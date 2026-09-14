import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { auditLogs, connections, parentChildLinks, users } from "../src/lib/schema.js";
import type { DatabaseHandle } from "../server/db.js";
import {
  assignUserRole,
  getModerationQueue,
  getSystemMetrics,
  listAuditLogs,
  listUsers,
  setUserAccountStatus,
} from "../server/actions/admin.js";
import { cleanupStaleConnections } from "../server/actions/cron.js";
import { createConnection, decideConnection } from "../server/actions/matchmaking.js";
import { createReport } from "../server/actions/reports.js";
import { assertAccountUsable } from "../server/auth.js";
import { dbErrorMessage, errorCode, linkFamily, makeUser, reload, setupDatabase } from "./helpers.js";

let handle: DatabaseHandle;
const db = () => handle.db;

beforeAll(async () => {
  handle = await setupDatabase();
});
afterAll(async () => {
  await handle.close();
});

async function approvedConnection() {
  const brother = await makeUser(db());
  const sister = await makeUser(db(), { gender: "female" });
  const mahram = await makeUser(db(), { role: "MAHRAM" });
  await linkFamily(db(), mahram, sister, "MAHRAM");
  const c = await createConnection(db(), brother, sister.id);
  await decideConnection(db(), sister, c.id, { decision: "APPROVE" });
  return { brother, sister, mahram, connectionId: c.id };
}

describe("ghosting cleaner", () => {
  it("terminates APPROVED connections idle for more than 7 days and audits it", async () => {
    const stale = await approvedConnection();
    const fresh = await approvedConnection();
    await db().execute(
      sql`UPDATE connections SET last_activity_at = now() - interval '8 days' WHERE id = ${stale.connectionId}::uuid`,
    );

    const result = await cleanupStaleConnections(db());
    expect(result.terminatedConnectionIds).toContain(stale.connectionId);
    expect(result.terminatedConnectionIds).not.toContain(fresh.connectionId);

    const [row] = await db().select().from(connections).where(eq(connections.id, stale.connectionId));
    expect(row?.status).toBe("TERMINATED");
    expect(row?.closedReason).toBe("INACTIVITY");

    const logs = await db()
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.action, "CONNECTION_TERMINATED_INACTIVITY"), eq(auditLogs.targetId, stale.brother.id)));
    expect(logs).toHaveLength(1);
    expect(logs[0]?.actorId).toBeNull();
    expect(logs[0]?.metadata.connectionId).toBe(stale.connectionId);

    // Idempotent.
    expect((await cleanupStaleConnections(db())).terminatedConnectionIds).not.toContain(stale.connectionId);
  });

  it("lifts expired suspensions", async () => {
    const user = await makeUser(db(), { accountStatus: "SUSPENDED", suspendedUntil: new Date(Date.now() - 1000) });
    const result = await cleanupStaleConnections(db());
    expect(result.liftedSuspensionUserIds).toContain(user.id);
    expect((await reload(db(), user)).accountStatus).toBe("ACTIVE");
  });
});

describe("audit log immutability", () => {
  it("rejects UPDATE and DELETE", async () => {
    const user = await makeUser(db());
    await db().insert(auditLogs).values({ actorId: user.id, targetId: user.id, action: "USER_REGISTERED" });
    expect(await dbErrorMessage(db().execute(sql`UPDATE audit_logs SET action = 'TAMPERED'`))).toMatch(/append-only/);
    expect(await dbErrorMessage(db().execute(sql`DELETE FROM audit_logs`))).toMatch(/append-only/);
  });
});

describe("admin interventions", () => {
  it("bans a user, terminates their connections, blocks sign-in and writes an audit record", async () => {
    const admin = await makeUser(db(), { role: "ADMIN" });
    const { brother, connectionId } = await approvedConnection();

    const row = await setUserAccountStatus(db(), admin, brother.id, { action: "BAN", reason: "Harassment reports" });
    expect(row.accountStatus).toBe("BANNED");

    const [conn] = await db().select().from(connections).where(eq(connections.id, connectionId));
    expect(conn?.status).toBe("TERMINATED");
    expect(await errorCode(assertAccountUsable(db(), await reload(db(), brother)))).toBe("ACCOUNT_BANNED");

    const logs = await listAuditLogs(db(), { page: 1, pageSize: 50, userId: brother.id, action: "ACCOUNT_BANNED" });
    expect(logs.items).toHaveLength(1);
    expect(logs.items[0]?.actor?.id).toBe(admin.id);
    expect(logs.items[0]?.metadata.reason).toBe("Harassment reports");
  });

  it("suspends with a duration and reinstates", async () => {
    const admin = await makeUser(db(), { role: "ADMIN" });
    const user = await makeUser(db());
    const suspended = await setUserAccountStatus(db(), admin, user.id, { action: "SUSPEND", reason: "Cooling off", durationDays: 3 });
    expect(suspended.accountStatus).toBe("SUSPENDED");
    expect(await errorCode(assertAccountUsable(db(), await reload(db(), user)))).toBe("ACCOUNT_SUSPENDED");
    const reinstated = await setUserAccountStatus(db(), admin, user.id, { action: "REINSTATE", reason: "Appeal accepted" });
    expect(reinstated.accountStatus).toBe("ACTIVE");
  });

  it("refuses to act on the admin's own account", async () => {
    const admin = await makeUser(db(), { role: "ADMIN" });
    expect(await errorCode(setUserAccountStatus(db(), admin, admin.id, { action: "BAN", reason: "oops" }))).toBe(
      "CANNOT_TARGET_SELF",
    );
  });

  it("RESET_ROLE removes guardian links; assignUserRole elevates", async () => {
    const admin = await makeUser(db(), { role: "ADMIN" });
    const parent = await makeUser(db(), { role: "PARENT" });
    const child = await makeUser(db(), { role: "DEPENDENT", gender: "female", requiresParentalVetting: true });
    await linkFamily(db(), parent, child, "WALI");

    await setUserAccountStatus(db(), admin, parent.id, { action: "RESET_ROLE", reason: "Not a real guardian" });
    expect((await reload(db(), parent)).role).toBe("SOLO");
    expect(await db().select().from(parentChildLinks).where(eq(parentChildLinks.parentId, parent.id))).toHaveLength(0);

    const promoted = await assignUserRole(db(), admin, parent.id, { role: "ADMIN", reason: "New moderator" });
    expect(promoted.role).toBe("ADMIN");
  });
});

describe("admin read models", () => {
  it("computes metrics, moderation queue and a safe search", async () => {
    const reporter = await makeUser(db(), { gender: "female" });
    const offender = await makeUser(db(), { displayName: "100% Real_Name" });
    const second = await makeUser(db(), { gender: "female" });
    await createReport(db(), reporter, { reportedId: offender.id, reason: "Asked for private photos repeatedly" });
    await createReport(db(), second, { reportedId: offender.id, reason: "Rude and inappropriate messages" });

    const metrics = await getSystemMetrics(db());
    expect(metrics.totalUsers).toBeGreaterThan(0);
    expect(metrics.reportedAccounts).toBeGreaterThanOrEqual(1);
    expect(metrics.signupsLast14Days).toHaveLength(14);
    expect(metrics.signupsLast14Days.at(-1)?.count).toBeGreaterThan(0);

    const queue = await getModerationQueue(db());
    expect(queue.reports.some((r) => r.reported.id === offender.id)).toBe(true);
    expect(queue.flagged.find((f) => f.user.id === offender.id)?.signals[0]).toMatch(/pending reports/);

    const exact = await listUsers(db(), { page: 1, pageSize: 20, q: "100% Real_" });
    expect(exact.items.map((u) => u.id)).toEqual([offender.id]);
    const wildcard = await listUsers(db(), { page: 1, pageSize: 20, q: "%" });
    expect(wildcard.items.every((u) => (u.displayName ?? "").includes("%") || u.email.includes("%"))).toBe(true);

    const [countRow] = await db().select({ n: sql<number>`count(*)::int` }).from(users);
    expect(metrics.totalUsers).toBeLessThanOrEqual(countRow?.n ?? 0);
  });
});
