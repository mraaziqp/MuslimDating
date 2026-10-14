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
      body: JSON.stringify({ identifier: "sister@test.local", password: "wrong-password" }),
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

    const search = await call("/api/seekers/search", { token });
    expect(search.status).toBe(200);
    expect(Array.isArray(search.body.profiles)).toBe(true);

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

  it("serves discovery, saving and passing over HTTP", async () => {
    const onboard = async (email: string, gender: "male" | "female") => {
      const token = await register(email);
      const body = { displayName: `Deck ${gender}`, gender, age: 29, role: "SOLO", requiresParentalVetting: false };
      expect((await call("/api/me/onboarding", { method: "POST", token, body: JSON.stringify(body) })).status).toBe(200);
      const quiz = await call("/api/readiness/intro", { method: "POST", token, body: JSON.stringify({ answers: [0, 1, 2, 3, 0] }) });
      expect(quiz.body.passed).toBe(true);
      return { token, id: String((await call("/api/me", { token })).body.id) };
    };
    const him = await onboard("deck-brother@test.local", "male");
    const her = await onboard("deck-sister@test.local", "female");
    const reaction = `/api/seekers/${her.id}/reaction`;
    const put = (path: string, token: string | undefined, body: unknown) =>
      call(path, { method: "PUT", token, body: JSON.stringify(body) });

    expect((await put(reaction, undefined, { kind: "SAVED" })).status).toBe(401);
    expect((await put(reaction, him.token, { kind: "LIKED" })).body.code).toBe("VALIDATION_FAILED");
    expect((await put("/api/seekers/not-a-uuid/reaction", him.token, { kind: "SAVED" })).body.code).toBe("INVALID_ID");

    const saved = await put(reaction, him.token, { kind: "SAVED" });
    expect(saved.status).toBe(200);
    expect(saved.body).toEqual({ targetId: her.id, kind: "SAVED" });

    const note = `/api/seekers/${her.id}/note`;
    expect((await put(note, him.token, { note: "x".repeat(501) })).body.code).toBe("VALIDATION_FAILED");
    expect((await put(note, her.token, { note: "Not saved by her" })).body.code).toBe("NOT_SAVED");
    expect((await put(note, him.token, { note: "Speak to my father first" })).body).toEqual({
      targetId: her.id,
      note: "Speak to my father first",
    });

    const shortlist = await call("/api/seekers/saved", { token: him.token });
    expect(shortlist.body.profiles).toMatchObject([{ id: her.id, saved: true, note: "Speak to my father first" }]);
    // Her own shortlist is separate, and she is never told.
    expect((await call("/api/seekers/saved", { token: her.token })).body.profiles).toEqual([]);

    // A seeker cannot widen the search to their own gender.
    const sameGender = await call("/api/seekers/search?gender=male", { token: him.token });
    expect(sameGender.status).toBe(200);
    expect((sameGender.body.profiles as { gender: string }[]).every((p) => p.gender === "female")).toBe(true);
    expect((await call("/api/seekers/search?minAge=2", { token: him.token })).body.code).toBe("VALIDATION_FAILED");

    expect((await call(reaction, { method: "DELETE", token: him.token })).status).toBe(204);
    expect((await put(reaction, him.token, { kind: "PASSED" })).status).toBe(200);
    const hidden = await call("/api/seekers/search", { token: him.token });
    expect((hidden.body.profiles as { id: string }[]).map((p) => p.id)).not.toContain(her.id);
    expect(hidden.body.passedCount).toBe(1);
    expect((await call("/api/seekers/passes", { method: "DELETE", token: him.token })).body).toEqual({ restored: 1 });

    const summary = await call("/api/me/summary", { token: him.token });
    expect(summary.body).toEqual({ needsResponse: 0, activeChats: 0, pendingOutgoing: 0, unreadMessages: 0 });
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
