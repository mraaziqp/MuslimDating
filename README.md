# NikahPath

Intentional, family-first halal matchmaking. No swiping — curated daily introductions, wali approval,
mahram-chaperoned chats, private photos, and a readiness course before anyone can connect.

**Stack:** React 19 · Vite · Tailwind CSS 4 · Express (Vercel serverless) · Drizzle ORM · Neon Postgres ·
Firebase Authentication (Google) + email/password · zod · vitest

---

## Quick start (local, zero configuration)

```bash
npm install
npm run db:seed     # optional: demo accounts + sample data
npm run dev         # web on http://localhost:3000, API on :3001
```

Without `DATABASE_URL` the API runs an embedded Postgres (PGlite) in `./.data/pglite` and migrates it
automatically. Delete that folder to start fresh.

Demo accounts (password `Bismillah-2026`):

| Email | Role | Scenario |
|---|---|---|
| `admin@nikahpath.test` | ADMIN | Full admin dashboard at `/admin` |
| `yusuf@nikahpath.test` | SOLO (m) | Active chat with Maryam; pending request to Huda |
| `maryam@nikahpath.test` | SOLO (f) | Active chat, chaperoned by Khalid |
| `huda@nikahpath.test` | SOLO (f) | Incoming request from Yusuf to accept |
| `zaid@nikahpath.test` | SOLO (m), vetted | Request to Amina awaiting his father |
| `ibrahim@nikahpath.test` | PARENT | Zaid's wali — approve the request |
| `amina@nikahpath.test` | DEPENDENT (f) | Wali: Abdullah |
| `abdullah@nikahpath.test` | PARENT | Amina's wali |
| `khalid@nikahpath.test` | MAHRAM | Chaperone for Maryam and Huda |
| `omar@nikahpath.test` | SOLO (m) | Has not completed readiness; has a report against him |

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Vite + API with hot reload |
| `npm test` | Integration tests (state machine, SQL constraints, admin, cron, HTTP auth boundary) |
| `npm run lint` | Strict TypeScript check (`tsc --noEmit`) |
| `npm run build` | Production web build |
| `npm run db:migrate` | Apply migrations to `DATABASE_URL` |
| `npm run db:seed` | Demo data (refuses to run against Neon without `--force`) |
| `npm run make-admin -- <email>` | Promote an existing account to ADMIN (audited) |

## Deploying (Vercel + Neon)

1. Set environment variables (see `.env.example`): **`DATABASE_URL`**, **`JWT_SECRET`** (≥ 32 chars),
   **`CRON_SECRET`**, optionally `ADMIN_EMAIL`.
2. Migrate the production database once per release: `DATABASE_URL=… npm run db:migrate`.
   Migrations are idempotent and upgrade the legacy schema in place (see *Migrating existing data*).
3. Deploy. `vercel.json` routes `/api/*` to the Express app and schedules the inactivity cleaner daily.
4. Promote your admin: sign in once, then `DATABASE_URL=… npm run make-admin -- you@example.com`.
5. In the Firebase console, add your production domain to *Authentication → Authorized domains*.

`GET /api/health` reports the database driver, pending migrations, and whether secrets are configured.

## How matchmaking works

```
request ─┬─ sender requires vetting ─► PENDING_MALE_PARENT ── sender's wali approves ─┐
         └─ otherwise ──────────────────────────────────────────────────────────────┴─► PENDING_FEMALE_PARENT
PENDING_FEMALE_PARENT ── recipient accepts (+ recipient's wali approves if DEPENDENT/vetted)
                      ── mahram assigned ──► APPROVED (chat unlocked)
any pending stage ── declined ──► REJECTED        APPROVED ── ended / banned / 7 days idle ──► TERMINATED
```

* **Readiness Gate** — both members must pass the “Etiquette of Halal Courtship” quiz; enforced in the
  service layer and again inside the `INSERT` statement.
* **3 active chats** — enforced by a Postgres trigger that serialises approvals per user with advisory locks,
  so concurrent approvals cannot exceed the cap.
* **Mahram required** — the same trigger rejects `APPROVED` without a mahram. Options come from wali/mahram
  links (the woman's mahram first). Links are created with single-use, hashed, expiring invite codes.
* **No duplicates** — partial unique index on the unordered pair where `status <> 'TERMINATED'`.
* **Photos** — stored server-side and streamed only after an authorisation check. Before mutual consent the
  server only ever sends a 24 px thumbnail (or nothing, with modesty blur on). EXIF is stripped on upload.
* **Ghosting cleaner** — `/api/cron/cleanup-stale-connections` terminates `APPROVED` chats with no messages
  from either member for 7 days, writing an audit record in the same statement.

## Admin

`/admin` is protected by `AdminProtectedRoute` (server re-validation of the session and role) and every
`/api/admin/*` endpoint checks `role = 'ADMIN'` from the database. It provides live metrics, a user directory
(search, role/status filters, suspend / ban / reinstate / reset role / assign role / remove photo), the
moderation queue (reports + automatically flagged unusual activity), and the audit trail. `audit_logs` is
append-only: a trigger rejects `UPDATE` and `DELETE`.

## Project layout

```
api/index.ts            Vercel entry → server/app.ts
server/app.ts           Express routes (auth, validation, error mapping)
server/actions/*        Business logic: matchmaking state machine, admin, chat, family, photos, cron …
server/migrations.ts    Idempotent SQL migrations, triggers and constraints
src/lib/schema.ts       Drizzle schema (source of truth for types)
src/lib/contracts.ts    zod request schemas + response DTOs shared by client and server
src/pages, components   React app; components/admin/* is the admin suite
tests/                  vitest integration tests against in-memory Postgres
```

## Migrating existing data

Running `npm run db:migrate` against the pre-2026-09 database:

* adds `ADMIN` / `TERMINATED` enum values and all new tables and columns;
* renames `is_intro_completed` → `readiness_completed` and drops the unused `photo_url` column;
* marks users who already had a name and gender as onboarded and forces vetting on for `DEPENDENT` users;
* closes duplicate live connections for the same pair (keeping the approved or newest one) so the unique
  index can be created.

Former “admin” accounts were stored as `PARENT`; promote them with `npm run make-admin`.

See [`docs/AUDIT.md`](docs/AUDIT.md) for the security audit and outstanding recommendations.
