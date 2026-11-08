/**
 * Seeds demo accounts and profile photos for NikahPath.
 * Populates 20 rich, realistic Muslim seeker profiles with authentic portrait photos,
 * complete Islamic biodata, wali/mahram relationships, and sample dual-channel chats.
 *
 * Usage:
 *   npm run db:seed               (local pglite)
 *   npm run db:seed -- --force    (allows running against Neon/production)
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { and, eq, or } from "drizzle-orm";
import { READINESS_MODULES } from "../src/lib/readiness.js";
import {
  connections,
  messages,
  parentChildLinks,
  profilePhotos,
  reports,
  users,
  type LinkKind,
  type NewUser,
  type User,
} from "../src/lib/schema.js";
import { createConnection, decideConnection } from "../server/actions/matchmaking.js";
import { createDatabase } from "../server/db.js";

const force = process.argv.includes("--force") || process.argv.includes("--prod");
const PASSWORD = "Bismillah-2026";
const allModules = READINESS_MODULES.map((m) => m.id);
const CACHE_DIR = path.resolve(".data", "seed-photos");

interface ProfileSeedDef {
  email: string;
  displayName: string;
  gender: "male" | "female";
  age: number;
  location: string;
  profession: string;
  education: "High School" | "Bachelor's" | "Master's" | "Doctorate" | "Other";
  maritalStatus: "Never Married" | "Divorced" | "Widowed" | "Annulled";
  prayerFrequency: "Always" | "Usually" | "Sometimes" | "Rarely";
  dietaryHabits: "Strictly Halal" | "Halal" | "Flexible";
  languages: string[];
  bio: string;
  photoId: string;
  modestyBlurEnabled: boolean;
  role?: "SOLO" | "DEPENDENT";
  requiresParentalVetting?: boolean;
}

const BROTHERS: ProfileSeedDef[] = [
  {
    email: "yusuf@nikahpath.test",
    displayName: "Yusuf Rahman",
    gender: "male",
    age: 29,
    location: "Cape Town, South Africa",
    profession: "Senior Civil Engineer",
    education: "Master's",
    maritalStatus: "Never Married",
    prayerFrequency: "Always",
    dietaryHabits: "Strictly Halal",
    languages: ["English", "Afrikaans", "Arabic (learning)"],
    bio: "Family-oriented civil engineer who loves the outdoors, hiking Lion's Head for Fajr, and memorising Surah Al-Kahf with our local halaqah. Looking for a deen-centered sister to build a peaceful, hospitable home with.",
    photoId: "photo-1507003211169-0a1dd7228f2d",
    modestyBlurEnabled: false,
    role: "SOLO",
  },
  {
    email: "zaid@nikahpath.test",
    displayName: "Zaid Patel",
    gender: "male",
    age: 31,
    location: "Johannesburg, South Africa",
    profession: "Clinical Pharmacist",
    education: "Bachelor's",
    maritalStatus: "Never Married",
    prayerFrequency: "Always",
    dietaryHabits: "Strictly Halal",
    languages: ["English", "Urdu", "Gujarati"],
    bio: "Working in paediatric oncology pharmacy. My father Ibrahim reviews my requests — family involvement from day one is essential to me.",
    photoId: "photo-1500648767791-00dcc994a43e",
    modestyBlurEnabled: false,
    role: "DEPENDENT",
    requiresParentalVetting: true,
  },
  {
    email: "omar@nikahpath.test",
    displayName: "Omar Hendricks",
    gender: "male",
    age: 26,
    location: "Durban, South Africa",
    profession: "High School Islamic Studies Educator",
    education: "Bachelor's",
    maritalStatus: "Never Married",
    prayerFrequency: "Always",
    dietaryHabits: "Strictly Halal",
    languages: ["English", "Zulu (conversational)"],
    bio: "Passionate about youth mentorship, community work at the Musjid, and ocean swimming. Seeking an articulate, warm companion with a shared vision of raising righteous children.",
    photoId: "photo-1492562080023-ab3db95bfbce",
    modestyBlurEnabled: false,
    role: "SOLO",
  },
  {
    email: "bilal@nikahpath.test",
    displayName: "Bilal Kassim",
    gender: "male",
    age: 32,
    location: "Cape Town, South Africa",
    profession: "Cloud & AI Solutions Architect",
    education: "Master's",
    maritalStatus: "Never Married",
    prayerFrequency: "Always",
    dietaryHabits: "Strictly Halal",
    languages: ["English", "Arabic"],
    bio: "Tech professional passionate about community projects, hiking Table Mountain, and memorising Juz Amma. Seeking someone grounded in Islamic values and emotional maturity.",
    photoId: "photo-1506794778202-cad84cf45f1d",
    modestyBlurEnabled: false,
    role: "SOLO",
  },
  {
    email: "tariq@nikahpath.test",
    displayName: "Tariq Al-Mansoor",
    gender: "male",
    age: 28,
    location: "Johannesburg, South Africa",
    profession: "Senior Financial Risk Analyst",
    education: "Bachelor's",
    maritalStatus: "Never Married",
    prayerFrequency: "Always",
    dietaryHabits: "Strictly Halal",
    languages: ["English", "Arabic", "Urdu"],
    bio: "Disciplined, active in our local community charity, memorising classical Arabic. Looking for a supportive, God-fearing sister to share life's milestones.",
    photoId: "photo-1519085360753-af0119f7cbe7",
    modestyBlurEnabled: false,
    role: "SOLO",
  },
  {
    email: "farhan@nikahpath.test",
    displayName: "Farhan Jaffer",
    gender: "male",
    age: 35,
    location: "Durban, South Africa",
    profession: "High School Principal",
    education: "Master's",
    maritalStatus: "Divorced",
    prayerFrequency: "Usually",
    dietaryHabits: "Halal",
    languages: ["English", "Gujarati"],
    bio: "Father of one wonderful 6-year-old girl. Mature, calm, and seeking a compassionate sister who understands life's nuances and prioritises family harmony.",
    photoId: "photo-1522075469751-3a6694fb2f61",
    modestyBlurEnabled: true,
    role: "SOLO",
  },
  {
    email: "hamza@nikahpath.test",
    displayName: "Hamza Davids",
    gender: "male",
    age: 27,
    location: "Pretoria, South Africa",
    profession: "Renewable Energy Consultant",
    education: "Bachelor's",
    maritalStatus: "Never Married",
    prayerFrequency: "Always",
    dietaryHabits: "Strictly Halal",
    languages: ["English", "Afrikaans"],
    bio: "Working on solar energy infrastructure in Gauteng. Keen cyclist, avid reader of Islamic biographies, close to my parents and siblings.",
    photoId: "photo-1501196354995-cbb51c65aaea",
    modestyBlurEnabled: false,
    role: "SOLO",
  },
  {
    email: "mustafa@nikahpath.test",
    displayName: "Mustafa Abrahams",
    gender: "male",
    age: 30,
    location: "Cape Town, South Africa",
    profession: "Commercial Property Manager",
    education: "Bachelor's",
    maritalStatus: "Never Married",
    prayerFrequency: "Always",
    dietaryHabits: "Strictly Halal",
    languages: ["English", "Afrikaans"],
    bio: "Based in Bo-Kaap. Loving Cape Malay heritage, community iftars, and regular qira'ah practice. Looking for a gentle-mannered sister who values modesty and family unity.",
    photoId: "photo-1472099645785-5658abf4ff4e",
    modestyBlurEnabled: true,
    role: "SOLO",
  },
  {
    email: "luqman@nikahpath.test",
    displayName: "Luqman Cassiem",
    gender: "male",
    age: 29,
    location: "London, United Kingdom",
    profession: "Management Consultant",
    education: "Master's",
    maritalStatus: "Never Married",
    prayerFrequency: "Always",
    dietaryHabits: "Strictly Halal",
    languages: ["English", "French"],
    bio: "Originally from South Africa, now working in central London. Open to relocation for the right match. Focused on building a deen-first family with mutual respect.",
    photoId: "photo-1539571696357-5a69c17a67c6",
    modestyBlurEnabled: false,
    role: "SOLO",
  },
  {
    email: "nabeel@nikahpath.test",
    displayName: "Nabeel Solomons",
    gender: "male",
    age: 33,
    location: "Birmingham, United Kingdom",
    profession: "NHS General Practitioner",
    education: "Doctorate",
    maritalStatus: "Never Married",
    prayerFrequency: "Always",
    dietaryHabits: "Strictly Halal",
    languages: ["English", "Urdu"],
    bio: "NHS GP physician, balance between hospital shifts and regular community masjid lectures. Looking for an educated, caring companion who values sincerity and good character.",
    photoId: "photo-1513956589380-bad6acb9b9d4",
    modestyBlurEnabled: false,
    role: "SOLO",
  },
];

const SISTERS: ProfileSeedDef[] = [
  {
    email: "maryam@nikahpath.test",
    displayName: "Dr. Maryam Isaacs",
    gender: "female",
    age: 27,
    location: "Cape Town, South Africa",
    profession: "Paediatric Registrar Doctor",
    education: "Doctorate",
    maritalStatus: "Never Married",
    prayerFrequency: "Always",
    dietaryHabits: "Strictly Halal",
    languages: ["English", "Afrikaans", "Arabic (elementary)"],
    bio: "Paediatrician with a deep love for children, reading Islamic theology, and weekend coastal trail walks. Chaperoned by my brother Khalid.",
    photoId: "photo-1534528741775-53994a69daeb",
    modestyBlurEnabled: false,
    role: "SOLO",
  },
  {
    email: "amina@nikahpath.test",
    displayName: "Amina Moosa",
    gender: "female",
    age: 24,
    location: "Pretoria, South Africa",
    profession: "Senior UX & Brand Designer",
    education: "Bachelor's",
    maritalStatus: "Never Married",
    prayerFrequency: "Always",
    dietaryHabits: "Strictly Halal",
    languages: ["English", "Afrikaans"],
    bio: "Creative digital designer, close to my parents. My father Abdullah is actively involved in my courtship to ensure everything is conducted with dignity and Islamic etiquette.",
    photoId: "photo-1544005313-94ddf0286df2",
    modestyBlurEnabled: false,
    role: "DEPENDENT",
    requiresParentalVetting: true,
  },
  {
    email: "huda@nikahpath.test",
    displayName: "Huda Salie",
    gender: "female",
    age: 30,
    location: "Port Elizabeth, South Africa",
    profession: "Senior Chartered Accountant (CA)",
    education: "Master's",
    maritalStatus: "Never Married",
    prayerFrequency: "Usually",
    dietaryHabits: "Halal",
    languages: ["English"],
    bio: "Numbers by day, community soup kitchen volunteer on weekends. Practical, kind, and seeking an honest brother who leads with patience and humility.",
    photoId: "photo-1517841905240-472988babdf9",
    modestyBlurEnabled: false,
    role: "SOLO",
  },
  {
    email: "fatima@nikahpath.test",
    displayName: "Fatima Al-Zahra",
    gender: "female",
    age: 26,
    location: "Cape Town, South Africa",
    profession: "Paediatric Speech Therapist",
    education: "Master's",
    maritalStatus: "Never Married",
    prayerFrequency: "Always",
    dietaryHabits: "Strictly Halal",
    languages: ["English", "Arabic"],
    bio: "Speech therapist with a love for Arabic calligraphy, family Sunday lunches, and studying the Seerah. Looking for a respectful, practicing brother.",
    photoId: "photo-1524504388940-b1c1722653e1",
    modestyBlurEnabled: false,
    role: "SOLO",
  },
  {
    email: "zainab@nikahpath.test",
    displayName: "Zainab Khan",
    gender: "female",
    age: 25,
    location: "Johannesburg, South Africa",
    profession: "Architect & Urban Planner",
    education: "Bachelor's",
    maritalStatus: "Never Married",
    prayerFrequency: "Always",
    dietaryHabits: "Strictly Halal",
    languages: ["English", "Urdu"],
    bio: "Passionate about sustainable Islamic architecture and community spaces. Supported by my father Farooq in finding a pious, hardworking spouse.",
    photoId: "photo-1573496359142-b8d87734a5a2",
    modestyBlurEnabled: false,
    role: "DEPENDENT",
    requiresParentalVetting: true,
  },
  {
    email: "salma@nikahpath.test",
    displayName: "Salma Adam",
    gender: "female",
    age: 29,
    location: "Durban, South Africa",
    profession: "Clinical Psychologist",
    education: "Master's",
    maritalStatus: "Never Married",
    prayerFrequency: "Always",
    dietaryHabits: "Strictly Halal",
    languages: ["English", "Zulu"],
    bio: "Committed to mental health advocacy in Muslim communities. Active volunteer at our local darul yatama. Looking for someone mature, self-aware, and deen-grounded.",
    photoId: "photo-1531746020798-e6953c6e8e04",
    modestyBlurEnabled: false,
    role: "SOLO",
  },
  {
    email: "yasmin@nikahpath.test",
    displayName: "Yasmin Parker",
    gender: "female",
    age: 33,
    location: "Cape Town, South Africa",
    profession: "Lead Data Scientist",
    education: "Master's",
    maritalStatus: "Widowed",
    prayerFrequency: "Usually",
    dietaryHabits: "Halal",
    languages: ["English", "Afrikaans"],
    bio: "Gentle-hearted mother of one 5-year-old son. Seeking an understanding, practicing brother who values compassion, family, and building a peaceful sanctuary together.",
    photoId: "photo-1548142813-c348350df52b",
    modestyBlurEnabled: true,
    role: "SOLO",
  },
  {
    email: "layla@nikahpath.test",
    displayName: "Layla Banderker",
    gender: "female",
    age: 23,
    location: "Pretoria, South Africa",
    profession: "Hospital Pharmacist",
    education: "Bachelor's",
    maritalStatus: "Never Married",
    prayerFrequency: "Always",
    dietaryHabits: "Strictly Halal",
    languages: ["English", "Afrikaans"],
    bio: "Quiet nature, dedicated to prayer, and family is my foundation. Seeking someone honest, good-tempered, and steadfast in Islamic obligations.",
    photoId: "photo-1508214751196-bcfd4ca60f91",
    modestyBlurEnabled: false,
    role: "DEPENDENT",
    requiresParentalVetting: true,
  },
  {
    email: "sumayya@nikahpath.test",
    displayName: "Sumayya Dollie",
    gender: "female",
    age: 28,
    location: "Johannesburg, South Africa",
    profession: "Corporate Attorney & Legal Counsel",
    education: "Master's",
    maritalStatus: "Never Married",
    prayerFrequency: "Always",
    dietaryHabits: "Strictly Halal",
    languages: ["English", "Arabic"],
    bio: "In-house legal counsel. Balance between professional excellence and Quran memorisation. Seeking an ambitious brother with high akhlaq and a sense of humour.",
    photoId: "photo-1567532939604-b6b5b0db2604",
    modestyBlurEnabled: false,
    role: "SOLO",
  },
  {
    email: "khadija@nikahpath.test",
    displayName: "Khadija Daniels",
    gender: "female",
    age: 31,
    location: "Cape Town, South Africa",
    profession: "Primary Montessori Educator",
    education: "Bachelor's",
    maritalStatus: "Divorced",
    prayerFrequency: "Always",
    dietaryHabits: "Strictly Halal",
    languages: ["English", "Afrikaans"],
    bio: "Montessori teacher, baker, and community youth mentor. Believer in kindness, open communication, and shared Islamic aspirations.",
    photoId: "photo-1580489944761-15a19d654956",
    modestyBlurEnabled: true,
    role: "SOLO",
  },
];

async function fetchPhotoBuffers(photoId: string): Promise<{ fullBase64: string; blurBase64: string }> {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const fullCachePath = path.join(CACHE_DIR, `${photoId}-full.jpg`);
  const blurCachePath = path.join(CACHE_DIR, `${photoId}-blur.jpg`);

  if (fs.existsSync(fullCachePath) && fs.existsSync(blurCachePath)) {
    return {
      fullBase64: fs.readFileSync(fullCachePath, "base64"),
      blurBase64: fs.readFileSync(blurCachePath, "base64"),
    };
  }

  const fullUrl = `https://images.unsplash.com/${photoId}?auto=format&fit=crop&w=600&h=600&q=80`;
  const blurUrl = `https://images.unsplash.com/${photoId}?auto=format&fit=crop&w=32&h=32&q=30`;

  const [fullRes, blurRes] = await Promise.all([fetch(fullUrl), fetch(blurUrl)]);
  if (!fullRes.ok || !blurRes.ok) {
    throw new Error(`Failed to fetch photo ${photoId}: full=${fullRes.status}, blur=${blurRes.status}`);
  }

  const fullBuf = Buffer.from(await fullRes.arrayBuffer());
  const blurBuf = Buffer.from(await blurRes.arrayBuffer());

  fs.writeFileSync(fullCachePath, fullBuf);
  fs.writeFileSync(blurCachePath, blurBuf);

  return {
    fullBase64: fullBuf.toString("base64"),
    blurBase64: blurBuf.toString("base64"),
  };
}

const handle = await createDatabase();
if ((handle.kind === "neon" || process.env.NODE_ENV === "production") && !force) {
  console.error("Refusing to seed a Neon/production database. Re-run with --force if you really mean it.");
  await handle.close();
  process.exit(1);
}
const db = handle.db;

try {
  console.log(`\n=======================================================`);
  console.log(`🌸 NikahPath Database Seeder`);
  console.log(`Database: ${handle.kind}`);
  console.log(`=======================================================\n`);

  const passwordHash = await bcrypt.hash(PASSWORD, 12);

  // Helper to upsert a user
  const upsertUser = async (def: Omit<NewUser, "firebaseUid" | "passwordHash">): Promise<User> => {
    const [existing] = await db.select().from(users).where(eq(users.email, def.email)).limit(1);
    if (existing) {
      const [updated] = await db
        .update(users)
        .set({
          ...def,
          passwordHash,
          onboardingCompleted: true,
          readinessCompleted: true,
          accountStatus: "ACTIVE",
          updatedAt: new Date(),
        })
        .where(eq(users.id, existing.id))
        .returning();
      return updated;
    } else {
      const [inserted] = await db
        .insert(users)
        .values({
          firebaseUid: `local:${randomUUID()}`,
          passwordHash,
          onboardingCompleted: true,
          readinessCompleted: true,
          accountStatus: "ACTIVE",
          ...def,
        })
        .returning();
      return inserted;
    }
  };

  // Helper to attach photo
  const attachPhoto = async (userId: string, photoId: string, displayName: string) => {
    try {
      const { fullBase64, blurBase64 } = await fetchPhotoBuffers(photoId);
      await db
        .insert(profilePhotos)
        .values({
          userId,
          mimeType: "image/jpeg",
          fullData: fullBase64,
          blurData: blurBase64,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: profilePhotos.userId,
          set: {
            mimeType: "image/jpeg",
            fullData: fullBase64,
            blurData: blurBase64,
            updatedAt: new Date(),
          },
        });
      console.log(`  ✓ Photo attached: ${displayName}`);
    } catch (err) {
      console.warn(`  ⚠️ Failed to attach photo for ${displayName}:`, err);
    }
  };

  // 1. Seed Platform Admin
  const adminUser = await upsertUser({
    email: "admin@nikahpath.test",
    role: "ADMIN",
    displayName: "Platform Admin",
  });
  console.log(`✓ Admin account ready (${adminUser.email})`);

  // 2. Seed Parents & Mahrams
  const abdullah = await upsertUser({
    email: "abdullah@nikahpath.test",
    role: "PARENT",
    displayName: "Abdullah Moosa",
    gender: "male",
    age: 55,
  });
  const farooq = await upsertUser({
    email: "farooq@nikahpath.test",
    role: "PARENT",
    displayName: "Farooq Khan",
    gender: "male",
    age: 58,
  });
  const ibrahim = await upsertUser({
    email: "ibrahim@nikahpath.test",
    role: "PARENT",
    displayName: "Ibrahim Patel",
    gender: "male",
    age: 60,
  });
  const khalid = await upsertUser({
    email: "khalid@nikahpath.test",
    role: "MAHRAM",
    displayName: "Khalid Isaacs",
    gender: "male",
    age: 34,
  });
  console.log("✓ Parents and Mahram accounts ready.");

  // 3. Seed Brothers
  const seededBrothers: User[] = [];
  console.log(`\nSeeding ${BROTHERS.length} brother seekers with photos...`);
  for (const b of BROTHERS) {
    const user = await upsertUser({
      email: b.email,
      role: b.role ?? "SOLO",
      requiresParentalVetting: b.requiresParentalVetting ?? false,
      displayName: b.displayName,
      gender: b.gender,
      age: b.age,
      location: b.location,
      profession: b.profession,
      education: b.education,
      maritalStatus: b.maritalStatus,
      prayerFrequency: b.prayerFrequency,
      dietaryHabits: b.dietaryHabits,
      languages: b.languages,
      bio: b.bio,
      completedModules: allModules,
      modestyBlurEnabled: b.modestyBlurEnabled,
    });
    seededBrothers.push(user);
    await attachPhoto(user.id, b.photoId, b.displayName);
  }

  // 4. Seed Sisters
  const seededSisters: User[] = [];
  console.log(`\nSeeding ${SISTERS.length} sister seekers with photos...`);
  for (const s of SISTERS) {
    const user = await upsertUser({
      email: s.email,
      role: s.role ?? "SOLO",
      requiresParentalVetting: s.requiresParentalVetting ?? false,
      displayName: s.displayName,
      gender: s.gender,
      age: s.age,
      location: s.location,
      profession: s.profession,
      education: s.education,
      maritalStatus: s.maritalStatus,
      prayerFrequency: s.prayerFrequency,
      dietaryHabits: s.dietaryHabits,
      languages: s.languages,
      bio: s.bio,
      completedModules: allModules,
      modestyBlurEnabled: s.modestyBlurEnabled,
    });
    seededSisters.push(user);
    await attachPhoto(user.id, s.photoId, s.displayName);
  }

  // 5. Link Walis and Mahrams
  const amina = seededSisters.find((s) => s.email === "amina@nikahpath.test")!;
  const layla = seededSisters.find((s) => s.email === "layla@nikahpath.test")!;
  const zainab = seededSisters.find((s) => s.email === "zainab@nikahpath.test")!;
  const zaid = seededBrothers.find((b) => b.email === "zaid@nikahpath.test")!;
  const maryam = seededSisters.find((s) => s.email === "maryam@nikahpath.test")!;
  const yusuf = seededBrothers.find((b) => b.email === "yusuf@nikahpath.test")!;

  const safeLink = async (parent: User, child: User, kind: LinkKind) => {
    await db
      .insert(parentChildLinks)
      .values({ parentId: parent.id, childId: child.id, kind })
      .onConflictDoNothing();
  };

  await safeLink(abdullah, amina, "WALI");
  await safeLink(abdullah, layla, "WALI");
  await safeLink(farooq, zainab, "WALI");
  await safeLink(ibrahim, zaid, "WALI");
  await safeLink(khalid, maryam, "MAHRAM");
  console.log("\n✓ Wali and Mahram family links confirmed.");

  // 6. Seed sample courtship chats if not already existing
  try {
    const existingConn = await db
      .select({ id: connections.id, status: connections.status })
      .from(connections)
      .where(
        and(
          or(
            and(eq(connections.senderId, yusuf.id), eq(connections.receiverId, maryam.id)),
            and(eq(connections.senderId, maryam.id), eq(connections.receiverId, yusuf.id)),
          ),
          eq(connections.status, "APPROVED"),
        ),
      )
      .limit(1);

    if (existingConn.length === 0) {
      const courtship = await createConnection(db, yusuf, maryam.id);
      await decideConnection(db, maryam, courtship.id, { decision: "APPROVE" });
      await db.insert(messages).values([
        {
          connectionId: courtship.id,
          channel: "FAMILY",
          senderId: yusuf.id,
          text: "Assalamu alaikum Maryam and respected family. Thank you for accepting my request to connect.",
        },
        {
          connectionId: courtship.id,
          channel: "FAMILY",
          senderId: maryam.id,
          text: "Wa alaikum assalam Yusuf. Welcome to our family lounge. My brother Khalid is here with us as chaperone.",
        },
        {
          connectionId: courtship.id,
          channel: "FAMILY",
          senderId: khalid.id,
          text: "Assalamu alaikum brother Yusuf. Khalid here as Maryam's mahram. Mubarak to both of you, we look forward to getting to know your family.",
        },
        {
          connectionId: courtship.id,
          channel: "DIRECT",
          senderId: yusuf.id,
          text: "Assalamu alaikum Maryam, what are your aspirations for your medical career and family life?",
        },
        {
          connectionId: courtship.id,
          channel: "DIRECT",
          senderId: maryam.id,
          text: "Wa alaikum assalam! I hope to complete my paediatric fellowship in Cape Town while keeping a healthy work-life balance for home and community.",
        },
      ]);
      console.log("✓ Sample approved courtship seeded between Yusuf Rahman & Maryam Isaacs.");
    }
  } catch (e) {
    console.log("Notice: Sample courtship already present or skipped:", (e as Error).message);
  }

  // 7. Seed sample pending request (Zaid -> Amina, awaiting Zaid's father)
  try {
    const existingZaidConn = await db
      .select({ id: connections.id })
      .from(connections)
      .where(
        or(
          and(eq(connections.senderId, zaid.id), eq(connections.receiverId, amina.id)),
          and(eq(connections.senderId, amina.id), eq(connections.receiverId, zaid.id)),
        ),
      )
      .limit(1);
    if (existingZaidConn.length === 0) {
      await createConnection(db, zaid, amina.id);
      console.log("✓ Sample pending request seeded (Zaid Patel -> Amina Moosa, awaiting wali).");
    }
  } catch (e) {
    console.log("Notice: Zaid connection already present or skipped:", (e as Error).message);
  }

  console.log("\n=======================================================");
  console.log("🎉 Seeding completed successfully!");
  console.log(`Total Seekers Available: ${seededBrothers.length + seededSisters.length}`);
  console.log(`All accounts password: ${PASSWORD}`);
  console.log("=======================================================\n");
} finally {
  await handle.close();
}
