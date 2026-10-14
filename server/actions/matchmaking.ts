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
import { and, count, desc, eq, gte, inArray, or, sql } from "drizzle-orm";
import {
  MAX_ACTIVE_CHATS,
  MAX_PENDING_OUTGOING,
  type ActivitySummary,
  type ConnectionDecisionInput,
  type ConnectionPerspective,
  type ConnectionView,
  type PersonBrief,
} from "../../src/lib/contracts.js";
import {
  connections,
  parentChildLinks,
  profilePhotos,
  profileReactions,
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
import { asNumber, rowsOf } from "../rows.js";
import { cleanupStaleConnections } from "./cron.js";
import { countAllUnread, totalUnread, unreadByConnection } from "./unread.js";

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

function buildView(
  actor: User,
  conn: Connection,
  perspective: ConnectionPerspective,
  ctx: HydrationContext,
  unreadCount: number,
): ConnectionView {
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
    unreadCount,
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

/**
 * Loads a connection the actor is allowed to see, or 404s.
 * `unread: false` skips the unread count (the chat endpoint computes its own after marking the room read).
 */
export async function resolveConnection(
  db: Database,
  actor: User,
  id: string,
  options: { unread?: boolean } = {},
): Promise<ResolvedConnection> {
  const conn = await findConnection(db, id);
  const ctx = await hydrate(db, [conn]);
  const perspective = perspectiveOf(actor.id, conn, ctx);
  if (!isVisible(perspective, conn)) throw errors.notFound("Connection not found.");
  const unread =
    options.unread === false || conn.status !== "APPROVED"
      ? 0
      : totalUnread((await unreadByConnection(db, actor, [conn.id])).get(conn.id));
  return { conn, ctx, view: buildView(actor, conn, perspective, ctx, unread) };
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

export function isSeeker(user: User): boolean {
  return user.role === "SOLO" || user.role === "DEPENDENT";
}

export async function activeChatCount(db: Database, userId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(connections)
    .where(and(eq(connections.status, "APPROVED"), or(eq(connections.senderId, userId), eq(connections.receiverId, userId))));
  return row?.n ?? 0;
}

export async function pendingOutgoingCount(db: Database, userId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(connections)
    .where(and(eq(connections.senderId, userId), inArray(connections.status, PENDING_STATUSES)));
  return row?.n ?? 0;
}

export async function hasWaliLink(db: Database, childId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: parentChildLinks.id })
    .from(parentChildLinks)
    .where(and(eq(parentChildLinks.childId, childId), eq(parentChildLinks.kind, "WALI")))
    .limit(1);
  return row !== undefined;
}

/**
 * Counts for the navigation badges. Mirrors the `canAccept` / `canGuardianDecide`
 * rules in `buildView`, as one cheap query instead of hydrating every connection.
 */
export async function getActivitySummary(db: Database, actor: User): Promise<ActivitySummary> {
  const [row] = rowsOf(
    await db.execute(sql`
      SELECT
        (SELECT count(*) FROM connections c
          WHERE c.status = 'PENDING_FEMALE_PARENT'
            AND c.receiver_id = ${actor.id}::uuid
            AND c.receiver_accepted_at IS NULL)
        + (SELECT count(*) FROM connections c
            JOIN parent_child_links l
              ON l.parent_id = ${actor.id}::uuid AND l.kind = 'WALI' AND l.child_id = c.sender_id
           WHERE c.status = 'PENDING_MALE_PARENT')
        + (SELECT count(*) FROM connections c
            JOIN parent_child_links l
              ON l.parent_id = ${actor.id}::uuid AND l.kind = 'WALI' AND l.child_id = c.receiver_id
            JOIN users r ON r.id = c.receiver_id
           WHERE c.status = 'PENDING_FEMALE_PARENT'
             AND c.receiver_guardian_approved_at IS NULL
             AND (r.role = 'DEPENDENT' OR r.requires_parental_vetting)) AS needs_response,
        (SELECT count(*) FROM connections c
          WHERE c.status = 'APPROVED'
            AND (c.sender_id = ${actor.id}::uuid OR c.receiver_id = ${actor.id}::uuid OR c.mahram_id = ${actor.id}::uuid))
          AS active_chats,
        (SELECT count(*) FROM connections c
          WHERE c.sender_id = ${actor.id}::uuid
            AND c.status IN ('PENDING_MALE_PARENT', 'PENDING_FEMALE_PARENT')) AS pending_outgoing`),
  );
  return {
    needsResponse: asNumber(row?.needs_response),
    activeChats: asNumber(row?.active_chats),
    pendingOutgoing: asNumber(row?.pending_outgoing),
    unreadMessages: await countAllUnread(db, actor),
  };
}

/**
 * The connections list is polled by every open tab, and the inactivity sweep is four
 * statements. Running it on a short timer keeps chats closing promptly between the
 * daily cron runs without paying for it on every poll. Tracked per database handle,
 * so separate databases (tests) never share a timer.
 */
const SWEEP_INTERVAL_MS = 60_000;
const lastSweep = new WeakMap<Database, number>();

async function sweepStaleConnectionsIfDue(db: Database): Promise<void> {
  const now = Date.now();
  if (now - (lastSweep.get(db) ?? 0) < SWEEP_INTERVAL_MS) return;
  lastSweep.set(db, now);
  await cleanupStaleConnections(db);
}

export async function listConnections(db: Database, actor: User): Promise<ConnectionView[]> {
  await sweepStaleConnectionsIfDue(db);
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
  const unread = await unreadByConnection(
    db,
    actor,
    conns.filter((c) => c.status === "APPROVED").map((c) => c.id),
  );
  const views: ConnectionView[] = [];
  for (const conn of conns) {
    const perspective = perspectiveOf(actor.id, conn, ctx);
    if (isVisible(perspective, conn)) views.push(buildView(actor, conn, perspective, ctx, totalUnread(unread.get(conn.id))));
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

  // A requested profile leaves the shortlist; it now lives under Requests.
  await db
    .delete(profileReactions)
    .where(and(eq(profileReactions.userId, sender.id), eq(profileReactions.targetId, receiver.id)));

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
