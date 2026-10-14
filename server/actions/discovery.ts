/**
 * Discovery: the daily curated batch, filtered browsing, and the viewer's
 * private shortlist / passes.
 *
 * Every query starts from the same eligibility rules, so a profile that may
 * not be contacted is never shown anywhere:
 *   • active, onboarded, readiness-certified seekers with a free chat slot
 *   • guardian-vetted seekers only once their wali is linked
 *   • for seekers: the opposite gender only, no existing live connection,
 *     and no report in either direction
 * Fields a member has hidden are never matched by a filter or keyword, so
 * search cannot be used to infer them.
 */
import { and, count, desc, eq, gte, ilike, inArray, lte, ne, or, sql, type SQL } from "drizzle-orm";
import {
  MAX_ACTIVE_CHATS,
  MAX_PENDING_OUTGOING,
  PASS_COOLDOWN_DAYS,
  SEEKER_ROLES,
  type DiscoverProfile,
  type FeedGate,
  type FeedResponse,
  type PrivacyFieldKey,
  type ReactionKind,
  type ReactionResult,
  type SavedProfilesResponse,
  type SeekerSearchQuery,
  type SeekerSearchResponse,
} from "../../src/lib/contracts.js";
import { profilePhotos, profileReactions, users, type User } from "../../src/lib/schema.js";
import type { Database } from "../db.js";
import { errors } from "../http.js";
import { photoAccessFor, requiresGuardian, toPublicProfile } from "../presenters.js";
import { enforceRateLimit } from "../rate-limit.js";
import { escapeLike } from "../rows.js";
import { activeChatCount, hasWaliLink, isSeeker, pendingOutgoingCount } from "./matchmaking.js";

const DAILY_BATCH_SIZE = 5;
const SAVED_LIMIT = 100;

// ─── Shared building blocks ───────────────────────────────────────────────────

async function gateFor(db: Database, viewer: User): Promise<FeedGate> {
  const [activeChats, pendingOutgoing, waliLinked] = await Promise.all([
    activeChatCount(db, viewer.id),
    pendingOutgoingCount(db, viewer.id),
    hasWaliLink(db, viewer.id),
  ]);
  const isAdmin = viewer.role === "ADMIN";
  return {
    readinessCompleted: isAdmin ? true : viewer.readinessCompleted,
    needsWali: isAdmin ? false : requiresGuardian(viewer) && !waliLinked,
    activeChats,
    pendingOutgoing,
    maxActiveChats: MAX_ACTIVE_CHATS,
    maxPendingOutgoing: MAX_PENDING_OUTGOING,
  };
}

/** Members who can receive a request from anyone. */
function availableSeekerConditions(viewer: User): SQL[] {
  return [
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
}

/** Narrows to members this particular seeker may contact. */
function contactableConditions(viewer: User & { gender: "male" | "female" }): SQL[] {
  return [
    eq(users.gender, viewer.gender === "male" ? "female" : "male"),
    sql`NOT EXISTS (
      SELECT 1 FROM connections c
       WHERE c.status <> 'TERMINATED'
         AND LEAST(c.sender_id, c.receiver_id) = LEAST(${users.id}, ${viewer.id}::uuid)
         AND GREATEST(c.sender_id, c.receiver_id) = GREATEST(${users.id}, ${viewer.id}::uuid))`,
    sql`NOT EXISTS (
      SELECT 1 FROM reports r
       WHERE (r.reporter_id = ${viewer.id}::uuid AND r.reported_id = ${users.id})
          OR (r.reporter_id = ${users.id} AND r.reported_id = ${viewer.id}::uuid))`,
  ];
}

function hasGender(viewer: User): viewer is User & { gender: "male" | "female" } {
  return viewer.gender !== null;
}

const passIsFresh = sql`pr.created_at > now() - make_interval(days => ${PASS_COOLDOWN_DAYS}::int)`;

function reactionExists(viewer: User, kind: ReactionKind, extra?: SQL): SQL {
  return sql`EXISTS (
    SELECT 1 FROM profile_reactions pr
     WHERE pr.user_id = ${viewer.id}::uuid AND pr.target_id = ${users.id} AND pr.kind = ${kind}::reaction_kind
       ${extra ? sql`AND ${extra}` : sql``})`;
}

const isHidden = (key: PrivacyFieldKey) => sql`${key}::text = ANY(${users.hiddenFields})`;

/** Applies a filter only to members who have not hidden the field it reads. */
function onVisible(key: PrivacyFieldKey, condition: SQL): SQL {
  return sql`(NOT (${isHidden(key)}) AND ${condition})`;
}

interface CandidateRow {
  user: User;
  photoUserId: string | null;
}

async function present(db: Database, viewer: User, rows: CandidateRow[]): Promise<DiscoverProfile[]> {
  if (rows.length === 0) return [];
  const saved = await db
    .select({ targetId: profileReactions.targetId, note: profileReactions.note })
    .from(profileReactions)
    .where(
      and(
        eq(profileReactions.userId, viewer.id),
        eq(profileReactions.kind, "SAVED"),
        inArray(
          profileReactions.targetId,
          rows.map((r) => r.user.id),
        ),
      ),
    );
  const notes = new Map(saved.map((s) => [s.targetId, s.note]));

  return rows.map((r) => ({
    ...toPublicProfile(
      r.user,
      photoAccessFor({
        viewer,
        owner: r.user,
        ownerHasPhoto: r.photoUserId !== null,
        viewerIsGuardianOfOwner: false,
        approvedConnection: null,
      }),
    ),
    saved: notes.has(r.user.id),
    note: notes.get(r.user.id) ?? null,
  }));
}

// ─── Queries ──────────────────────────────────────────────────────────────────

/** Daily curated batch: up to 5 eligible, opposite-gender, readiness-certified seekers. */
export async function getFeed(db: Database, viewer: User): Promise<FeedResponse> {
  const gate = await gateFor(db, viewer);
  const isAdmin = viewer.role === "ADMIN";
  if (!isSeeker(viewer) && !isAdmin) return { profiles: [], gate };

  const conditions = availableSeekerConditions(viewer);
  if (!isAdmin) {
    if (!hasGender(viewer)) return { profiles: [], gate };
    conditions.push(
      ...contactableConditions(viewer),
      // Passes from earlier days make room for someone new; today's are removed below.
      sql`NOT (${reactionExists(viewer, "PASSED", sql`${passIsFresh} AND pr.created_at < current_date`)})`,
    );
  }

  const rows = await db
    .select({ user: users, photoUserId: profilePhotos.userId })
    .from(users)
    .leftJoin(profilePhotos, eq(profilePhotos.userId, users.id))
    .where(and(...conditions))
    .orderBy(sql`md5(${users.id}::text || ${viewer.id}::text || current_date::text)`)
    .limit(DAILY_BATCH_SIZE);

  // Passing on one of today's five shrinks the batch instead of refilling it,
  // so the daily batch stays a small, deliberate set.
  const passedToday =
    rows.length === 0
      ? []
      : await db
          .select({ targetId: profileReactions.targetId })
          .from(profileReactions)
          .where(
            and(
              eq(profileReactions.userId, viewer.id),
              eq(profileReactions.kind, "PASSED"),
              inArray(
                profileReactions.targetId,
                rows.map((r) => r.user.id),
              ),
            ),
          );
  const passedIds = new Set(passedToday.map((p) => p.targetId));

  return { gate, profiles: await present(db, viewer, rows.filter((r) => !passedIds.has(r.user.id))) };
}

/** Browsing with filters and pagination, under the same eligibility and privacy rules as the feed. */
export async function searchSeekers(
  db: Database,
  viewer: User,
  query: SeekerSearchQuery,
): Promise<SeekerSearchResponse> {
  const gate = await gateFor(db, viewer);
  const isAdmin = viewer.role === "ADMIN";
  const emptyResponse: SeekerSearchResponse = {
    profiles: [],
    total: 0,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: 0,
    passedCount: 0,
    gate,
  };

  if (!isSeeker(viewer) && !isAdmin) return emptyResponse;

  const eligible = availableSeekerConditions(viewer);
  if (isAdmin) {
    // Preview only: administrators may look at either gender.
    if (query.gender) eligible.push(eq(users.gender, query.gender));
  } else {
    if (!hasGender(viewer)) return emptyResponse;
    eligible.push(...contactableConditions(viewer));
  }

  const filters: SQL[] = [];
  if (query.q) {
    const pattern = `%${escapeLike(query.q.trim())}%`;
    const match = or(
      ilike(users.displayName, pattern),
      onVisible("location", ilike(users.location, pattern)),
      onVisible("profession", ilike(users.profession, pattern)),
      onVisible("bio", ilike(users.bio, pattern)),
    );
    if (match) filters.push(match);
  }
  if (query.minAge !== undefined) filters.push(onVisible("age", gte(users.age, query.minAge)));
  if (query.maxAge !== undefined) filters.push(onVisible("age", lte(users.age, query.maxAge)));
  if (query.location) {
    filters.push(onVisible("location", ilike(users.location, `%${escapeLike(query.location.trim())}%`)));
  }
  if (query.prayerFrequency) {
    filters.push(onVisible("prayerFrequency", eq(users.prayerFrequency, query.prayerFrequency)));
  }
  if (query.dietaryHabits) filters.push(onVisible("dietaryHabits", eq(users.dietaryHabits, query.dietaryHabits)));
  if (query.maritalStatus) filters.push(onVisible("maritalStatus", eq(users.maritalStatus, query.maritalStatus)));
  if (query.education) filters.push(onVisible("education", eq(users.education, query.education)));
  if (query.waliInvolved === true) {
    const vetted = or(eq(users.role, "DEPENDENT"), eq(users.requiresParentalVetting, true));
    if (vetted) filters.push(vetted);
  } else if (query.waliInvolved === false) {
    const independent = and(eq(users.role, "SOLO"), eq(users.requiresParentalVetting, false));
    if (independent) filters.push(independent);
  }

  const passed = reactionExists(viewer, "PASSED", passIsFresh);
  const shown: SQL[] = [...eligible, ...filters];
  if (!isAdmin) {
    shown.push(sql`NOT (${passed})`);
    if (query.hideSaved) shown.push(sql`NOT (${reactionExists(viewer, "SAVED")})`);
  }
  const whereClause = and(...shown);

  const [[countRow], [passedRow]] = await Promise.all([
    db.select({ n: count() }).from(users).where(whereClause),
    isAdmin
      ? Promise.resolve([{ n: 0 }])
      : db
          .select({ n: count() })
          .from(users)
          .where(and(...eligible, passed)),
  ]);
  const total = countRow?.n ?? 0;

  // A hidden age must not be recoverable from where a profile lands in the ordering.
  const visibleAge = sql`CASE WHEN ${isHidden("age")} THEN NULL ELSE ${users.age} END`;
  let sortExpr: SQL;
  switch (query.sortBy) {
    case "age_asc":
      sortExpr = sql`${visibleAge} ASC NULLS LAST, ${users.createdAt} DESC`;
      break;
    case "age_desc":
      sortExpr = sql`${visibleAge} DESC NULLS LAST, ${users.createdAt} DESC`;
      break;
    case "readiness":
      sortExpr = sql`cardinality(${users.completedModules}) DESC, ${users.createdAt} DESC`;
      break;
    case "recent":
    default:
      sortExpr = desc(users.createdAt);
      break;
  }

  const rows = await db
    .select({ user: users, photoUserId: profilePhotos.userId })
    .from(users)
    .leftJoin(profilePhotos, eq(profilePhotos.userId, users.id))
    .where(whereClause)
    // The id tie-break keeps pages stable when several rows share a sort value.
    .orderBy(sortExpr, users.id)
    .limit(query.pageSize)
    .offset(query.offset ?? (query.page - 1) * query.pageSize);

  return {
    gate,
    total,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.ceil(total / query.pageSize),
    passedCount: passedRow?.n ?? 0,
    profiles: await present(db, viewer, rows),
  };
}

/** The viewer's shortlist, newest first. Members who are no longer available drop out. */
export async function listSavedProfiles(db: Database, viewer: User): Promise<SavedProfilesResponse> {
  const gate = await gateFor(db, viewer);
  if (!isSeeker(viewer) || !hasGender(viewer)) return { profiles: [], gate };

  const rows = await db
    .select({ user: users, photoUserId: profilePhotos.userId })
    .from(profileReactions)
    .innerJoin(users, eq(users.id, profileReactions.targetId))
    .leftJoin(profilePhotos, eq(profilePhotos.userId, users.id))
    .where(
      and(
        eq(profileReactions.userId, viewer.id),
        eq(profileReactions.kind, "SAVED"),
        ...availableSeekerConditions(viewer),
        ...contactableConditions(viewer),
      ),
    )
    .orderBy(desc(profileReactions.createdAt))
    .limit(SAVED_LIMIT);

  return { gate, profiles: await present(db, viewer, rows) };
}

// ─── Reactions ────────────────────────────────────────────────────────────────

function assertCanReact(viewer: User): asserts viewer is User & { gender: "male" | "female" } {
  if (!isSeeker(viewer)) throw errors.forbidden("Only seekers can save or pass on profiles.", "NOT_A_SEEKER");
  if (!hasGender(viewer)) throw errors.forbidden("Complete your profile first.", "PROFILE_INCOMPLETE");
}

/** Saves a profile to the shortlist or passes on it. One reaction per profile; the latest wins. */
export async function setReaction(
  db: Database,
  viewer: User,
  targetId: string,
  kind: ReactionKind,
): Promise<ReactionResult> {
  assertCanReact(viewer);
  if (targetId === viewer.id) throw errors.badRequest("You cannot react to your own profile.");
  await enforceRateLimit(db, `react:${viewer.id}`, 400, 3600, "You are browsing too quickly. Take a short break.");

  const [target] = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.id, targetId),
        inArray(users.role, [...SEEKER_ROLES]),
        eq(users.accountStatus, "ACTIVE"),
        eq(users.onboardingCompleted, true),
        eq(users.gender, viewer.gender === "male" ? "female" : "male"),
      ),
    )
    .limit(1);
  if (!target) throw errors.notFound("This member is not available.", "RECIPIENT_UNAVAILABLE");

  await db
    .insert(profileReactions)
    .values({ userId: viewer.id, targetId, kind })
    .onConflictDoUpdate({
      target: [profileReactions.userId, profileReactions.targetId],
      // Saving again keeps the note; passing means the save, and its note, are gone.
      set: { kind, createdAt: sql`now()`, note: kind === "SAVED" ? sql`${profileReactions.note}` : null },
    });
  return { targetId, kind };
}

/** Sets or clears the viewer's private note on a profile they have saved. */
export async function setSavedNote(
  db: Database,
  viewer: User,
  targetId: string,
  note: string | null | undefined,
): Promise<{ targetId: string; note: string | null }> {
  assertCanReact(viewer);
  const value = note?.trim() ? note.trim() : null;
  const [updated] = await db
    .update(profileReactions)
    .set({ note: value })
    .where(
      and(eq(profileReactions.userId, viewer.id), eq(profileReactions.targetId, targetId), eq(profileReactions.kind, "SAVED")),
    )
    .returning({ targetId: profileReactions.targetId, note: profileReactions.note });
  if (!updated) throw errors.notFound("Save this profile before adding a note.", "NOT_SAVED");
  return updated;
}

/** Removes a save or undoes a pass. Succeeds even when there was nothing to remove. */
export async function clearReaction(db: Database, viewer: User, targetId: string): Promise<void> {
  assertCanReact(viewer);
  await db
    .delete(profileReactions)
    .where(and(eq(profileReactions.userId, viewer.id), eq(profileReactions.targetId, targetId)));
}

/** Brings every passed profile back into discovery. */
export async function resetPasses(db: Database, viewer: User): Promise<{ restored: number }> {
  assertCanReact(viewer);
  const removed = await db
    .delete(profileReactions)
    .where(and(eq(profileReactions.userId, viewer.id), eq(profileReactions.kind, "PASSED")))
    .returning({ targetId: profileReactions.targetId });
  return { restored: removed.length };
}
