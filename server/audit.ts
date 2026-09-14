import { AUDIT_ACTIONS, type AuditAction } from "../src/lib/constants.js";
import { auditLogs } from "../src/lib/schema.js";
import type { Database } from "./db.js";

export { AUDIT_ACTIONS, type AuditAction };

export interface AuditEntry {
  /** null = performed by the system (cron, automatic expiry). */
  actorId: string | null;
  targetId: string | null;
  action: AuditAction;
  metadata?: Record<string, unknown>;
}

export async function recordAudit(db: Database, entry: AuditEntry): Promise<void> {
  await db.insert(auditLogs).values({
    actorId: entry.actorId,
    targetId: entry.targetId,
    action: entry.action,
    metadata: entry.metadata ?? {},
  });
}
