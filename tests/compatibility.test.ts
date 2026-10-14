import { describe, expect, it } from "vitest";
import { compatibility } from "../src/lib/compatibility.js";

const blank = {
  prayerFrequency: null,
  dietaryHabits: null,
  location: null,
  age: null,
  languages: [] as string[],
  education: null,
};

describe("compatibility summary", () => {
  it("gives no score without a viewer or without enough shared detail", () => {
    expect(compatibility(null, blank)).toEqual({ score: null, reasons: [] });
    expect(compatibility(blank, blank)).toEqual({ score: null, reasons: [] });
    // Age alone is far too little to put a number on.
    expect(compatibility({ ...blank, age: 30 }, { ...blank, age: 30 })).toEqual({
      score: null,
      reasons: ["You are close in age"],
    });
  });

  it("scores a full match at 100 and explains why", () => {
    const person = {
      prayerFrequency: "Always",
      dietaryHabits: "Strictly Halal",
      location: "Cape Town, South Africa",
      age: 28,
      languages: ["English", "Arabic"],
      education: "Master's",
    };
    const result = compatibility(person, { ...person, age: 27, languages: ["arabic"] });
    expect(result.score).toBe(100);
    expect(result.reasons).toEqual([
      "You both pray always",
      "You both keep strictly halal",
      "You are both in Cape Town",
      "You are close in age",
      "You both speak arabic",
    ]);
  });

  it("scores only what both members shared, and lower when they differ", () => {
    const viewer = { ...blank, prayerFrequency: "Always", dietaryHabits: "Strictly Halal", location: "Durban, South Africa" };
    const near = compatibility(viewer, {
      ...blank,
      prayerFrequency: "Usually",
      dietaryHabits: "Strictly Halal",
      location: "Cape Town, South Africa",
    });
    const far = compatibility(viewer, {
      ...blank,
      prayerFrequency: "Rarely",
      dietaryHabits: "Flexible",
      location: "London, UK",
    });

    expect(near.score).toBe(72); // (30×0.6 + 20×1 + 15×0.6) / 65
    expect(near.reasons).toEqual(["You both keep strictly halal", "You are both in South Africa"]);
    expect(far.score).toBe(9); // (30×0 + 20×0.15 + 15×0.2) / 65
    expect(far.reasons).toEqual([]);
  });

  it("ignores values outside the known options instead of guessing", () => {
    const result = compatibility(
      { ...blank, prayerFrequency: "Always", dietaryHabits: "Halal" },
      { ...blank, prayerFrequency: "Five times daily", dietaryHabits: "Halal" },
    );
    expect(result).toEqual({ score: null, reasons: ["You both keep halal"] });
  });
});
