/**
 * Shared API contracts. The server imports the zod schemas for validation;
 * the client imports only the inferred/DTO types (`import type`), so zod is
 * never shipped in the browser bundle.
 */
import { z } from "zod";
import type {
  AccountStatus,
  ConnectionStatus,
  LinkKind,
  ReportStatus,
  UserRole,
} from "./schema";

export type { AccountStatus, ConnectionStatus, LinkKind, ReportStatus, UserRole };

// ─── Constants ────────────────────────────────────────────────────────────────

export * from "./constants.js";
import {
  ACCOUNT_STATUSES,
  ALL_ROLES,
  CONNECTION_STATUSES,
  DIETARY_HABITS,
  EDUCATION_LEVELS,
  MARITAL_STATUSES,
  PHOTO_MIME_TYPES,
  PRAYER_FREQUENCIES,
  PRIVACY_FIELD_KEYS,
  SELF_SELECTABLE_ROLES,
  type PrivacyFieldKey,
} from "./constants.js";

// ─── Request schemas ──────────────────────────────────────────────────────────

const trimmed = (min: number, max: number) => z.string().trim().min(min).max(max);
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();

export const registerSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(8, "Password must be at least 8 characters.").max(128),
});
export type RegisterInput = z.infer<typeof registerSchema>;

/** `identifier` is an email address or a username. */
export const loginSchema = z.object({
  identifier: z.string().trim().min(3, "Enter your email or username.").max(254),
  password: z.string().min(1).max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const onboardingSchema = z.object({
  displayName: trimmed(2, 80),
  gender: z.enum(["male", "female"]),
  age: z.number().int().min(18).max(99),
  location: optionalText(120),
  role: z.enum(SELF_SELECTABLE_ROLES),
  requiresParentalVetting: z.boolean(),
});
export type OnboardingInput = z.infer<typeof onboardingSchema>;

export const profileUpdateSchema = z
  .object({
    displayName: trimmed(2, 80),
    age: z.number().int().min(18).max(99).nullable(),
    location: optionalText(120),
    profession: optionalText(120),
    prayerFrequency: z.enum(PRAYER_FREQUENCIES).nullable(),
    dietaryHabits: z.enum(DIETARY_HABITS).nullable(),
    bio: optionalText(1000),
    height: optionalText(40),
    maritalStatus: z.enum(MARITAL_STATUSES).nullable(),
    education: z.enum(EDUCATION_LEVELS).nullable(),
    nationality: optionalText(80),
    phone: optionalText(32),
    languages: z.array(trimmed(1, 40)).max(10),
    hiddenFields: z.array(z.enum(PRIVACY_FIELD_KEYS)).max(PRIVACY_FIELD_KEYS.length),
    modestyBlurEnabled: z.boolean(),
    requiresParentalVetting: z.boolean(),
  })
  .partial();
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;

/** ~1.5 MB of base64 for the full image, ~6 KB for the blur thumbnail. */
export const photoUploadSchema = z.object({
  mimeType: z.enum(PHOTO_MIME_TYPES),
  fullData: z.base64().max(2_000_000),
  blurData: z.base64().max(8_000),
});
export type PhotoUploadInput = z.infer<typeof photoUploadSchema>;

export const createConnectionSchema = z.object({ receiverId: z.uuid() });
export type CreateConnectionInput = z.infer<typeof createConnectionSchema>;

export const connectionDecisionSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  mahramId: z.uuid().optional(),
});
export type ConnectionDecisionInput = z.infer<typeof connectionDecisionSchema>;

export const terminateConnectionSchema = z.object({ reason: optionalText(300) });
export type TerminateConnectionInput = z.infer<typeof terminateConnectionSchema>;

export const photoConsentSchema = z.object({ consent: z.boolean() });

export const sendMessageSchema = z.object({
  text: trimmed(1, 2000),
  channel: z.enum(["FAMILY", "DIRECT"]).default("FAMILY"),
});
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export const reportSchema = z.object({
  reportedId: z.uuid(),
  reason: trimmed(10, 1000),
});
export type ReportInput = z.infer<typeof reportSchema>;

export const createInviteSchema = z.object({ kind: z.enum(["WALI", "MAHRAM"]) });
export const redeemInviteSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{4}-?[A-Z0-9]{4}$/, "Invite codes look like ABCD-1234."),
});

export const readinessSubmissionSchema = z.object({
  answers: z.array(z.number().int().min(0).max(9)).max(20),
});

// ─── Admin request schemas ────────────────────────────────────────────────────

export const accountActionSchema = z.object({
  action: z.enum(["SUSPEND", "BAN", "RESET_ROLE", "REINSTATE"]),
  reason: trimmed(3, 500),
  durationDays: z.number().int().min(1).max(365).optional(),
});
export type AccountActionInput = z.infer<typeof accountActionSchema>;

export const assignRoleSchema = z.object({
  role: z.enum(ALL_ROLES),
  reason: trimmed(3, 500),
});
export type AssignRoleInput = z.infer<typeof assignRoleSchema>;

export const removePhotoSchema = z.object({ reason: trimmed(3, 500) });

export const userDirectoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(20),
  role: z.enum(ALL_ROLES).optional(),
  status: z.enum(ACCOUNT_STATUSES).optional(),
  q: z.string().trim().max(120).optional(),
});
export type UserDirectoryQuery = z.infer<typeof userDirectoryQuerySchema>;

export const seekerSearchQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(12),
  q: z.string().trim().max(120).optional(),
  gender: z.enum(["male", "female"]).optional(),
  minAge: z.coerce.number().int().min(18).max(99).optional(),
  maxAge: z.coerce.number().int().min(18).max(99).optional(),
  location: z.string().trim().max(120).optional(),
  prayerFrequency: z.enum(PRAYER_FREQUENCIES).optional(),
  dietaryHabits: z.enum(DIETARY_HABITS).optional(),
  maritalStatus: z.enum(MARITAL_STATUSES).optional(),
  education: z.enum(EDUCATION_LEVELS).optional(),
  waliInvolved: z.preprocess(
    (val) => (val === "true" || val === true ? true : val === "false" || val === false ? false : undefined),
    z.boolean().optional(),
  ),
  sortBy: z.enum(["recent", "age_asc", "age_desc", "readiness"]).default("recent"),
});
export type SeekerSearchQuery = z.infer<typeof seekerSearchQuerySchema>;

export const adminConnectionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(25),
  status: z.enum(CONNECTION_STATUSES).optional(),
  userId: z.uuid().optional(),
  q: z.string().trim().max(120).optional(),
});
export type AdminConnectionsQuery = z.infer<typeof adminConnectionsQuerySchema>;

export const reportUpdateSchema = z.object({
  status: z.enum(["REVIEWED", "RESOLVED"]),
  note: optionalText(500),
});
export type ReportUpdateInput = z.infer<typeof reportUpdateSchema>;

export const auditQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(200).default(50),
  action: z.string().trim().max(64).optional(),
  userId: z.uuid().optional(),
  since: z.iso.datetime().optional(),
});
export type AuditQuery = z.infer<typeof auditQuerySchema>;

// ─── Response DTOs ────────────────────────────────────────────────────────────

export type Gender = "male" | "female";
export type PhotoAccess = "NONE" | "BLUR" | "FULL";

export interface ApiErrorBody {
  error: string;
  code: string;
  details?: Record<string, string[]>;
}

/** The authenticated user's own record. Never includes secrets. */
export interface SelfUser {
  id: string;
  email: string;
  username: string | null;
  phone: string | null;
  role: UserRole;
  accountStatus: AccountStatus;
  suspendedUntil: string | null;
  onboardingCompleted: boolean;
  requiresParentalVetting: boolean;
  modestyBlurEnabled: boolean;
  displayName: string | null;
  gender: Gender | null;
  age: number | null;
  location: string | null;
  profession: string | null;
  prayerFrequency: string | null;
  dietaryHabits: string | null;
  bio: string | null;
  height: string | null;
  maritalStatus: string | null;
  education: string | null;
  nationality: string | null;
  languages: string[];
  hiddenFields: PrivacyFieldKey[];
  readinessCompleted: boolean;
  completedModules: string[];
  hasPhoto: boolean;
  hasPassword: boolean;
  authProvider: "password" | "google";
  createdAt: string;
}

export interface AuthResponse {
  token: string;
  user: SelfUser;
}

/** What another user may see. Hidden fields are removed server-side (null). */
export interface PublicProfile {
  id: string;
  displayName: string;
  gender: Gender | null;
  role: UserRole;
  age: number | null;
  location: string | null;
  profession: string | null;
  prayerFrequency: string | null;
  dietaryHabits: string | null;
  bio: string | null;
  height: string | null;
  maritalStatus: string | null;
  education: string | null;
  nationality: string | null;
  languages: string[];
  hiddenFields: PrivacyFieldKey[];
  readinessCompleted: boolean;
  completedModules: string[];
  waliInvolved: boolean;
  photoAccess: PhotoAccess;
}

export interface FeedGate {
  readinessCompleted: boolean;
  needsWali: boolean;
  activeChats: number;
  pendingOutgoing: number;
  maxActiveChats: number;
  maxPendingOutgoing: number;
}

export interface FeedResponse {
  profiles: PublicProfile[];
  gate: FeedGate;
}

export interface SeekerSearchResponse {
  profiles: PublicProfile[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  gate: FeedGate;
}

export interface PersonBrief {
  id: string;
  displayName: string;
  role: UserRole;
}

export type ConnectionPerspective = "SENDER" | "RECEIVER" | "SENDER_GUARDIAN" | "RECEIVER_GUARDIAN" | "MAHRAM";

export interface ConnectionView {
  id: string;
  status: ConnectionStatus;
  perspective: ConnectionPerspective;
  sender: PublicProfile;
  receiver: PublicProfile;
  mahram: PersonBrief | null;
  senderGuardianApproved: boolean;
  receiverGuardianApproved: boolean;
  receiverAccepted: boolean;
  receiverNeedsGuardian: boolean;
  /** Human-readable list of the approvals still outstanding. */
  awaiting: string[];
  canAccept: boolean;
  canDecline: boolean;
  canWithdraw: boolean;
  canTerminate: boolean;
  canGuardianDecide: boolean;
  mahramOptions: PersonBrief[];
  senderPhotoConsent: boolean;
  receiverPhotoConsent: boolean;
  closedReason: string | null;
  lastActivityAt: string;
  inactiveDays: number;
  createdAt: string;
  updatedAt: string;
}

export interface MessageView {
  id: string;
  senderId: string;
  senderName: string;
  senderKind: "SELF" | "COUNTERPART" | "MAHRAM";
  channel: "FAMILY" | "DIRECT";
  text: string;
  createdAt: string;
}

export interface ChatDetail {
  connection: ConnectionView;
  messages: MessageView[];
  canSend: boolean;
  activeChannel: "FAMILY" | "DIRECT";
  hasFamilyChat: boolean;
  familyMessageCount: number;
  directMessageCount: number;
}

export interface FamilyLink {
  linkId: string;
  kind: LinkKind;
  person: PersonBrief;
  createdAt: string;
}

export interface FamilyOverview {
  guardians: FamilyLink[];
  dependents: FamilyLink[];
  activeInvites: { id: string; kind: LinkKind; expiresAt: string }[];
}

export interface InviteCreated {
  code: string;
  kind: LinkKind;
  expiresAt: string;
}

export interface ReadinessResult {
  passed: boolean;
  correct: number;
  total: number;
  user: SelfUser;
}

// ─── Admin DTOs ───────────────────────────────────────────────────────────────

export type AdminPerson = PersonBrief & { email: string };

export interface SystemMetrics {
  usersByRole: Record<UserRole, number>;
  usersByStatus: Record<AccountStatus, number>;
  totalUsers: number;
  pendingWaliRequests: number;
  activeChaperonedChats: number;
  reportedAccounts: number;
  pendingReports: number;
  connectionsByStatus: Record<ConnectionStatus, number>;
  signupsLast14Days: { date: string; count: number }[];
  messagesLast24h: number;
  generatedAt: string;
}

export interface AdminUserRow {
  id: string;
  email: string;
  username: string | null;
  phone: string | null;
  displayName: string | null;
  role: UserRole;
  accountStatus: AccountStatus;
  suspendedUntil: string | null;
  readinessCompleted: boolean;
  onboardingCompleted: boolean;
  hasPhoto: boolean;
  reportCount: number;
  activeChats: number;
  createdAt: string;
  lastSeenAt: string | null;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface ReportRow {
  id: string;
  reporter: AdminPerson;
  reported: AdminPerson & { accountStatus: AccountStatus };
  reason: string;
  status: ReportStatus;
  resolutionNote: string | null;
  createdAt: string;
}

export interface FlaggedUser {
  user: AdminPerson & { accountStatus: AccountStatus };
  signals: string[];
}

export interface ModerationQueue {
  reports: ReportRow[];
  flagged: FlaggedUser[];
}

export interface AuditLogView {
  id: string;
  action: string;
  actor: AdminPerson | null;
  target: AdminPerson | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface AdminConnectionRow {
  id: string;
  status: ConnectionStatus;
  sender: AdminPerson;
  receiver: AdminPerson;
  mahram: AdminPerson | null;
  messageCount: number;
  senderPhotoConsent: boolean;
  receiverPhotoConsent: boolean;
  closedReason: string | null;
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string;
}

export interface AdminFamilyLink {
  linkId: string;
  kind: LinkKind;
  /** GUARDIAN: the person is this user's wali/mahram. WARD: this user looks after the person. */
  relation: "GUARDIAN" | "WARD";
  person: AdminPerson;
  createdAt: string;
}

export interface AdminUserDetail {
  account: AdminUserRow;
  profile: SelfUser;
  family: AdminFamilyLink[];
  connections: AdminConnectionRow[];
  reportsAgainst: ReportRow[];
  reportsFiled: number;
  recentActivity: AuditLogView[];
}

export interface AdminTranscriptMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: "SENDER" | "RECEIVER" | "MAHRAM" | "OTHER";
  text: string;
  createdAt: string;
}

export interface AdminTranscript {
  connection: AdminConnectionRow;
  messages: AdminTranscriptMessage[];
}
