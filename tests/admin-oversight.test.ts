import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { auditLogs, messages, users } from "../src/lib/schema.js";
import type { DatabaseHandle } from "../server/db.js";
import { getConversationTranscript, getUserDetail, listAllConnections } from "../server/actions/admin-oversight.js";
import { createConnection, decideConnection } from "../server/actions/matchmaking.js";
import { loginWithPassword } from "../server/actions/users.js";
import { errorCode, linkFamily, makeUser, setupDatabase } from "./helpers.js";

let handle: DatabaseHandle;
const db = () => handle.db;

beforeAll(async () => {
  handle = await setupDatabase();
});
afterAll(async () => {
  await handle.close();
});
afterEach(() => {
  delete process.env.ADMIN_USERNAME;
  delete process.env.ADMIN_PASSWORD;
});

describe("username administrator", () => {
  it("bootstraps the env-configured admin on first sign-in and accepts the username case-insensitively", async () => {
    process.env.ADMIN_USERNAME = "siteadmin";
    process.env.ADMIN_PASSWORD = "test-only-password";

    expect(await errorCode(loginWithPassword(db(), { identifier: "siteadmin", password: "wrong" }, "10.0.0.1"))).toBe(
      "INVALID_CREDENTIALS",
    );

    const admin = await loginWithPassword(db(), { identifier: "SiteAdmin", password: "test-only-password" }, "10.0.0.1");
    expect(admin.role).toBe("ADMIN");
    expect(admin.username).toBe("siteadmin");
    expect(admin.onboardingCompleted).toBe(true);

    await loginWithPassword(db(), { identifier: "siteadmin", password: "test-only-password" }, "10.0.0.1");
    expect(await db().select().from(users).where(eq(users.username, "siteadmin"))).toHaveLength(1);
  });

  it("does not create an admin when the env password is absent", async () => {
    process.env.ADMIN_USERNAME = "ghostadmin";
    expect(await errorCode(loginWithPassword(db(), { identifier: "ghostadmin", password: "anything" }, "10.0.0.2"))).toBe(
      "INVALID_CREDENTIALS",
    );
    expect(await db().select().from(users).where(eq(users.username, "ghostadmin"))).toHaveLength(0);
  });
});

describe("admin oversight", () => {
  async function approvedChat() {
    const brother = await makeUser(db(), { displayName: "Oversight Brother" });
    const sister = await makeUser(db(), { gender: "female", displayName: "Oversight Sister" });
    const mahram = await makeUser(db(), { role: "MAHRAM", displayName: "Oversight Mahram" });
    await linkFamily(db(), mahram, sister, "MAHRAM");
    const c = await createConnection(db(), brother, sister.id);
    await decideConnection(db(), sister, c.id, { decision: "APPROVE" });
    await db().insert(messages).values([
      { connectionId: c.id, senderId: brother.id, text: "Assalamu alaikum" },
      { connectionId: c.id, senderId: mahram.id, text: "Present as chaperone" },
    ]);
    return { brother, sister, mahram, connectionId: c.id };
  }

  it("lists every connection with filters and message counts", async () => {
    const { connectionId } = await approvedChat();
    const all = await listAllConnections(db(), { page: 1, pageSize: 25, status: "APPROVED", q: "Oversight Sister" });
    const row = all.items.find((c) => c.id === connectionId);
    expect(row?.messageCount).toBe(2);
    expect(row?.mahram?.displayName).toBe("Oversight Mahram");
  });

  it("returns a full transcript and audits the view", async () => {
    const admin = await makeUser(db(), { role: "ADMIN" });
    const { connectionId, brother } = await approvedChat();
    const transcript = await getConversationTranscript(db(), admin, connectionId);
    expect(transcript.messages.map((m) => m.senderRole)).toEqual(["SENDER", "MAHRAM"]);

    const logs = await db()
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.action, "ADMIN_VIEWED_CONVERSATION"), eq(auditLogs.actorId, admin.id)));
    expect(logs).toHaveLength(1);
    expect(logs[0]?.targetId).toBe(brother.id);
  });

  it("returns the complete member record", async () => {
    const { sister, mahram, connectionId } = await approvedChat();
    const detail = await getUserDetail(db(), sister.id);
    expect(detail.profile.email).toBe(sister.email);
    expect(detail.family.map((f) => [f.person.id, f.relation])).toEqual([[mahram.id, "GUARDIAN"]]);
    expect(detail.connections.map((c) => c.id)).toContain(connectionId);
    expect(JSON.stringify(detail)).not.toMatch(/password_?hash/i);
  });
});
