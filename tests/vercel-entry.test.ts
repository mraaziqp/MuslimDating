/**
 * The hosted deployment does not hand Express a live request stream: Vercel
 * buffers the body first and exposes it as a lazily parsed `req.body`. These
 * tests reproduce that hand-over around api/index.ts, because a mismatch there
 * (the JSON middleware waiting on a drained stream) would hang every POST in
 * production while passing every ordinary HTTP test.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";

let server: Server;
let base = "";

beforeAll(async () => {
  process.env.DATABASE_URL = "memory://";
  const { default: handler } = await import("../api/index.js");

  server = createServer((req: IncomingMessage & { body?: unknown }, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    // Like Vercel: only once the whole body has been read is the function invoked.
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      let parsed: { value: unknown } | undefined;
      Object.defineProperty(req, "body", {
        configurable: true,
        enumerable: true,
        get() {
          if (raw.length === 0) return undefined;
          parsed ??= { value: JSON.parse(raw) };
          return parsed.value;
        },
        set(value: unknown) {
          parsed = { value };
        },
      });
      handler(req, res);
    });
  }).listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function post(path: string, body: string, token?: string) {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

describe("Vercel entry point", () => {
  it("serves requests without a body", async () => {
    const res = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(15_000) });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { database: string }).database).toBe("pglite");
  });

  it("uses the body Vercel already parsed instead of waiting on the drained stream", async () => {
    const registered = await post("/api/auth/register", JSON.stringify({ email: "hosted@test.local", password: "correct-horse-battery" }));
    expect(registered.status).toBe(200);
    const token = String(registered.body.token);

    const onboarded = await post(
      "/api/me/onboarding",
      JSON.stringify({ displayName: "Hosted Member", gender: "female", age: 28, role: "SOLO", requiresParentalVetting: false }),
      token,
    );
    expect(onboarded.status).toBe(200);
    expect(onboarded.body.displayName).toBe("Hosted Member");

    // Validation still applies to the pre-parsed body.
    const invalid = await post("/api/auth/register", JSON.stringify({ email: "not-an-email", password: "x" }));
    expect(invalid.status).toBe(400);
    expect(invalid.body.code).toBe("VALIDATION_FAILED");
  });

  it("answers malformed JSON with a 400 rather than hanging or crashing", async () => {
    const res = await post("/api/auth/login", "{ not json");
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_JSON");
  });

  it("handles a POST that carries no body at all", async () => {
    const res = await fetch(`${base}/api/auth/firebase`, { method: "POST", signal: AbortSignal.timeout(15_000) });
    expect(res.status).toBe(401);
  });
});
