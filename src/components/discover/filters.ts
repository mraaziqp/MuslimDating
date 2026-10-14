import { DIETARY_HABITS, EDUCATION_LEVELS, MARITAL_STATUSES, PRAYER_FREQUENCIES, oneOf } from "../../lib/constants";
import type { Gender, SeekerSearchQuery } from "../../lib/contracts";

/** Filter state as the form holds it: every field is a string so inputs stay controlled. */
export interface DiscoverFilters {
  q: string;
  location: string;
  minAge: string;
  maxAge: string;
  prayerFrequency: string;
  dietaryHabits: string;
  maritalStatus: string;
  education: string;
  waliInvolved: "" | "true" | "false";
  sortBy: SeekerSearchQuery["sortBy"];
  /** Administrator preview only; ignored by the server for seekers. */
  gender: "" | Gender;
}

export const EMPTY_FILTERS: DiscoverFilters = {
  q: "",
  location: "",
  minAge: "",
  maxAge: "",
  prayerFrequency: "",
  dietaryHabits: "",
  maritalStatus: "",
  education: "",
  waliInvolved: "",
  sortBy: "recent",
  gender: "",
};

export const SORT_LABELS: Record<SeekerSearchQuery["sortBy"], string> = {
  recent: "Newest members",
  readiness: "Most readiness modules",
  age_asc: "Youngest first",
  age_desc: "Oldest first",
};

/** A typed age only counts once it is a whole number the server accepts. */
function validAge(value: string): number | undefined {
  if (!/^\d{2}$/.test(value.trim())) return undefined;
  const age = Number(value);
  return age >= 18 && age <= 99 ? age : undefined;
}

export function toQuery(filters: DiscoverFilters): Partial<SeekerSearchQuery> {
  let minAge = validAge(filters.minAge);
  let maxAge = validAge(filters.maxAge);
  if (minAge !== undefined && maxAge !== undefined && minAge > maxAge) [minAge, maxAge] = [maxAge, minAge];

  return {
    q: filters.q.trim() || undefined,
    location: filters.location.trim() || undefined,
    minAge,
    maxAge,
    prayerFrequency: oneOf(PRAYER_FREQUENCIES, filters.prayerFrequency) ?? undefined,
    dietaryHabits: oneOf(DIETARY_HABITS, filters.dietaryHabits) ?? undefined,
    maritalStatus: oneOf(MARITAL_STATUSES, filters.maritalStatus) ?? undefined,
    education: oneOf(EDUCATION_LEVELS, filters.education) ?? undefined,
    waliInvolved: filters.waliInvolved === "" ? undefined : filters.waliInvolved === "true",
    sortBy: filters.sortBy,
    gender: filters.gender || undefined,
  };
}

export interface ActiveFilter {
  key: keyof DiscoverFilters;
  label: string;
}

/** The filters currently narrowing results, for the removable chips above them. */
export function activeFilters(filters: DiscoverFilters): ActiveFilter[] {
  const query = toQuery(filters);
  const active: ActiveFilter[] = [];
  if (query.location) active.push({ key: "location", label: query.location });
  if (query.minAge !== undefined && query.maxAge !== undefined) {
    active.push({ key: "minAge", label: `Age ${query.minAge}–${query.maxAge}` });
  } else if (query.minAge !== undefined) {
    active.push({ key: "minAge", label: `Age ${query.minAge}+` });
  } else if (query.maxAge !== undefined) {
    active.push({ key: "maxAge", label: `Up to ${query.maxAge}` });
  }
  if (query.prayerFrequency) active.push({ key: "prayerFrequency", label: `Prays ${query.prayerFrequency.toLowerCase()}` });
  if (query.dietaryHabits) active.push({ key: "dietaryHabits", label: query.dietaryHabits });
  if (query.maritalStatus) active.push({ key: "maritalStatus", label: query.maritalStatus });
  if (query.education) active.push({ key: "education", label: query.education });
  if (query.waliInvolved !== undefined) {
    active.push({ key: "waliInvolved", label: query.waliInvolved ? "Wali involved" : "Independent seekers" });
  }
  if (query.sortBy && query.sortBy !== "recent") active.push({ key: "sortBy", label: SORT_LABELS[query.sortBy] });
  return active;
}

/** Clears one chip. Removing the age chip clears both ends of the range. */
export function withoutFilter(filters: DiscoverFilters, key: keyof DiscoverFilters): DiscoverFilters {
  if (key === "minAge" || key === "maxAge") return { ...filters, minAge: "", maxAge: "" };
  return { ...filters, [key]: EMPTY_FILTERS[key] };
}
