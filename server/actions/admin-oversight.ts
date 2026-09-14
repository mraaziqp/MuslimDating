/**
 * Administrator oversight: every connection, full member records, and
 * conversation transcripts. Every transcript view is written to the audit log.
 */
import { and, asc, count, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type {
  AdminConnectionRow,
  AdminConnectionsQuery,
  AdminFamilyLink,
  AdminPerson,
  AdminTranscript,
  AdminUserDetail,
  Paginated,
  ReportRow,
} from "../../src/lib/contracts.js";
import { connections, messages, parentChildLinks, reports, users, type User } from "../../src/lib/schema.js";
import { recordAudit } from "../audit.js";
import type { Database } from "../db.js";
import { errors } from "../http.js";
import { toSelfUser } from "../presenters.js";
import { listAuditLogs, selectAdminRows } from "./admin.js";
import { userHasPhoto } from "./users.js";

const senderUser = alias(users, "sender_user");
const receiverUser = alias(users, "receiver_user");
const mahramUser = alias(users, "mahram_user");

interface PersonColumns {
  id: string;
  displayName: string | null;
  role: User["role"];
  email: string;
}

function person(p: PersonColumns): AdminPerson {
  return { id: p.id, displayName: p.displayName ?? "Member", role: p.role, email: p.email };
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

async function selectConnectionRows(
  db: Database,
  where: SQL | undefined,
  limit: number,
  offset: number,
): Promise<AdminConnectionRow[]> {
  const rows = await db
    .select({
      conn: connections,
      sender: { id: senderUser.id, displayName: senderUser.displayName, role: senderUser.role, email: senderUser.email },
      receiver: {
        id: receiverUser.id,
        displayName: receiverUser.displayName,
        role: receiverUser.role,
        email: receiverUser.email,
      },
      mahram: { id: mahramUser.id, displayName: mahramUser.displayName, role: mahramUser.role, email: mahramUser.email },
      messageCount: sql<number>`(SELECT count(*) FROM messages mm WHERE mm.connection_id = ${connections.id})`.mapWith(Number),
    })
    .from(connections)
    .innerJoin(senderUser, eq(senderUser.id, connections.senderId))
    .innerJoin(receiverUser, eq(receiverUser.id, connections.receiverId))
    .leftJoin(mahramUser, eq(mahramUser.id, connections.mahramId))
    .where(where)
    .orderBy(desc(connections.updatedAt))
    .limit(limit)
    .offset(offset);

  return rows.map(({ conn, sender, receiver, mahram, messageCount }) => ({
    id: conn.id,
    status: conn.status,
    sender: person(sender),
    receiver: person(receiver),
    mahram: mahram ? person(mahram) : null,
    messageCount,
    senderPhotoConsent: conn.senderPhotoConsent,
    receiverPhotoConsent: conn.receiverPhotoConsent,
    closedReason: conn.closedReason,
    createdAt: conn.createdAt.toISOString(),
    updatedAt: conn.updatedAt.toISOString(),
    lastActivityAt: conn.lastActivityAt.toISOString(),
  }));
}

export async function listAllConnections(
  db: Database,
  query: AdminConnectionsQuery,
): Promise<Paginated<AdminConnectionRow>> {
  const conditions: SQL[] = [];
  if (query.status) conditions.push(eq(connections.status, query.status));
  if (query.userId) {
    const involved = or(
      eq(connections.senderId, query.userId),
      eq(connections.receiverId, query.userId),
      eq(connections.mahramId, query.userId),
    );
    if (involved) conditions.push(involved);
  }
  if (query.q) {
    const pattern = `%${escapeLike(query.q)}%`;
    const search = or(
      ilike(senderUser.email, pattern),
      ilike(senderUser.displayName, pattern),
      ilike(receiverUser.email, pattern),
      ilike(receiverUser.displayName, pattern),
    );
    if (search) conditions.push(search);
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [total] = await db
    .select({ n: count() })
    .from(connections)
    .innerJoin(senderUser, eq(senderUser.id, connections.senderId))
    .innerJoin(receiverUser, eq(receiverUser.id, connections.receiverId))
    .where(where);

  return {
    page: query.page,
    pageSize: query.pageSize,
    total: total?.n ?? 0,
    items: await selectConnectionRows(db, where, query.pageSize, (query.page - 1) * query.pageSize),
  };
}

export async function getUserDetail(db: Database, userId: string): Promise<AdminUserDetail> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw errors.notFound("User not found.");
  const [account] = await selectAdminRows(db, eq(users.id, userId), 1, 0);
  if (!account) throw errors.notFound("User not found.");

  const personFields = { id: users.id, displayName: users.displayName, role: users.role, email: users.email };
  const guardians = await db
    .select({ link: parentChildLinks, other: personFields })
    .from(parentChildLinks)
    .innerJoin(users, eq(users.id, parentChildLinks.parentId))
    .where(eq(parentChildLinks.childId, userId));
  const wards = await db
    .select({ link: parentChildLinks, other: personFields })
    .from(parentChildLinks)
    .innerJoin(users, eq(users.id, parentChildLinks.childId))
    .where(eq(parentChildLinks.parentId, userId));

  const family: AdminFamilyLink[] = [
    ...guardians.map(({ link, other }) => ({
      linkId: link.id,
      kind: link.kind,
      relation: "GUARDIAN" as const,
      person: person(other),
      createdAt: link.createdAt.toISOString(),
    })),
    ...wards.map(({ link, other }) => ({
      linkId: link.id,
      kind: link.kind,
      relation: "WARD" as const,
      person: person(other),
      createdAt: link.createdAt.toISOString(),
    })),
  ];

  const reporter = alias(users, "reporter_user");
  const reportRows = await db
    .select({
      report: reports,
      reporter: { id: reporter.id, displayName: reporter.displayName, role: reporter.role, email: reporter.email },
    })
    .from(reports)
    .innerJoin(reporter, eq(reporter.id, reports.reporterId))
    .where(eq(reports.reportedId, userId))
    .orderBy(desc(reports.createdAt))
    .limit(50);

  const reportsAgainst: ReportRow[] = reportRows.map(({ report, reporter: from }) => ({
    id: report.id,
    reporter: person(from),
    reported: { ...person(user), accountStatus: user.accountStatus },
    reason: report.reason,
    status: report.status,
    resolutionNote: report.resolutionNote,
    createdAt: report.createdAt.toISOString(),
  }));

  const [filed] = await db.select({ n: count() }).from(reports).where(eq(reports.reporterId, userId));
  const involved = or(
    eq(connections.senderId, userId),
    eq(connections.receiverId, userId),
    eq(connections.mahramId, userId),
  );

  return {
    account,
    profile: toSelfUser(user, await userHasPhoto(db, userId)),
    family,
    connections: await selectConnectionRows(db, involved, 100, 0),
    reportsAgainst,
    reportsFiled: filed?.n ?? 0,
    recentActivity: (await listAuditLogs(db, { page: 1, pageSize: 25, userId })).items,
  };
}

export async function getConversationTranscript(
  db: Database,
  admin: User,
  connectionId: string,
): Promise<AdminTranscript> {
  const [connection] = await selectConnectionRows(db, eq(connections.id, connectionId), 1, 0);
  if (!connection) throw errors.notFound("Connection not found.");

  const rows = await db
    .select({ message: messages, senderName: users.displayName })
    .from(messages)
    .innerJoin(users, eq(users.id, messages.senderId))
    .where(eq(messages.connectionId, connectionId))
    .orderBy(asc(messages.createdAt))
    .limit(2000);

  await recordAudit(db, {
    actorId: admin.id,
    targetId: connection.sender.id,
    action: "ADMIN_VIEWED_CONVERSATION",
    metadata: { connectionId, receiverId: connection.receiver.id, messageCount: rows.length },
  });

  return {
    connection,
    messages: rows.map(({ message, senderName }) => ({
      id: message.id,
      senderId: message.senderId,
      senderName: senderName ?? "Member",
      senderRole:
        message.senderId === connection.sender.id
          ? "SENDER"
          : message.senderId === connection.receiver.id
            ? "RECEIVER"
            : message.senderId === connection.mahram?.id
              ? "MAHRAM"
              : "OTHER",
      text: message.text,
      createdAt: message.createdAt.toISOString(),
    })),
  };
}
