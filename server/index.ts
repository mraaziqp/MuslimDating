import "dotenv/config";
import express from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import app from "./app.js";
import { getDatabase } from "./db.js";

// PORT is only honoured for self-hosted production; in development Vite owns PORT and proxies to API_PORT.
const PORT = Number(process.env.API_PORT ?? (process.env.NODE_ENV === "production" ? process.env.PORT : undefined) ?? 3001);

/**
 * The same policy vercel.json sends in the hosted deployment. Scripts may only come
 * from this origin plus the Google sign-in helper Firebase Auth loads; keep the two
 * copies in step when either changes.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' https://apis.google.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://www.googleapis.com",
  "frame-src https://*.firebaseapp.com https://accounts.google.com",
  "manifest-src 'self'",
  "worker-src 'self' blob:",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
].join("; ");

// Self-hosted production: serve the built SPA from the same process.
const dist = path.resolve("dist");
if (process.env.NODE_ENV === "production" && existsSync(dist)) {
  app.use((_req, res, next) => {
    res.setHeader("Content-Security-Policy", CONTENT_SECURITY_POLICY);
    res.setHeader("X-Frame-Options", "DENY");
    next();
  });
  app.use(express.static(dist, { index: false, maxAge: "1h" }));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

const handle = await getDatabase();
app.listen(PORT, () => {
  console.log(`[NikahPath API] Listening on http://localhost:${PORT} (database: ${handle.kind})`);
});
