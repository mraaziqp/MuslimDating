import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { and, eq, like } from "drizzle-orm";
import type {
  LoginInput,
  OnboardingInput,
  ProfileUpdateInput,
  RegisterInput,
  SelfUser,
} from "../../src/lib/contracts.js";
import { profilePhotos, users, type NewUser, type User } from "../../src/lib/schema.js";
import { recordAudit } from "../audit.js";
import { assertAccountUsable, type VerifiedToken } from "../auth.js";
import type { Database } from "../db.js";
import { errors, translateDatabaseError } from "../http.js";
import { toSelfUser } from "../presenters.js";
import { enforceRateLimit } from "../rate-limit.js";

const BCRYPT_ROUNDS = 12;
let dummyHash: string | null = null;

export async function userHasPhoto(db: Database, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ userId: profilePhotos.userId })
    .from(profilePhotos)
    .where(eq(profilePhotos.userId, userId))
    .limit(1);
  return row !== undefined;
}

export async function getSelf(db: Database, userId: string): Promise<SelfUser> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw errors.notFound("Account not found.");
  return toSelfUser(user, await userHasPhoto(db, userId));
}

function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

// ─── Email / password ─────────────────────────────────────────────────────────

export async function registerWithPassword(db: Database, input: RegisterInput, ip: string): Promise<User> {
  await enforceRateLimit(db, `register:${ip}`, 10, 3600, "Too many sign-ups from this network. Try again later.");
  const email = normaliseEmail(input.email);
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

  let created: User | undefined;
  try {
    [created] = await db
      .insert(users)
      .values({ firebaseUid: `local:${randomUUID()}`, email, passwordHash, role: "SOLO" })
      .returning();
  } catch (err) {
    throw translateDatabaseError(err) ?? err;
  }
  if (!created) throw new Error("Failed to create user");

  await recordAudit(db, {
    actorId: created.id,
    targetId: created.id,
    action: "USER_REGISTERED",
    metadata: { provider: "password" },
  });
  return created;
}

export async function loginWithPassword(db: Database, input: LoginInput, ip: string): Promise<User> {
  const email = normaliseEmail(input.email);
  await enforceRateLimit(db, `login:ip:${ip}`, 30, 900, "Too many sign-in attempts. Try again in 15 minutes.");
  await enforceRateLimit(db, `login:email:${email}`, 10, 900, "Too many sign-in attempts. Try again in 15 minutes.");

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  // Always run bcrypt so response time does not reveal whether the email exists.
  dummyHash ??= await bcrypt.hash(randomUUID(), BCRYPT_ROUNDS);
  const valid = await bcrypt.compare(input.password, user?.passwordHash ?? dummyHash);
  if (!user || !user.passwordHash || !valid) {
    throw errors.unauthorized("Incorrect email or password.", "INVALID_CREDENTIALS");
  }
  return assertAccountUsable(db, user);
}

// ─── Google (Firebase) ────────────────────────────────────────────────────────

type FirebaseToken = Extract<VerifiedToken, { kind: "firebase" }>;

async function bootstrapAdmin(db: Database, user: User, token: FirebaseToken): Promise<User> {
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (!adminEmail || !token.emailVerified || token.email !== adminEmail || user.role === "ADMIN") return user;

  const [promoted] = await db
    .update(users)
    .set({ role: "ADMIN", onboardingCompleted: true, updatedAt: new Date() })
    .where(eq(users.id, user.id))
    .returning();
  if (!promoted) return user;
  await recordAudit(db, {
    actorId: null,
    targetId: user.id,
    action: "ADMIN_BOOTSTRAPPED",
    metadata: { previousRole: user.role, source: "ADMIN_EMAIL" },
  });
  return promoted;
}

/** Finds or creates the account for a verified Firebase ID token. */
export async function provisionFirebaseUser(db: Database, token: FirebaseToken): Promise<User> {
  const [existing] = await db.select().from(users).where(eq(users.firebaseUid, token.uid)).limit(1);
  if (existing) return assertAccountUsable(db, await bootstrapAdmin(db, existing, token));

  if (!token.email) throw errors.badRequest("Your Google account has no email address.", "EMAIL_REQUIRED");

  const [byEmail] = await db.select().from(users).where(eq(users.email, token.email)).limit(1);
  if (byEmail) {
    if (!token.emailVerified || !byEmail.firebaseUid.startsWith("local:")) {
      throw errors.conflict(
        "An account with this email already exists. Sign in with your email and password.",
        "EMAIL_TAKEN",
      );
    }
    const [linked] = await db
      .update(users)
      .set({ firebaseUid: token.uid, updatedAt: new Date() })
      .where(and(eq(users.id, byEmail.id), like(users.firebaseUid, "local:%")))
      .returning();
    if (!linked) throw errors.conflict("This account is already linked to another Google login.", "EMAIL_TAKEN");
    return assertAccountUsable(db, await bootstrapAdmin(db, linked, token));
  }

  let created: User | undefined;
  try {
    [created] = await db
      .insert(users)
      .values({
        firebaseUid: token.uid,
        email: token.email,
        role: "SOLO",
        displayName: token.name?.slice(0, 80) ?? null,
      })
      .returning();
  } catch (err) {
    throw translateDatabaseError(err) ?? err;
  }
  if (!created) throw new Error("Failed to create user");

  await recordAudit(db, {
    actorId: created.id,
    targetId: created.id,
    action: "USER_REGISTERED",
    metadata: { provider: "google" },
  });
  return bootstrapAdmin(db, created, token);
}

// ─── Onboarding & profile ─────────────────────────────────────────────────────

export async function completeOnboarding(db: Database, user: User, input: OnboardingInput): Promise<User> {
  if (user.onboardingCompleted) {
    throw errors.conflict("Your profile is already set up. Use the profile page to make changes.", "ALREADY_ONBOARDED");
  }
  const [updated] = await db
    .update(users)
    .set({
      displayName: input.displayName,
      gender: input.gender,
      age: input.age,
      location: input.location ?? null,
      role: input.role,
      requiresParentalVetting: input.role === "DEPENDENT" ? true : input.requiresParentalVetting,
      onboardingCompleted: true,
      updatedAt: new Date(),
    })
    .where(and(eq(users.id, user.id), eq(users.onboardingCompleted, false)))
    .returning();
  if (!updated) throw errors.conflict("Your profile is already set up.", "ALREADY_ONBOARDED");

  await recordAudit(db, {
    actorId: user.id,
    targetId: user.id,
    action: "ONBOARDING_COMPLETED",
    metadata: { role: input.role },
  });
  return updated;
}

export async function updateProfile(db: Database, user: User, input: ProfileUpdateInput): Promise<User> {
  const patch: Partial<NewUser> = { updatedAt: new Date() };

  if (input.displayName !== undefined) patch.displayName = input.displayName;
  if (input.age !== undefined) patch.age = input.age;
  if (input.location !== undefined) patch.location = input.location || null;
  if (input.profession !== undefined) patch.profession = input.profession || null;
  if (input.prayerFrequency !== undefined) patch.prayerFrequency = input.prayerFrequency;
  if (input.dietaryHabits !== undefined) patch.dietaryHabits = input.dietaryHabits;
  if (input.bio !== undefined) patch.bio = input.bio || null;
  if (input.height !== undefined) patch.height = input.height || null;
  if (input.maritalStatus !== undefined) patch.maritalStatus = input.maritalStatus;
  if (input.education !== undefined) patch.education = input.education;
  if (input.nationality !== undefined) patch.nationality = input.nationality || null;
  if (input.phone !== undefined) patch.phone = input.phone || null;
  if (input.languages !== undefined) patch.languages = [...new Set(input.languages)];
  if (input.hiddenFields !== undefined) patch.hiddenFields = [...new Set(input.hiddenFields)];
  if (input.modestyBlurEnabled !== undefined) patch.modestyBlurEnabled = input.modestyBlurEnabled;
  if (input.requiresParentalVetting !== undefined) {
    // Dependents are always vetted; the toggle only applies to independent seekers.
    patch.requiresParentalVetting = user.role === "DEPENDENT" ? true : input.requiresParentalVetting;
  }

  const [updated] = await db.update(users).set(patch).where(eq(users.id, user.id)).returning();
  if (!updated) throw errors.notFound("Account not found.");
  return updated;
}
