import { db } from "../lib/db";
import {
  connections,
  parentChildLinks,
  users,
  type Connection,
  type User,
} from "../lib/schema";
import { eq, inArray, or, and } from "drizzle-orm";

// ─── Types ────────────────────────────────────────────────────────────────────

export type PendingConnectionWithParties = Connection & {
  sender: Pick<User, "id" | "email" | "role">;
  receiver: Pick<User, "id" | "email" | "role">;
};

// ─── getPendingConnectionsForParent ──────────────────────────────────────────

/**
 * Fetches all PENDING connections involving any child linked to the given parent.
 *
 * Workflow:
 *  1. Resolve every child UUID the parent is responsible for.
 *  2. Query connections where any child is the sender OR receiver.
 *  3. Narrow to statuses that still require parental action.
 *
 * @param parentId - UUID of the authenticated PARENT/wali user.
 * @returns Array of pending connections enriched with both parties' profiles.
 */
export async function getPendingConnectionsForParent(
  parentId: string
): Promise<PendingConnectionWithParties[]> {
  // Step 1 — resolve all children this parent supervises
  const childRows = await db
    .select({ childId: parentChildLinks.childId })
    .from(parentChildLinks)
    .where(eq(parentChildLinks.parentId, parentId));

  if (childRows.length === 0) {
    return [];
  }

  const childIds = childRows.map((r) => r.childId);

  // Step 2 & 3 — fetch pending connections involving any of those children
  const pendingRows = await db
    .select({
      // Connection fields
      id: connections.id,
      senderId: connections.senderId,
      receiverId: connections.receiverId,
      status: connections.status,
      mahramId: connections.mahramId,
      createdAt: connections.createdAt,
      updatedAt: connections.updatedAt,
      // Sender profile (aliased)
      senderEmail: users.email,
      senderRole: users.role,
    })
    .from(connections)
    .innerJoin(users, eq(users.id, connections.senderId))
    .where(
      and(
        // Must involve one of the parent's children
        or(
          inArray(connections.senderId, childIds),
          inArray(connections.receiverId, childIds)
        ),
        // Only statuses that demand parental review
        or(
          eq(connections.status, "PENDING_MALE_PARENT"),
          eq(connections.status, "PENDING_FEMALE_PARENT")
        )
      )
    );

  if (pendingRows.length === 0) {
    return [];
  }

  // Step 4 — hydrate the receiver profile in a single IN query
  const receiverIds = [...new Set(pendingRows.map((r) => r.receiverId))];
  const receiverProfiles = await db
    .select({ id: users.id, email: users.email, role: users.role })
    .from(users)
    .where(inArray(users.id, receiverIds));

  const receiverMap = new Map(receiverProfiles.map((u) => [u.id, u]));

  // Step 5 — compose enriched result
  return pendingRows.map((row) => ({
    id: row.id,
    senderId: row.senderId,
    receiverId: row.receiverId,
    status: row.status,
    mahramId: row.mahramId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    sender: {
      id: row.senderId,
      email: row.senderEmail,
      role: row.senderRole,
    },
    receiver: receiverMap.get(row.receiverId) ?? {
      id: row.receiverId,
      email: "unknown",
      role: "SOLO" as const,
    },
  }));
}

// ─── approveConnection ────────────────────────────────────────────────────────

/**
 * Advances a Connection through the approval workflow.
 * PENDING_MALE_PARENT  → PENDING_FEMALE_PARENT
 * PENDING_FEMALE_PARENT → APPROVED  (mahramId must be supplied)
 *
 * Guards: only a parent whose child is a party to the connection may approve.
 */
export async function approveConnection(
  connectionId: string,
  parentId: string,
  mahramId?: string
): Promise<{ success: boolean; message: string }> {
  // Fetch the connection
  const [conn] = await db
    .select()
    .from(connections)
    .where(eq(connections.id, connectionId))
    .limit(1);

  if (!conn) {
    return { success: false, message: "Connection not found." };
  }

  // Verify the parent actually oversees one of the parties
  const [link] = await db
    .select()
    .from(parentChildLinks)
    .where(
      and(
        eq(parentChildLinks.parentId, parentId),
        or(
          eq(parentChildLinks.childId, conn.senderId),
          eq(parentChildLinks.childId, conn.receiverId)
        )
      )
    )
    .limit(1);

  if (!link) {
    return {
      success: false,
      message: "Unauthorized: you are not the wali for a party in this connection.",
    };
  }

  // Advance status
  if (conn.status === "PENDING_MALE_PARENT") {
    await db
      .update(connections)
      .set({ status: "PENDING_FEMALE_PARENT", updatedAt: new Date() })
      .where(eq(connections.id, connectionId));

    return { success: true, message: "Forwarded to female wali for review." };
  }

  if (conn.status === "PENDING_FEMALE_PARENT") {
    if (!mahramId) {
      return {
        success: false,
        message: "A mahram UUID is required to fully approve a connection.",
      };
    }

    await db
      .update(connections)
      .set({ status: "APPROVED", mahramId, updatedAt: new Date() })
      .where(eq(connections.id, connectionId));

    return { success: true, message: "Connection approved. Chat is now unlocked." };
  }

  return {
    success: false,
    message: `Connection is already in '${conn.status}' state.`,
  };
}

// ─── rejectConnection ─────────────────────────────────────────────────────────

/**
 * Allows a parent (or either seeker) to close a connection at any stage.
 */
export async function rejectConnection(
  connectionId: string,
  requestingUserId: string
): Promise<{ success: boolean }> {
  const [conn] = await db
    .select()
    .from(connections)
    .where(eq(connections.id, connectionId))
    .limit(1);

  if (!conn) return { success: false };

  // Allow the seeker themselves or their parent to reject
  const isParty =
    conn.senderId === requestingUserId ||
    conn.receiverId === requestingUserId;

  const [link] = await db
    .select()
    .from(parentChildLinks)
    .where(
      and(
        eq(parentChildLinks.parentId, requestingUserId),
        or(
          eq(parentChildLinks.childId, conn.senderId),
          eq(parentChildLinks.childId, conn.receiverId)
        )
      )
    )
    .limit(1);

  if (!isParty && !link) return { success: false };

  await db
    .update(connections)
    .set({ status: "REJECTED", updatedAt: new Date() })
    .where(eq(connections.id, connectionId));

  return { success: true };
}
