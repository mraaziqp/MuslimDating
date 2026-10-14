/**
 * Unread message counts. A message is unread for a participant when someone
 * else sent it after that participant last opened the room it is in.
 *
 * Only the people who can open a chat have counts: the two members (both rooms)
 * and the mahram (the family lounge only). Read positions are private: nothing
 * here tells one participant whether another has read their message.
 */
import { sql, type SQL } from "drizzle-orm";
import type { ChatChannel } from "../../src/lib/constants.js";
import { chatReads, type User } from "../../src/lib/schema.js";
import type { Database } from "../db.js";
import { asNumber, asString, rowsOf } from "../rows.js";

export type UnreadByChannel = Record<ChatChannel, number>;

/** Unread messages in open chats the actor takes part in, optionally narrowed by `scope`. */
function unreadRows(actor: User, scope: SQL): SQL {
  return sql`
    SELECT m.connection_id, m.channel, count(*)::int AS n
      FROM messages m
      JOIN connections c ON c.id = m.connection_id
      LEFT JOIN chat_reads r
        ON r.connection_id = m.connection_id AND r.user_id = ${actor.id}::uuid AND r.channel = m.channel
     WHERE c.status = 'APPROVED'
       AND m.sender_id <> ${actor.id}::uuid
       AND (r.last_read_at IS NULL OR m.created_at > r.last_read_at)
       AND (c.sender_id = ${actor.id}::uuid
            OR c.receiver_id = ${actor.id}::uuid
            OR (c.mahram_id = ${actor.id}::uuid AND m.channel = 'FAMILY'))
       AND ${scope}
     GROUP BY m.connection_id, m.channel`;
}

/** Per-room unread counts for the given connections. Connections with nothing unread are absent. */
export async function unreadByConnection(
  db: Database,
  actor: User,
  connectionIds: string[],
): Promise<Map<string, UnreadByChannel>> {
  const counts = new Map<string, UnreadByChannel>();
  if (connectionIds.length === 0) return counts;

  const ids = sql.join(
    connectionIds.map((id) => sql`${id}::uuid`),
    sql`, `,
  );
  for (const row of rowsOf(await db.execute(unreadRows(actor, sql`m.connection_id IN (${ids})`)))) {
    const id = asString(row.connection_id);
    const entry = counts.get(id) ?? { FAMILY: 0, DIRECT: 0 };
    if (row.channel === "FAMILY" || row.channel === "DIRECT") entry[row.channel] = asNumber(row.n);
    counts.set(id, entry);
  }
  return counts;
}

export function totalUnread(counts: UnreadByChannel | undefined): number {
  return counts ? counts.FAMILY + counts.DIRECT : 0;
}

/** Everything unread across all of the actor's open chats (the navigation badge). */
export async function countAllUnread(db: Database, actor: User): Promise<number> {
  const [row] = rowsOf(await db.execute(sql`SELECT coalesce(sum(u.n), 0)::int AS total FROM (${unreadRows(actor, sql`true`)}) u`));
  return asNumber(row?.total);
}

/** Records that the actor has seen everything in a room up to now. */
export async function markRoomRead(db: Database, actor: User, connectionId: string, channel: ChatChannel): Promise<void> {
  await db
    .insert(chatReads)
    .values({ connectionId, userId: actor.id, channel, lastReadAt: sql`now()` })
    .onConflictDoUpdate({
      target: [chatReads.connectionId, chatReads.userId, chatReads.channel],
      set: { lastReadAt: sql`now()` },
    });
}
