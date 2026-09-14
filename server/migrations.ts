import { sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { rowsOf } from "./rows.js";

type AnyPgDatabase = PgDatabase<PgQueryResultHKT, Record<string, unknown>>;

interface Migration {
  id: string;
  statements: string[];
}

// ─── Statement helpers (every statement is idempotent) ───────────────────────

const createEnum = (name: string, values: string[]) => [
  `DO $$ BEGIN CREATE TYPE ${name} AS ENUM (${values.map((v) => `'${v}'`).join(", ")}); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
  // Legacy databases were created with fewer values.
  ...values.map((v) => `ALTER TYPE ${name} ADD VALUE IF NOT EXISTS '${v}';`),
];

const addColumn = (table: string, definition: string) =>
  `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${definition};`;

const addConstraint = (table: string, name: string, definition: string) =>
  `DO $$ BEGIN ALTER TABLE ${table} ADD CONSTRAINT ${name} ${definition}; EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;`;

const fk = (table: string, column: string, onDelete: "cascade" | "set null" | "no action") =>
  addConstraint(
    table,
    `${table}_${column}_users_id_fk`,
    `FOREIGN KEY (${column}) REFERENCES public.users(id) ON DELETE ${onDelete} ON UPDATE no action`,
  );

// ─── Migrations ──────────────────────────────────────────────────────────────

export const MIGRATIONS: Migration[] = [
  {
    id: "0001_nikahpath_core",
    statements: [
      ...createEnum("user_role", ["SOLO", "DEPENDENT", "PARENT", "MAHRAM", "ADMIN"]),
      ...createEnum("connection_status", [
        "PENDING_MALE_PARENT",
        "PENDING_FEMALE_PARENT",
        "APPROVED",
        "REJECTED",
        "TERMINATED",
      ]),
      ...createEnum("account_status", ["ACTIVE", "SUSPENDED", "BANNED"]),
      ...createEnum("report_status", ["PENDING", "REVIEWED", "RESOLVED"]),
      ...createEnum("link_kind", ["WALI", "MAHRAM"]),

      // ── users ──
      `CREATE TABLE IF NOT EXISTS users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        firebase_uid text NOT NULL,
        email text NOT NULL,
        role user_role NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT users_firebase_uid_unique UNIQUE (firebase_uid),
        CONSTRAINT users_email_unique UNIQUE (email)
      );`,
      `DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'is_intro_completed')
           AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'readiness_completed') THEN
          ALTER TABLE users RENAME COLUMN is_intro_completed TO readiness_completed;
        END IF;
      END $$;`,
      addColumn("users", "password_hash text"),
      addColumn("users", "phone text"),
      addColumn("users", "account_status account_status NOT NULL DEFAULT 'ACTIVE'"),
      addColumn("users", "suspended_until timestamptz"),
      addColumn("users", "onboarding_completed boolean NOT NULL DEFAULT false"),
      addColumn("users", "requires_parental_vetting boolean NOT NULL DEFAULT false"),
      addColumn("users", "modesty_blur_enabled boolean NOT NULL DEFAULT true"),
      "ALTER TABLE users ALTER COLUMN modesty_blur_enabled SET DEFAULT true;",
      addColumn("users", "display_name text"),
      addColumn("users", "gender text"),
      addColumn("users", "age integer"),
      addColumn("users", "location text"),
      addColumn("users", "profession text"),
      addColumn("users", "prayer_frequency text"),
      addColumn("users", "dietary_habits text"),
      addColumn("users", "bio text"),
      addColumn("users", "height text"),
      addColumn("users", "marital_status text"),
      addColumn("users", "education text"),
      addColumn("users", "nationality text"),
      addColumn("users", "languages text[] NOT NULL DEFAULT ARRAY[]::text[]"),
      addColumn("users", "hidden_fields text[] NOT NULL DEFAULT ARRAY[]::text[]"),
      addColumn("users", "readiness_completed boolean NOT NULL DEFAULT false"),
      addColumn("users", "completed_modules text[] NOT NULL DEFAULT ARRAY[]::text[]"),
      addColumn("users", "last_seen_at timestamptz"),
      "ALTER TABLE users DROP COLUMN IF EXISTS photo_url;",
      // Legacy rows that already had a gender were onboarded by the old flow.
      "UPDATE users SET onboarding_completed = true WHERE onboarding_completed = false AND gender IS NOT NULL AND display_name IS NOT NULL;",
      "UPDATE users SET requires_parental_vetting = true WHERE role = 'DEPENDENT' AND requires_parental_vetting = false;",
      addConstraint("users", "chk_users_age", "CHECK (age IS NULL OR (age BETWEEN 18 AND 99)) NOT VALID"),
      addConstraint("users", "chk_users_gender", "CHECK (gender IS NULL OR gender IN ('male', 'female')) NOT VALID"),
      "CREATE INDEX IF NOT EXISTS idx_users_role ON users USING btree (role);",
      "CREATE INDEX IF NOT EXISTS idx_users_gender_role ON users USING btree (gender, role);",

      // ── profile_photos ──
      `CREATE TABLE IF NOT EXISTS profile_photos (
        user_id uuid PRIMARY KEY,
        mime_type text NOT NULL,
        full_data text NOT NULL,
        blur_data text NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      );`,
      fk("profile_photos", "user_id", "cascade"),

      // ── parent_child_links ──
      `CREATE TABLE IF NOT EXISTS parent_child_links (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        parent_id uuid NOT NULL,
        child_id uuid NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_parent_child UNIQUE (parent_id, child_id)
      );`,
      addColumn("parent_child_links", "kind link_kind NOT NULL DEFAULT 'WALI'"),
      fk("parent_child_links", "parent_id", "cascade"),
      fk("parent_child_links", "child_id", "cascade"),
      addConstraint("parent_child_links", "chk_links_not_self", "CHECK (parent_id <> child_id) NOT VALID"),
      "CREATE INDEX IF NOT EXISTS idx_links_child ON parent_child_links USING btree (child_id);",

      // ── link_invites ──
      `CREATE TABLE IF NOT EXISTS link_invites (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        child_id uuid NOT NULL,
        kind link_kind NOT NULL,
        code_hash text NOT NULL,
        expires_at timestamptz NOT NULL,
        used_at timestamptz,
        used_by uuid,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT link_invites_code_hash_unique UNIQUE (code_hash)
      );`,
      fk("link_invites", "child_id", "cascade"),
      fk("link_invites", "used_by", "set null"),
      "CREATE INDEX IF NOT EXISTS idx_invites_child ON link_invites USING btree (child_id);",

      // ── connections ──
      `CREATE TABLE IF NOT EXISTS connections (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        sender_id uuid NOT NULL,
        receiver_id uuid NOT NULL,
        status connection_status NOT NULL DEFAULT 'PENDING_MALE_PARENT',
        mahram_id uuid,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );`,
      addColumn("connections", "sender_guardian_approved_by uuid"),
      addColumn("connections", "sender_guardian_approved_at timestamptz"),
      addColumn("connections", "receiver_guardian_approved_by uuid"),
      addColumn("connections", "receiver_guardian_approved_at timestamptz"),
      addColumn("connections", "receiver_accepted_at timestamptz"),
      addColumn("connections", "sender_photo_consent boolean NOT NULL DEFAULT false"),
      addColumn("connections", "receiver_photo_consent boolean NOT NULL DEFAULT false"),
      addColumn("connections", "closed_by uuid"),
      addColumn("connections", "closed_reason text"),
      addColumn("connections", "version integer NOT NULL DEFAULT 0"),
      addColumn("connections", "last_activity_at timestamptz NOT NULL DEFAULT now()"),
      fk("connections", "sender_id", "cascade"),
      fk("connections", "receiver_id", "cascade"),
      fk("connections", "mahram_id", "set null"),
      fk("connections", "sender_guardian_approved_by", "set null"),
      fk("connections", "receiver_guardian_approved_by", "set null"),
      fk("connections", "closed_by", "set null"),
      addConstraint("connections", "chk_connections_not_self", "CHECK (sender_id <> receiver_id) NOT VALID"),
      // Collapse legacy duplicate pairs (either direction) so the unique index can be built.
      `WITH ranked AS (
        SELECT id, row_number() OVER (
          PARTITION BY LEAST(sender_id, receiver_id), GREATEST(sender_id, receiver_id)
          ORDER BY (status = 'APPROVED') DESC, created_at DESC
        ) AS rn
        FROM connections WHERE status <> 'TERMINATED'
      )
      UPDATE connections c
         SET status = 'TERMINATED', closed_reason = 'DUPLICATE_PAIR_MIGRATION', updated_at = now()
        FROM ranked r
       WHERE c.id = r.id AND r.rn > 1;`,
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_connections_active_pair
         ON connections USING btree (LEAST(sender_id, receiver_id), GREATEST(sender_id, receiver_id))
         WHERE status <> 'TERMINATED';`,
      "CREATE INDEX IF NOT EXISTS idx_connections_sender_status ON connections USING btree (sender_id, status);",
      "CREATE INDEX IF NOT EXISTS idx_connections_receiver_status ON connections USING btree (receiver_id, status);",
      "CREATE INDEX IF NOT EXISTS idx_connections_mahram ON connections USING btree (mahram_id);",
      "CREATE INDEX IF NOT EXISTS idx_connections_status_activity ON connections USING btree (status, last_activity_at);",

      // ── messages ──
      `CREATE TABLE IF NOT EXISTS messages (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        connection_id uuid NOT NULL,
        sender_id uuid NOT NULL,
        text text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );`,
      addConstraint(
        "messages",
        "messages_connection_id_connections_id_fk",
        "FOREIGN KEY (connection_id) REFERENCES public.connections(id) ON DELETE cascade ON UPDATE no action",
      ),
      fk("messages", "sender_id", "cascade"),
      addConstraint("messages", "chk_messages_length", "CHECK (char_length(text) BETWEEN 1 AND 2000) NOT VALID"),
      "CREATE INDEX IF NOT EXISTS idx_messages_connection_created ON messages USING btree (connection_id, created_at);",

      // ── audit_logs ──
      `CREATE TABLE IF NOT EXISTS audit_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        actor_id uuid,
        target_id uuid,
        action text NOT NULL,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      );`,
      fk("audit_logs", "actor_id", "no action"),
      fk("audit_logs", "target_id", "no action"),
      "CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs USING btree (created_at);",
      "CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs USING btree (actor_id);",
      "CREATE INDEX IF NOT EXISTS idx_audit_target ON audit_logs USING btree (target_id);",
      "CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs USING btree (action);",
      `CREATE OR REPLACE FUNCTION audit_logs_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'audit_logs is append-only' USING ERRCODE = 'insufficient_privilege';
      END $$;`,
      "DROP TRIGGER IF EXISTS trg_audit_logs_append_only ON audit_logs;",
      "CREATE TRIGGER trg_audit_logs_append_only BEFORE UPDATE OR DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION audit_logs_append_only();",

      // ── reports ──
      `CREATE TABLE IF NOT EXISTS reports (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        reporter_id uuid NOT NULL,
        reported_id uuid NOT NULL,
        reason text NOT NULL,
        status report_status NOT NULL DEFAULT 'PENDING',
        resolved_by uuid,
        resolution_note text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );`,
      fk("reports", "reporter_id", "cascade"),
      fk("reports", "reported_id", "cascade"),
      fk("reports", "resolved_by", "set null"),
      addConstraint("reports", "chk_reports_not_self", "CHECK (reporter_id <> reported_id)"),
      "CREATE INDEX IF NOT EXISTS idx_reports_status ON reports USING btree (status, created_at);",
      "CREATE INDEX IF NOT EXISTS idx_reports_reported ON reports USING btree (reported_id);",

      // ── rate_limits ──
      `CREATE TABLE IF NOT EXISTS rate_limits (
        key text PRIMARY KEY,
        window_start timestamptz NOT NULL,
        count integer NOT NULL
      );`,

      // ── Approval invariants enforced inside the database ──
      // Serialises approvals per user with advisory locks so concurrent requests
      // cannot push either party past the active-chat cap.
      `CREATE OR REPLACE FUNCTION enforce_connection_approval_rules() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE
        sender_active integer;
        receiver_active integer;
      BEGIN
        IF NEW.status = 'APPROVED' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'APPROVED') THEN
          IF NEW.mahram_id IS NULL THEN
            RAISE EXCEPTION 'MAHRAM_REQUIRED: a mahram must be assigned before a connection is approved'
              USING ERRCODE = 'check_violation';
          END IF;
          IF NEW.mahram_id = NEW.sender_id OR NEW.mahram_id = NEW.receiver_id THEN
            RAISE EXCEPTION 'MAHRAM_INVALID: a party cannot chaperone their own connection'
              USING ERRCODE = 'check_violation';
          END IF;

          PERFORM pg_advisory_xact_lock(hashtextextended(LEAST(NEW.sender_id, NEW.receiver_id)::text, 7));
          PERFORM pg_advisory_xact_lock(hashtextextended(GREATEST(NEW.sender_id, NEW.receiver_id)::text, 7));

          SELECT count(*) INTO sender_active FROM connections
           WHERE status = 'APPROVED' AND id <> NEW.id
             AND (sender_id = NEW.sender_id OR receiver_id = NEW.sender_id);
          SELECT count(*) INTO receiver_active FROM connections
           WHERE status = 'APPROVED' AND id <> NEW.id
             AND (sender_id = NEW.receiver_id OR receiver_id = NEW.receiver_id);

          IF sender_active >= 3 OR receiver_active >= 3 THEN
            RAISE EXCEPTION 'ACTIVE_CHAT_LIMIT: sender=% receiver=%', sender_active, receiver_active
              USING ERRCODE = 'check_violation';
          END IF;

          NEW.last_activity_at := now();
        END IF;
        RETURN NEW;
      END $$;`,
      "DROP TRIGGER IF EXISTS trg_connections_approval_rules ON connections;",
      "CREATE TRIGGER trg_connections_approval_rules BEFORE INSERT OR UPDATE OF status ON connections FOR EACH ROW EXECUTE FUNCTION enforce_connection_approval_rules();",
    ],
  },
];

/**
 * Applies pending migrations. Statements run one at a time (the Neon HTTP
 * driver has no interactive transactions); each is idempotent so a partially
 * applied migration can simply be re-run.
 */
export async function runMigrations<TSchema extends Record<string, unknown>>(
  db: PgDatabase<PgQueryResultHKT, TSchema>,
  log: (message: string) => void = () => {},
): Promise<string[]> {
  const database = db as unknown as AnyPgDatabase;
  await database.execute(
    sql.raw(`CREATE TABLE IF NOT EXISTS schema_migrations (
      id text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );`),
  );
  const applied = new Set(
    rowsOf(await database.execute(sql.raw("SELECT id FROM schema_migrations"))).map((r) => String(r.id)),
  );

  const newlyApplied: string[] = [];
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) continue;
    log(`Applying ${migration.id} (${migration.statements.length} statements)`);
    for (const statement of migration.statements) {
      await database.execute(sql.raw(statement));
    }
    await database.execute(sql`INSERT INTO schema_migrations (id) VALUES (${migration.id}) ON CONFLICT DO NOTHING`);
    newlyApplied.push(migration.id);
  }
  return newlyApplied;
}

export async function pendingMigrations<TSchema extends Record<string, unknown>>(
  db: PgDatabase<PgQueryResultHKT, TSchema>,
): Promise<string[]> {
  const database = db as unknown as AnyPgDatabase;
  try {
    const applied = new Set(
      rowsOf(await database.execute(sql.raw("SELECT id FROM schema_migrations"))).map((r) => String(r.id)),
    );
    return MIGRATIONS.map((m) => m.id).filter((id) => !applied.has(id));
  } catch {
    return MIGRATIONS.map((m) => m.id);
  }
}
