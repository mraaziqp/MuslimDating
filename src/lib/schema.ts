import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { relations } from "drizzle-orm";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const userRoleEnum = pgEnum("user_role", [
  "SOLO",       // Independent adult seeker, no wali required
  "DEPENDENT",  // Adult seeker whose profile requires parental vetting
  "PARENT",     // Wali / father / guardian who manages a DEPENDENT's profile
  "MAHRAM",     // Trusted chaperone assigned once a Connection is APPROVED
]);

export const connectionStatusEnum = pgEnum("connection_status", [
  "PENDING_MALE_PARENT",    // Awaiting approval from the male seeker's parent/wali
  "PENDING_FEMALE_PARENT",  // Awaiting approval from the female seeker's wali
  "APPROVED",               // Both sides approved; chat channel is unlocked
  "REJECTED",               // One side declined; connection is closed
]);

// ─── Users ────────────────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),

  // Firebase UID — kept as the stable join key; for email/password users this is
  // populated with a generated UUID on registration (no Firebase dependency)
  firebaseUid: text("firebase_uid").notNull().unique(),

  email: text("email").notNull().unique(),
  // Bcrypt hash — null for Google OAuth users
  passwordHash: text("password_hash"),
  phone: text("phone"),
  role: userRoleEnum("role").notNull(),

  // When true, a PARENT must approve any incoming/outgoing Connection
  requiresParentalVetting: boolean("requires_parental_vetting")
    .notNull()
    .default(false),

  // When true, profile photos are blurred until a Connection is APPROVED
  modestyBlurEnabled: boolean("modesty_blur_enabled")
    .notNull()
    .default(false),

  // ── Rich profile fields (populated after onboarding / via profile editor) ──
  displayName: text("display_name"),
  /** 'male' | 'female' — drives opposite-gender matching */
  gender: text("gender"),
  age: integer("age"),
  location: text("location"),
  profession: text("profession"),
  prayerFrequency: text("prayer_frequency"),
  dietaryHabits: text("dietary_habits"),
  bio: text("bio"),
  photoUrl: text("photo_url"),

  // ── Extended profile fields ──────────────────────────────────────────────
  height: text("height"),
  maritalStatus: text("marital_status"),
  education: text("education"),
  nationality: text("nationality"),
  languages: text("languages")
    .array()
    .notNull()
    .default(sql`ARRAY[]::text[]`),

  // ── Privacy: fields the user has chosen to hide from their profile card ──
  hiddenFields: text("hidden_fields")
    .array()
    .notNull()
    .default(sql`ARRAY[]::text[]`),

  // Readiness Hub progress
  isIntroCompleted: boolean("is_intro_completed").notNull().default(false),
  completedModules: text("completed_modules")
    .array()
    .notNull()
    .default(sql`ARRAY[]::text[]`),

  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// ─── ParentChildLink ──────────────────────────────────────────────────────────

/**
 * Junction table that links a DEPENDENT seeker to their PARENT/wali.
 * A DEPENDENT may have multiple parents (e.g., father + mother both vetted),
 * and a PARENT may oversee multiple dependents.
 */
export const parentChildLinks = pgTable(
  "parent_child_links",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    parentId: uuid("parent_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    childId: uuid("child_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    // Prevent duplicate parent–child pairs
    uniqParentChild: unique("uq_parent_child").on(t.parentId, t.childId),
  })
);

// ─── Connections ──────────────────────────────────────────────────────────────

/**
 * Tracks the full matchmaking lifecycle between two seekers.
 * The `status` column drives the approval workflow:
 *   sender sends request → PENDING_MALE_PARENT (if male seeker needs vetting)
 *   → PENDING_FEMALE_PARENT (after male parent approves)
 *   → APPROVED (female wali approves; mahramId is assigned)
 *   → REJECTED (either party declines at any stage)
 */
export const connections = pgTable("connections", {
  id: uuid("id").defaultRandom().primaryKey(),

  senderId: uuid("sender_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  receiverId: uuid("receiver_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),

  status: connectionStatusEnum("status")
    .notNull()
    .default("PENDING_MALE_PARENT"),

  // Populated when status = APPROVED; points to the MAHRAM who will chaperone
  mahramId: uuid("mahram_id").references(() => users.id, {
    onDelete: "set null",
  }),

  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// ─── Messages ─────────────────────────────────────────────────────────────────

/**
 * Chat messages scoped to an APPROVED Connection.
 * Application logic should gate writes behind connections.status = 'APPROVED'.
 */
export const messages = pgTable("messages", {
  id: uuid("id").defaultRandom().primaryKey(),

  connectionId: uuid("connection_id")
    .notNull()
    .references(() => connections.id, { onDelete: "cascade" }),

  senderId: uuid("sender_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),

  text: text("text").notNull(),

  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// ─── Relations (for Drizzle relational queries) ───────────────────────────────

export const usersRelations = relations(users, ({ many }) => ({
  sentConnections: many(connections, { relationName: "sender" }),
  receivedConnections: many(connections, { relationName: "receiver" }),
  chaperoneConnections: many(connections, { relationName: "mahram" }),
  parentLinks: many(parentChildLinks, { relationName: "parent" }),
  childLinks: many(parentChildLinks, { relationName: "child" }),
  messages: many(messages),
}));

export const parentChildLinksRelations = relations(
  parentChildLinks,
  ({ one }) => ({
    parent: one(users, {
      fields: [parentChildLinks.parentId],
      references: [users.id],
      relationName: "parent",
    }),
    child: one(users, {
      fields: [parentChildLinks.childId],
      references: [users.id],
      relationName: "child",
    }),
  })
);

export const connectionsRelations = relations(connections, ({ one, many }) => ({
  sender: one(users, {
    fields: [connections.senderId],
    references: [users.id],
    relationName: "sender",
  }),
  receiver: one(users, {
    fields: [connections.receiverId],
    references: [users.id],
    relationName: "receiver",
  }),
  mahram: one(users, {
    fields: [connections.mahramId],
    references: [users.id],
    relationName: "mahram",
  }),
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  connection: one(connections, {
    fields: [messages.connectionId],
    references: [connections.id],
  }),
  sender: one(users, {
    fields: [messages.senderId],
    references: [users.id],
  }),
}));

// ─── Exported types ───────────────────────────────────────────────────────────

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type ParentChildLink = typeof parentChildLinks.$inferSelect;
export type Connection = typeof connections.$inferSelect;
export type NewConnection = typeof connections.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type UserRole = (typeof userRoleEnum.enumValues)[number];
export type ConnectionStatus = (typeof connectionStatusEnum.enumValues)[number];
