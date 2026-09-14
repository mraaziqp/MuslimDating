import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "../src/lib/schema.js";
import { runMigrations } from "./migrations.js";

export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

export type DatabaseKind = "neon" | "postgres" | "pglite";

export interface DatabaseHandle {
  db: Database;
  kind: DatabaseKind;
  close: () => Promise<void>;
}

export class DatabaseConfigError extends Error {}

/**
 * Picks a driver from DATABASE_URL:
 *  - *.neon.tech            → Neon HTTP driver (stateless; ideal for Vercel)
 *  - any other postgres URL → node-postgres pool
 *  - unset (non-production) → embedded PGlite at ./.data/pglite, auto-migrated
 *  - "memory://"            → in-memory PGlite (tests)
 */
export async function createDatabase(url: string | undefined = process.env.DATABASE_URL): Promise<DatabaseHandle> {
  const trimmed = url?.trim();

  if (trimmed && /^postgres(ql)?:\/\//.test(trimmed)) {
    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      throw new DatabaseConfigError("DATABASE_URL is not a valid connection string.");
    }

    if (parsed.hostname.endsWith(".neon.tech")) {
      const { neon } = await import("@neondatabase/serverless");
      const { drizzle } = await import("drizzle-orm/neon-http");
      const db = drizzle({ client: neon(trimmed), schema });
      return { db, kind: "neon", close: async () => {} };
    }

    const pg = await import("pg");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const pool = new pg.default.Pool({ connectionString: trimmed, max: 5 });
    const db = drizzle({ client: pool, schema });
    return { db, kind: "postgres", close: () => pool.end() };
  }

  if (trimmed && trimmed !== "memory://") {
    throw new DatabaseConfigError("DATABASE_URL must start with postgres:// or postgresql://.");
  }

  if (!trimmed && process.env.NODE_ENV === "production") {
    throw new DatabaseConfigError(
      "DATABASE_URL is not set. Add your Neon connection string to the deployment environment.",
    );
  }

  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const dataDir = trimmed === "memory://" ? undefined : (process.env.PGLITE_DIR ?? "./.data/pglite");
  if (dataDir) {
    const { mkdirSync } = await import("node:fs");
    mkdirSync(dataDir, { recursive: true });
  }
  const client = new PGlite(dataDir);
  const db = drizzle({ client, schema });
  await runMigrations(db);
  return { db, kind: "pglite", close: () => client.close() };
}

let shared: Promise<DatabaseHandle> | null = null;

/** Process-wide database handle (reused across serverless invocations). */
export function getDatabase(): Promise<DatabaseHandle> {
  if (!shared) {
    shared = createDatabase().catch((err: unknown) => {
      shared = null;
      throw err;
    });
  }
  return shared;
}

export async function getDb(): Promise<Database> {
  return (await getDatabase()).db;
}
