import { and, asc, count, desc, eq, gt, sql } from "drizzle-orm";
import type { ChatDetail, MessageView } from "../../src/lib/contracts.js";
import { connections, messages, users, type Message, type User } from "../../src/lib/schema.js";
import type { Database } from "../db.js";
import { errors } from "../http.js";
import { enforceRateLimit } from "../rate-limit.js";
import { resolveConnection } from "./matchmaking.js";

const PAGE_SIZE = 200;

function present(message: Message, actorId: string, names: Map<string, string>, mahramId: string | null): MessageView {
  return {
    id: message.id,
    senderId: message.senderId,
    senderName: names.get(message.senderId) ?? "Member",
    senderKind: message.senderId === actorId ? "SELF" : message.senderId === mahramId ? "MAHRAM" : "COUNTERPART",
    channel: (message.channel as "FAMILY" | "DIRECT") ?? "FAMILY",
    text: message.text,
    createdAt: message.createdAt.toISOString(),
  };
}

export async function getChat(
  db: Database,
  actor: User,
  connectionId: string,
  after?: Date,
  requestedChannel?: "FAMILY" | "DIRECT",
): Promise<ChatDetail> {
  const { conn, view } = await resolveConnection(db, actor, connectionId);
  const isMahram = actor.id === conn.mahramId;
  const isSuitor = [conn.senderId, conn.receiverId].includes(actor.id);
  if (!isMahram && !isSuitor) throw errors.notFound("Chat not found.");
  if (conn.status !== "APPROVED" && conn.status !== "TERMINATED") {
    throw errors.conflict("This chat unlocks once the connection is approved and a mahram is assigned.", "CHAT_LOCKED");
  }

  const hasFamilyChat = conn.mahramId !== null;
  // Mahrams are restricted to the Family channel; suitors can toggle between Family and Direct.
  const activeChannel: "FAMILY" | "DIRECT" = isMahram
    ? "FAMILY"
    : requestedChannel ?? (hasFamilyChat ? "FAMILY" : "DIRECT");

  const channelCondition = eq(messages.channel, activeChannel);

  const rows = after
    ? await db
        .select()
        .from(messages)
        .where(and(eq(messages.connectionId, conn.id), channelCondition, gt(messages.createdAt, after)))
        .orderBy(asc(messages.createdAt))
        .limit(PAGE_SIZE)
    : (
        await db
          .select()
          .from(messages)
          .where(and(eq(messages.connectionId, conn.id), channelCondition))
          .orderBy(desc(messages.createdAt))
          .limit(PAGE_SIZE)
      ).reverse();

  const countRows = await db
    .select({ channel: messages.channel, n: count() })
    .from(messages)
    .where(eq(messages.connectionId, conn.id))
    .groupBy(messages.channel);

  let familyMessageCount = 0;
  let directMessageCount = 0;
  for (const c of countRows) {
    if (c.channel === "FAMILY") familyMessageCount = Number(c.n);
    if (c.channel === "DIRECT") directMessageCount = Number(c.n);
  }

  const names = new Map<string, string>([
    [view.sender.id, view.sender.displayName],
    [view.receiver.id, view.receiver.displayName],
  ]);
  if (view.mahram) names.set(view.mahram.id, view.mahram.displayName);

  return {
    connection: view,
    messages: rows.map((m) => present(m, actor.id, names, conn.mahramId)),
    canSend:
      conn.status === "APPROVED" &&
      actor.accountStatus === "ACTIVE" &&
      (activeChannel === "FAMILY" || isSuitor),
    activeChannel,
    hasFamilyChat,
    familyMessageCount,
    directMessageCount,
  };
}

export async function sendMessage(
  db: Database,
  actor: User,
  connectionId: string,
  text: string,
  channel: "FAMILY" | "DIRECT" = "FAMILY",
): Promise<MessageView> {
  await enforceRateLimit(db, `message:${actor.id}`, 30, 60, "You are sending messages too quickly.");

  const { conn } = await resolveConnection(db, actor, connectionId);
  const isMahram = actor.id === conn.mahramId;
  const isSuitor = [conn.senderId, conn.receiverId].includes(actor.id);
  if (!isMahram && !isSuitor) throw errors.notFound("Chat not found.");
  if (conn.status !== "APPROVED") throw errors.conflict("This chat is closed.", "CHAT_LOCKED");

  if (channel === "DIRECT" && !isSuitor) {
    throw errors.forbidden("Direct chat is strictly between the two prospective spouses.", "NOT_ALLOWED");
  }

  const [message] = await db
    .insert(messages)
    .values({
      connectionId: conn.id,
      senderId: actor.id,
      channel,
      text: text.trim(),
    })
    .returning();

  if (!message) throw new Error("Failed to insert message");

  // Only the two suitors' messages update the activity timestamp for the 3-day inactivity tracker.
  if (isSuitor) {
    await db
      .update(connections)
      .set({ lastActivityAt: sql`now()` })
      .where(eq(connections.id, connectionId));
  }

  const [sender] = await db.select({ displayName: users.displayName }).from(users).where(eq(users.id, actor.id)).limit(1);
  return present(message, actor.id, new Map([[actor.id, sender?.displayName ?? "Member"]]), conn.mahramId);
}
