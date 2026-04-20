/**
 * One-time script: promote a user to PARENT (admin) role by email.
 * Usage: npx tsx scripts/make-admin.ts <email>
 * Example: npx tsx scripts/make-admin.ts mraaziqp@gmail.com
 */
import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq } from 'drizzle-orm';
import * as schema from '../src/lib/schema';

const email = process.argv[2];

if (!email) {
  console.error('Usage: npx tsx scripts/make-admin.ts <email>');
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set in .env');
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);
const db = drizzle(sql, { schema });

const result = await db
  .update(schema.users)
  .set({ role: 'PARENT' })
  .where(eq(schema.users.email, email))
  .returning({ id: schema.users.id, email: schema.users.email, role: schema.users.role });

if (result.length === 0) {
  console.log(`No user found with email "${email}".`);
  console.log('Make sure this account has signed in at least once through the app first.');
} else {
  console.log(`✓ ${result[0].email} is now PARENT (admin) role.`);
}

process.exit(0);
