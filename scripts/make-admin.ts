/**
 * Promotes an existing account to ADMIN and records it in the audit log.
 * Usage: npm run make-admin -- <email>
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { users } from "../src/lib/schema.js";
import { recordAudit } from "../server/audit.js";
import { createDatabase } from "../server/db.js";

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error("Usage: npm run make-admin -- <email>");
  process.exit(1);
}

const handle = await createDatabase();
try {
  const [user] = await handle.db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) {
    console.error(`No account found for "${email}". The user must sign up in the app first.`);
    process.exitCode = 1;
  } else if (user.role === "ADMIN") {
    console.log(`${email} is already an ADMIN.`);
  } else {
    await handle.db
      .update(users)
      .set({ role: "ADMIN", onboardingCompleted: true, updatedAt: new Date() })
      .where(eq(users.id, user.id));
    await recordAudit(handle.db, {
      actorId: null,
      targetId: user.id,
      action: "ROLE_ASSIGNED",
      metadata: { previousRole: user.role, newRole: "ADMIN", source: "cli:make-admin" },
    });
    console.log(`✓ ${email} is now an ADMIN (was ${user.role}).`);
  }
} finally {
  await handle.close();
}
