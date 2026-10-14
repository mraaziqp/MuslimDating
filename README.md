# NikahPath

Intentional, family-first halal matchmaking. Discovery is a card deck you swipe through — but every right
swipe is a real, limited request that goes through wali approval and opens only a mahram-chaperoned chat.
Photos stay private, and a readiness course comes before anyone can connect.

**Stack:** React 19 · Vite 8 · Tailwind CSS 4 · Express 5 (Vercel serverless) · Drizzle ORM · Neon Postgres ·
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
| `omar@nikahpath.test` | SOLO (m) | Has a report against him (Admin → Moderation) |

More seekers are seeded so there is something to browse: `bilal`, `tariq`, `farhan` (brothers) and `fatima`,
`zainab`, `salma`, `yasmin`, `layla` (sisters), all `@nikahpath.test`, plus `farooq` (Zainab's wali).

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
any pending stage ── declined ──► REJECTED        APPROVED ── ended / banned / 3 days idle ──► TERMINATED
```

### Discover

`/discover` is the seeker's home. It has three tabs and two views (cards or grid):

* **Today** — up to five picks, stable for the day. Passing on one shrinks the batch rather than refilling it.
* **Browse** — everyone eligible, with keyword search and filters.
* **Saved** — the private shortlist.

In the card view, swipe (or use the buttons / arrow keys): **right** sends a connection request, **up** saves
for later, **left** passes. The last action can be undone — undoing a request withdraws it. Tap a card for the
full profile and a "what you have in common" summary (`src/lib/compatibility.ts`), which compares only details
both members have chosen to share and shows no score when there is too little to compare.

Saves and passes are stored per member in `profile_reactions`. They are private: the other member is never
told, and they are not written to the audit trail. A pass hides a profile for 30 days (`PASS_COOLDOWN_DAYS`).
A saved profile can carry a private note (up to 500 characters) — something to remember or to raise with
family. Only its author can read it; it goes when the save goes.

* **Readiness Gate** — both members must pass the “Etiquette of Halal Courtship” quiz; enforced in the
  service layer and again inside the `INSERT` statement.
* **3 active chats** — enforced by a Postgres trigger that serialises approvals per user with advisory locks,
  so concurrent approvals cannot exceed the cap.
* **Mahram required** — the same trigger rejects `APPROVED` without a mahram. Options come from wali/mahram
  links (the woman's mahram first). Links are created with single-use, hashed, expiring invite codes.
* **No duplicates** — partial unique index on the unordered pair where `status <> 'TERMINATED'`.
* **Photos** — stored server-side and streamed only after an authorisation check. Before mutual consent the
  server only ever sends a 24 px thumbnail (or nothing, with modesty blur on). EXIF is stripped on upload.
* **Unread messages** — `chat_reads` records when each participant last opened each room of a chat. The
  Chats tab, the conversation list and the other room's tab show what is waiting. Read positions are private:
  nobody is told whether their message has been read. The mahram only ever counts the family lounge.
* **Search privacy** — seekers only ever see the opposite gender, and a filter or keyword never matches a
  field the member has hidden, so search cannot be used to infer hidden details.
* **Ghosting cleaner** — `/api/cron/cleanup-stale-connections` terminates `APPROVED` chats with no messages
  from either member for 3 days (`STALE_CONNECTION_DAYS`), writing an audit record in the same statement.

## Mobile

The app is built phone-first and checked from 320 px wide up to tablets.

* **Navigation** — a bottom tab bar per role below the `lg` breakpoint (it steps aside while the keyboard is
  open), the profile and sign-out in the top bar, and a back button on every sub-screen. The chat room is
  full-screen on phones with its own header.
* **Layout variables** — `--nav-h`, `--tabbar-h`, `--page-pb` and `--safe-bottom` in `src/index.css` are the
  single source for the app chrome sizes. Full-height screens (the deck, the chat room) compute their height
  from them, so change a bar's height there and nowhere else.
* **Touch sizing** — the shared `Button`, `Input`, `NativeSelect` and `Tabs` grow to 40–44 px wherever the
  pointer is a finger (`pointer-coarse:`), without changing the denser desktop layout. Form controls use 16 px
  text on phones so iOS does not zoom the page on focus.
* **Dialogs** are bottom sheets on phones (`src/components/ui/dialog.tsx`) and centred dialogs from `sm` up.
* **The profile card** is a size container: on a short phone it drops the bio and extra chips rather than
  clipping, so the deck and its buttons fit a 320×568 screen without scrolling.
* **Installable** — `public/manifest.webmanifest` and the icons in `public/icons/` let members add it to their
  home screen. Regenerate the PNGs from `public/icons/icon.svg` if the mark changes.

## Admin

`/admin` is protected by `AdminProtectedRoute` (server re-validation of the session and role) and every
`/api/admin/*` endpoint checks `role = 'ADMIN'` from the database. Administrators see everything:

* **Overview** — live metrics and charts, plus a manual run of the inactivity cleaner.
* **Users** — search by name, username, email or phone; filter by role/status; open any member's complete
  record (all profile fields including hidden ones, photo, family links, connections, reports, activity);
  suspend / ban / reinstate / reset role / assign role / remove photo.
* **Connections** — every connection in every state, with message counts and full conversation transcripts.
  Each transcript view is recorded in the audit trail (`ADMIN_VIEWED_CONVERSATION`).
* **Moderation** — reports and automatically flagged unusual activity.
* **Audit trail** — live, filterable, append-only (a trigger rejects `UPDATE` and `DELETE`).

### Signing in as the administrator (username + password)

Admins can sign in with a **username** instead of an email. Two ways to create one:

* **Deployment environment (recommended for Vercel):** set `ADMIN_USERNAME` and `ADMIN_PASSWORD` in the
  project's environment variables. The account is created the first time you sign in with that username.
* **CLI:** `DATABASE_URL=… npm run create-admin -- <username>` with `ADMIN_PASSWORD` set in the shell
  (re-running resets the password).

Never commit the admin password. Sign-in is rate limited (10 attempts per username per 15 minutes).

## Security headers

`vercel.json` sends a Content Security Policy: scripts only from this origin plus `apis.google.com` (the helper
Firebase Auth loads for Google sign-in), frames only to Firebase and Google, connections only to this origin and
Google's identity endpoints. `server/index.ts` sends the same policy when self-hosting; keep the two in step.
If you add a third-party script, font or API, it must be added to the policy or the browser will block it.

## UI components

The primitives in `src/components/ui` follow shadcn/ui (Base UI flavour). The `shadcn` CLI is not a dependency;
run it when you need it — `npx shadcn@latest add <component>` — using the existing `components.json`. The state
variants those components rely on (`data-open:` …) live in `src/ui-variants.css`.

## Project layout

```
api/index.ts            Vercel entry → server/app.ts
server/app.ts           Express routes (auth, validation, error mapping)
server/actions/*        Business logic: matchmaking state machine, discovery, admin, chat, family, photos, cron …
server/migrations.ts    Idempotent SQL migrations, triggers and constraints
src/lib/schema.ts       Drizzle schema (source of truth for types)
src/lib/contracts.ts    zod request schemas + response DTOs shared by client and server
src/pages, components   React app; components/discover/* is the card deck, components/admin/* the admin suite
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
