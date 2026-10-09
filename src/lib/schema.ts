import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  unique,
  uniqueIndex,
  index,
  check,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const userRoleEnum = pgEnum("user_role", [
  "SOLO", // Independent adult seeker
  "DEPENDENT", // Seeker whose requests always require wali vetting
  "PARENT", // Wali / guardian linked to one or more seekers
  "MAHRAM", // Chaperone linked to one or more seekers
  "ADMIN", // Platform administrator
]);

export const connectionStatusEnum = pgEnum("connection_status", [
  "PENDING_MALE_PARENT", // Awaiting the initiating side's guardian (sender requires vetting)
  "PENDING_FEMALE_PARENT", // Awaiting the receiving side (recipient consent + their wali if vetted)
  "APPROVED", // Both sides approved, mahram assigned, chat unlocked
  "REJECTED", // Declined during the approval workflow
  "TERMINATED", // Closed after approval (by a party, admin, or inactivity)
]);

export const accountStatusEnum = pgEnum("account_status", ["ACTIVE", "SUSPENDED", "BANNED"]);

export const reportStatusEnum = pgEnum("report_status", ["PENDING", "REVIEWED", "RESOLVED"]);

export const linkKindEnum = pgEnum("link_kind", ["WALI", "MAHRAM"]);

// ─── Users ────────────────────────────────────────────────────────────────────

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** Firebase UID for Google users, `local:<uuid>` for email/password users. */
    firebaseUid: text("firebase_uid").notNull().unique(),
    email: text("email").notNull().unique(),
    /** Optional lowercase login handle (used by administrator accounts). */
    username: text("username").unique(),
    /** bcrypt hash; null for Google-only accounts. Never leaves the server. */
    passwordHash: text("password_hash"),
    phone: text("phone"),
    role: userRoleEnum("role").notNull(),
    accountStatus: accountStatusEnum("account_status").notNull().default("ACTIVE"),
    suspendedUntil: timestamp("suspended_until", { withTimezone: true }),

    onboardingCompleted: boolean("onboarding_completed").notNull().default(false),
    requiresParentalVetting: boolean("requires_parental_vetting").notNull().default(false),
    modestyBlurEnabled: boolean("modesty_blur_enabled").notNull().default(true),

    displayName: text("display_name"),
    gender: text("gender").$type<"male" | "female">(),
    age: integer("age"),
    location: text("location"),
    profession: text("profession"),
    prayerFrequency: text("prayer_frequency"),
    dietaryHabits: text("dietary_habits"),
    bio: text("bio"),
    height: text("height"),
    maritalStatus: text("marital_status"),
    education: text("education"),
    nationality: text("nationality"),
    languages: text("languages").array().notNull().default(sql`ARRAY[]::text[]`),
    hiddenFields: text("hidden_fields").array().notNull().default(sql`ARRAY[]::text[]`),

    readinessCompleted: boolean("readiness_completed").notNull().default(false),
    completedModules: text("completed_modules").array().notNull().default(sql`ARRAY[]::text[]`),

    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_users_role").on(t.role),
    index("idx_users_gender_role").on(t.gender, t.role),
    check("chk_users_age", sql`${t.age} IS NULL OR (${t.age} BETWEEN 18 AND 99)`),
    check("chk_users_gender", sql`${t.gender} IS NULL OR ${t.gender} IN ('male', 'female')`),
  ],
);

// ─── Profile photos ───────────────────────────────────────────────────────────

/**
 * Photos are stored server-side and only streamed through an authorisation
 * check. `blurData` is a tiny (~24px) thumbnail that reveals nothing
 * identifiable; `fullData` is only served after mutual consent.
 */
export const profilePhotos = pgTable("profile_photos", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  mimeType: text("mime_type").notNull(),
  fullData: text("full_data").notNull(), // base64
  blurData: text("blur_data").notNull(), // base64
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ─── Guardian / mahram links ──────────────────────────────────────────────────

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
    kind: linkKindEnum("kind").notNull().default("WALI"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique("uq_parent_child").on(t.parentId, t.childId),
    index("idx_links_child").on(t.childId),
    check("chk_links_not_self", sql`${t.parentId} <> ${t.childId}`),
  ],
);

/** Single-use invite codes a seeker shares with their wali or mahram. */
export const linkInvites = pgTable(
  "link_invites",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    childId: uuid("child_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: linkKindEnum("kind").notNull(),
    codeHash: text("code_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    usedBy: uuid("used_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("idx_invites_child").on(t.childId)],
);

// ─── Connections ──────────────────────────────────────────────────────────────

export const connections = pgTable(
  "connections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    senderId: uuid("sender_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    receiverId: uuid("receiver_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: connectionStatusEnum("status").notNull().default("PENDING_MALE_PARENT"),

    senderGuardianApprovedBy: uuid("sender_guardian_approved_by").references(() => users.id, {
      onDelete: "set null",
    }),
    senderGuardianApprovedAt: timestamp("sender_guardian_approved_at", { withTimezone: true }),
    receiverGuardianApprovedBy: uuid("receiver_guardian_approved_by").references(() => users.id, {
      onDelete: "set null",
    }),
    receiverGuardianApprovedAt: timestamp("receiver_guardian_approved_at", { withTimezone: true }),
    receiverAcceptedAt: timestamp("receiver_accepted_at", { withTimezone: true }),

    mahramId: uuid("mahram_id").references(() => users.id, { onDelete: "set null" }),

    senderPhotoConsent: boolean("sender_photo_consent").notNull().default(false),
    receiverPhotoConsent: boolean("receiver_photo_consent").notNull().default(false),

    closedBy: uuid("closed_by").references(() => users.id, { onDelete: "set null" }),
    closedReason: text("closed_reason"),

    /** Optimistic-concurrency counter; every transition bumps it. */
    version: integer("version").notNull().default(0),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    // One live connection per pair, regardless of direction.
    uniqueIndex("uq_connections_active_pair")
      .on(sql`LEAST(${t.senderId}, ${t.receiverId})`, sql`GREATEST(${t.senderId}, ${t.receiverId})`)
      .where(sql`${t.status} <> 'TERMINATED'`),
    index("idx_connections_sender_status").on(t.senderId, t.status),
    index("idx_connections_receiver_status").on(t.receiverId, t.status),
    index("idx_connections_mahram").on(t.mahramId),
    index("idx_connections_status_activity").on(t.status, t.lastActivityAt),
    check("chk_connections_not_self", sql`${t.senderId} <> ${t.receiverId}`),
  ],
);

// ─── Messages ─────────────────────────────────────────────────────────────────

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => connections.id, { onDelete: "cascade" }),
    senderId: uuid("sender_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    channel: text("channel").notNull().default("FAMILY").$type<"FAMILY" | "DIRECT">(),
    text: text("text").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_messages_connection_channel_created").on(t.connectionId, t.channel, t.createdAt),
    index("idx_messages_connection_created").on(t.connectionId, t.createdAt),
    check("chk_messages_length", sql`char_length(${t.text}) BETWEEN 1 AND 2000`),
  ],
);

// ─── Audit logs (append-only; UPDATE/DELETE blocked by trigger) ──────────────

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** Null means the action was performed by the system (e.g. cron). */
    actorId: uuid("actor_id").references(() => users.id),
    targetId: uuid("target_id").references(() => users.id),
    action: text("action").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_audit_created").on(t.createdAt),
    index("idx_audit_actor").on(t.actorId),
    index("idx_audit_target").on(t.targetId),
    index("idx_audit_action").on(t.action),
  ],
);

// ─── Reports ──────────────────────────────────────────────────────────────────

export const reports = pgTable(
  "reports",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    reporterId: uuid("reporter_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    reportedId: uuid("reported_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    reason: text("reason").notNull(),
    status: reportStatusEnum("status").notNull().default("PENDING"),
    resolvedBy: uuid("resolved_by").references(() => users.id, { onDelete: "set null" }),
    resolutionNote: text("resolution_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_reports_status").on(t.status, t.createdAt),
    index("idx_reports_reported").on(t.reportedId),
    check("chk_reports_not_self", sql`${t.reporterId} <> ${t.reportedId}`),
  ],
);

// ─── Rate limiting (fixed window, serverless-safe) ────────────────────────────

export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  count: integer("count").notNull(),
});

// ─── Relations ────────────────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ many, one }) => ({
  sentConnections: many(connections, { relationName: "sender" }),
  receivedConnections: many(connections, { relationName: "receiver" }),
  chaperoneConnections: many(connections, { relationName: "mahram" }),
  parentLinks: many(parentChildLinks, { relationName: "parent" }),
  childLinks: many(parentChildLinks, { relationName: "child" }),
  photo: one(profilePhotos, { fields: [users.id], references: [profilePhotos.userId] }),
}));

export const parentChildLinksRelations = relations(parentChildLinks, ({ one }) => ({
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
}));

export const connectionsRelations = relations(connections, ({ one, many }) => ({
  sender: one(users, { fields: [connections.senderId], references: [users.id], relationName: "sender" }),
  receiver: one(users, {
    fields: [connections.receiverId],
    references: [users.id],
    relationName: "receiver",
  }),
  mahram: one(users, { fields: [connections.mahramId], references: [users.id], relationName: "mahram" }),
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  connection: one(connections, { fields: [messages.connectionId], references: [connections.id] }),
  sender: one(users, { fields: [messages.senderId], references: [users.id] }),
}));

// ─── Inferred types ───────────────────────────────────────────────────────────

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type ParentChildLink = typeof parentChildLinks.$inferSelect;
export type Connection = typeof connections.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type Report = typeof reports.$inferSelect;
export type UserRole = (typeof userRoleEnum.enumValues)[number];
export type ConnectionStatus = (typeof connectionStatusEnum.enumValues)[number];
export type AccountStatus = (typeof accountStatusEnum.enumValues)[number];
export type ReportStatus = (typeof reportStatusEnum.enumValues)[number];
export type LinkKind = (typeof linkKindEnum.enumValues)[number];
