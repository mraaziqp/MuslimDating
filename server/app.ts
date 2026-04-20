import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import {
  syncUserWithDb,
  getUserByFirebaseId,
  updateProfile,
  completeModule,
  getSeekers,
  createConnection,
  getPendingForParent,
  reviewConnection,
} from "../src/actions/user.js";
import { db } from "../src/lib/db.js";
import { users } from "../src/lib/schema.js";
import { eq, sql } from "drizzle-orm";
import type { UserRole } from "../src/lib/schema.js";

const app = express();
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET ?? "nikahpath-dev-secret";

// ─── GET /api/health ─────────────────────────────────────────────────────────
// Quick env/db connectivity diagnostic — safe to hit from browser
app.get("/api/health", async (_req, res) => {
  const missing: string[] = [];
  if (!process.env.DATABASE_URL) missing.push("DATABASE_URL");
  if (!process.env.JWT_SECRET)   missing.push("JWT_SECRET");

  if (missing.length > 0) {
    return res.status(500).json({
      ok: false,
      error: `Missing environment variables: ${missing.join(", ")}. Set them in Vercel → Project → Settings → Environment Variables, then redeploy.`,
    });
  }

  try {
    // Simple ping — just check we can reach the DB
    await db.execute(sql`SELECT 1`);
    return res.json({ ok: true, env: "all required vars present", db: "reachable" });
  } catch (err: unknown) {
    const e = err as { message?: string };
    return res.status(500).json({ ok: false, env: "all required vars present", db: e?.message ?? String(err) });
  }
});

// Global API error handler so serverless failures return JSON instead of hard crash pages
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[UNHANDLED API ERROR]", err);
  const message = (err as { message?: string })?.message ?? "Internal server error";
  return res.status(500).json({ error: message });
});

function mapAuthRouteError(err: unknown): { status: number; message: string } {
  const e = err as { code?: string; message?: string };

  // Postgres undefined column (very likely when production DB is missing password_hash migration)
  if (e?.code === "42703") {
    return {
      status: 500,
      message: "Database schema is out of date. Run migrations so users.password_hash exists.",
    };
  }

  // Postgres undefined table / relation
  if (e?.code === "42P01") {
    return {
      status: 500,
      message: "Database schema is missing required tables. Run migrations on production database.",
    };
  }

  // Common connection/config errors
  if (
    e?.message?.includes("DATABASE_URL") ||
    e?.message?.includes("ECONN") ||
    e?.message?.includes("ENOTFOUND") ||
    e?.message?.includes("Invalid URL") ||
    e?.message?.includes("not set")
  ) {
    return {
      status: 500,
      message: "Database connection failed — DATABASE_URL is missing or invalid in your deployment env vars. Check Vercel → Project → Settings → Environment Variables.",
    };
  }

  return { status: 500, message: "Authentication service error." };
}

// ─── POST /api/auth/register ─────────────────────────────────────────────────
app.post("/api/auth/register", async (req, res) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password) return res.status(400).json({ error: "email and password are required." });
    if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters." });

    const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email.toLowerCase().trim())).limit(1);
    if (existing.length > 0) return res.status(409).json({ error: "An account with that email already exists." });

    const passwordHash = await bcrypt.hash(password, 12);
    const firebaseUid = `local:${randomUUID()}`;
    const normalizedEmail = email.toLowerCase().trim();
    const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase().trim();
    const role: UserRole = adminEmail && normalizedEmail === adminEmail ? "PARENT" : "SOLO";

    const [user] = await db.insert(users).values({
      firebaseUid,
      email: normalizedEmail,
      passwordHash,
      role,
    }).returning();

    const token = jwt.sign({ uid: user.firebaseUid, email: user.email }, JWT_SECRET, { expiresIn: "30d" });
    return res.json({ token, user });
  } catch (err) {
    console.error("[POST /api/auth/register]", err);
    const mapped = mapAuthRouteError(err);
    return res.status(mapped.status).json({ error: mapped.message });
  }
});

// ─── POST /api/auth/login ────────────────────────────────────────────────────
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password) return res.status(400).json({ error: "email and password are required." });

    const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase().trim())).limit(1);
    if (!user || !user.passwordHash) return res.status(401).json({ error: "Invalid email or password." });

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ error: "Invalid email or password." });

    const token = jwt.sign({ uid: user.firebaseUid, email: user.email }, JWT_SECRET, { expiresIn: "30d" });
    return res.json({ token, user });
  } catch (err) {
    console.error("[POST /api/auth/login]", err);
    const mapped = mapAuthRouteError(err);
    return res.status(mapped.status).json({ error: mapped.message });
  }
});

// ─── GET /api/auth/me ────────────────────────────────────────────────────────
// Validates a JWT and returns the current user row
app.get("/api/auth/me", async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return res.status(401).json({ error: "No token." });
  try {
    const payload = jwt.verify(auth.slice(7), JWT_SECRET) as { uid: string };
    const user = await getUserByFirebaseId(payload.uid);
    if (!user) return res.status(404).json({ error: "User not found." });
    return res.json(user);
  } catch {
    return res.status(401).json({ error: "Invalid or expired token." });
  }
});

// ─── POST /api/users/sync ────────────────────────────────────────────────────
app.post("/api/users/sync", async (req, res) => {
  const { firebaseUid, email, role, phone, displayName, gender, age, location, requiresParentalVetting } =
    req.body as {
      firebaseUid: string;
      email: string;
      role: UserRole;
      phone?: string;
      displayName?: string;
      gender?: string;
      age?: number;
      location?: string;
      requiresParentalVetting?: boolean;
    };

  if (!firebaseUid || !email || !role) {
    console.error("[POST /api/users/sync] missing fields", { firebaseUid: !!firebaseUid, email: !!email, role: !!role });
    return res.status(400).json({ error: "firebaseUid, email, and role are required." });
  }

  try {
    const user = await syncUserWithDb({ firebaseUid, email, role, phone, displayName, gender, age, location, requiresParentalVetting });
    return res.json(user);
  } catch (err) {
    console.error("[POST /api/users/sync]", err);
    return res.status(500).json({ error: "Failed to sync user." });
  }
});

// ─── GET /api/users/me?firebaseUid=xxx ───────────────────────────────────────
app.get("/api/users/me", async (req, res) => {
  const { firebaseUid } = req.query as { firebaseUid?: string };
  if (!firebaseUid) return res.status(400).json({ error: "firebaseUid query param is required." });

  try {
    const user = await getUserByFirebaseId(firebaseUid);
    if (!user) return res.status(404).json({ error: "User not found." });
    return res.json(user);
  } catch (err) {
    console.error("[GET /api/users/me]", err);
    return res.status(500).json({ error: "Failed to fetch user." });
  }
});

// ─── PUT /api/users/profile ──────────────────────────────────────────────────
app.put("/api/users/profile", async (req, res) => {
  const { firebaseUid, ...fields } = req.body as { firebaseUid: string; [key: string]: any };
  if (!firebaseUid) return res.status(400).json({ error: "firebaseUid is required." });

  try {
    const user = await updateProfile({ firebaseUid, ...fields });
    return res.json(user);
  } catch (err) {
    console.error("[PUT /api/users/profile]", err);
    return res.status(500).json({ error: "Failed to update profile." });
  }
});

// ─── POST /api/users/modules/complete ────────────────────────────────────────
app.post("/api/users/modules/complete", async (req, res) => {
  const { firebaseUid, moduleId } = req.body as { firebaseUid: string; moduleId: string };
  if (!firebaseUid || !moduleId) return res.status(400).json({ error: "firebaseUid and moduleId are required." });

  try {
    const user = await completeModule(firebaseUid, moduleId);
    return res.json(user);
  } catch (err) {
    console.error("[POST /api/users/modules/complete]", err);
    return res.status(500).json({ error: "Failed to complete module." });
  }
});

// ─── GET /api/users/seekers?firebaseUid=xxx ───────────────────────────────────
app.get("/api/users/seekers", async (req, res) => {
  const { firebaseUid } = req.query as { firebaseUid?: string };
  if (!firebaseUid) return res.status(400).json({ error: "firebaseUid is required." });

  try {
    const seekers = await getSeekers(firebaseUid);
    return res.json(seekers);
  } catch (err) {
    console.error("[GET /api/users/seekers]", err);
    return res.status(500).json({ error: "Failed to fetch seekers." });
  }
});

// ─── POST /api/connections ────────────────────────────────────────────────────
app.post("/api/connections", async (req, res) => {
  const { senderFirebaseUid, receiverDbId } = req.body as {
    senderFirebaseUid: string;
    receiverDbId: string;
  };

  if (!senderFirebaseUid || !receiverDbId) {
    return res.status(400).json({ error: "senderFirebaseUid and receiverDbId are required." });
  }

  try {
    const result = await createConnection(senderFirebaseUid, receiverDbId);
    return result.success ? res.json(result) : res.status(409).json(result);
  } catch (err) {
    console.error("[POST /api/connections]", err);
    return res.status(500).json({ error: "Failed to create connection." });
  }
});

// ─── GET /api/connections/pending-parent?firebaseUid=xxx ─────────────────────
app.get("/api/connections/pending-parent", async (req, res) => {
  const { firebaseUid } = req.query as { firebaseUid?: string };
  if (!firebaseUid) return res.status(400).json({ error: "firebaseUid is required." });

  try {
    const pending = await getPendingForParent(firebaseUid);
    return res.json(pending);
  } catch (err) {
    console.error("[GET /api/connections/pending-parent]", err);
    return res.status(500).json({ error: "Failed to fetch pending connections." });
  }
});

// ─── PUT /api/connections/:id ─────────────────────────────────────────────────
app.put("/api/connections/:id", async (req, res) => {
  const { id } = req.params;
  const { firebaseUid, action, mahramId } = req.body as {
    firebaseUid: string;
    action: "approve" | "reject";
    mahramId?: string;
  };

  if (!firebaseUid || !action) {
    return res.status(400).json({ error: "firebaseUid and action are required." });
  }

  try {
    const result = await reviewConnection(id, firebaseUid, action, mahramId);
    return result.success ? res.json(result) : res.status(400).json(result);
  } catch (err) {
    console.error("[PUT /api/connections/:id]", err);
    return res.status(500).json({ error: "Failed to update connection." });
  }
});

export default app;
