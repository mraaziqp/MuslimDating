import { eq, sql } from "drizzle-orm";
import type { ReadinessResult } from "../../src/lib/contracts.js";
import { findModule, REQUIRED_MODULE_IDS } from "../../src/lib/readiness.js";
import { users, type User } from "../../src/lib/schema.js";
import { recordAudit } from "../audit.js";
import type { Database } from "../db.js";
import { errors } from "../http.js";
import { toSelfUser } from "../presenters.js";
import { READINESS_ANSWER_KEY } from "../readiness-answers.js";
import { userHasPhoto } from "./users.js";

export async function submitReadinessModule(
  db: Database,
  user: User,
  moduleId: string,
  answers: number[],
): Promise<ReadinessResult> {
  const module = findModule(moduleId);
  if (!module) throw errors.notFound("Module not found.");
  if (!module.required && !user.readinessCompleted) {
    throw errors.forbidden("Complete the required module first.", "READINESS_REQUIRED");
  }

  const key = READINESS_ANSWER_KEY[module.id];
  if (answers.length !== key.length) {
    throw errors.badRequest(`Answer all ${key.length} questions.`, "INCOMPLETE_ANSWERS");
  }
  const correct = key.reduce((total, expected, i) => total + (answers[i] === expected ? 1 : 0), 0);
  const passed = correct === key.length;
  const hasPhoto = await userHasPhoto(db, user.id);

  if (!passed) {
    return { passed, correct, total: key.length, user: toSelfUser(user, hasPhoto) };
  }

  const alreadyCompleted = user.completedModules.includes(module.id);
  const modules = new Set([...user.completedModules, module.id]);
  const readinessCompleted = user.readinessCompleted || REQUIRED_MODULE_IDS.every((id) => modules.has(id));

  const [updated] = await db
    .update(users)
    .set({
      completedModules: sql`CASE WHEN ${module.id}::text = ANY(${users.completedModules})
                                 THEN ${users.completedModules}
                                 ELSE array_append(${users.completedModules}, ${module.id}::text) END`,
      readinessCompleted,
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id))
    .returning();
  if (!updated) throw errors.notFound("Account not found.");

  if (!alreadyCompleted) {
    await recordAudit(db, {
      actorId: user.id,
      targetId: user.id,
      action: "READINESS_MODULE_COMPLETED",
      metadata: { moduleId: module.id, readinessCompleted },
    });
  }
  return { passed, correct, total: key.length, user: toSelfUser(updated, hasPhoto) };
}
