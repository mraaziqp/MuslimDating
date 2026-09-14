import {
  PRIVACY_FIELD_KEYS,
  type PersonBrief,
  type PhotoAccess,
  type PrivacyFieldKey,
  type PublicProfile,
  type SelfUser,
} from "../src/lib/contracts.js";
import type { User } from "../src/lib/schema.js";

const privacyKeys: ReadonlySet<string> = new Set(PRIVACY_FIELD_KEYS);

export function privacyFields(values: readonly string[]): PrivacyFieldKey[] {
  return values.filter((v): v is PrivacyFieldKey => privacyKeys.has(v));
}

export function toSelfUser(user: User, hasPhoto: boolean): SelfUser {
  return {
    id: user.id,
    email: user.email,
    phone: user.phone,
    role: user.role,
    accountStatus: user.accountStatus,
    suspendedUntil: user.suspendedUntil?.toISOString() ?? null,
    onboardingCompleted: user.onboardingCompleted,
    requiresParentalVetting: user.requiresParentalVetting,
    modestyBlurEnabled: user.modestyBlurEnabled,
    displayName: user.displayName,
    gender: user.gender,
    age: user.age,
    location: user.location,
    profession: user.profession,
    prayerFrequency: user.prayerFrequency,
    dietaryHabits: user.dietaryHabits,
    bio: user.bio,
    height: user.height,
    maritalStatus: user.maritalStatus,
    education: user.education,
    nationality: user.nationality,
    languages: user.languages,
    hiddenFields: privacyFields(user.hiddenFields),
    readinessCompleted: user.readinessCompleted,
    completedModules: user.completedModules,
    hasPhoto,
    hasPassword: user.passwordHash !== null,
    authProvider: user.firebaseUid.startsWith("local:") ? "password" : "google",
    createdAt: user.createdAt.toISOString(),
  };
}

export function requiresGuardian(user: Pick<User, "role" | "requiresParentalVetting">): boolean {
  return user.role === "DEPENDENT" || user.requiresParentalVetting;
}

/** Hidden fields are stripped here, on the server, never just hidden in CSS. */
export function toPublicProfile(user: User, photoAccess: PhotoAccess): PublicProfile {
  const hidden = new Set(privacyFields(user.hiddenFields));
  const visible = <T>(key: PrivacyFieldKey, value: T): T | null => (hidden.has(key) ? null : value);

  return {
    id: user.id,
    displayName: user.displayName ?? "Member",
    gender: user.gender,
    role: user.role,
    age: visible("age", user.age),
    location: visible("location", user.location),
    profession: visible("profession", user.profession),
    prayerFrequency: visible("prayerFrequency", user.prayerFrequency),
    dietaryHabits: visible("dietaryHabits", user.dietaryHabits),
    bio: visible("bio", user.bio),
    height: visible("height", user.height),
    maritalStatus: visible("maritalStatus", user.maritalStatus),
    education: visible("education", user.education),
    nationality: visible("nationality", user.nationality),
    languages: hidden.has("languages") ? [] : user.languages,
    hiddenFields: [...hidden],
    readinessCompleted: user.readinessCompleted,
    completedModules: user.completedModules,
    waliInvolved: requiresGuardian(user),
    photoAccess,
  };
}

export function toBrief(user: Pick<User, "id" | "displayName" | "role">): PersonBrief {
  return { id: user.id, displayName: user.displayName ?? "Member", role: user.role };
}

export interface PhotoAccessInput {
  viewer: Pick<User, "id" | "role" | "gender" | "onboardingCompleted" | "accountStatus">;
  owner: Pick<User, "id" | "gender" | "modestyBlurEnabled">;
  ownerHasPhoto: boolean;
  viewerIsGuardianOfOwner: boolean;
  /** Present when viewer and owner share an APPROVED connection. */
  approvedConnection: { senderPhotoConsent: boolean; receiverPhotoConsent: boolean } | null;
}

/**
 * Progressive unblurring:
 *   NONE  → no image at all (default for modest profiles)
 *   BLUR  → only a ~24px thumbnail, rendered blurred
 *   FULL  → the real photo, only after mutual consent in an approved connection
 */
export function photoAccessFor(input: PhotoAccessInput): PhotoAccess {
  const { viewer, owner } = input;
  if (!input.ownerHasPhoto) return "NONE";
  if (viewer.id === owner.id || viewer.role === "ADMIN" || input.viewerIsGuardianOfOwner) return "FULL";
  if (input.approvedConnection) {
    return input.approvedConnection.senderPhotoConsent && input.approvedConnection.receiverPhotoConsent
      ? "FULL"
      : "BLUR";
  }
  const viewerIsEligibleSeeker =
    (viewer.role === "SOLO" || viewer.role === "DEPENDENT") &&
    viewer.onboardingCompleted &&
    viewer.accountStatus === "ACTIVE" &&
    viewer.gender !== null &&
    owner.gender !== null &&
    viewer.gender !== owner.gender;
  if (viewerIsEligibleSeeker && !owner.modestyBlurEnabled) return "BLUR";
  return "NONE";
}
