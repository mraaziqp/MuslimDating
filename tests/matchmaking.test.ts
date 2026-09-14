import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { connections, profilePhotos } from "../src/lib/schema.js";
import type { DatabaseHandle } from "../server/db.js";
import {
  createConnection,
  decideConnection,
  getFeed,
  listConnections,
  setPhotoConsent,
  withdrawConnection,
} from "../server/actions/matchmaking.js";
import { readPhoto } from "../server/actions/photos.js";
import { getChat, sendMessage } from "../server/actions/chat.js";
import { dbErrorMessage, errorCode, linkFamily, makeUser, setupDatabase } from "./helpers.js";

let handle: DatabaseHandle;
const db = () => handle.db;

beforeAll(async () => {
  handle = await setupDatabase();
});
afterAll(async () => {
  await handle.close();
});

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]).toString("base64");

describe("connection creation gates", () => {
  it("enforces the Readiness Gate", async () => {
    const sender = await makeUser(db(), { readinessCompleted: false, completedModules: [] });
    const receiver = await makeUser(db(), { gender: "female" });
    expect(await errorCode(createConnection(db(), sender, receiver.id))).toBe("READINESS_REQUIRED");
  });

  it("requires a linked wali when the sender requires vetting", async () => {
    const sender = await makeUser(db(), { requiresParentalVetting: true });
    const receiver = await makeUser(db(), { gender: "female" });
    expect(await errorCode(createConnection(db(), sender, receiver.id))).toBe("WALI_REQUIRED");
  });

  it("rejects same-gender and non-seeker recipients", async () => {
    const sender = await makeUser(db());
    const sameGender = await makeUser(db());
    const parent = await makeUser(db(), { role: "PARENT", gender: "female" });
    expect(await errorCode(createConnection(db(), sender, sameGender.id))).toBe("RECIPIENT_UNAVAILABLE");
    expect(await errorCode(createConnection(db(), sender, parent.id))).toBe("RECIPIENT_UNAVAILABLE");
  });

  it("prevents duplicate requests in either direction", async () => {
    const brother = await makeUser(db());
    const sister = await makeUser(db(), { gender: "female" });
    await createConnection(db(), brother, sister.id);
    expect(await errorCode(createConnection(db(), brother, sister.id))).toBe("CONNECTION_EXISTS");
    expect(await errorCode(createConnection(db(), sister, brother.id))).toBe("CONNECTION_EXISTS");
  });

  it("allows a new request after withdrawal (TERMINATED frees the pair)", async () => {
    const brother = await makeUser(db());
    const sister = await makeUser(db(), { gender: "female" });
    const first = await createConnection(db(), brother, sister.id);
    await withdrawConnection(db(), brother, first.id);
    const second = await createConnection(db(), brother, sister.id);
    expect(second.status).toBe("PENDING_FEMALE_PARENT");
  });
});

describe("approval state machine", () => {
  it("SOLO → SOLO: recipient must accept and a mahram must exist before APPROVED", async () => {
    const brother = await makeUser(db());
    const sister = await makeUser(db(), { gender: "female" });
    const view = await createConnection(db(), brother, sister.id);
    expect(view.status).toBe("PENDING_FEMALE_PARENT");
    expect(view.awaiting).toHaveLength(1);

    // The sender cannot approve on the recipient's behalf.
    expect(await errorCode(decideConnection(db(), brother, view.id, { decision: "APPROVE" }))).toBe("NOT_ALLOWED");
    expect(await errorCode(decideConnection(db(), sister, view.id, { decision: "APPROVE" }))).toBe("MAHRAM_REQUIRED");

    const mahram = await makeUser(db(), { role: "MAHRAM" });
    await linkFamily(db(), mahram, sister, "MAHRAM");
    const approved = await decideConnection(db(), sister, view.id, { decision: "APPROVE" });
    expect(approved.status).toBe("APPROVED");
    expect(approved.mahram?.id).toBe(mahram.id);
  });

  it("vetted sender → DEPENDENT recipient walks through both walis", async () => {
    const brother = await makeUser(db(), { requiresParentalVetting: true });
    const brotherWali = await makeUser(db(), { role: "PARENT" });
    const sister = await makeUser(db(), { gender: "female", role: "DEPENDENT", requiresParentalVetting: true });
    const sisterWali = await makeUser(db(), { role: "PARENT" });
    const stranger = await makeUser(db(), { role: "PARENT" });
    await linkFamily(db(), brotherWali, brother, "WALI");
    await linkFamily(db(), sisterWali, sister, "WALI");

    const created = await createConnection(db(), brother, sister.id);
    expect(created.status).toBe("PENDING_MALE_PARENT");

    // Hidden from the recipient side until the sender's wali forwards it.
    expect((await listConnections(db(), sister)).some((c) => c.id === created.id)).toBe(false);
    expect(await errorCode(decideConnection(db(), sister, created.id, { decision: "APPROVE" }))).toBe("NOT_FOUND");
    expect(await errorCode(decideConnection(db(), stranger, created.id, { decision: "APPROVE" }))).toBe("NOT_FOUND");

    const forwarded = await decideConnection(db(), brotherWali, created.id, { decision: "APPROVE" });
    expect(forwarded.status).toBe("PENDING_FEMALE_PARENT");

    const accepted = await decideConnection(db(), sister, created.id, { decision: "APPROVE" });
    expect(accepted.status).toBe("PENDING_FEMALE_PARENT");
    expect(accepted.receiverAccepted).toBe(true);

    const sisterWaliView = (await listConnections(db(), sisterWali)).find((c) => c.id === created.id);
    expect(sisterWaliView?.canGuardianDecide).toBe(true);
    expect(sisterWaliView?.mahramOptions.map((o) => o.id)).toContain(sisterWali.id);

    const approved = await decideConnection(db(), sisterWali, created.id, { decision: "APPROVE" });
    expect(approved.status).toBe("APPROVED");
    expect(approved.mahram?.id).toBe(sisterWali.id);

    // Walis cannot act twice / after approval.
    expect(await errorCode(decideConnection(db(), sisterWali, created.id, { decision: "REJECT" }))).toBe(
      "INVALID_TRANSITION",
    );
  });

  it("lets the recipient's wali decline", async () => {
    const brother = await makeUser(db());
    const sister = await makeUser(db(), { gender: "female", role: "DEPENDENT", requiresParentalVetting: true });
    const wali = await makeUser(db(), { role: "PARENT" });
    await linkFamily(db(), wali, sister, "WALI");
    const created = await createConnection(db(), brother, sister.id);
    const rejected = await decideConnection(db(), wali, created.id, { decision: "REJECT" });
    expect(rejected.status).toBe("REJECTED");
  });

  it("rejects a mahram who is not linked to either party", async () => {
    const brother = await makeUser(db());
    const sister = await makeUser(db(), { gender: "female" });
    const mahram = await makeUser(db(), { role: "MAHRAM" });
    const outsider = await makeUser(db(), { role: "MAHRAM" });
    await linkFamily(db(), mahram, sister, "MAHRAM");
    const created = await createConnection(db(), brother, sister.id);
    expect(
      await errorCode(decideConnection(db(), sister, created.id, { decision: "APPROVE", mahramId: outsider.id })),
    ).toBe("MAHRAM_INVALID");
  });
});

describe("3 active chat cap", () => {
  async function approvedPair() {
    const brother = await makeUser(db());
    const sister = await makeUser(db(), { gender: "female" });
    const mahram = await makeUser(db(), { role: "MAHRAM" });
    await linkFamily(db(), mahram, sister, "MAHRAM");
    return { brother, sister, mahram };
  }

  it("blocks approval when the recipient already has 3 active chats", async () => {
    const { sister, mahram } = await approvedPair();
    for (let i = 0; i < 3; i++) {
      const other = await makeUser(db());
      const c = await createConnection(db(), other, sister.id);
      await decideConnection(db(), sister, c.id, { decision: "APPROVE" });
    }
    const fourth = await makeUser(db());
    const pending = await createConnection(db(), fourth, sister.id);
    expect(await errorCode(decideConnection(db(), sister, pending.id, { decision: "APPROVE" }))).toBe("ACTIVE_CHAT_LIMIT");
    expect(mahram.id).toBeTruthy();
  });

  it("is enforced by the database trigger even for direct writes", async () => {
    const { brother, mahram } = await approvedPair();
    for (let i = 0; i < 3; i++) {
      const sister = await makeUser(db(), { gender: "female" });
      await db().insert(connections).values({ senderId: brother.id, receiverId: sister.id, status: "APPROVED", mahramId: mahram.id });
    }
    const extra = await makeUser(db(), { gender: "female" });
    const [pending] = await db()
      .insert(connections)
      .values({ senderId: brother.id, receiverId: extra.id, status: "PENDING_FEMALE_PARENT" })
      .returning();
    expect(
      await dbErrorMessage(
        db().execute(
          sql`UPDATE connections SET status = 'APPROVED', mahram_id = ${mahram.id}::uuid WHERE id = ${pending!.id}::uuid`,
        ),
      ),
    ).toMatch(/ACTIVE_CHAT_LIMIT/);
    expect(
      await dbErrorMessage(db().update(connections).set({ status: "APPROVED" }).where(eq(connections.id, pending!.id))),
    ).toMatch(/MAHRAM_REQUIRED/);
  });
});

describe("privacy", () => {
  it("never exposes secrets or hidden fields in the feed", async () => {
    const viewer = await makeUser(db());
    await makeUser(db(), {
      gender: "female",
      passwordHash: "should-never-leak",
      location: "Secret City",
      hiddenFields: ["location"],
    });
    const feed = await getFeed(db(), viewer);
    const json = JSON.stringify(feed);
    expect(json).not.toContain("should-never-leak");
    expect(json).not.toContain("Secret City");
    expect(json).not.toContain("@test.local");
  });

  it("unblurs photos only after mutual consent", async () => {
    const brother = await makeUser(db());
    const sister = await makeUser(db(), { gender: "female" });
    const mahram = await makeUser(db(), { role: "MAHRAM" });
    await linkFamily(db(), mahram, sister, "MAHRAM");
    await db().insert(profilePhotos).values({ userId: sister.id, mimeType: "image/jpeg", fullData: JPEG, blurData: JPEG });

    // Before any connection: modest profile → nothing at all.
    await expect(readPhoto(db(), brother, sister.id, "blur")).rejects.toThrow();

    const c = await createConnection(db(), brother, sister.id);
    const approved = await decideConnection(db(), sister, c.id, { decision: "APPROVE" });
    expect(approved.receiver.photoAccess).toBe("FULL"); // her own view of herself

    await expect(readPhoto(db(), brother, sister.id, "blur")).resolves.toBeTruthy();
    await expect(readPhoto(db(), brother, sister.id, "full")).rejects.toThrow();

    await setPhotoConsent(db(), brother, c.id, true);
    await expect(readPhoto(db(), brother, sister.id, "full")).rejects.toThrow();
    await setPhotoConsent(db(), sister, c.id, true);
    await expect(readPhoto(db(), brother, sister.id, "full")).resolves.toBeTruthy();

    // Her own mahram is family and may see her photo; an unrelated member may not.
    await expect(readPhoto(db(), mahram, sister.id, "full")).resolves.toBeTruthy();
    const outsider = await makeUser(db());
    await expect(readPhoto(db(), outsider, sister.id, "blur")).rejects.toThrow();
  });
});

describe("chat", () => {
  it("allows only participants of an APPROVED connection to message", async () => {
    const brother = await makeUser(db());
    const sister = await makeUser(db(), { gender: "female" });
    const mahram = await makeUser(db(), { role: "MAHRAM" });
    const outsider = await makeUser(db());
    await linkFamily(db(), mahram, sister, "MAHRAM");
    const c = await createConnection(db(), brother, sister.id);

    expect(await errorCode(getChat(db(), brother, c.id))).toBe("CHAT_LOCKED");
    await decideConnection(db(), sister, c.id, { decision: "APPROVE" });

    await sendMessage(db(), brother, c.id, "Assalamu alaikum");
    await sendMessage(db(), mahram, c.id, "I am present as chaperone");
    expect(await errorCode(sendMessage(db(), outsider, c.id, "hello"))).toBe("NOT_FOUND");

    const chat = await getChat(db(), sister, c.id);
    expect(chat.messages.map((m) => m.senderKind)).toEqual(["COUNTERPART", "MAHRAM"]);
    expect(chat.canSend).toBe(true);
  });
});
