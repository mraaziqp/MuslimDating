/**
 * A transparent "what you have in common" summary for the discovery cards.
 *
 * Only facts both members have chosen to share are compared, each one is
 * weighted, and the score is the weighted average of what could actually be
 * compared. With too little to go on there is no score at all, rather than a
 * number that looks meaningful and is not.
 */
import { DIETARY_HABITS, PRAYER_FREQUENCIES } from "./constants";
import type { PublicProfile, SelfUser } from "./contracts";

export interface Compatibility {
  /** 0–100, or null when there is not enough shared information to compare. */
  score: number | null;
  /** Short, human-readable things the two members share, strongest first. */
  reasons: string[];
}

type Comparable = Pick<
  SelfUser | PublicProfile,
  "prayerFrequency" | "dietaryHabits" | "location" | "age" | "languages" | "education"
>;

interface Signal {
  weight: number;
  /** 0–1: how closely the two members line up on this point. */
  match: number;
  reason?: string;
}

/** Below this much comparable weight a percentage would be noise. */
const MIN_COMPARABLE_WEIGHT = 40;

function ladder(options: readonly string[], a: string | null, b: string | null, steps: number[]): number | null {
  if (!a || !b) return null;
  const ia = options.indexOf(a);
  const ib = options.indexOf(b);
  if (ia < 0 || ib < 0) return null;
  return steps[Math.abs(ia - ib)] ?? 0;
}

function placeParts(location: string | null): { city: string; country: string } | null {
  const parts = (location ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const city = parts[0];
  if (!city) return null;
  return { city, country: parts.length > 1 ? (parts[parts.length - 1] ?? "") : "" };
}

const same = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base" }) === 0;

export function compatibility(viewer: Comparable | null, profile: Comparable): Compatibility {
  if (!viewer) return { score: null, reasons: [] };
  const signals: Signal[] = [];

  const prayer = ladder(PRAYER_FREQUENCIES, viewer.prayerFrequency, profile.prayerFrequency, [1, 0.6, 0.25, 0]);
  if (prayer !== null) {
    signals.push({
      weight: 30,
      match: prayer,
      reason: prayer === 1 ? `You both pray ${profile.prayerFrequency?.toLowerCase()}` : undefined,
    });
  }

  const diet = ladder(DIETARY_HABITS, viewer.dietaryHabits, profile.dietaryHabits, [1, 0.5, 0.15]);
  if (diet !== null) {
    signals.push({
      weight: 20,
      match: diet,
      reason: diet === 1 ? `You both keep ${profile.dietaryHabits?.toLowerCase()}` : undefined,
    });
  }

  const here = placeParts(viewer.location);
  const there = placeParts(profile.location);
  if (here && there) {
    if (same(here.city, there.city)) {
      signals.push({ weight: 15, match: 1, reason: `You are both in ${there.city}` });
    } else if (here.country && there.country && same(here.country, there.country)) {
      signals.push({ weight: 15, match: 0.6, reason: `You are both in ${there.country}` });
    } else {
      signals.push({ weight: 15, match: 0.2 });
    }
  }

  if (viewer.age !== null && profile.age !== null) {
    const gap = Math.abs(viewer.age - profile.age);
    signals.push({
      weight: 10,
      match: gap <= 3 ? 1 : gap <= 6 ? 0.7 : gap <= 10 ? 0.4 : 0.15,
      reason: gap <= 3 ? "You are close in age" : undefined,
    });
  }

  if (viewer.languages.length > 0 && profile.languages.length > 0) {
    const shared = profile.languages.filter((language) => viewer.languages.some((mine) => same(mine, language)));
    signals.push({
      weight: 10,
      match: shared.length > 0 ? 1 : 0.3,
      reason: shared.length > 0 ? `You both speak ${shared.slice(0, 2).join(" and ")}` : undefined,
    });
  }

  if (viewer.education && profile.education) {
    signals.push({ weight: 5, match: viewer.education === profile.education ? 1 : 0.6 });
  }

  const reasons = signals
    .filter((s): s is Signal & { reason: string } => s.reason !== undefined)
    .sort((a, b) => b.weight - a.weight)
    .map((s) => s.reason);

  const comparable = signals.reduce((sum, s) => sum + s.weight, 0);
  if (comparable < MIN_COMPARABLE_WEIGHT) return { score: null, reasons };

  const earned = signals.reduce((sum, s) => sum + s.weight * s.match, 0);
  return { score: Math.round((earned / comparable) * 100), reasons };
}
