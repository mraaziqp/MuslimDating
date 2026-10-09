/**
 * Connection state machine.
 *
 *   create ──► PENDING_MALE_PARENT   (sender requires vetting: sender's wali must approve)
 *          └─► PENDING_FEMALE_PARENT (otherwise)
 *
 *   PENDING_MALE_PARENT   ── sender's wali approves ──► PENDING_FEMALE_PARENT
 *   PENDING_FEMALE_PARENT ── recipient accepts  (+ recipient's wali approves when the
 *                            recipient is DEPENDENT / vetted) + mahram assigned ──► APPROVED
 *   PENDING_*             ── declined by the deciding side ──► REJECTED
 *   PENDING_*             ── withdrawn by sender ──► TERMINATED
 *   APPROVED              ── ended by a participant / admin / inactivity ──► TERMINATED
 *
 * Invariants enforced by the database (see migrations):
 *   • one non-terminated connection per pair (partial unique index)
 *   • APPROVED requires a mahram and neither party may exceed 3 APPROVED chats (trigger)
 * Every transition is an optimistic-concurrency UPDATE guarded by `version`.
 */
import { and, count, desc, eq, gte, ilike, inArray, lte, ne, or, sql, type SQL } from "drizzle-orm";
import {
  MAX_ACTIVE_CHATS,
  MAX_PENDING_OUTGOING,
  SEEKER_ROLES,
  type ConnectionDecisionInput,
  type ConnectionPerspective,
  type ConnectionView,
  type FeedResponse,
  type PersonBrief,
  type SeekerSearchQuery,
  type SeekerSearchResponse,
} from "../../src/lib/contracts.js";
import {
  connections,
  parentChildLinks,
  profilePhotos,
  reports,
  users,
  type Connection,
  type ConnectionStatus,
  type ParentChildLink,
  type User,
} from "../../src/lib/schema.js";
import { recordAudit } from "../audit.js";
import type { Database } from "../db.js";
import { AppError, errors, translateDatabaseError } from "../http.js";
import { photoAccessFor, requiresGuardian, toBrief, toPublicProfile } from "../presenters.js";
import { enforceRateLimit } from "../rate-limit.js";
import { rowsOf } from "../rows.js";
import { cleanupStaleConnections } from "./cron.js";

const PENDING_STATUSES: ConnectionStatus[] = ["PENDING_MALE_PARENT", "PENDING_FEMALE_PARENT"];
const LIVE_STATUSES: ConnectionStatus[] = [...PENDING_STATUSES, "APPROVED"];
const DAY_MS = 24 * 60 * 60 * 1000;

// ─── Hydration ────────────────────────────────────────────────────────────────

interface Person {
  user: User;
  hasPhoto: boolean;
}

interface HydrationContext {
  people: Map<string, Person>;
  /** Links where the child is a party to one of the hydrated connections. */
  links: ParentChildLink[];
}

async function loadPeople(db: Database, ids: string[]): Promise<Map<string, Person>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const rows = await db
    .select({ user: users, photoUserId: profilePhotos.userId })
    .from(users)
    .leftJoin(profilePhotos, eq(profilePhotos.userId, users.id))
    .where(inArray(users.id, unique));
  return new Map(rows.map((r) => [r.user.id, { user: r.user, hasPhoto: r.photoUserId !== null }]));
}

async function hydrate(db: Database, conns: Connection[]): Promise<HydrationContext> {
  const partyIds = [...new Set(conns.flatMap((c) => [c.senderId, c.receiverId]))];
  const links =
    partyIds.length > 0 ? await db.select().from(parentChildLinks).where(inArray(parentChildLinks.childId, partyIds)) : [];
  const people = await loadPeople(db, [
    ...partyIds,
    ...links.map((l) => l.parentId),
    ...conns.flatMap((c) => (c.mahramId ? [c.mahramId] : [])),
  ]);
  return { people, links };
}

function person(ctx: HydrationContext, id: string): Person {
  const found = ctx.people.get(id);
  if (!found) throw new Error(`User ${id} missing from hydration context`);
  return found;
}

function hasWali(ctx: HydrationContext, childId: string, parentId?: string): boolean {
  return ctx.links.some(
    (l) => l.childId === childId && l.kind === "WALI" && (parentId === undefined || l.parentId === parentId),
  );
}

export function perspectiveOf(actorId: string, conn: Connection, ctx: HydrationContext): ConnectionPerspective | null {
  if (actorId === conn.senderId) return "SENDER";
  if (actorId === conn.receiverId) return "RECEIVER";
  if (hasWali(ctx, conn.senderId, actorId)) return "SENDER_GUARDIAN";
  if (hasWali(ctx, conn.receiverId, actorId)) return "RECEIVER_GUARDIAN";
  if (conn.mahramId === actorId) return "MAHRAM";
  return null;
}

/** Receivers (and their walis) do not see a request until the sender's wali forwards it. */
function isVisible(perspective: ConnectionPerspective | null, conn: Connection): perspective is ConnectionPerspective {
  if (perspective === null) return false;
  if (conn.status === "PENDING_MALE_PARENT") return perspective === "SENDER" || perspective === "SENDER_GUARDIAN";
  return true;
}

/** Eligible chaperones, preferring the woman's mahram, then her wali, then the man's. */
export function mahramOptions(conn: Connection, ctx: HydrationContext): PersonBrief[] {
  const sender = person(ctx, conn.senderId).user;
  const receiver = person(ctx, conn.receiverId).user;
  const ordered = sender.gender === "female" ? [sender, receiver] : [receiver, sender];

  const options: PersonBrief[] = [];
  const seen = new Set<string>([sender.id, receiver.id]);
  for (const party of ordered) {
    for (const kind of ["MAHRAM", "WALI"] as const) {
      for (const link of ctx.links) {
        if (link.childId !== party.id || link.kind !== kind || seen.has(link.parentId)) continue;
        const candidate = ctx.people.get(link.parentId)?.user;
        if (!candidate || candidate.accountStatus !== "ACTIVE") continue;
        seen.add(candidate.id);
        options.push(toBrief(candidate));
      }
    }
  }
  return options;
}

function buildView(actor: User, conn: Connection, perspective: ConnectionPerspective, ctx: HydrationContext): ConnectionView {
  const sender = person(ctx, conn.senderId);
  const receiver = person(ctx, conn.receiverId);
  const receiverNeedsGuardian = requiresGuardian(receiver.user);
  const receiverAccepted = conn.receiverAcceptedAt !== null;
  const receiverGuardianApproved = conn.receiverGuardianApprovedAt !== null;
  const isParty = perspective === "SENDER" || perspective === "RECEIVER";

  const photoAccess = (owner: Person) =>
    photoAccessFor({
      viewer: actor,
      owner: owner.user,
      ownerHasPhoto: owner.hasPhoto,
      viewerIsGuardianOfOwner: ctx.links.some((l) => l.parentId === actor.id && l.childId === owner.user.id),
      approvedConnection:
        conn.status === "APPROVED" && isParty && owner.user.id !== actor.id
          ? { senderPhotoConsent: conn.senderPhotoConsent, receiverPhotoConsent: conn.receiverPhotoConsent }
          : null,
    });

  const awaiting: string[] = [];
  if (conn.status === "PENDING_MALE_PARENT") {
    awaiting.push(`${sender.user.displayName ?? "Sender"}'s wali`);
  } else if (conn.status === "PENDING_FEMALE_PARENT") {
    if (!receiverAccepted) awaiting.push(receiver.user.displayName ?? "Recipient");
    if (receiverNeedsGuardian && !receiverGuardianApproved) {
      awaiting.push(`${receiver.user.displayName ?? "Recipient"}'s wali`);
    }
  }

  const canGuardianDecide =
    (conn.status === "PENDING_MALE_PARENT" && perspective === "SENDER_GUARDIAN") ||
    (conn.status === "PENDING_FEMALE_PARENT" &&
      perspective === "RECEIVER_GUARDIAN" &&
      receiverNeedsGuardian &&
      !receiverGuardianApproved);
  const canAccept = conn.status === "PENDING_FEMALE_PARENT" && perspective === "RECEIVER" && !receiverAccepted;
  const canDecline =
    (conn.status === "PENDING_MALE_PARENT" && perspective === "SENDER_GUARDIAN") ||
    (conn.status === "PENDING_FEMALE_PARENT" &&
      (perspective === "RECEIVER" || (perspective === "RECEIVER_GUARDIAN" && receiverNeedsGuardian)));

  const mahram = conn.mahramId ? ctx.people.get(conn.mahramId)?.user : undefined;

  return {
    id: conn.id,
    status: conn.status,
    perspective,
    sender: toPublicProfile(sender.user, photoAccess(sender)),
    receiver: toPublicProfile(receiver.user, photoAccess(receiver)),
    mahram: mahram ? toBrief(mahram) : null,
    senderGuardianApproved: conn.senderGuardianApprovedAt !== null,
    receiverGuardianApproved,
    receiverAccepted,
    receiverNeedsGuardian,
    awaiting,
    canAccept,
    canDecline,
    canWithdraw: perspective === "SENDER" && PENDING_STATUSES.includes(conn.status),
    canTerminate: conn.status === "APPROVED",
    canGuardianDecide,
    mahramOptions: canAccept || canGuardianDecide ? mahramOptions(conn, ctx) : [],
    senderPhotoConsent: conn.senderPhotoConsent,
    receiverPhotoConsent: conn.receiverPhotoConsent,
    closedReason: conn.closedReason,
    lastActivityAt: conn.lastActivityAt.toISOString(),
    inactiveDays: Math.floor((Date.now() - conn.lastActivityAt.getTime()) / DAY_MS),
    createdAt: conn.createdAt.toISOString(),
    updatedAt: conn.updatedAt.toISOString(),
  };
}

async function findConnection(db: Database, id: string): Promise<Connection> {
  const [conn] = await db.select().from(connections).where(eq(connections.id, id)).limit(1);
  if (!conn) throw errors.notFound("Connection not found.");
  return conn;
}

interface ResolvedConnection {
  conn: Connection;
  ctx: HydrationContext;
  view: ConnectionView;
}

/** Loads a connection the actor is allowed to see, or 404s. */
export async function resolveConnection(db: Database, actor: User, id: string): Promise<ResolvedConnection> {
  const conn = await findConnection(db, id);
  const ctx = await hydrate(db, [conn]);
  const perspective = perspectiveOf(actor.id, conn, ctx);
  if (!isVisible(perspective, conn)) throw errors.notFound("Connection not found.");
  return { conn, ctx, view: buildView(actor, conn, perspective, ctx) };
}

async function transition(
  db: Database,
  conn: Connection,
  patch: Partial<typeof connections.$inferInsert>,
): Promise<Connection> {
  try {
    const [updated] = await db
      .update(connections)
      .set({ ...patch, version: sql`${connections.version} + 1`, updatedAt: new Date() })
      .where(and(eq(connections.id, conn.id), eq(connections.version, conn.version)))
      .returning();
    if (!updated) {
      throw errors.conflict("This connection was just updated by someone else. Refresh and try again.", "STALE_CONNECTION");
    }
    return updated;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw translateDatabaseError(err) ?? err;
  }
}

async function presentOne(db: Database, actor: User, id: string): Promise<ConnectionView> {
  return (await resolveConnection(db, actor, id)).view;
}

// ─── Queries ──────────────────────────────────────────────────────────────────

function isSeeker(user: User): boolean {
  return user.role === "SOLO" || user.role === "DEPENDENT";
}

async function activeChatCount(db: Database, userId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(connections)
    .where(and(eq(connections.status, "APPROVED"), or(eq(connections.senderId, userId), eq(connections.receiverId, userId))));
  return row?.n ?? 0;
}

async function pendingOutgoingCount(db: Database, userId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(connections)
    .where(and(eq(connections.senderId, userId), inArray(connections.status, PENDING_STATUSES)));
  return row?.n ?? 0;
}

async function hasWaliLink(db: Database, childId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: parentChildLinks.id })
    .from(parentChildLinks)
    .where(and(eq(parentChildLinks.childId, childId), eq(parentChildLinks.kind, "WALI")))
    .limit(1);
  return row !== undefined;
}

/** Daily curated batch: up to 5 eligible, opposite-gender, readiness-certified seekers. */
export async function getFeed(db: Database, viewer: User): Promise<FeedResponse> {
  const [activeChats, pendingOutgoing, waliLinked] = await Promise.all([
    activeChatCount(db, viewer.id),
    pendingOutgoingCount(db, viewer.id),
    hasWaliLink(db, viewer.id),
  ]);
  const isAdmin = viewer.role === "ADMIN";
  const gate = {
    readinessCompleted: isAdmin ? true : viewer.readinessCompleted,
    needsWali: isAdmin ? false : requiresGuardian(viewer) && !waliLinked,
    activeChats,
    pendingOutgoing,
    maxActiveChats: MAX_ACTIVE_CHATS,
    maxPendingOutgoing: MAX_PENDING_OUTGOING,
  };
  if (!isSeeker(viewer) && !isAdmin) return { profiles: [], gate };

  const conditions: SQL[] = [
    inArray(users.role, [...SEEKER_ROLES]),
    eq(users.accountStatus, "ACTIVE"),
    eq(users.onboardingCompleted, true),
    eq(users.readinessCompleted, true),
    ne(users.id, viewer.id),
    sql`(NOT (${users.role} = 'DEPENDENT' OR ${users.requiresParentalVetting})
         OR EXISTS (SELECT 1 FROM parent_child_links l WHERE l.child_id = ${users.id} AND l.kind = 'WALI'))`,
    sql`(SELECT count(*) FROM connections c2
          WHERE c2.status = 'APPROVED' AND (c2.sender_id = ${users.id} OR c2.receiver_id = ${users.id})) < ${MAX_ACTIVE_CHATS}`,
  ];

  if (!isAdmin) {
    if (!viewer.gender) return { profiles: [], gate };
    const opposite = viewer.gender === "male" ? "female" : "male";
    conditions.push(
      eq(users.gender, opposite),
      sql`NOT EXISTS (
        SELECT 1 FROM connections c
         WHERE c.status <> 'TERMINATED'
           AND LEAST(c.sender_id, c.receiver_id) = LEAST(${users.id}, ${viewer.id}::uuid)
           AND GREATEST(c.sender_id, c.receiver_id) = GREATEST(${users.id}, ${viewer.id}::uuid))`,
      sql`NOT EXISTS (
        SELECT 1 FROM reports r
         WHERE (r.reporter_id = ${viewer.id}::uuid AND r.reported_id = ${users.id})
            OR (r.reporter_id = ${users.id} AND r.reported_id = ${viewer.id}::uuid))`,
    );
  }

  const rows = await db
    .select({ user: users, photoUserId: profilePhotos.userId })
    .from(users)
    .leftJoin(profilePhotos, eq(profilePhotos.userId, users.id))
    .where(and(...conditions))
    .orderBy(sql`md5(${users.id}::text || ${viewer.id}::text || current_date::text)`)
    .limit(5);

  return {
    gate,
    profiles: rows.map((r) =>
      toPublicProfile(
        r.user,
        photoAccessFor({
          viewer,
          owner: r.user,
          ownerHasPhoto: r.photoUserId !== null,
          viewerIsGuardianOfOwner: false,
          approvedConnection: null,
        }),
      ),
    ),
  };
}

/** Full halal search and exploration with granular filters, pagination, and Islamic privacy enforcement. */
export async function searchSeekers(
  db: Database,
  viewer: User,
  query: SeekerSearchQuery,
): Promise<SeekerSearchResponse> {
  const [activeChats, pendingOutgoing, waliLinked] = await Promise.all([
    activeChatCount(db, viewer.id),
    pendingOutgoingCount(db, viewer.id),
    hasWaliLink(db, viewer.id),
  ]);
  const isAdmin = viewer.role === "ADMIN";
  const gate = {
    readinessCompleted: isAdmin ? true : viewer.readinessCompleted,
    needsWali: isAdmin ? false : requiresGuardian(viewer) && !waliLinked,
    activeChats,
    pendingOutgoing,
    maxActiveChats: MAX_ACTIVE_CHATS,
    maxPendingOutgoing: MAX_PENDING_OUTGOING,
  };
  const emptyResponse: SeekerSearchResponse = {
    profiles: [],
    total: 0,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: 0,
    gate,
  };

  if (!isSeeker(viewer) && !isAdmin) return emptyResponse;

  const conditions: SQL[] = [
    inArray(users.role, [...SEEKER_ROLES]),
    eq(users.accountStatus, "ACTIVE"),
    eq(users.onboardingCompleted, true),
    eq(users.readinessCompleted, true),
    ne(users.id, viewer.id),
    sql`(NOT (${users.role} = 'DEPENDENT' OR ${users.requiresParentalVetting})
         OR EXISTS (SELECT 1 FROM parent_child_links l WHERE l.child_id = ${users.id} AND l.kind = 'WALI'))`,
    sql`(SELECT count(*) FROM connections c2
          WHERE c2.status = 'APPROVED' AND (c2.sender_id = ${users.id} OR c2.receiver_id = ${users.id})) < ${MAX_ACTIVE_CHATS}`,
  ];

  if (query.gender) {
    conditions.push(eq(users.gender, query.gender));
  } else if (!isAdmin) {
    if (!viewer.gender) return emptyResponse;
    const opposite = viewer.gender === "male" ? "female" : "male";
    conditions.push(eq(users.gender, opposite));
  }

  if (!isAdmin) {
    conditions.push(
      sql`NOT EXISTS (
        SELECT 1 FROM connections c
         WHERE c.status <> 'TERMINATED'
           AND LEAST(c.sender_id, c.receiver_id) = LEAST(${users.id}, ${viewer.id}::uuid)
           AND GREATEST(c.sender_id, c.receiver_id) = GREATEST(${users.id}, ${viewer.id}::uuid))`,
      sql`NOT EXISTS (
        SELECT 1 FROM reports r
         WHERE (r.reporter_id = ${viewer.id}::uuid AND r.reported_id = ${users.id})
            OR (r.reporter_id = ${users.id} AND r.reported_id = ${viewer.id}::uuid))`,
    );
  }

  if (query.q) {
    const pattern = `%${query.q.trim()}%`;
    conditions.push(
      or(
        ilike(users.displayName, pattern),
        ilike(users.location, pattern),
        ilike(users.profession, pattern),
        ilike(users.bio, pattern),
      )!,
    );
  }

  if (query.minAge !== undefined) {
    conditions.push(gte(users.age, query.minAge));
  }
  if (query.maxAge !== undefined) {
    conditions.push(lte(users.age, query.maxAge));
  }
  if (query.location) {
    conditions.push(ilike(users.location, `%${query.location.trim()}%`));
  }
  if (query.prayerFrequency) {
    conditions.push(eq(users.prayerFrequency, query.prayerFrequency));
  }
  if (query.dietaryHabits) {
    conditions.push(eq(users.dietaryHabits, query.dietaryHabits));
  }
  if (query.maritalStatus) {
    conditions.push(eq(users.maritalStatus, query.maritalStatus));
  }
  if (query.education) {
    conditions.push(eq(users.education, query.education));
  }
  if (query.waliInvolved === true) {
    conditions.push(or(eq(users.role, "DEPENDENT"), eq(users.requiresParentalVetting, true))!);
  } else if (query.waliInvolved === false) {
    conditions.push(and(eq(users.role, "SOLO"), eq(users.requiresParentalVetting, false))!);
  }

  const whereClause = and(...conditions);

  const [countRow] = await db
    .select({ n: count() })
    .from(users)
    .where(whereClause);
  const total = countRow?.n ?? 0;
  const totalPages = Math.ceil(total / query.pageSize);

  let sortExpr: SQL;
  switch (query.sortBy) {
    case "age_asc":
      sortExpr = sql`${users.age} ASC NULLS LAST`;
      break;
    case "age_desc":
      sortExpr = sql`${users.age} DESC NULLS LAST`;
      break;
    case "readiness":
      sortExpr = sql`cardinality(${users.completedModules}) DESC, ${users.createdAt} DESC`;
      break;
    case "recent":
    default:
      sortExpr = desc(users.createdAt);
      break;
  }

  const offset = (query.page - 1) * query.pageSize;
  const rows = await db
    .select({ user: users, photoUserId: profilePhotos.userId })
    .from(users)
    .leftJoin(profilePhotos, eq(profilePhotos.userId, users.id))
    .where(whereClause)
    .orderBy(sortExpr)
    .limit(query.pageSize)
    .offset(offset);

  return {
    gate,
    total,
    page: query.page,
    pageSize: query.pageSize,
    totalPages,
    profiles: rows.map((r) =>
      toPublicProfile(
        r.user,
        photoAccessFor({
          viewer,
          owner: r.user,
          ownerHasPhoto: r.photoUserId !== null,
          viewerIsGuardianOfOwner: false,
          approvedConnection: null,
        }),
      ),
    ),
  };
}

export async function listConnections(db: Database, actor: User): Promise<ConnectionView[]> {
  await cleanupStaleConnections(db);
  const waliOf = await db
    .select({ childId: parentChildLinks.childId })
    .from(parentChildLinks)
    .where(and(eq(parentChildLinks.parentId, actor.id), eq(parentChildLinks.kind, "WALI")));
  const childIds = waliOf.map((l) => l.childId);

  const involvement = [
    eq(connections.senderId, actor.id),
    eq(connections.receiverId, actor.id),
    eq(connections.mahramId, actor.id),
  ];
  if (childIds.length > 0) {
    involvement.push(inArray(connections.senderId, childIds), inArray(connections.receiverId, childIds));
  }

  const conns = await db
    .select()
    .from(connections)
    .where(
      and(
        or(...involvement),
        or(inArray(connections.status, LIVE_STATUSES), gte(connections.updatedAt, new Date(Date.now() - 90 * DAY_MS))),
      ),
    )
    .orderBy(desc(connections.updatedAt))
    .limit(150);

  const ctx = await hydrate(db, conns);
  const views: ConnectionView[] = [];
  for (const conn of conns) {
    const perspective = perspectiveOf(actor.id, conn, ctx);
    if (isVisible(perspective, conn)) views.push(buildView(actor, conn, perspective, ctx));
  }
  return views;
}

// ─── Commands ─────────────────────────────────────────────────────────────────

function isDiscoverable(user: User): boolean {
  return isSeeker(user) && user.accountStatus === "ACTIVE" && user.onboardingCompleted && user.gender !== null;
}

export async function createConnection(db: Database, sender: User, receiverId: string): Promise<ConnectionView> {
  if (!isSeeker(sender)) throw errors.forbidden("Only seekers can send connection requests.", "NOT_A_SEEKER");
  if (!sender.readinessCompleted) {
    throw errors.forbidden(
      "Complete the “Etiquette of Halal Courtship” module in the Readiness Hub before sending requests.",
      "READINESS_REQUIRED",
    );
  }
  if (!sender.gender || !sender.onboardingCompleted) {
    throw errors.forbidden("Complete your profile before sending requests.", "PROFILE_INCOMPLETE");
  }
  if (receiverId === sender.id) throw errors.badRequest("You cannot connect with yourself.");

  const unavailable = errors.notFound("This member is not available for new requests.", "RECIPIENT_UNAVAILABLE");
  const [receiver] = await db.select().from(users).where(eq(users.id, receiverId)).limit(1);
  if (!receiver || !isDiscoverable(receiver) || !receiver.readinessCompleted || receiver.gender === sender.gender) {
    throw unavailable;
  }

  const [blocked] = await db
    .select({ id: reports.id })
    .from(reports)
    .where(
      or(
        and(eq(reports.reporterId, sender.id), eq(reports.reportedId, receiver.id)),
        and(eq(reports.reporterId, receiver.id), eq(reports.reportedId, sender.id)),
      ),
    )
    .limit(1);
  if (blocked) throw unavailable;

  const senderNeedsGuardian = requiresGuardian(sender);
  if (senderNeedsGuardian && !(await hasWaliLink(db, sender.id))) {
    throw errors.conflict(
      "Your requests require wali approval, but no wali is linked yet. Invite your wali from the Family page.",
      "WALI_REQUIRED",
    );
  }
  if (requiresGuardian(receiver) && !(await hasWaliLink(db, receiver.id))) throw unavailable;

  if ((await activeChatCount(db, sender.id)) >= MAX_ACTIVE_CHATS) {
    throw errors.conflict(
      `You already have ${MAX_ACTIVE_CHATS} active chats. Close one before starting a new courtship.`,
      "ACTIVE_CHAT_LIMIT",
    );
  }
  if ((await pendingOutgoingCount(db, sender.id)) >= MAX_PENDING_OUTGOING) {
    throw errors.conflict(
      `You have ${MAX_PENDING_OUTGOING} requests awaiting a response. Wait for replies or withdraw one first.`,
      "PENDING_LIMIT",
    );
  }

  await enforceRateLimit(db, `connect:${sender.id}`, 10, 86_400, "You can send at most 10 requests per day.");

  const initialStatus: ConnectionStatus = senderNeedsGuardian ? "PENDING_MALE_PARENT" : "PENDING_FEMALE_PARENT";

  // The Readiness Gate is re-checked inside the INSERT so a concurrent reset cannot slip through.
  let insertedId: string | undefined;
  try {
    const result = await db.execute(sql`
      INSERT INTO connections (sender_id, receiver_id, status)
      SELECT s.id, r.id, ${initialStatus}::connection_status
        FROM users s, users r
       WHERE s.id = ${sender.id}::uuid
         AND r.id = ${receiver.id}::uuid
         AND s.readiness_completed AND r.readiness_completed
         AND s.account_status = 'ACTIVE' AND r.account_status = 'ACTIVE'
      RETURNING id`);
    const row = rowsOf(result)[0];
    insertedId = row ? String(row.id) : undefined;
  } catch (err) {
    throw translateDatabaseError(err) ?? err;
  }
  if (!insertedId) {
    throw errors.forbidden("Both members must have completed the Readiness Hub.", "READINESS_REQUIRED");
  }

  await recordAudit(db, {
    actorId: sender.id,
    targetId: receiver.id,
    action: "CONNECTION_REQUESTED",
    metadata: { connectionId: insertedId, status: initialStatus },
  });
  return presentOne(db, sender, insertedId);
}

export async function decideConnection(
  db: Database,
  actor: User,
  connectionId: string,
  input: ConnectionDecisionInput,
): Promise<ConnectionView> {
  const { conn, ctx, view } = await resolveConnection(db, actor, connectionId);
  if (!PENDING_STATUSES.includes(conn.status)) {
    throw errors.conflict("This request is no longer pending.", "INVALID_TRANSITION");
  }
  const now = new Date();

  if (input.decision === "REJECT") {
    if (!view.canDecline) throw errors.forbidden("You cannot decline this request.", "NOT_ALLOWED");
    await transition(db, conn, {
      status: "REJECTED",
      closedBy: actor.id,
      closedReason: `DECLINED_BY_${view.perspective}`,
    });
    await recordAudit(db, {
      actorId: actor.id,
      targetId: view.perspective.startsWith("SENDER") ? conn.senderId : conn.receiverId,
      action: "CONNECTION_REJECTED",
      metadata: { connectionId: conn.id, fromStatus: conn.status, perspective: view.perspective },
    });
    return presentOne(db, actor, conn.id);
  }

  if (conn.status === "PENDING_MALE_PARENT") {
    if (!view.canGuardianDecide) throw errors.forbidden("Only the sender's wali can approve this stage.", "NOT_ALLOWED");
    await transition(db, conn, {
      status: "PENDING_FEMALE_PARENT",
      senderGuardianApprovedBy: actor.id,
      senderGuardianApprovedAt: now,
    });
    await recordAudit(db, {
      actorId: actor.id,
      targetId: conn.senderId,
      action: "CONNECTION_GUARDIAN_APPROVED",
      metadata: { connectionId: conn.id, side: "SENDER" },
    });
    return presentOne(db, actor, conn.id);
  }

  // PENDING_FEMALE_PARENT
  const patch: Partial<typeof connections.$inferInsert> = {};
  let stepAction: "CONNECTION_ACCEPTED" | "CONNECTION_GUARDIAN_APPROVED";
  if (view.canAccept) {
    if (!actor.readinessCompleted) {
      throw errors.forbidden("Complete the Readiness Hub before accepting requests.", "READINESS_REQUIRED");
    }
    patch.receiverAcceptedAt = now;
    stepAction = "CONNECTION_ACCEPTED";
  } else if (view.canGuardianDecide) {
    patch.receiverGuardianApprovedBy = actor.id;
    patch.receiverGuardianApprovedAt = now;
    stepAction = "CONNECTION_GUARDIAN_APPROVED";
  } else {
    throw errors.forbidden("You cannot approve this request.", "NOT_ALLOWED");
  }

  const accepted = conn.receiverAcceptedAt !== null || patch.receiverAcceptedAt !== undefined;
  const guardianSatisfied =
    !view.receiverNeedsGuardian || conn.receiverGuardianApprovedAt !== null || patch.receiverGuardianApprovedAt !== undefined;

  let mahramId: string | undefined;
  if (accepted && guardianSatisfied) {
    const options = mahramOptions(conn, ctx);
    if (input.mahramId !== undefined) {
      if (!options.some((o) => o.id === input.mahramId)) {
        throw errors.badRequest("That person is not an eligible mahram for this connection.", "MAHRAM_INVALID");
      }
      mahramId = input.mahramId;
    } else {
      mahramId = options[0]?.id;
    }
    if (!mahramId) {
      throw errors.conflict(
        "A mahram must be assigned before this chat can open, but neither of you has a wali or mahram linked. Link one from the Family page, then approve again.",
        "MAHRAM_REQUIRED",
      );
    }
    if ((await activeChatCount(db, conn.senderId)) >= MAX_ACTIVE_CHATS || (await activeChatCount(db, conn.receiverId)) >= MAX_ACTIVE_CHATS) {
      throw errors.conflict(
        `One of you already has ${MAX_ACTIVE_CHATS} active chats. An existing chat must close before this one can open.`,
        "ACTIVE_CHAT_LIMIT",
      );
    }
    patch.status = "APPROVED";
    patch.mahramId = mahramId;
  }

  await transition(db, conn, patch);
  await recordAudit(db, {
    actorId: actor.id,
    targetId: conn.receiverId,
    action: stepAction,
    metadata: { connectionId: conn.id, side: "RECEIVER" },
  });
  if (mahramId) {
    await recordAudit(db, {
      actorId: actor.id,
      targetId: conn.senderId,
      action: "CONNECTION_APPROVED",
      metadata: { connectionId: conn.id, receiverId: conn.receiverId, mahramId },
    });
  }
  return presentOne(db, actor, conn.id);
}

export async function withdrawConnection(db: Database, actor: User, connectionId: string): Promise<ConnectionView> {
  const { conn, view } = await resolveConnection(db, actor, connectionId);
  if (!view.canWithdraw) throw errors.forbidden("Only a pending request you sent can be withdrawn.", "NOT_ALLOWED");
  await transition(db, conn, { status: "TERMINATED", closedBy: actor.id, closedReason: "WITHDRAWN" });
  await recordAudit(db, {
    actorId: actor.id,
    targetId: conn.receiverId,
    action: "CONNECTION_WITHDRAWN",
    metadata: { connectionId: conn.id, fromStatus: conn.status },
  });
  return presentOne(db, actor, conn.id);
}

export async function terminateConnection(
  db: Database,
  actor: User,
  connectionId: string,
  reason: string | null | undefined,
): Promise<ConnectionView> {
  const { conn, view } = await resolveConnection(db, actor, connectionId);
  if (!view.canTerminate) throw errors.forbidden("Only an active chat can be ended.", "NOT_ALLOWED");
  await transition(db, conn, {
    status: "TERMINATED",
    closedBy: actor.id,
    closedReason: reason?.trim() ? `ENDED_BY_${view.perspective}: ${reason.trim()}` : `ENDED_BY_${view.perspective}`,
  });
  await recordAudit(db, {
    actorId: actor.id,
    targetId: actor.id === conn.senderId ? conn.receiverId : conn.senderId,
    action: "CONNECTION_TERMINATED",
    metadata: { connectionId: conn.id, perspective: view.perspective, reason: reason ?? null },
  });
  return presentOne(db, actor, conn.id);
}

export async function setPhotoConsent(
  db: Database,
  actor: User,
  connectionId: string,
  consent: boolean,
): Promise<ConnectionView> {
  const { conn, view } = await resolveConnection(db, actor, connectionId);
  if (conn.status !== "APPROVED" || (view.perspective !== "SENDER" && view.perspective !== "RECEIVER")) {
    throw errors.forbidden("Photo consent can only be given by the two members of an active chat.", "NOT_ALLOWED");
  }
  await transition(
    db,
    conn,
    view.perspective === "SENDER" ? { senderPhotoConsent: consent } : { receiverPhotoConsent: consent },
  );
  await recordAudit(db, {
    actorId: actor.id,
    targetId: actor.id === conn.senderId ? conn.receiverId : conn.senderId,
    action: "PHOTO_CONSENT_CHANGED",
    metadata: { connectionId: conn.id, consent },
  });
  return presentOne(db, actor, conn.id);
}
