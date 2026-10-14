import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import {
  clearReaction,
  getFeed,
  listSavedProfiles,
  resetPasses,
  searchSeekers,
  setReaction,
  setSavedNote,
} from "../server/actions/discovery.js";
import { createConnection, decideConnection, getActivitySummary } from "../server/actions/matchmaking.js";
import type { DatabaseHandle } from "../server/db.js";
import { seekerSearchQuerySchema, type SeekerSearchQuery } from "../src/lib/contracts.js";
import { profileReactions } from "../src/lib/schema.js";
import { errorCode, linkFamily, makeUser, setupDatabase } from "./helpers.js";

let handle: DatabaseHandle;
const db = () => handle.db;

beforeAll(async () => {
  handle = await setupDatabase();
});
afterAll(async () => {
  await handle.close();
});

const search = (overrides: Partial<SeekerSearchQuery> = {}): SeekerSearchQuery => ({
  page: 1,
  pageSize: 50,
  sortBy: "recent",
  ...overrides,
});

describe("search privacy", () => {
  it("ignores a gender filter from seekers, so same-gender profiles can never be listed", async () => {
    const brother = await makeUser(db(), { gender: "male" });
    const otherBrother = await makeUser(db(), { gender: "male" });
    const sister = await makeUser(db(), { gender: "female" });

    const res = await searchSeekers(db(), brother, search({ gender: "male" }));
    const ids = res.profiles.map((p) => p.id);
    expect(ids).not.toContain(otherBrother.id);
    expect(ids).toContain(sister.id);
    expect(res.profiles.every((p) => p.gender === "female")).toBe(true);
  });

  it("never matches a filter or keyword against a field the member has hidden", async () => {
    const viewer = await makeUser(db(), { gender: "male" });
    const hidden = await makeUser(db(), {
      gender: "female",
      location: "Stellenbosch, South Africa",
      profession: "Cartographer",
      age: 27,
      prayerFrequency: "Always",
      bio: "Loves quiet mountain hikes.",
      hiddenFields: ["location", "profession", "age", "prayerFrequency", "bio"],
    });
    const open = await makeUser(db(), {
      gender: "female",
      location: "Stellenbosch, South Africa",
      profession: "Cartographer",
      age: 27,
      prayerFrequency: "Always",
      bio: "Loves quiet mountain hikes.",
    });

    const probes: Partial<SeekerSearchQuery>[] = [
      { location: "Stellenbosch" },
      { q: "Stellenbosch" },
      { q: "Cartographer" },
      { q: "mountain hikes" },
      { minAge: 27, maxAge: 27 },
      { location: "Stellenbosch", prayerFrequency: "Always" },
    ];
    for (const probe of probes) {
      const ids = (await searchSeekers(db(), viewer, search(probe))).profiles.map((p) => p.id);
      expect(ids, JSON.stringify(probe)).toContain(open.id);
      expect(ids, JSON.stringify(probe)).not.toContain(hidden.id);
    }

    // With no filter they are still discoverable; only the hidden details are withheld.
    const everyone = await searchSeekers(db(), viewer, search());
    const listed = everyone.profiles.find((p) => p.id === hidden.id);
    expect(listed).toMatchObject({ location: null, profession: null, age: null, bio: null });
  });

  it("treats LIKE wildcards in a keyword literally", async () => {
    const viewer = await makeUser(db(), { gender: "male" });
    const sister = await makeUser(db(), { gender: "female", profession: "Zoologist" });

    const wildcard = await searchSeekers(db(), viewer, search({ q: "Z_ologist" }));
    expect(wildcard.profiles.map((p) => p.id)).not.toContain(sister.id);
    const percent = await searchSeekers(db(), viewer, search({ q: "%" }));
    expect(percent.profiles).toHaveLength(0);
    const literal = await searchSeekers(db(), viewer, search({ q: "Zoologist" }));
    expect(literal.profiles.map((p) => p.id)).toContain(sister.id);
  });

  it("pages by offset without skipping or repeating profiles", async () => {
    const viewer = await makeUser(db(), { gender: "male" });
    for (let i = 0; i < 5; i++) await makeUser(db(), { gender: "female", location: "Offsetville" });

    const all = await searchSeekers(db(), viewer, search({ location: "Offsetville" }));
    expect(all.total).toBe(5);
    const firstTwo = await searchSeekers(db(), viewer, search({ location: "Offsetville", pageSize: 2 }));
    const rest = await searchSeekers(db(), viewer, search({ location: "Offsetville", pageSize: 50, offset: 2 }));
    expect([...firstTwo.profiles, ...rest.profiles].map((p) => p.id)).toEqual(all.profiles.map((p) => p.id));
  });

  it("parses query-string flags", () => {
    const parsed = seekerSearchQuerySchema.parse({ hideSaved: "true", waliInvolved: "false", offset: "24" });
    expect(parsed).toMatchObject({ hideSaved: true, waliInvolved: false, offset: 24, page: 1, sortBy: "recent" });
    expect(seekerSearchQuerySchema.safeParse({ minAge: "2" }).success).toBe(false);
  });
});

describe("saving and passing", () => {
  it("hides passed profiles from browsing until the pass is undone", async () => {
    const viewer = await makeUser(db(), { gender: "male" });
    const sister = await makeUser(db(), { gender: "female", location: "Passtown" });
    const listed = async () => searchSeekers(db(), viewer, search({ location: "Passtown" }));

    expect((await listed()).profiles.map((p) => p.id)).toEqual([sister.id]);

    await setReaction(db(), viewer, sister.id, "PASSED");
    const afterPass = await listed();
    expect(afterPass.profiles).toHaveLength(0);
    expect(afterPass.total).toBe(0);
    expect(afterPass.passedCount).toBe(1);

    await clearReaction(db(), viewer, sister.id);
    expect((await listed()).profiles.map((p) => p.id)).toEqual([sister.id]);

    await setReaction(db(), viewer, sister.id, "PASSED");
    expect(await resetPasses(db(), viewer)).toEqual({ restored: 1 });
    expect((await listed()).passedCount).toBe(0);
  });

  it("lets a pass lapse after the cooling-off period", async () => {
    const viewer = await makeUser(db(), { gender: "male" });
    const sister = await makeUser(db(), { gender: "female", location: "Cooldown City" });
    await setReaction(db(), viewer, sister.id, "PASSED");
    await db()
      .update(profileReactions)
      .set({ createdAt: sql`now() - interval '45 days'` })
      .where(and(eq(profileReactions.userId, viewer.id), eq(profileReactions.targetId, sister.id)));

    const res = await searchSeekers(db(), viewer, search({ location: "Cooldown City" }));
    expect(res.profiles.map((p) => p.id)).toEqual([sister.id]);
    expect(res.passedCount).toBe(0);
  });

  it("keeps a private shortlist that is the viewer's alone", async () => {
    const viewer = await makeUser(db(), { gender: "male" });
    const someoneElse = await makeUser(db(), { gender: "male" });
    const sister = await makeUser(db(), { gender: "female", location: "Savedville" });

    await setReaction(db(), viewer, sister.id, "SAVED");

    const browsing = await searchSeekers(db(), viewer, search({ location: "Savedville" }));
    expect(browsing.profiles).toMatchObject([{ id: sister.id, saved: true }]);
    // The card deck asks for profiles it has not already filed away.
    expect((await searchSeekers(db(), viewer, search({ location: "Savedville", hideSaved: true }))).profiles).toHaveLength(0);

    expect((await listSavedProfiles(db(), viewer)).profiles.map((p) => p.id)).toEqual([sister.id]);
    expect((await listSavedProfiles(db(), someoneElse)).profiles).toHaveLength(0);
    expect((await searchSeekers(db(), someoneElse, search({ location: "Savedville" }))).profiles).toMatchObject([
      { id: sister.id, saved: false },
    ]);

    // One reaction per profile: passing replaces the save.
    await setReaction(db(), viewer, sister.id, "PASSED");
    expect((await listSavedProfiles(db(), viewer)).profiles).toHaveLength(0);
  });

  it("keeps a private note on a saved profile, for the saver's eyes only", async () => {
    const viewer = await makeUser(db(), { gender: "male" });
    const someoneElse = await makeUser(db(), { gender: "male" });
    const sister = await makeUser(db(), { gender: "female", location: "Notetown" });
    const noteOf = async (who: typeof viewer) =>
      (await searchSeekers(db(), who, search({ location: "Notetown" }))).profiles.find((p) => p.id === sister.id)?.note;

    expect(await errorCode(setSavedNote(db(), viewer, sister.id, "Too early"))).toBe("NOT_SAVED");

    await setReaction(db(), viewer, sister.id, "SAVED");
    expect(await setSavedNote(db(), viewer, sister.id, "  Ask about relocating  ")).toEqual({
      targetId: sister.id,
      note: "Ask about relocating",
    });
    expect((await listSavedProfiles(db(), viewer)).profiles).toMatchObject([{ id: sister.id, note: "Ask about relocating" }]);
    expect(await noteOf(viewer)).toBe("Ask about relocating");

    // Another member who saves the same profile sees no trace of it.
    await setReaction(db(), someoneElse, sister.id, "SAVED");
    expect(await noteOf(someoneElse)).toBeNull();

    // Saving again keeps the note; an empty note clears it; passing discards it with the save.
    await setReaction(db(), viewer, sister.id, "SAVED");
    expect(await noteOf(viewer)).toBe("Ask about relocating");
    expect((await setSavedNote(db(), viewer, sister.id, "   ")).note).toBeNull();
    await setSavedNote(db(), viewer, sister.id, "Remember this");
    await setReaction(db(), viewer, sister.id, "PASSED");
    await setReaction(db(), viewer, sister.id, "SAVED");
    expect(await noteOf(viewer)).toBeNull();
  });

  it("moves a saved profile off the shortlist once a request is sent", async () => {
    const viewer = await makeUser(db(), { gender: "male" });
    const sister = await makeUser(db(), { gender: "female" });
    await setReaction(db(), viewer, sister.id, "SAVED");
    await createConnection(db(), viewer, sister.id);

    expect((await listSavedProfiles(db(), viewer)).profiles).toHaveLength(0);
    const rows = await db().select().from(profileReactions).where(eq(profileReactions.userId, viewer.id));
    expect(rows).toHaveLength(0);
  });

  it("only lets seekers react, and only to members they could contact", async () => {
    const brother = await makeUser(db(), { gender: "male" });
    const otherBrother = await makeUser(db(), { gender: "male" });
    const sister = await makeUser(db(), { gender: "female" });
    const admin = await makeUser(db(), { role: "ADMIN" });
    const wali = await makeUser(db(), { role: "PARENT" });
    const banned = await makeUser(db(), { gender: "female", accountStatus: "BANNED" });

    expect(await errorCode(setReaction(db(), brother, otherBrother.id, "SAVED"))).toBe("RECIPIENT_UNAVAILABLE");
    expect(await errorCode(setReaction(db(), brother, banned.id, "SAVED"))).toBe("RECIPIENT_UNAVAILABLE");
    expect(await errorCode(setReaction(db(), brother, wali.id, "SAVED"))).toBe("RECIPIENT_UNAVAILABLE");
    expect(await errorCode(setReaction(db(), brother, brother.id, "SAVED"))).toBe("BAD_REQUEST");
    expect(await errorCode(setReaction(db(), admin, sister.id, "SAVED"))).toBe("NOT_A_SEEKER");
    expect(await errorCode(setReaction(db(), wali, sister.id, "PASSED"))).toBe("NOT_A_SEEKER");
    expect(await setReaction(db(), brother, sister.id, "SAVED")).toEqual({ targetId: sister.id, kind: "SAVED" });
  });
});

describe("daily batch", () => {
  it("shrinks when today's picks are passed, and refills on a later day", async () => {
    const viewer = await makeUser(db(), { gender: "male" });
    for (let i = 0; i < 8; i++) await makeUser(db(), { gender: "female" });

    const first = await getFeed(db(), viewer);
    expect(first.profiles).toHaveLength(5);
    const passed = first.profiles[0];
    if (!passed) throw new Error("expected a profile in the feed");

    await setReaction(db(), viewer, passed.id, "PASSED");
    const sameDay = await getFeed(db(), viewer);
    expect(sameDay.profiles.map((p) => p.id)).toEqual(first.profiles.slice(1).map((p) => p.id));

    // Once the pass is from a previous day, the slot goes to someone new.
    await db()
      .update(profileReactions)
      .set({ createdAt: sql`now() - interval '2 days'` })
      .where(and(eq(profileReactions.userId, viewer.id), eq(profileReactions.targetId, passed.id)));
    const laterDay = await getFeed(db(), viewer);
    expect(laterDay.profiles).toHaveLength(5);
    expect(laterDay.profiles.map((p) => p.id)).not.toContain(passed.id);
  });

  it("marks saved profiles in the batch", async () => {
    const viewer = await makeUser(db(), { gender: "female" });
    const feed = await getFeed(db(), viewer);
    const pick = feed.profiles[0];
    if (!pick) throw new Error("expected a profile in the feed");
    expect(pick.saved).toBe(false);

    await setReaction(db(), viewer, pick.id, "SAVED");
    const again = await getFeed(db(), viewer);
    expect(again.profiles.find((p) => p.id === pick.id)?.saved).toBe(true);
  });
});

describe("activity summary", () => {
  it("counts the requests waiting on each person", async () => {
    const brother = await makeUser(db(), { gender: "male", requiresParentalVetting: true });
    const father = await makeUser(db(), { role: "PARENT" });
    await linkFamily(db(), father, brother, "WALI");

    const sister = await makeUser(db(), { gender: "female", role: "DEPENDENT", requiresParentalVetting: true });
    const sisterWali = await makeUser(db(), { role: "PARENT" });
    await linkFamily(db(), sisterWali, sister, "WALI");

    const request = await createConnection(db(), brother, sister.id);
    expect(request.status).toBe("PENDING_MALE_PARENT");
    expect(await getActivitySummary(db(), brother)).toEqual({ needsResponse: 0, activeChats: 0, pendingOutgoing: 1, unreadMessages: 0 });
    expect((await getActivitySummary(db(), father)).needsResponse).toBe(1);
    // Nothing reaches the receiving side until the sender's wali forwards it.
    expect((await getActivitySummary(db(), sister)).needsResponse).toBe(0);
    expect((await getActivitySummary(db(), sisterWali)).needsResponse).toBe(0);

    await decideConnection(db(), father, request.id, { decision: "APPROVE" });
    expect((await getActivitySummary(db(), father)).needsResponse).toBe(0);
    expect((await getActivitySummary(db(), sister)).needsResponse).toBe(1);
    expect((await getActivitySummary(db(), sisterWali)).needsResponse).toBe(1);

    await decideConnection(db(), sister, request.id, { decision: "APPROVE" });
    expect((await getActivitySummary(db(), sister)).needsResponse).toBe(0);
    expect((await getActivitySummary(db(), sisterWali)).needsResponse).toBe(1);

    const opened = await decideConnection(db(), sisterWali, request.id, { decision: "APPROVE" });
    expect(opened.status).toBe("APPROVED");
    expect(await getActivitySummary(db(), sisterWali)).toEqual({ needsResponse: 0, activeChats: 1, pendingOutgoing: 0, unreadMessages: 0 });
    expect(await getActivitySummary(db(), brother)).toEqual({ needsResponse: 0, activeChats: 1, pendingOutgoing: 0, unreadMessages: 0 });
  });
});
