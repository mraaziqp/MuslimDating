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

const sql = neon(databaseUrl);

export const db = drizzle(sql, { schema });
