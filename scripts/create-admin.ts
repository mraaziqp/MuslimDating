/**
 * Creates (or resets) a username/password administrator account.
 * Usage: npm run create-admin -- <username> [password]
 * The password may instead be supplied via the ADMIN_PASSWORD environment
 * variable so it does not end up in shell history.
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { users } from "../src/lib/schema.js";
import { recordAudit } from "../server/audit.js";
import { createDatabase } from "../server/db.js";

const username = process.argv[2]?.trim().toLowerCase();
const password = process.argv[3] ?? process.env.ADMIN_PASSWORD;

if (!username || !/^[a-z0-9._-]{3,32}$/.test(username) || !password) {
  console.error("Usage: npm run create-admin -- <username> [password]   (or set ADMIN_PASSWORD)");
  console.error("Usernames: 3-32 characters, letters, digits, dot, dash or underscore.");
  process.exit(1);
}
if (password.length < 12) {
  console.warn("⚠  This password is shorter than 12 characters. Administrator accounts should use a long, unique password.");
}

const handle = await createDatabase();
try {
  const passwordHash = await bcrypt.hash(password, 12);
  const [existing] = await handle.db.select().from(users).where(eq(users.username, username)).limit(1);

  if (existing) {
    await handle.db
      .update(users)
      .set({
        passwordHash,
        role: "ADMIN",
        accountStatus: "ACTIVE",
        suspendedUntil: null,
        onboardingCompleted: true,
        updatedAt: new Date(),
      })
      .where(eq(users.id, existing.id));
    await recordAudit(handle.db, {
      actorId: null,
      targetId: existing.id,
      action: "ROLE_ASSIGNED",
      metadata: { source: "cli:create-admin", previousRole: existing.role, newRole: "ADMIN", passwordReset: true },
    });
    console.log(`✓ Updated administrator "${username}" (database: ${handle.kind}).`);
  } else {
    const [created] = await handle.db
      .insert(users)
      .values({
        firebaseUid: `local:${randomUUID()}`,
        email: `${username}@admin.nikahpath.local`,
        username,
        passwordHash,
        role: "ADMIN",
        onboardingCompleted: true,
        displayName: username,
      })
      .returning({ id: users.id });
    if (!created) throw new Error("Failed to create administrator");
    await recordAudit(handle.db, {
      actorId: null,
      targetId: created.id,
      action: "ADMIN_BOOTSTRAPPED",
      metadata: { source: "cli:create-admin", username },
    });
    console.log(`✓ Created administrator "${username}" (database: ${handle.kind}).`);
  }
} finally {
  await handle.close();
}
