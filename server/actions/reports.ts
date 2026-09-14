import { and, eq } from "drizzle-orm";
import type { ReportInput } from "../../src/lib/contracts.js";
import { reports, users, type User } from "../../src/lib/schema.js";
import { recordAudit } from "../audit.js";
import type { Database } from "../db.js";
import { errors } from "../http.js";
import { enforceRateLimit } from "../rate-limit.js";

export async function createReport(db: Database, reporter: User, input: ReportInput): Promise<{ id: string }> {
  if (input.reportedId === reporter.id) throw errors.badRequest("You cannot report yourself.");
  await enforceRateLimit(db, `report:${reporter.id}`, 5, 86_400, "You can submit at most 5 reports per day.");

  const [reported] = await db.select({ id: users.id }).from(users).where(eq(users.id, input.reportedId)).limit(1);
  if (!reported) throw errors.notFound("Member not found.");

  const [existing] = await db
    .select({ id: reports.id })
    .from(reports)
    .where(
      and(eq(reports.reporterId, reporter.id), eq(reports.reportedId, input.reportedId), eq(reports.status, "PENDING")),
    )
    .limit(1);
  if (existing) {
    throw errors.conflict("You have already reported this member. Our team is reviewing it.", "REPORT_EXISTS");
  }

  const [created] = await db
    .insert(reports)
    .values({ reporterId: reporter.id, reportedId: input.reportedId, reason: input.reason })
    .returning({ id: reports.id });
  if (!created) throw new Error("Failed to create report");

  await recordAudit(db, {
    actorId: reporter.id,
    targetId: input.reportedId,
    action: "REPORT_CREATED",
    metadata: { reportId: created.id },
  });
  return created;
}
