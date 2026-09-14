import { and, asc, desc, eq, gt, sql } from "drizzle-orm";
import type { ChatDetail, MessageView } from "../../src/lib/contracts.js";
import { connections, messages, users, type Message, type User } from "../../src/lib/schema.js";
import type { Database } from "../db.js";
import { errors } from "../http.js";
import { enforceRateLimit } from "../rate-limit.js";
import { rowsOf } from "../rows.js";
import { resolveConnection } from "./matchmaking.js";

const PAGE_SIZE = 200;

function present(message: Message, actorId: string, names: Map<string, string>, mahramId: string | null): MessageView {
  return {
    id: message.id,
    senderId: message.senderId,
    senderName: names.get(message.senderId) ?? "Member",
    senderKind: message.senderId === actorId ? "SELF" : message.senderId === mahramId ? "MAHRAM" : "COUNTERPART",
    text: message.text,
    createdAt: message.createdAt.toISOString(),
  };
}

export async function getChat(db: Database, actor: User, connectionId: string, after?: Date): Promise<ChatDetail> {
  const { conn, view } = await resolveConnection(db, actor, connectionId);
  const participant = [conn.senderId, conn.receiverId, conn.mahramId].includes(actor.id);
  if (!participant) throw errors.notFound("Chat not found.");
  if (conn.status !== "APPROVED" && conn.status !== "TERMINATED") {
    throw errors.conflict("This chat unlocks once the connection is approved and a mahram is assigned.", "CHAT_LOCKED");
  }

  const rows = after
    ? await db
        .select()
        .from(messages)
        .where(and(eq(messages.connectionId, conn.id), gt(messages.createdAt, after)))
        .orderBy(asc(messages.createdAt))
        .limit(PAGE_SIZE)
    : (
        await db
          .select()
          .from(messages)
          .where(eq(messages.connectionId, conn.id))
          .orderBy(desc(messages.createdAt))
          .limit(PAGE_SIZE)
      ).reverse();

  const names = new Map<string, string>([
    [view.sender.id, view.sender.displayName],
    [view.receiver.id, view.receiver.displayName],
  ]);
  if (view.mahram) names.set(view.mahram.id, view.mahram.displayName);

  return {
    connection: view,
    messages: rows.map((m) => present(m, actor.id, names, conn.mahramId)),
    canSend: conn.status === "APPROVED" && actor.accountStatus === "ACTIVE",
  };
}

export async function sendMessage(db: Database, actor: User, connectionId: string, text: string): Promise<MessageView> {
  await enforceRateLimit(db, `message:${actor.id}`, 30, 60, "You are sending messages too quickly.");

  // Insert only if the chat is APPROVED and the actor participates — checked atomically.
  const inserted = rowsOf(
    await db.execute(sql`
      INSERT INTO messages (connection_id, sender_id, text)
      SELECT c.id, ${actor.id}::uuid, ${text}
        FROM connections c
       WHERE c.id = ${connectionId}::uuid
         AND c.status = 'APPROVED'
         AND ${actor.id}::uuid IN (c.sender_id, c.receiver_id, c.mahram_id)
      RETURNING id`),
  )[0];

  if (!inserted) {
    const { conn } = await resolveConnection(db, actor, connectionId);
    if (![conn.senderId, conn.receiverId, conn.mahramId].includes(actor.id)) throw errors.notFound("Chat not found.");
    throw errors.conflict("This chat is closed.", "CHAT_LOCKED");
  }

  const [message] = await db.select().from(messages).where(eq(messages.id, String(inserted.id))).limit(1);
  if (!message) throw new Error("Inserted message not found");

  // Only the two members' messages count as activity for the inactivity cleaner.
  const [conn] = await db
    .update(connections)
    .set({ lastActivityAt: sql`now()` })
    .where(
      and(
        eq(connections.id, connectionId),
        sql`${actor.id}::uuid IN (${connections.senderId}, ${connections.receiverId})`,
      ),
    )
    .returning({ mahramId: connections.mahramId });

  const [sender] = await db.select({ displayName: users.displayName }).from(users).where(eq(users.id, actor.id)).limit(1);
  return present(message, actor.id, new Map([[actor.id, sender?.displayName ?? "Member"]]), conn?.mahramId ?? null);
}
