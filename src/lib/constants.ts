/** Runtime constants shared by client and server. Must not import zod. */
import type { UserRole } from "./schema";

export const MAX_ACTIVE_CHATS = 3;
export const STALE_CONNECTION_DAYS = 3;
export const MAX_PENDING_OUTGOING = 5;

export const CHAT_CHANNELS = ["FAMILY", "DIRECT"] as const;
export type ChatChannel = (typeof CHAT_CHANNELS)[number];

export const SEEKER_ROLES = ["SOLO", "DEPENDENT"] as const;
export const SELF_SELECTABLE_ROLES = ["SOLO", "DEPENDENT", "PARENT", "MAHRAM"] as const;
export const ALL_ROLES = ["SOLO", "DEPENDENT", "PARENT", "MAHRAM", "ADMIN"] as const;
export const ACCOUNT_STATUSES = ["ACTIVE", "SUSPENDED", "BANNED"] as const;
export const REPORT_STATUSES = ["PENDING", "REVIEWED", "RESOLVED"] as const;

export const PRIVACY_FIELD_KEYS = [
  "age",
  "location",
  "profession",
  "education",
  "height",
  "nationality",
  "languages",
  "maritalStatus",
  "prayerFrequency",
  "dietaryHabits",
  "bio",
] as const;
export type PrivacyFieldKey = (typeof PRIVACY_FIELD_KEYS)[number];

export const PRIVACY_FIELD_LABELS: Record<PrivacyFieldKey, string> = {
  age: "Age",
  location: "Location",
  profession: "Profession",
  education: "Education",
  height: "Height",
  nationality: "Nationality",
  languages: "Languages",
  maritalStatus: "Marital status",
  prayerFrequency: "Prayer frequency",
  dietaryHabits: "Dietary habits",
  bio: "Bio",
};

export const PRAYER_FREQUENCIES = ["Always", "Usually", "Sometimes", "Rarely"] as const;
export const DIETARY_HABITS = ["Strictly Halal", "Halal", "Flexible"] as const;
export const MARITAL_STATUSES = ["Never Married", "Divorced", "Widowed", "Annulled"] as const;
export const EDUCATION_LEVELS = ["High School", "Bachelor's", "Master's", "Doctorate", "Other"] as const;
export const PHOTO_MIME_TYPES = ["image/jpeg", "image/webp", "image/png"] as const;

export const ROLE_LABELS: Record<UserRole, string> = {
  SOLO: "Independent Seeker",
  DEPENDENT: "Dependent Seeker (Wali Involved)",
  PARENT: "Parent / Wali",
  MAHRAM: "Mahram (Chaperone)",
  ADMIN: "Administrator",
};

export const AUDIT_ACTIONS = [
  "USER_REGISTERED",
  "ADMIN_BOOTSTRAPPED",
  "ONBOARDING_COMPLETED",
  "READINESS_MODULE_COMPLETED",
  "FAMILY_LINKED",
  "FAMILY_UNLINKED",
  "CONNECTION_REQUESTED",
  "CONNECTION_GUARDIAN_APPROVED",
  "CONNECTION_ACCEPTED",
  "CONNECTION_APPROVED",
  "CONNECTION_REJECTED",
  "CONNECTION_WITHDRAWN",
  "CONNECTION_TERMINATED",
  "CONNECTION_TERMINATED_INACTIVITY",
  "PHOTO_CONSENT_CHANGED",
  "REPORT_CREATED",
  "REPORT_UPDATED",
  "ACCOUNT_SUSPENDED",
  "ACCOUNT_BANNED",
  "ACCOUNT_REINSTATED",
  "ACCOUNT_SUSPENSION_EXPIRED",
  "ROLE_RESET",
  "ROLE_ASSIGNED",
  "PHOTO_REMOVED",
  "ADMIN_VIEWED_CONVERSATION",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const CONNECTION_STATUSES = [
  "PENDING_MALE_PARENT",
  "PENDING_FEMALE_PARENT",
  "APPROVED",
  "REJECTED",
  "TERMINATED",
] as const;

/** Narrows a free string (e.g. a <select> value) to one of the allowed options. */
export function oneOf<T extends string>(options: readonly T[], value: string): T | null {
  return options.find((option) => option === value) ?? null;
}

export const ROLE_HOME: Record<UserRole, string> = {
  SOLO: "/feed",
  DEPENDENT: "/feed",
  PARENT: "/parent-dashboard",
  MAHRAM: "/chats",
  ADMIN: "/admin",
};
