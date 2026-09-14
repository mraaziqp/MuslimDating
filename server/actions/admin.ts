import { and, count, desc, eq, gte, ilike, inArray, ne, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  ACCOUNT_STATUSES,
  ALL_ROLES,
  type AccountActionInput,
  type AdminUserRow,
  type AssignRoleInput,
  type AuditLogView,
  type AuditQuery,
  type FlaggedUser,
  type ModerationQueue,
  type Paginated,
  type ReportUpdateInput,
  type SystemMetrics,
  type UserDirectoryQuery,
} from "../../src/lib/contracts.js";
import {
  auditLogs,
  connectionStatusEnum,
  connections,
  messages,
  parentChildLinks,
  profilePhotos,
  reports,
  users,
  type ConnectionStatus,
  type User,
  type UserRole,
} from "../../src/lib/schema.js";
import { recordAudit } from "../audit.js";
import type { Database } from "../db.js";
import { errors } from "../http.js";
import { asNumber, asString, rowsOf } from "../rows.js";

const LIVE_STATUSES: ConnectionStatus[] = ["PENDING_MALE_PARENT", "PENDING_FEMALE_PARENT", "APPROVED"];

function zeroRecord<K extends string>(keys: readonly K[]): Record<K, number> {
  const record = {} as Record<K, number>;
  for (const key of keys) record[key] = 0;
  return record;
}

// ─── Metrics ──────────────────────────────────────────────────────────────────

export async function getSystemMetrics(db: Database): Promise<SystemMetrics> {
  const [roleRows, statusRows, connectionRows, reportedRows, pendingReportRows, chatRows, messageRows, signupResult] =
    await Promise.all([
      db.select({ key: users.role, n: count() }).from(users).groupBy(users.role),
      db.select({ key: users.accountStatus, n: count() }).from(users).groupBy(users.accountStatus),
      db.select({ key: connections.status, n: count() }).from(connections).groupBy(connections.status),
      db
        .select({ n: sql<number>`count(DISTINCT ${reports.reportedId})`.mapWith(Number) })
        .from(reports)
        .where(eq(reports.status, "PENDING")),
      db.select({ n: count() }).from(reports).where(eq(reports.status, "PENDING")),
      db
        .select({ n: count() })
        .from(connections)
        .where(and(eq(connections.status, "APPROVED"), sql`${connections.mahramId} IS NOT NULL`)),
      db
        .select({ n: count() })
        .from(messages)
        .where(gte(messages.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000))),
      db.execute(sql`
        SELECT to_char(d, 'YYYY-MM-DD') AS date, count(u.id)::int AS count
          FROM generate_series((current_date - 13)::timestamp, current_date::timestamp, interval '1 day') AS d
          LEFT JOIN users u ON u.created_at >= d AND u.created_at < d + interval '1 day'
         GROUP BY d
         ORDER BY d`),
    ]);

  const usersByRole = zeroRecord(ALL_ROLES);
  for (const row of roleRows) usersByRole[row.key] = row.n;
  const usersByStatus = zeroRecord(ACCOUNT_STATUSES);
  for (const row of statusRows) usersByStatus[row.key] = row.n;
  const connectionsByStatus = zeroRecord(connectionStatusEnum.enumValues);
  for (const row of connectionRows) connectionsByStatus[row.key] = row.n;

  return {
    usersByRole,
    usersByStatus,
    totalUsers: Object.values(usersByRole).reduce((a, b) => a + b, 0),
    pendingWaliRequests: connectionsByStatus.PENDING_MALE_PARENT + connectionsByStatus.PENDING_FEMALE_PARENT,
    activeChaperonedChats: chatRows[0]?.n ?? 0,
    reportedAccounts: reportedRows[0]?.n ?? 0,
    pendingReports: pendingReportRows[0]?.n ?? 0,
    connectionsByStatus,
    signupsLast14Days: rowsOf(signupResult).map((r) => ({ date: asString(r.date), count: asNumber(r.count) })),
    messagesLast24h: messageRows[0]?.n ?? 0,
    generatedAt: new Date().toISOString(),
  };
}

// ─── Moderation queue ─────────────────────────────────────────────────────────

const SIGNAL_LABELS: Record<string, (value: number) => string> = {
  MULTIPLE_PENDING_REPORTS: (n) => `${n} pending reports`,
  REQUEST_BURST_24H: (n) => `${n} connection requests in 24h`,
  HIGH_REJECTION_COUNT_30D: (n) => `${n} requests declined in 30 days`,
  MESSAGE_BURST_1H: (n) => `${n} messages in the last hour`,
};

export async function getModerationQueue(db: Database): Promise<ModerationQueue> {
  const reporter = alias(users, "reporter");
  const reported = alias(users, "reported");

  const reportRows = await db
    .select({ report: reports, reporter, reported })
    .from(reports)
    .innerJoin(reporter, eq(reporter.id, reports.reporterId))
    .innerJoin(reported, eq(reported.id, reports.reportedId))
    .where(ne(reports.status, "RESOLVED"))
    .orderBy(desc(reports.createdAt))
    .limit(100);

  const signalRows = rowsOf(
    await db.execute(sql`
      SELECT reported_id AS user_id, 'MULTIPLE_PENDING_REPORTS' AS signal, count(*)::int AS value
        FROM reports WHERE status = 'PENDING' GROUP BY reported_id HAVING count(*) >= 2
      UNION ALL
      SELECT sender_id, 'REQUEST_BURST_24H', count(*)::int
        FROM connections WHERE created_at > now() - interval '24 hours' GROUP BY sender_id HAVING count(*) >= 8
      UNION ALL
      SELECT sender_id, 'HIGH_REJECTION_COUNT_30D', count(*)::int
        FROM connections WHERE status = 'REJECTED' AND updated_at > now() - interval '30 days'
        GROUP BY sender_id HAVING count(*) >= 5
      UNION ALL
      SELECT sender_id, 'MESSAGE_BURST_1H', count(*)::int
        FROM messages WHERE created_at > now() - interval '1 hour' GROUP BY sender_id HAVING count(*) >= 120`),
  );

  const signalsByUser = new Map<string, string[]>();
  for (const row of signalRows) {
    const userId = asString(row.user_id);
    const label = SIGNAL_LABELS[asString(row.signal)]?.(asNumber(row.value)) ?? asString(row.signal);
    signalsByUser.set(userId, [...(signalsByUser.get(userId) ?? []), label]);
  }

  const flaggedIds = [...signalsByUser.keys()];
  const flaggedUsers = flaggedIds.length > 0 ? await db.select().from(users).where(inArray(users.id, flaggedIds)) : [];
  const flagged: FlaggedUser[] = flaggedUsers
    .filter((u) => u.accountStatus !== "BANNED")
    .map((u) => ({
      user: {
        id: u.id,
        displayName: u.displayName ?? "Member",
        role: u.role,
        email: u.email,
        accountStatus: u.accountStatus,
      },
      signals: signalsByUser.get(u.id) ?? [],
    }));

  return {
    reports: reportRows.map(({ report, reporter: from, reported: about }) => ({
      id: report.id,
      reporter: { id: from.id, displayName: from.displayName ?? "Member", role: from.role, email: from.email },
      reported: {
        id: about.id,
        displayName: about.displayName ?? "Member",
        role: about.role,
        email: about.email,
        accountStatus: about.accountStatus,
      },
      reason: report.reason,
      status: report.status,
      resolutionNote: report.resolutionNote,
      createdAt: report.createdAt.toISOString(),
    })),
    flagged,
  };
}

export async function updateReport(
  db: Database,
  admin: User,
  reportId: string,
  input: ReportUpdateInput,
): Promise<{ id: string }> {
  const [updated] = await db
    .update(reports)
    .set({ status: input.status, resolutionNote: input.note ?? null, resolvedBy: admin.id, updatedAt: new Date() })
    .where(eq(reports.id, reportId))
    .returning({ id: reports.id, reportedId: reports.reportedId });
  if (!updated) throw errors.notFound("Report not found.");

  await recordAudit(db, {
    actorId: admin.id,
    targetId: updated.reportedId,
    action: "REPORT_UPDATED",
    metadata: { reportId, status: input.status, note: input.note ?? null },
  });
  return { id: updated.id };
}

// ─── User directory ───────────────────────────────────────────────────────────

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

export async function listUsers(db: Database, query: UserDirectoryQuery): Promise<Paginated<AdminUserRow>> {
  const conditions: SQL[] = [];
  if (query.role) conditions.push(eq(users.role, query.role));
  if (query.status) conditions.push(eq(users.accountStatus, query.status));
  if (query.q) {
    const pattern = `%${escapeLike(query.q)}%`;
    const search = or(ilike(users.email, pattern), ilike(users.phone, pattern), ilike(users.displayName, pattern));
    if (search) conditions.push(search);
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [totalRow] = await db.select({ n: count() }).from(users).where(where);
  return {
    page: query.page,
    pageSize: query.pageSize,
    total: totalRow?.n ?? 0,
    items: await selectAdminRows(db, where, query.pageSize, (query.page - 1) * query.pageSize),
  };
}

async function selectAdminRows(
  db: Database,
  where: SQL | undefined,
  limit: number,
  offset: number,
): Promise<AdminUserRow[]> {
  const rows = await db
    .select({
      user: users,
      reportCount: sql<number>`(SELECT count(*) FROM reports r WHERE r.reported_id = ${users.id})`.mapWith(Number),
      activeChats: sql<number>`(SELECT count(*) FROM connections c
                                 WHERE c.status = 'APPROVED'
                                   AND (c.sender_id = ${users.id} OR c.receiver_id = ${users.id}))`.mapWith(Number),
      hasPhoto: sql<boolean>`EXISTS (SELECT 1 FROM profile_photos p WHERE p.user_id = ${users.id})`.mapWith(Boolean),
    })
    .from(users)
    .where(where)
    .orderBy(desc(users.createdAt))
    .limit(limit)
    .offset(offset);

  return rows.map(({ user, reportCount, activeChats, hasPhoto }) => ({
    id: user.id,
    email: user.email,
    phone: user.phone,
    displayName: user.displayName,
    role: user.role,
    accountStatus: user.accountStatus,
    suspendedUntil: user.suspendedUntil?.toISOString() ?? null,
    readinessCompleted: user.readinessCompleted,
    onboardingCompleted: user.onboardingCompleted,
    hasPhoto,
    reportCount,
    activeChats,
    createdAt: user.createdAt.toISOString(),
    lastSeenAt: user.lastSeenAt?.toISOString() ?? null,
  }));
}

// ─── Interventions ────────────────────────────────────────────────────────────

async function loadTarget(db: Database, admin: User, targetUserId: string): Promise<User> {
  if (targetUserId === admin.id) {
    throw errors.forbidden("Administrators cannot run moderation actions on their own account.", "CANNOT_TARGET_SELF");
  }
  const [target] = await db.select().from(users).where(eq(users.id, targetUserId)).limit(1);
  if (!target) throw errors.notFound("User not found.");
  return target;
}

async function assertNotLastAdmin(db: Database, target: User): Promise<void> {
  if (target.role !== "ADMIN") return;
  const [row] = await db
    .select({ n: count() })
    .from(users)
    .where(and(eq(users.role, "ADMIN"), eq(users.accountStatus, "ACTIVE"), ne(users.id, target.id)));
  if ((row?.n ?? 0) === 0) {
    throw errors.conflict("This is the last active administrator and cannot be removed.", "LAST_ADMIN");
  }
}

async function terminateConnections(
  db: Database,
  adminId: string,
  condition: SQL | undefined,
  statuses: ConnectionStatus[],
  reason: string,
): Promise<string[]> {
  const rows = await db
    .update(connections)
    .set({
      status: "TERMINATED",
      closedBy: adminId,
      closedReason: reason,
      updatedAt: new Date(),
      version: sql`${connections.version} + 1`,
    })
    .where(and(inArray(connections.status, statuses), condition))
    .returning({ id: connections.id });
  return rows.map((r) => r.id);
}

/** Removes guardian-side privileges when someone stops being a PARENT/MAHRAM. */
async function revokeGuardianship(db: Database, adminId: string, userId: string): Promise<{ links: number; chats: string[] }> {
  const removed = await db.delete(parentChildLinks).where(eq(parentChildLinks.parentId, userId)).returning({ id: parentChildLinks.id });
  const chats = await terminateConnections(db, adminId, eq(connections.mahramId, userId), ["APPROVED"], "MAHRAM_ROLE_REMOVED");
  return { links: removed.length, chats };
}

export async function setUserAccountStatus(
  db: Database,
  admin: User,
  targetUserId: string,
  input: AccountActionInput,
): Promise<AdminUserRow> {
  const target = await loadTarget(db, admin, targetUserId);
  const base = { reason: input.reason, previousStatus: target.accountStatus, previousRole: target.role };

  switch (input.action) {
    case "SUSPEND": {
      await assertNotLastAdmin(db, target);
      const days = input.durationDays ?? 7;
      const suspendedUntil = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
      await db
        .update(users)
        .set({ accountStatus: "SUSPENDED", suspendedUntil, updatedAt: new Date() })
        .where(eq(users.id, target.id));
      await recordAudit(db, {
        actorId: admin.id,
        targetId: target.id,
        action: "ACCOUNT_SUSPENDED",
        metadata: { ...base, durationDays: days, suspendedUntil: suspendedUntil.toISOString() },
      });
      break;
    }
    case "BAN": {
      await assertNotLastAdmin(db, target);
      await db
        .update(users)
        .set({ accountStatus: "BANNED", suspendedUntil: null, updatedAt: new Date() })
        .where(eq(users.id, target.id));
      const terminated = await terminateConnections(
        db,
        admin.id,
        or(eq(connections.senderId, target.id), eq(connections.receiverId, target.id), eq(connections.mahramId, target.id)),
        LIVE_STATUSES,
        "ACCOUNT_BANNED",
      );
      await recordAudit(db, {
        actorId: admin.id,
        targetId: target.id,
        action: "ACCOUNT_BANNED",
        metadata: { ...base, terminatedConnectionIds: terminated },
      });
      break;
    }
    case "RESET_ROLE": {
      if (target.role === "SOLO") throw errors.conflict("This user already has the default role.", "NO_CHANGE");
      await assertNotLastAdmin(db, target);
      const revoked =
        target.role === "PARENT" || target.role === "MAHRAM" ? await revokeGuardianship(db, admin.id, target.id) : null;
      await db.update(users).set({ role: "SOLO", updatedAt: new Date() }).where(eq(users.id, target.id));
      await recordAudit(db, {
        actorId: admin.id,
        targetId: target.id,
        action: "ROLE_RESET",
        metadata: { ...base, newRole: "SOLO", removedLinks: revoked?.links ?? 0, terminatedConnectionIds: revoked?.chats ?? [] },
      });
      break;
    }
    case "REINSTATE": {
      if (target.accountStatus === "ACTIVE") throw errors.conflict("This account is already active.", "NO_CHANGE");
      await db
        .update(users)
        .set({ accountStatus: "ACTIVE", suspendedUntil: null, updatedAt: new Date() })
        .where(eq(users.id, target.id));
      await recordAudit(db, { actorId: admin.id, targetId: target.id, action: "ACCOUNT_REINSTATED", metadata: base });
      break;
    }
  }
  return getAdminUserRow(db, target.id);
}

export async function assignUserRole(
  db: Database,
  admin: User,
  targetUserId: string,
  input: AssignRoleInput,
): Promise<AdminUserRow> {
  const target = await loadTarget(db, admin, targetUserId);
  const newRole: UserRole = input.role;
  if (target.role === newRole) throw errors.conflict(`This user is already ${newRole}.`, "NO_CHANGE");
  if (newRole !== "ADMIN") await assertNotLastAdmin(db, target);

  const wasGuardian = target.role === "PARENT" || target.role === "MAHRAM";
  const staysGuardian = newRole === "PARENT" || newRole === "MAHRAM";
  const wasSeeker = target.role === "SOLO" || target.role === "DEPENDENT";
  const staysSeeker = newRole === "SOLO" || newRole === "DEPENDENT";

  const revoked = wasGuardian && !staysGuardian ? await revokeGuardianship(db, admin.id, target.id) : null;
  const endedCourtships =
    wasSeeker && !staysSeeker
      ? await terminateConnections(
          db,
          admin.id,
          or(eq(connections.senderId, target.id), eq(connections.receiverId, target.id)),
          LIVE_STATUSES,
          "ROLE_CHANGED",
        )
      : [];

  await db
    .update(users)
    .set({
      role: newRole,
      requiresParentalVetting: newRole === "DEPENDENT" ? true : target.requiresParentalVetting,
      onboardingCompleted: newRole === "ADMIN" ? true : target.onboardingCompleted,
      updatedAt: new Date(),
    })
    .where(eq(users.id, target.id));

  await recordAudit(db, {
    actorId: admin.id,
    targetId: target.id,
    action: "ROLE_ASSIGNED",
    metadata: {
      reason: input.reason,
      previousRole: target.role,
      newRole,
      removedLinks: revoked?.links ?? 0,
      terminatedConnectionIds: [...(revoked?.chats ?? []), ...endedCourtships],
    },
  });
  return getAdminUserRow(db, target.id);
}

export async function removeUserPhoto(db: Database, admin: User, targetUserId: string, reason: string): Promise<AdminUserRow> {
  const target = await loadTarget(db, admin, targetUserId);
  const removed = await db.delete(profilePhotos).where(eq(profilePhotos.userId, target.id)).returning({ userId: profilePhotos.userId });
  if (removed.length === 0) throw errors.notFound("This user has no photo.");
  await recordAudit(db, { actorId: admin.id, targetId: target.id, action: "PHOTO_REMOVED", metadata: { reason } });
  return getAdminUserRow(db, target.id);
}

async function getAdminUserRow(db: Database, userId: string): Promise<AdminUserRow> {
  const [row] = await selectAdminRows(db, eq(users.id, userId), 1, 0);
  if (!row) throw errors.notFound("User not found.");
  return row;
}

// ─── Audit trail ──────────────────────────────────────────────────────────────

export async function listAuditLogs(db: Database, query: AuditQuery): Promise<Paginated<AuditLogView>> {
  const actorUser = alias(users, "actor_user");
  const targetUser = alias(users, "target_user");

  const conditions: SQL[] = [];
  if (query.action) conditions.push(eq(auditLogs.action, query.action));
  if (query.userId) {
    const byUser = or(eq(auditLogs.actorId, query.userId), eq(auditLogs.targetId, query.userId));
    if (byUser) conditions.push(byUser);
  }
  if (query.since) conditions.push(gte(auditLogs.createdAt, new Date(query.since)));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [totalRow] = await db.select({ n: count() }).from(auditLogs).where(where);
  const rows = await db
    .select({
      log: auditLogs,
      actor: { id: actorUser.id, displayName: actorUser.displayName, role: actorUser.role, email: actorUser.email },
      target: { id: targetUser.id, displayName: targetUser.displayName, role: targetUser.role, email: targetUser.email },
    })
    .from(auditLogs)
    .leftJoin(actorUser, eq(actorUser.id, auditLogs.actorId))
    .leftJoin(targetUser, eq(targetUser.id, auditLogs.targetId))
    .where(where)
    .orderBy(desc(auditLogs.createdAt))
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize);

  const brief = (p: { id: string; displayName: string | null; role: UserRole; email: string } | null) =>
    p ? { id: p.id, displayName: p.displayName ?? "Member", role: p.role, email: p.email } : null;

  return {
    page: query.page,
    pageSize: query.pageSize,
    total: totalRow?.n ?? 0,
    items: rows.map(({ log, actor, target }) => ({
      id: log.id,
      action: log.action,
      actor: brief(actor),
      target: brief(target),
      metadata: log.metadata,
      createdAt: log.createdAt.toISOString(),
    })),
  };
}
