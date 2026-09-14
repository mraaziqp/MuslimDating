import { sql } from "drizzle-orm";
import { STALE_CONNECTION_DAYS } from "../../src/lib/contracts.js";
import type { Database } from "../db.js";
import { asString, rowsOf } from "../rows.js";

export interface CleanupResult {
  terminatedConnectionIds: string[];
  liftedSuspensionUserIds: string[];
  purgedRateLimitRows: number;
  ranAt: string;
}

/**
 * Ghosting cleaner. Each step is a single data-modifying CTE, so the status
 * change and its audit record commit atomically.
 */
export async function cleanupStaleConnections(db: Database): Promise<CleanupResult> {
  const terminated = rowsOf(
    await db.execute(sql`
      WITH stale AS (
        UPDATE connections
           SET status = 'TERMINATED',
               closed_reason = 'INACTIVITY',
               updated_at = now(),
               version = version + 1
         WHERE status = 'APPROVED'
           AND last_activity_at < now() - make_interval(days => ${STALE_CONNECTION_DAYS}::int)
        RETURNING id, sender_id, receiver_id, mahram_id, last_activity_at
      ), logged AS (
        INSERT INTO audit_logs (actor_id, target_id, action, metadata)
        SELECT NULL, s.sender_id, 'CONNECTION_TERMINATED_INACTIVITY',
               jsonb_build_object(
                 'connectionId', s.id,
                 'receiverId', s.receiver_id,
                 'mahramId', s.mahram_id,
                 'lastActivityAt', s.last_activity_at,
                 'thresholdDays', ${STALE_CONNECTION_DAYS}::int,
                 'reason', 'No messages from either member within the inactivity window')
          FROM stale s
        RETURNING 1
      )
      SELECT id FROM stale`),
  ).map((r) => asString(r.id));

  const lifted = rowsOf(
    await db.execute(sql`
      WITH lifted AS (
        UPDATE users
           SET account_status = 'ACTIVE', suspended_until = NULL, updated_at = now()
         WHERE account_status = 'SUSPENDED' AND suspended_until IS NOT NULL AND suspended_until <= now()
        RETURNING id
      ), logged AS (
        INSERT INTO audit_logs (actor_id, target_id, action, metadata)
        SELECT NULL, l.id, 'ACCOUNT_SUSPENSION_EXPIRED', '{}'::jsonb FROM lifted l
        RETURNING 1
      )
      SELECT id FROM lifted`),
  ).map((r) => asString(r.id));

  const purged = rowsOf(
    await db.execute(sql`DELETE FROM rate_limits WHERE window_start < now() - interval '2 days' RETURNING key`),
  ).length;

  return {
    terminatedConnectionIds: terminated,
    liftedSuspensionUserIds: lifted,
    purgedRateLimitRows: purged,
    ranAt: new Date().toISOString(),
  };
}
