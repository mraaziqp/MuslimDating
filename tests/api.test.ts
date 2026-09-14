import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

let server: Server;
let base = "";

beforeAll(async () => {
  process.env.DATABASE_URL = "memory://";
  delete process.env.CRON_SECRET;
  const { createApp } = await import("../server/app.js");
  server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function call(path: string, init: RequestInit & { token?: string } = {}) {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");
  if (init.token) headers.set("Authorization", `Bearer ${init.token}`);
  const res = await fetch(`${base}${path}`, { ...init, headers });
  const text = await res.text();
  return { status: res.status, body: text ? (JSON.parse(text) as Record<string, unknown>) : {}, text };
}

async function register(email: string) {
  const res = await call("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password: "correct-horse-battery" }),
  });
  expect(res.status).toBe(200);
  return res.body.token as string;
}

describe("HTTP API security boundary", () => {
  it("reports health", async () => {
    const res = await call("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.database).toBe("pglite");
  });

  it("requires a verified bearer token (no more client-supplied firebaseUid)", async () => {
    expect((await call("/api/me")).status).toBe(401);
    expect((await call("/api/me", { token: "not-a-jwt" })).status).toBe(401);
    expect((await call("/api/users/me?firebaseUid=anything")).status).toBe(404);
  });

  it("validates registration and never returns the password hash", async () => {
    const weak = await call("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email: "weak@test.local", password: "123" }),
    });
    expect(weak.status).toBe(400);
    expect(weak.body.code).toBe("VALIDATION_FAILED");

    const token = await register("sister@test.local");
    const me = await call("/api/me", { token });
    expect(me.status).toBe(200);
    expect(me.text).not.toMatch(/password_?hash/i);
    expect(me.body.onboardingCompleted).toBe(false);

    const dup = await call("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email: "SISTER@test.local", password: "correct-horse-battery" }),
    });
    expect(dup.status).toBe(409);

    const badLogin = await call("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "sister@test.local", password: "wrong-password" }),
    });
    expect(badLogin.status).toBe(401);
  });

  it("gates features behind onboarding and blocks role self-escalation", async () => {
    const token = await register("brother@test.local");
    expect((await call("/api/feed", { token })).status).toBe(403);

    const escalate = await call("/api/me/onboarding", {
      method: "POST",
      token,
      body: JSON.stringify({ displayName: "Brother", gender: "male", age: 30, role: "ADMIN", requiresParentalVetting: false }),
    });
    expect(escalate.status).toBe(400);

    const ok = await call("/api/me/onboarding", {
      method: "POST",
      token,
      body: JSON.stringify({ displayName: "Brother", gender: "male", age: 30, role: "SOLO", requiresParentalVetting: false }),
    });
    expect(ok.status).toBe(200);
    expect(ok.body.role).toBe("SOLO");

    const feed = await call("/api/feed", { token });
    expect(feed.status).toBe(200);

    const blocked = await call("/api/connections", {
      method: "POST",
      token,
      body: JSON.stringify({ receiverId: "00000000-0000-4000-8000-000000000000" }),
    });
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe("READINESS_REQUIRED");

    const wrongQuiz = await call("/api/readiness/intro", { method: "POST", token, body: JSON.stringify({ answers: [3, 3, 3, 3, 3] }) });
    expect(wrongQuiz.body.passed).toBe(false);
    const quiz = await call("/api/readiness/intro", { method: "POST", token, body: JSON.stringify({ answers: [0, 1, 2, 3, 0] }) });
    expect(quiz.body.passed).toBe(true);

    expect((await call("/api/admin/metrics", { token })).status).toBe(403);
    expect((await call("/api/admin/users", { token })).status).toBe(403);
  });

  it("protects the cron endpoint", async () => {
    expect((await call("/api/cron/cleanup-stale-connections")).status).toBe(503);
    process.env.CRON_SECRET = "cron-secret-for-tests";
    expect((await call("/api/cron/cleanup-stale-connections", { token: "wrong" })).status).toBe(401);
    const ok = await call("/api/cron/cleanup-stale-connections", { token: "cron-secret-for-tests" });
    expect(ok.status).toBe(200);
    expect(Array.isArray(ok.body.terminatedConnectionIds)).toBe(true);
  });

  it("returns JSON 404 for unknown endpoints", async () => {
    const res = await call("/api/nope");
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("ENDPOINT_NOT_FOUND");
  });
});
