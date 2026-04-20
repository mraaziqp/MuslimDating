import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

/**
 * Uses the Neon HTTP driver — stateless, edge-safe, no TCP connection pools.
 * DATABASE_URL must be set in .env.local (Next.js) or your deployment environment.
 * Format: postgresql://user:password@host/dbname?sslmode=require
 */
const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://invalid:invalid@localhost:5432/invalid?sslmode=require";

let sql: ReturnType<typeof neon>;
try {
  sql = neon(databaseUrl);
} catch (err) {
  // Never crash the serverless function at import time due to malformed env vars.
  // Routes can then return structured JSON errors instead of FUNCTION_INVOCATION_FAILED.
  console.error("[db init] Failed to parse DATABASE_URL, using fallback placeholder", err);
  sql = neon("postgresql://invalid:invalid@localhost:5432/invalid?sslmode=require");
}

export const db = drizzle(sql, { schema });
