import { sql } from "drizzle-orm";
import { rateLimits } from "../src/lib/schema.js";
import type { Database } from "./db.js";
import { errors } from "./http.js";

/**
 * Fixed-window limiter stored in Postgres so it holds across serverless
 * instances. The upsert is a single atomic statement.
 */
export async function enforceRateLimit(
  db: Database,
  key: string,
  limit: number,
  windowSeconds: number,
  message?: string,
): Promise<void> {
  const expired = sql`${rateLimits.windowStart} < now() - make_interval(secs => ${windowSeconds}::double precision)`;
  const [row] = await db
    .insert(rateLimits)
    .values({ key, windowStart: sql`now()`, count: 1 })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: sql`CASE WHEN ${expired} THEN 1 ELSE ${rateLimits.count} + 1 END`,
        windowStart: sql`CASE WHEN ${expired} THEN now() ELSE ${rateLimits.windowStart} END`,
      },
    })
    .returning({ count: rateLimits.count });

  if (row && row.count > limit) {
    throw errors.tooManyRequests(message);
  }
}
