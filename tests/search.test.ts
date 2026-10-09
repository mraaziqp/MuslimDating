import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { searchSeekers, createConnection } from "../server/actions/matchmaking.js";
import type { DatabaseHandle } from "../server/db.js";
import { makeUser, setupDatabase, linkFamily } from "./helpers.js";

let handle: DatabaseHandle;
const db = () => handle.db;

beforeAll(async () => {
  handle = await setupDatabase();
});
afterAll(async () => {
  await handle.close();
});

describe("Halal Seeker Search & Exploration", () => {
  it("strictly enforces opposite gender visibility", async () => {
    const brother = await makeUser(db(), { gender: "male", displayName: "Brother Ali" });
    const brother2 = await makeUser(db(), { gender: "male", displayName: "Brother Bilal" });
    const sister = await makeUser(db(), { gender: "female", displayName: "Sister Fatima" });

    const searchFromBrother = await searchSeekers(db(), brother, {
      page: 1,
      pageSize: 10,
      sortBy: "recent",
    });

    // Brother should only see sister, never brother2 or himself
    expect(searchFromBrother.profiles.some((p) => p.id === brother2.id)).toBe(false);
    expect(searchFromBrother.profiles.some((p) => p.id === brother.id)).toBe(false);
    expect(searchFromBrother.profiles.some((p) => p.id === sister.id)).toBe(true);

    const searchFromSister = await searchSeekers(db(), sister, {
      page: 1,
      pageSize: 10,
      sortBy: "recent",
    });

    // Sister should see brother and brother2, never herself
    expect(searchFromSister.profiles.some((p) => p.id === sister.id)).toBe(false);
    expect(searchFromSister.profiles.some((p) => p.id === brother.id)).toBe(true);
    expect(searchFromSister.profiles.some((p) => p.id === brother2.id)).toBe(true);
  });

  it("filters accurately by location, practice, age, and education", async () => {
    const viewer = await makeUser(db(), { gender: "male" });

    const matchCandidate = await makeUser(db(), {
      gender: "female",
      displayName: "Dr. Maryam",
      location: "Cape Town, South Africa",
      profession: "Surgeon",
      age: 28,
      prayerFrequency: "Always",
      dietaryHabits: "Strictly Halal",
      maritalStatus: "Never Married",
      education: "Doctorate",
    });

    const otherCandidate = await makeUser(db(), {
      gender: "female",
      displayName: "Sister Layla",
      location: "London, UK",
      profession: "Teacher",
      age: 35,
      prayerFrequency: "Sometimes",
      dietaryHabits: "Flexible",
      maritalStatus: "Divorced",
      education: "Bachelor's",
    });

    // Search by location
    const resLocation = await searchSeekers(db(), viewer, {
      page: 1,
      pageSize: 10,
      location: "Cape Town",
      sortBy: "recent",
    });
    expect(resLocation.profiles.some((p) => p.id === matchCandidate.id)).toBe(true);
    expect(resLocation.profiles.some((p) => p.id === otherCandidate.id)).toBe(false);

    // Search by prayer frequency
    const resPrayer = await searchSeekers(db(), viewer, {
      page: 1,
      pageSize: 10,
      prayerFrequency: "Always",
      sortBy: "recent",
    });
    expect(resPrayer.profiles.some((p) => p.id === matchCandidate.id)).toBe(true);
    expect(resPrayer.profiles.some((p) => p.id === otherCandidate.id)).toBe(false);

    // Search by age range
    const resAge = await searchSeekers(db(), viewer, {
      page: 1,
      pageSize: 10,
      minAge: 25,
      maxAge: 30,
      sortBy: "recent",
    });
    expect(resAge.profiles.some((p) => p.id === matchCandidate.id)).toBe(true);
    expect(resAge.profiles.some((p) => p.id === otherCandidate.id)).toBe(false);

    // Search by keyword query (q)
    const resQuery = await searchSeekers(db(), viewer, {
      page: 1,
      pageSize: 10,
      q: "Surgeon",
      sortBy: "recent",
    });
    expect(resQuery.profiles.some((p) => p.id === matchCandidate.id)).toBe(true);
    expect(resQuery.profiles.some((p) => p.id === otherCandidate.id)).toBe(false);
  });

  it("filters by wali involvement", async () => {
    const viewer = await makeUser(db(), { gender: "male" });
    const waliUser = await makeUser(db(), { role: "PARENT", gender: "male" });

    const dependentSister = await makeUser(db(), {
      gender: "female",
      role: "DEPENDENT",
      requiresParentalVetting: true,
      displayName: "Dependent Sister",
    });
    await linkFamily(db(), waliUser, dependentSister, "WALI");

    const soloSister = await makeUser(db(), {
      gender: "female",
      role: "SOLO",
      requiresParentalVetting: false,
      displayName: "Independent Sister",
    });

    const waliOnly = await searchSeekers(db(), viewer, {
      page: 1,
      pageSize: 10,
      waliInvolved: true,
      sortBy: "recent",
    });
    expect(waliOnly.profiles.some((p) => p.id === dependentSister.id)).toBe(true);
    expect(waliOnly.profiles.some((p) => p.id === soloSister.id)).toBe(false);

    const soloOnly = await searchSeekers(db(), viewer, {
      page: 1,
      pageSize: 10,
      waliInvolved: false,
      sortBy: "recent",
    });
    expect(soloOnly.profiles.some((p) => p.id === dependentSister.id)).toBe(false);
    expect(soloOnly.profiles.some((p) => p.id === soloSister.id)).toBe(true);
  });

  it("excludes already-connected profiles from search results", async () => {
    const brother = await makeUser(db(), { gender: "male" });
    const sister = await makeUser(db(), { gender: "female", displayName: "Connected Sister" });

    // Sister should be visible initially
    const beforeConn = await searchSeekers(db(), brother, { page: 1, pageSize: 10, sortBy: "recent" });
    expect(beforeConn.profiles.some((p) => p.id === sister.id)).toBe(true);

    // Connect them
    await createConnection(db(), brother, sister.id);

    // Sister should now be excluded from search
    const afterConn = await searchSeekers(db(), brother, { page: 1, pageSize: 10, sortBy: "recent" });
    expect(afterConn.profiles.some((p) => p.id === sister.id)).toBe(false);
  });

  it("supports sorting and pagination", async () => {
    const viewer = await makeUser(db(), { gender: "female" });

    const youngBrother = await makeUser(db(), {
      gender: "male",
      age: 22,
      displayName: "Young Brother",
    });
    const elderBrother = await makeUser(db(), {
      gender: "male",
      age: 40,
      displayName: "Elder Brother",
    });
    expect(youngBrother.id).toBeDefined();
    expect(elderBrother.id).toBeDefined();

    const ascRes = await searchSeekers(db(), viewer, {
      page: 1,
      pageSize: 2,
      sortBy: "age_asc",
    });
    expect(ascRes.profiles[0].age).toBeLessThanOrEqual(ascRes.profiles[1].age ?? 100);

    const descRes = await searchSeekers(db(), viewer, {
      page: 1,
      pageSize: 2,
      sortBy: "age_desc",
    });
    expect(descRes.profiles[0].age).toBeGreaterThanOrEqual(descRes.profiles[1].age ?? 0);
  });

  it("allows administrator to preview and search seekers across genders", async () => {
    const admin = await makeUser(db(), { role: "ADMIN", displayName: "System Admin" });
    const brother = await makeUser(db(), { gender: "male", displayName: "Seeker Brother" });
    const sister = await makeUser(db(), { gender: "female", displayName: "Seeker Sister" });

    // Admin searches all suitors
    const allRes = await searchSeekers(db(), admin, {
      page: 1,
      pageSize: 20,
      sortBy: "recent",
    });
    expect(allRes.profiles.some((p) => p.id === brother.id)).toBe(true);
    expect(allRes.profiles.some((p) => p.id === sister.id)).toBe(true);

    // Admin filters by gender
    const maleRes = await searchSeekers(db(), admin, {
      page: 1,
      pageSize: 20,
      gender: "male",
      sortBy: "recent",
    });
    expect(maleRes.profiles.some((p) => p.id === brother.id)).toBe(true);
    expect(maleRes.profiles.some((p) => p.id === sister.id)).toBe(false);

    const femaleRes = await searchSeekers(db(), admin, {
      page: 1,
      pageSize: 20,
      gender: "female",
      sortBy: "recent",
    });
    expect(femaleRes.profiles.some((p) => p.id === sister.id)).toBe(true);
    expect(femaleRes.profiles.some((p) => p.id === brother.id)).toBe(false);
  });
});
