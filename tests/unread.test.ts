import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getChat, sendMessage } from "../server/actions/chat.js";
import {
  createConnection,
  decideConnection,
  getActivitySummary,
  listConnections,
  terminateConnection,
} from "../server/actions/matchmaking.js";
import type { DatabaseHandle } from "../server/db.js";
import type { User } from "../src/lib/schema.js";
import { linkFamily, makeUser, setupDatabase } from "./helpers.js";

let handle: DatabaseHandle;
const db = () => handle.db;

beforeAll(async () => {
  handle = await setupDatabase();
});
afterAll(async () => {
  await handle.close();
});

async function openChat() {
  const brother = await makeUser(db(), { gender: "male", displayName: "Brother" });
  const sister = await makeUser(db(), { gender: "female", displayName: "Sister" });
  const mahram = await makeUser(db(), { role: "MAHRAM", displayName: "Mahram" });
  await linkFamily(db(), mahram, sister, "MAHRAM");
  const request = await createConnection(db(), brother, sister.id);
  const opened = await decideConnection(db(), sister, request.id, { decision: "APPROVE" });
  expect(opened.status).toBe("APPROVED");
  return { brother, sister, mahram, id: request.id };
}

const unreadFor = async (user: User) => (await getActivitySummary(db(), user)).unreadMessages;
const listed = async (user: User, id: string) => (await listConnections(db(), user)).find((c) => c.id === id)?.unreadCount;

describe("unread messages", () => {
  it("counts what others sent, per room, until that room is opened", async () => {
    const { brother, sister, mahram, id } = await openChat();
    await sendMessage(db(), brother, id, "Assalamu alaikum to the family.", "FAMILY");
    await sendMessage(db(), brother, id, "How was your day?", "DIRECT");
    await sendMessage(db(), brother, id, "No rush to reply.", "DIRECT");

    // Your own messages are never unread; the mahram only has the family lounge.
    expect(await unreadFor(brother)).toBe(0);
    expect(await unreadFor(sister)).toBe(3);
    expect(await unreadFor(mahram)).toBe(1);
    expect(await listed(sister, id)).toBe(3);
    expect(await listed(mahram, id)).toBe(1);
    expect(await listed(brother, id)).toBe(0);

    // Opening the family lounge reads that room only.
    const family = await getChat(db(), sister, id, undefined, "FAMILY");
    expect(family.unread).toEqual({ FAMILY: 0, DIRECT: 2 });
    expect(family.connection.unreadCount).toBe(2);
    expect(await unreadFor(sister)).toBe(2);
    // One person reading does not read it for anyone else.
    expect(await unreadFor(mahram)).toBe(1);

    const direct = await getChat(db(), sister, id, undefined, "DIRECT");
    expect(direct.unread).toEqual({ FAMILY: 0, DIRECT: 0 });
    expect(await unreadFor(sister)).toBe(0);
    expect(await listed(sister, id)).toBe(0);
  });

  it("marks a room read when a poll delivers the new message, and not before", async () => {
    const { brother, sister, id } = await openChat();
    const first = await getChat(db(), sister, id, undefined, "DIRECT");
    expect(first.messages).toHaveLength(0);

    const sent = await sendMessage(db(), brother, id, "A new thought.", "DIRECT");
    expect(await unreadFor(sister)).toBe(1);

    // She is looking at the family lounge: its poll finds nothing new there and leaves the direct room unread.
    const elsewhere = await getChat(db(), sister, id, new Date(), "FAMILY");
    expect(elsewhere.messages).toHaveLength(0);
    expect(elsewhere.unread).toEqual({ FAMILY: 0, DIRECT: 1 });

    const poll = await getChat(db(), sister, id, new Date(Date.parse(sent.createdAt) - 1), "DIRECT");
    expect(poll.messages.map((m) => m.id)).toEqual([sent.id]);
    expect(poll.unread).toEqual({ FAMILY: 0, DIRECT: 0 });
    expect(await unreadFor(sister)).toBe(0);
  });

  it("stops counting once the chat is closed, and never counts for a wali outside the chat", async () => {
    const { brother, sister, id } = await openChat();
    const wali = await makeUser(db(), { role: "PARENT" });
    await linkFamily(db(), wali, brother, "WALI");

    await sendMessage(db(), sister, id, "Jazakallahu khayran.", "FAMILY");
    expect(await unreadFor(brother)).toBe(1);
    // The wali can see the connection in his dashboard but cannot open the chat.
    expect(await unreadFor(wali)).toBe(0);
    expect(await listed(wali, id)).toBe(0);

    await terminateConnection(db(), sister, id, null);
    expect(await unreadFor(brother)).toBe(0);
    expect(await listed(brother, id)).toBe(0);
  });
});
