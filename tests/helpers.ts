import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { parentChildLinks, users, type LinkKind, type NewUser, type User } from "../src/lib/schema.js";
import { createDatabase, type Database, type DatabaseHandle } from "../server/db.js";
import { AppError, findPgError } from "../server/http.js";

export async function setupDatabase(): Promise<DatabaseHandle> {
  return createDatabase("memory://");
}

export async function makeUser(db: Database, overrides: Partial<NewUser> = {}): Promise<User> {
  const [user] = await db
    .insert(users)
    .values({
      firebaseUid: `local:${randomUUID()}`,
      email: `${randomUUID()}@test.local`,
      role: "SOLO",
      gender: "male",
      displayName: "Test Member",
      onboardingCompleted: true,
      readinessCompleted: true,
      completedModules: ["intro"],
      ...overrides,
    })
    .returning();
  if (!user) throw new Error("failed to create user");
  return user;
}

export async function linkFamily(db: Database, parent: User, child: User, kind: LinkKind): Promise<void> {
  await db.insert(parentChildLinks).values({ parentId: parent.id, childId: child.id, kind });
}

export async function reload(db: Database, user: User): Promise<User> {
  const [fresh] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  if (!fresh) throw new Error("user vanished");
  return fresh;
}

/** Resolves to the underlying Postgres error message a promise rejects with. */
export async function dbErrorMessage(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (err) {
    return findPgError(err)?.message ?? String(err);
  }
  throw new Error("expected promise to reject");
}

/** Resolves to the AppError code a promise rejects with. */
export async function errorCode(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (err) {
    if (err instanceof AppError) return err.code;
    throw err;
  }
  throw new Error("expected promise to reject");
}
