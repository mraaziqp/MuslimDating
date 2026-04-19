import { db } from "../lib/db";
import { users, connections, parentChildLinks } from "../lib/schema";
import { eq, or, and, ne, inArray, sql } from "drizzle-orm";
import type { User, UserRole, ConnectionStatus } from "../lib/schema";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface SyncUserParams {
  firebaseUid: string;
  email: string;
  role: UserRole;
  phone?: string;
  displayName?: string;
  gender?: string;
  requiresParentalVetting?: boolean;
}

export interface UpdateProfileParams {
  firebaseUid: string;
  displayName?: string;
  gender?: string;
  age?: number;
  location?: string;
  profession?: string;
  prayerFrequency?: string;
  dietaryHabits?: string;
  bio?: string;
  photoUrl?: string;
  modestyBlurEnabled?: boolean;
  requiresParentalVetting?: boolean;
}

// ─── syncUserWithDb ─────────────────────────────────────────────────────────

export async function syncUserWithDb(params: SyncUserParams): Promise<User> {
  const { firebaseUid, email, role, phone, displayName, gender, requiresParentalVetting } = params;

  await db
    .insert(users)
    .values({
      firebaseUid,
      email,
      phone: phone ?? null,
      role,
      displayName: displayName ?? null,
      gender: gender ?? null,
      requiresParentalVetting: requiresParentalVetting ?? false,
    })
    .onConflictDoNothing({ target: users.firebaseUid });

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.firebaseUid, firebaseUid))
    .limit(1);

  return user;
}

// ─── getUserByFirebaseId ────────────────────────────────────────────────────

export async function getUserByFirebaseId(firebaseUid: string): Promise<User | null> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.firebaseUid, firebaseUid))
    .limit(1);

  return user ?? null;
}

// ─── updateProfile ──────────────────────────────────────────────────────────

export async function updateProfile(params: UpdateProfileParams): Promise<User> {
  const { firebaseUid, ...fields } = params;

  // Build update object — only include keys explicitly provided
  const patch: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };
  if (fields.displayName !== undefined) patch.displayName = fields.displayName;
  if (fields.gender !== undefined) patch.gender = fields.gender;
  if (fields.age !== undefined) patch.age = fields.age;
  if (fields.location !== undefined) patch.location = fields.location;
  if (fields.profession !== undefined) patch.profession = fields.profession;
  if (fields.prayerFrequency !== undefined) patch.prayerFrequency = fields.prayerFrequency;
  if (fields.dietaryHabits !== undefined) patch.dietaryHabits = fields.dietaryHabits;
  if (fields.bio !== undefined) patch.bio = fields.bio;
  if (fields.photoUrl !== undefined) patch.photoUrl = fields.photoUrl;
  if (fields.modestyBlurEnabled !== undefined) patch.modestyBlurEnabled = fields.modestyBlurEnabled;
  if (fields.requiresParentalVetting !== undefined) patch.requiresParentalVetting = fields.requiresParentalVetting;

  await db.update(users).set(patch).where(eq(users.firebaseUid, firebaseUid));

  const [updated] = await db
    .select()
    .from(users)
    .where(eq(users.firebaseUid, firebaseUid))
    .limit(1);

  return updated;
}

// ─── completeModule ─────────────────────────────────────────────────────────

export async function completeModule(
  firebaseUid: string,
  moduleId: string
): Promise<User> {
  const [current] = await db
    .select({ completedModules: users.completedModules, isIntroCompleted: users.isIntroCompleted })
    .from(users)
    .where(eq(users.firebaseUid, firebaseUid))
    .limit(1);

  if (!current) throw new Error("User not found");

  // Idempotent — don't add duplicates
  if (current.completedModules.includes(moduleId)) {
    const [u] = await db.select().from(users).where(eq(users.firebaseUid, firebaseUid)).limit(1);
    return u;
  }

  const patch: Partial<typeof users.$inferInsert> = {
    completedModules: sql`array_append(${users.completedModules}, ${moduleId})` as any,
    updatedAt: new Date(),
  };
  if (moduleId === "intro") patch.isIntroCompleted = true;

  await db.update(users).set(patch).where(eq(users.firebaseUid, firebaseUid));

  const [updated] = await db
    .select()
    .from(users)
    .where(eq(users.firebaseUid, firebaseUid))
    .limit(1);

  return updated;
}

// ─── getSeekers ─────────────────────────────────────────────────────────────

/**
 * Returns up to 5 curated seekers of the opposite gender (SOLO or DEPENDENT)
 * who the requesting user hasn't already connected with.
 */
export async function getSeekers(requesterFirebaseUid: string): Promise<User[]> {
  const [requester] = await db
    .select()
    .from(users)
    .where(eq(users.firebaseUid, requesterFirebaseUid))
    .limit(1);

  if (!requester || !requester.gender) return [];

  const oppositeGender = requester.gender === "male" ? "female" : "male";

  // Find IDs the requester is already connected to
  const existingConns = await db
    .select({ otherId: connections.receiverId })
    .from(connections)
    .where(eq(connections.senderId, requester.id));

  const excludeIds = [requester.id, ...existingConns.map((c) => c.otherId)];

  const seekers = await db
    .select()
    .from(users)
    .where(
      and(
        eq(users.gender, oppositeGender),
        inArray(users.role, ["SOLO", "DEPENDENT"]),
        ne(users.id, requester.id)
      )
    )
    .limit(5);

  return seekers.filter((s) => !excludeIds.includes(s.id));
}

// ─── createConnection ───────────────────────────────────────────────────────

export async function createConnection(
  senderFirebaseUid: string,
  receiverDbId: string
): Promise<{ success: boolean; message: string; status?: ConnectionStatus }> {
  const [sender] = await db
    .select()
    .from(users)
    .where(eq(users.firebaseUid, senderFirebaseUid))
    .limit(1);

  if (!sender) return { success: false, message: "Sender not found." };
  if (!sender.isIntroCompleted) {
    return {
      success: false,
      message: "Complete the Marriage Readiness intro module first.",
    };
  }

  // Count active (approved) connections as sender
  const activeConns = await db
    .select({ id: connections.id })
    .from(connections)
    .where(
      and(
        eq(connections.senderId, sender.id),
        eq(connections.status, "APPROVED")
      )
    );

  if (activeConns.length >= 3) {
    return {
      success: false,
      message: "You have reached the maximum of 3 active connections.",
    };
  }

  // Determine initial status based on halal workflow rules
  const initialStatus: ConnectionStatus = sender.requiresParentalVetting
    ? "PENDING_MALE_PARENT"
    : "PENDING_FEMALE_PARENT";

  const [existing] = await db
    .select()
    .from(connections)
    .where(
      and(
        eq(connections.senderId, sender.id),
        eq(connections.receiverId, receiverDbId)
      )
    )
    .limit(1);

  if (existing) {
    return { success: false, message: "Connection request already sent." };
  }

  await db.insert(connections).values({
    senderId: sender.id,
    receiverId: receiverDbId,
    status: initialStatus,
  });

  return { success: true, message: "Connection request sent.", status: initialStatus };
}

// ─── getPendingForParent ────────────────────────────────────────────────────

export async function getPendingForParent(parentFirebaseUid: string) {
  const [parent] = await db
    .select()
    .from(users)
    .where(eq(users.firebaseUid, parentFirebaseUid))
    .limit(1);

  if (!parent) return [];

  const childRows = await db
    .select({ childId: parentChildLinks.childId })
    .from(parentChildLinks)
    .where(eq(parentChildLinks.parentId, parent.id));

  if (childRows.length === 0) return [];

  const childIds = childRows.map((r) => r.childId);

  const pendingConns = await db
    .select()
    .from(connections)
    .where(
      and(
        or(
          inArray(connections.senderId, childIds),
          inArray(connections.receiverId, childIds)
        ),
        or(
          eq(connections.status, "PENDING_MALE_PARENT"),
          eq(connections.status, "PENDING_FEMALE_PARENT")
        )
      )
    );

  if (pendingConns.length === 0) return [];

  const allUserIds = [
    ...new Set(pendingConns.flatMap((c) => [c.senderId, c.receiverId])),
  ];
  const allUsers = await db
    .select()
    .from(users)
    .where(inArray(users.id, allUserIds));

  const userMap = new Map(allUsers.map((u) => [u.id, u]));

  return pendingConns.map((c) => ({
    ...c,
    sender: userMap.get(c.senderId)!,
    receiver: userMap.get(c.receiverId)!,
  }));
}

// ─── reviewConnection ───────────────────────────────────────────────────────

export async function reviewConnection(
  connectionId: string,
  parentFirebaseUid: string,
  action: "approve" | "reject",
  mahramId?: string
): Promise<{ success: boolean; message: string }> {
  const [parent] = await db
    .select()
    .from(users)
    .where(eq(users.firebaseUid, parentFirebaseUid))
    .limit(1);

  if (!parent) return { success: false, message: "Parent not found." };

  const [conn] = await db
    .select()
    .from(connections)
    .where(eq(connections.id, connectionId))
    .limit(1);

  if (!conn) return { success: false, message: "Connection not found." };

  if (action === "reject") {
    await db
      .update(connections)
      .set({ status: "REJECTED", updatedAt: new Date() })
      .where(eq(connections.id, connectionId));
    return { success: true, message: "Connection declined." };
  }

  // Approve: advance state machine
  if (conn.status === "PENDING_MALE_PARENT") {
    await db
      .update(connections)
      .set({ status: "PENDING_FEMALE_PARENT", updatedAt: new Date() })
      .where(eq(connections.id, connectionId));
    return { success: true, message: "Forwarded to female wali." };
  }

  if (conn.status === "PENDING_FEMALE_PARENT") {
    await db
      .update(connections)
      .set({ status: "APPROVED", mahramId: mahramId ?? null, updatedAt: new Date() })
      .where(eq(connections.id, connectionId));
    return { success: true, message: "Connection approved! Chat is unlocked." };
  }

  return { success: false, message: `Already in '${conn.status}' state.` };
}
