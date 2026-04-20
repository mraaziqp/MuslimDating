import "dotenv/config";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import { db } from "../src/lib/db.js";
import { users } from "../src/lib/schema.js";
import { eq, sql } from "drizzle-orm";
import type { UserRole } from "../src/lib/schema.js";

type Req = {
	method?: string;
	url?: string;
	headers: Record<string, string | string[] | undefined>;
	body?: unknown;
	on: (event: string, cb: (chunk: Buffer) => void) => void;
};

type Res = {
	statusCode: number;
	setHeader: (name: string, value: string) => void;
	end: (body?: string) => void;
};

const JWT_SECRET = process.env.JWT_SECRET ?? "nikahpath-dev-secret";
let authSchemaEnsured = false;
let authSchemaEnsuring: Promise<void> | null = null;

async function ensureAuthSchema(): Promise<void> {
	if (authSchemaEnsured) return;
	if (!authSchemaEnsuring) {
		authSchemaEnsuring = (async () => {
			await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash text`);
			authSchemaEnsured = true;
		})().finally(() => {
			authSchemaEnsuring = null;
		});
	}
	await authSchemaEnsuring;
}

function json(res: Res, status: number, payload: unknown) {
	res.statusCode = status;
	res.setHeader("Content-Type", "application/json; charset=utf-8");
	res.end(JSON.stringify(payload));
}

async function readJsonBody(req: Req): Promise<Record<string, unknown>> {
	if (req.body && typeof req.body === "object") {
		return req.body as Record<string, unknown>;
	}

	const chunks: Buffer[] = [];
	await new Promise<void>((resolve) => {
		req.on("data", (chunk) => chunks.push(chunk));
		req.on("end", () => resolve());
	});

	if (chunks.length === 0) return {};
	const raw = Buffer.concat(chunks).toString("utf8");
	if (!raw) return {};
	try {
		return JSON.parse(raw) as Record<string, unknown>;
	} catch {
		return {};
	}
}

export default async function handler(req: Req, res: Res) {
	const url = new URL(req.url ?? "/", "http://localhost");
	const method = (req.method ?? "GET").toUpperCase();

	try {
		if (method === "GET" && url.pathname === "/api/health") {
			const missing: string[] = [];
			if (!process.env.DATABASE_URL) missing.push("DATABASE_URL");
			if (!process.env.JWT_SECRET) missing.push("JWT_SECRET");
			if (missing.length > 0) {
				return json(res, 500, { ok: false, error: `Missing env vars: ${missing.join(", ")}` });
			}
			await db.execute(sql`SELECT 1`);
			return json(res, 200, { ok: true, db: "reachable" });
		}

		if (method === "POST" && url.pathname === "/api/auth/register") {
			await ensureAuthSchema();
			const body = await readJsonBody(req);
			const email = String(body.email ?? "").toLowerCase().trim();
			const password = String(body.password ?? "");
			if (!email || !password) return json(res, 400, { error: "email and password are required." });
			if (password.length < 6) return json(res, 400, { error: "Password must be at least 6 characters." });

			const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
			if (existing.length > 0) return json(res, 409, { error: "An account with that email already exists." });

			const passwordHash = await bcrypt.hash(password, 12);
			const firebaseUid = `local:${randomUUID()}`;
			const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase().trim();
			const role: UserRole = adminEmail && email === adminEmail ? "PARENT" : "SOLO";

			const [user] = await db.insert(users).values({ firebaseUid, email, passwordHash, role }).returning();
			const token = jwt.sign({ uid: user.firebaseUid, email: user.email }, JWT_SECRET, { expiresIn: "30d" });
			return json(res, 200, { token, user });
		}

		if (method === "POST" && url.pathname === "/api/auth/login") {
			await ensureAuthSchema();
			const body = await readJsonBody(req);
			const email = String(body.email ?? "").toLowerCase().trim();
			const password = String(body.password ?? "");
			if (!email || !password) return json(res, 400, { error: "email and password are required." });

			const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
			if (!user || !user.passwordHash) return json(res, 401, { error: "Invalid email or password." });

			const valid = await bcrypt.compare(password, user.passwordHash);
			if (!valid) return json(res, 401, { error: "Invalid email or password." });

			const token = jwt.sign({ uid: user.firebaseUid, email: user.email }, JWT_SECRET, { expiresIn: "30d" });
			return json(res, 200, { token, user });
		}

		if (method === "GET" && url.pathname === "/api/auth/me") {
			const auth = (req.headers.authorization ?? req.headers.Authorization) as string | undefined;
			if (!auth?.startsWith("Bearer ")) return json(res, 401, { error: "No token." });

			const payload = jwt.verify(auth.slice(7), JWT_SECRET) as { uid: string };
			const [user] = await db.select().from(users).where(eq(users.firebaseUid, payload.uid)).limit(1);
			if (!user) return json(res, 404, { error: "User not found." });
			return json(res, 200, user);
		}

		// Fallback to existing Express app for non-auth routes
		const mod = await import("../server/app.js");
		const app = mod.default as unknown as (req: Req, res: Res) => void;
		return app(req, res);
	} catch (err) {
		const e = err as { message?: string; stack?: string };
		console.error("[api bootstrap error]", err);
		return json(res, 500, {
			error: "API bootstrap failed",
			message: e?.message ?? "Unknown startup error",
			stack: process.env.NODE_ENV === "development" ? e?.stack : undefined,
		});
	}
}
