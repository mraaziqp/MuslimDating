import type { NextFunction, Request, RequestHandler, Response } from "express";
import { createRemoteJWKSet, decodeProtectedHeader, jwtVerify, SignJWT } from "jose";
import { and, eq, lt, or, isNull, sql } from "drizzle-orm";
import { users, type User, type UserRole } from "../src/lib/schema.js";
import type { Database } from "./db.js";
import { getDb } from "./db.js";
import { AppError, errors } from "./http.js";
import { recordAudit } from "./audit.js";

// ─── Configuration ────────────────────────────────────────────────────────────

const SESSION_ISSUER = "nikahpath";
const SESSION_AUDIENCE = "nikahpath-web";
const SESSION_TTL = "7d";
const DEV_JWT_SECRET = "nikahpath-local-development-secret-do-not-use-in-production";

export const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID ?? "studio-9165894196-8cf76";

function sessionSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (secret && secret.length >= 32) return new TextEncoder().encode(secret);
  if (process.env.NODE_ENV === "production") {
    throw new AppError(503, "AUTH_NOT_CONFIGURED", "JWT_SECRET must be set to at least 32 characters.");
  }
  return new TextEncoder().encode(DEV_JWT_SECRET);
}

const firebaseJwks = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"),
);

// ─── Tokens ───────────────────────────────────────────────────────────────────

export type VerifiedToken =
  | { kind: "session"; userId: string }
  | { kind: "firebase"; uid: string; email: string | null; emailVerified: boolean; name: string | null };

export async function signSessionToken(userId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuer(SESSION_ISSUER)
    .setAudience(SESSION_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(SESSION_TTL)
    .sign(sessionSecret());
}

export async function verifyBearerToken(token: string): Promise<VerifiedToken> {
  let alg: string | undefined;
  try {
    alg = decodeProtectedHeader(token).alg;
  } catch {
    throw errors.unauthorized("Your session is invalid. Please sign in again.", "INVALID_TOKEN");
  }

  try {
    if (alg === "HS256") {
      const { payload } = await jwtVerify(token, sessionSecret(), {
        issuer: SESSION_ISSUER,
        audience: SESSION_AUDIENCE,
        algorithms: ["HS256"],
      });
      if (!payload.sub) throw new Error("missing subject");
      return { kind: "session", userId: payload.sub };
    }

    if (alg === "RS256") {
      const { payload } = await jwtVerify(token, firebaseJwks, {
        issuer: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,
        audience: FIREBASE_PROJECT_ID,
        algorithms: ["RS256"],
      });
      if (!payload.sub) throw new Error("missing subject");
      const email = typeof payload.email === "string" ? payload.email.toLowerCase() : null;
      return {
        kind: "firebase",
        uid: payload.sub,
        email,
        emailVerified: payload.email_verified === true,
        name: typeof payload.name === "string" ? payload.name : null,
      };
    }
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw errors.unauthorized("Your session has expired. Please sign in again.", "INVALID_TOKEN");
  }

  throw errors.unauthorized("Unsupported token.", "INVALID_TOKEN");
}

export function bearerFrom(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  return token.length > 0 ? token : null;
}

// ─── Account status ───────────────────────────────────────────────────────────

/** Rejects banned/suspended accounts; lifts suspensions whose term has ended. */
export async function assertAccountUsable(db: Database, user: User): Promise<User> {
  if (user.accountStatus === "BANNED") {
    throw new AppError(403, "ACCOUNT_BANNED", "This account has been banned for violating community guidelines.");
  }
  if (user.accountStatus === "SUSPENDED") {
    if (user.suspendedUntil && user.suspendedUntil.getTime() <= Date.now()) {
      const [reinstated] = await db
        .update(users)
        .set({ accountStatus: "ACTIVE", suspendedUntil: null, updatedAt: new Date() })
        .where(and(eq(users.id, user.id), eq(users.accountStatus, "SUSPENDED")))
        .returning();
      if (reinstated) {
        await recordAudit(db, {
          actorId: null,
          targetId: user.id,
          action: "ACCOUNT_SUSPENSION_EXPIRED",
          metadata: { suspendedUntil: user.suspendedUntil.toISOString() },
        });
        return reinstated;
      }
      return user;
    }
    const until = user.suspendedUntil ? ` until ${user.suspendedUntil.toISOString().slice(0, 10)}` : "";
    throw new AppError(403, "ACCOUNT_SUSPENDED", `This account is suspended${until}.`);
  }
  return user;
}

// ─── Request actor ────────────────────────────────────────────────────────────

const actors = new WeakMap<Request, User>();

export function actor(req: Request): User {
  const user = actors.get(req);
  if (!user) throw errors.unauthorized();
  return user;
}

async function loadUserForToken(db: Database, token: VerifiedToken): Promise<User | undefined> {
  const [user] = await db
    .select()
    .from(users)
    .where(token.kind === "session" ? eq(users.id, token.userId) : eq(users.firebaseUid, token.uid))
    .limit(1);
  return user;
}

const LAST_SEEN_INTERVAL_MS = 5 * 60 * 1000;

export const requireAuth: RequestHandler = (req: Request, _res: Response, next: NextFunction) => {
  (async () => {
    const token = bearerFrom(req);
    if (!token) throw errors.unauthorized();
    const verified = await verifyBearerToken(token);
    const db = await getDb();
    const found = await loadUserForToken(db, verified);
    if (!found) {
      throw errors.unauthorized(
        verified.kind === "firebase" ? "Finish signing in to create your account." : "Account not found.",
        verified.kind === "firebase" ? "ACCOUNT_NOT_PROVISIONED" : "INVALID_TOKEN",
      );
    }
    const user = await assertAccountUsable(db, found);

    if (!user.lastSeenAt || Date.now() - user.lastSeenAt.getTime() > LAST_SEEN_INTERVAL_MS) {
      await db
        .update(users)
        .set({ lastSeenAt: sql`now()` })
        .where(
          and(
            eq(users.id, user.id),
            or(isNull(users.lastSeenAt), lt(users.lastSeenAt, new Date(Date.now() - LAST_SEEN_INTERVAL_MS))),
          ),
        );
    }

    actors.set(req, user);
  })()
    .then(() => next())
    .catch(next);
};

export const requireOnboarded: RequestHandler = (req, _res, next) => {
  try {
    const user = actor(req);
    if (!user.onboardingCompleted) {
      throw errors.forbidden("Complete your profile setup first.", "ONBOARDING_REQUIRED");
    }
    next();
  } catch (err) {
    next(err);
  }
};

export function requireRole(...roles: UserRole[]): RequestHandler {
  return (req, _res, next) => {
    try {
      const user = actor(req);
      if (!roles.includes(user.role)) throw errors.forbidden();
      next();
    } catch (err) {
      next(err);
    }
  };
}
