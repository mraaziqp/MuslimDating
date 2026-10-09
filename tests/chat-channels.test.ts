import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getChat, sendMessage } from "../server/actions/chat.js";
import { createConnection, decideConnection } from "../server/actions/matchmaking.js";
import type { DatabaseHandle } from "../server/db.js";
import { errorCode, linkFamily, makeUser, setupDatabase } from "./helpers.js";

let handle: DatabaseHandle;
const db = () => handle.db;

beforeAll(async () => {
  handle = await setupDatabase();
});
afterAll(async () => {
  await handle.close();
});

async function setupCourtship() {
  const brother = await makeUser(db(), { displayName: "Brother Harun" });
  const sister = await makeUser(db(), { gender: "female", displayName: "Sister Zaynab" });
  const mahram = await makeUser(db(), { role: "MAHRAM", gender: "male", displayName: "Uncle Farhan" });
  await linkFamily(db(), mahram, sister, "MAHRAM");

  const conn = await createConnection(db(), brother, sister.id);
  await decideConnection(db(), sister, conn.id, { decision: "APPROVE" });

  return { brother, sister, mahram, connectionId: conn.id };
}

describe("Dual-Channel Halal Chat (Family Room & Direct Suitor Chat)", () => {
  it("allows suitors and mahram to communicate in the Family room", async () => {
    const { brother, sister, mahram, connectionId } = await setupCourtship();

    // Brother sends in Family Room
    const msg1 = await sendMessage(db(), brother, connectionId, "Assalamu alaikum to the family.", "FAMILY");
    expect(msg1.channel).toBe("FAMILY");
    expect(msg1.senderKind).toBe("SELF");

    // Mahram responds in Family Room
    const msg2 = await sendMessage(db(), mahram, connectionId, "Wa alaikum assalam. Welcome brother.", "FAMILY");
    expect(msg2.channel).toBe("FAMILY");
    expect(msg2.senderKind).toBe("SELF");

    // Sister views Family room
    const sisterChat = await getChat(db(), sister, connectionId, undefined, "FAMILY");
    expect(sisterChat.messages).toHaveLength(2);
    expect(sisterChat.activeChannel).toBe("FAMILY");
    expect(sisterChat.hasFamilyChat).toBe(true);
    expect(sisterChat.familyMessageCount).toBe(2);
    expect(sisterChat.directMessageCount).toBe(0);
  });

  it("allows suitors to communicate in the Direct Personal channel", async () => {
    const { brother, sister, connectionId } = await setupCourtship();

    // Brother sends in Direct channel
    const msg1 = await sendMessage(db(), brother, connectionId, "Assalamu alaikum Sister. What is your daily routine?", "DIRECT");
    expect(msg1.channel).toBe("DIRECT");

    // Sister responds in Direct channel
    const msg2 = await sendMessage(db(), sister, connectionId, "Wa alaikum assalam. I work until 4pm then spend time with family.", "DIRECT");
    expect(msg2.channel).toBe("DIRECT");

    // Check Direct messages
    const directChat = await getChat(db(), brother, connectionId, undefined, "DIRECT");
    expect(directChat.messages).toHaveLength(2);
    expect(directChat.activeChannel).toBe("DIRECT");
    expect(directChat.directMessageCount).toBe(2);
  });

  it("blocks mahram from posting in the Direct personal channel", async () => {
    const { mahram, connectionId } = await setupCourtship();

    // Mahram attempts to send in DIRECT channel
    const err = await errorCode(sendMessage(db(), mahram, connectionId, "I should not post here", "DIRECT"));
    expect(err).toBe("NOT_ALLOWED");
  });
});
