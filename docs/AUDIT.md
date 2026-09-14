# NikahPath audit — September 2026

Scope: the full repository at commit `b0bc281` (Vite + Express API on Vercel, Drizzle/Neon, Firebase Auth).

## Findings in the original code

| # | Severity | Finding | Status |
|---|---|---|---|
| 1 | Critical | **No server-side authentication.** Every API route trusted a `firebaseUid` supplied in the body or query string, so anyone could read any profile, edit any account, create connections as anyone, and approve connections as any parent. | Fixed — every route requires a verified bearer token (HS256 session JWT or Firebase ID token verified against Google's JWKS); the acting user is loaded from the database. |
| 2 | Critical | `/api/users/seekers` and `/api/users/me` returned full user rows including **`password_hash`**, email and phone. | Fixed — explicit DTOs (`SelfUser`, `PublicProfile`); hidden fields are stripped server-side. |
| 3 | Critical | `PUT /api/users/profile` accepted `role`, allowing self-assignment of any role. | Fixed — role is only set during onboarding (never `ADMIN`) or by an admin. |
| 4 | High | `JWT_SECRET` fell back to a hard-coded string in production. | Fixed — production refuses to issue or verify tokens without a ≥ 32-char secret. |
| 5 | High | Parent approval did not check that the parent was linked to either party (`reviewConnection`). | Fixed — decisions are derived from the actor's verified relationship to the connection. |
| 6 | High | Chats, messages and photo consent still used Firestore while connections lived in Postgres, so chat never worked and Firestore rules were the only guard. | Fixed — chat and consent moved to Postgres behind authorised endpoints; Firestore removed. |
| 7 | High | No way to link a parent/wali to a seeker, so the parent workflow could never run. | Fixed — hashed, single-use, expiring invite codes with rate limiting. |
| 8 | High | Photo privacy was CSS blur only — the real photo URL was sent to every viewer. | Fixed — photos stored server-side; only a 24 px thumbnail is sent before mutual consent. |
| 9 | Medium | 3-chat limit counted only connections the user *sent*, and was checked non-atomically. | Fixed — database trigger with advisory locks covers both parties. |
| 10 | Medium | No duplicate protection for reverse-direction requests. | Fixed — unique index on the unordered pair. |
| 11 | Medium | Readiness module was a single "Start module" button that marked completion. | Fixed — real content with server-graded quizzes. |
| 12 | Medium | `ADMIN_EMAIL` promoted *password* sign-ups (unverified email), letting anyone who registered that address first become admin. | Fixed — only verified Google identities are bootstrapped; otherwise `make-admin` CLI. |
| 13 | Medium | No rate limiting on login/registration. | Fixed — Postgres-backed fixed-window limiter (works across serverless instances). |
| 14 | Medium | Express error handler was registered before the routes, so it never ran; Vercel body-parsing workaround duplicated auth logic in `api/index.ts`. | Fixed. |
| 15 | Low | `vite.config.ts` injected `GEMINI_API_KEY` into the browser bundle (unused dependency). | Removed. |
| 16 | Low | A 670 KB `nikahpath.zip` containing an old copy of the repo (including `.git`) was committed. | Removed from the tree (still in git history). |

The Firebase web `apiKey` in `firebase-applet-config.json` is a public identifier, not a secret; restrict it
in Google Cloud to your domains.

## Deliberate design decisions

* **Recipient consent is always required.** The brief allowed a SOLO recipient to go straight to `APPROVED`.
  That would let any member open a chat with, and fill the chat slots of, a SOLO user without their agreement,
  so `PENDING_FEMALE_PARENT` means "awaiting the receiving side": the recipient's acceptance, plus their wali's
  approval when they are `DEPENDENT` or vetted.
* `PENDING_MALE_PARENT` is the **sender-side** guardian stage; women may initiate too.
* `audit_logs.actor_id` is nullable: `NULL` records a system action (cron, automatic suspension expiry).
* `REJECTED` pairs cannot request again (the unique index excludes only `TERMINATED`); withdrawals and ended
  chats free the pair.
* The app remains Vite + Express rather than Next.js; "server actions" live in `server/actions/*` behind
  authenticated routes, sharing zod contracts with the client.

## Outstanding recommendations

1. **Password reset and email verification** for email/password accounts (needs an email provider).
2. **Content Security Policy `script-src`** — only framing/object restrictions are enforced today, to avoid
   breaking Firebase sign-in; add a full CSP after testing on the production domain.
3. Session tokens are stored in `localStorage`; consider httpOnly cookies with CSRF protection.
4. Chat uses 4-second polling; move to a realtime channel if usage grows.
5. Photos are stored in Postgres (≤ 1.5 MB each); move to object storage (e.g. S3/R2 with signed URLs) at scale.
6. Automated content moderation for photos and messages.
