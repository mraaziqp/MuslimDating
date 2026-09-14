/**
 * Seeds demo accounts for local development. Every account uses the password
 * printed at the end. Refuses to run against Neon/production unless --force.
 * Usage: npm run db:seed [-- --force]
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { READINESS_MODULES } from "../src/lib/readiness.js";
import { messages, parentChildLinks, reports, users, type LinkKind, type NewUser, type User } from "../src/lib/schema.js";
import { createConnection, decideConnection } from "../server/actions/matchmaking.js";
import { createDatabase } from "../server/db.js";

const PASSWORD = "Bismillah-2026";
const force = process.argv.includes("--force");

const handle = await createDatabase();
if ((handle.kind === "neon" || process.env.NODE_ENV === "production") && !force) {
  console.error("Refusing to seed a Neon/production database. Re-run with --force if you really mean it.");
  await handle.close();
  process.exit(1);
}
const db = handle.db;

try {
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, "admin@nikahpath.test")).limit(1);
  if (existing) {
    console.log("Demo data already present — nothing to do.");
  } else {
    const passwordHash = await bcrypt.hash(PASSWORD, 12);
    const allModules = READINESS_MODULES.map((m) => m.id);

    const make = async (values: Omit<NewUser, "firebaseUid" | "passwordHash">): Promise<User> => {
      const [user] = await db
        .insert(users)
        .values({ firebaseUid: `local:${randomUUID()}`, passwordHash, onboardingCompleted: true, ...values })
        .returning();
      if (!user) throw new Error(`Failed to create ${values.email}`);
      return user;
    };
    const link = (parent: User, child: User, kind: LinkKind) =>
      db.insert(parentChildLinks).values({ parentId: parent.id, childId: child.id, kind });

    const seeker: Pick<NewUser, "readinessCompleted" | "completedModules"> = {
      readinessCompleted: true,
      completedModules: ["intro"],
    };

    const admin = await make({ email: "admin@nikahpath.test", role: "ADMIN", displayName: "Platform Admin" });
    const yusuf = await make({
      ...seeker,
      email: "yusuf@nikahpath.test",
      role: "SOLO",
      displayName: "Yusuf Rahman",
      gender: "male",
      age: 29,
      location: "Cape Town, South Africa",
      profession: "Civil Engineer",
      prayerFrequency: "Always",
      dietaryHabits: "Strictly Halal",
      education: "Master's",
      maritalStatus: "Never Married",
      languages: ["English", "Arabic"],
      bio: "Family-oriented engineer who loves the outdoors and learning Qur'an.",
      completedModules: allModules,
    });
    const zaid = await make({
      ...seeker,
      email: "zaid@nikahpath.test",
      role: "SOLO",
      requiresParentalVetting: true,
      displayName: "Zaid Patel",
      gender: "male",
      age: 31,
      location: "Johannesburg, South Africa",
      profession: "Pharmacist",
      prayerFrequency: "Usually",
      dietaryHabits: "Halal",
      bio: "My father reviews my requests — I value his guidance.",
    });
    const omar = await make({
      email: "omar@nikahpath.test",
      role: "SOLO",
      displayName: "Omar Hendricks",
      gender: "male",
      age: 26,
      location: "Durban, South Africa",
      profession: "Teacher",
    });
    const maryam = await make({
      ...seeker,
      email: "maryam@nikahpath.test",
      role: "SOLO",
      displayName: "Maryam Isaacs",
      gender: "female",
      age: 27,
      location: "Cape Town, South Africa",
      profession: "Doctor",
      prayerFrequency: "Always",
      dietaryHabits: "Strictly Halal",
      education: "Doctorate",
      maritalStatus: "Never Married",
      languages: ["English", "Afrikaans"],
      bio: "Paediatrician, avid reader, looking for someone kind and grounded in deen.",
      completedModules: allModules,
    });
    const amina = await make({
      ...seeker,
      email: "amina@nikahpath.test",
      role: "DEPENDENT",
      requiresParentalVetting: true,
      displayName: "Amina Moosa",
      gender: "female",
      age: 24,
      location: "Pretoria, South Africa",
      profession: "Graphic Designer",
      prayerFrequency: "Always",
      dietaryHabits: "Strictly Halal",
      hiddenFields: ["location"],
      bio: "Creative, close to my family, and my father is involved in every step.",
    });
    const huda = await make({
      ...seeker,
      email: "huda@nikahpath.test",
      role: "SOLO",
      displayName: "Huda Salie",
      gender: "female",
      age: 30,
      location: "Port Elizabeth, South Africa",
      profession: "Accountant",
      prayerFrequency: "Usually",
      dietaryHabits: "Halal",
      bio: "Numbers by day, community volunteer on weekends.",
    });
    const abdullah = await make({
      email: "abdullah@nikahpath.test",
      role: "PARENT",
      displayName: "Abdullah Moosa",
      gender: "male",
      age: 55,
    });
    const ibrahim = await make({
      email: "ibrahim@nikahpath.test",
      role: "PARENT",
      displayName: "Ibrahim Patel",
      gender: "male",
      age: 60,
    });
    const khalid = await make({
      email: "khalid@nikahpath.test",
      role: "MAHRAM",
      displayName: "Khalid Isaacs",
      gender: "male",
      age: 34,
    });

    await link(abdullah, amina, "WALI");
    await link(ibrahim, zaid, "WALI");
    await link(khalid, maryam, "MAHRAM");
    await link(khalid, huda, "MAHRAM");

    // Approved, chaperoned chat: Yusuf ↔ Maryam (Khalid as mahram).
    const courtship = await createConnection(db, yusuf, maryam.id);
    await decideConnection(db, maryam, courtship.id, { decision: "APPROVE" });
    await db.insert(messages).values([
      { connectionId: courtship.id, senderId: yusuf.id, text: "Assalamu alaikum Maryam, thank you for accepting." },
      { connectionId: courtship.id, senderId: maryam.id, text: "Wa alaikum assalam. What are your plans for the next five years?" },
      { connectionId: courtship.id, senderId: khalid.id, text: "Assalamu alaikum both — I'm here as chaperone. Carry on." },
    ]);

    // Awaiting Zaid's father (PENDING_MALE_PARENT).
    await createConnection(db, zaid, amina.id);
    // Awaiting Huda's response (PENDING_FEMALE_PARENT).
    await createConnection(db, yusuf, huda.id);

    await db.insert(reports).values({
      reporterId: huda.id,
      reportedId: omar.id,
      reason: "Sent an inappropriate message request outside the platform guidelines.",
    });
    await db.execute(sql`SELECT 1`);

    console.log("Seeded demo accounts (password for all: %s)", PASSWORD);
    for (const u of [admin, yusuf, zaid, omar, maryam, amina, huda, abdullah, ibrahim, khalid]) {
      console.log(`  ${u.role.padEnd(9)} ${u.email}`);
    }
  }
} finally {
  await handle.close();
}
