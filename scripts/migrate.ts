/**
 * Applies database migrations to DATABASE_URL (or the local PGlite store).
 * Usage: npm run db:migrate
 */
import "dotenv/config";
import { createDatabase } from "../server/db.js";
import { MIGRATIONS, pendingMigrations, runMigrations } from "../server/migrations.js";

const handle = await createDatabase();
try {
  const before = await pendingMigrations(handle.db);
  const applied = await runMigrations(handle.db, (message) => console.log(`  ${message}`));
  console.log(`[migrate] database: ${handle.kind}`);
  console.log(
    applied.length > 0
      ? `[migrate] applied: ${applied.join(", ")}`
      : `[migrate] up to date (${MIGRATIONS.length - before.length}/${MIGRATIONS.length} already applied)`,
  );
} finally {
  await handle.close();
}
