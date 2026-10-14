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

0. **Use a strong administrator password.** The admin account can read every member's private data and
   conversations. A short numeric password is guessable despite rate limiting; use 16+ random characters and
   rotate it with `npm run create-admin`. Transcript access is audited, but a stolen admin session is still
   a full data breach.
1. **Password reset and email verification** for email/password accounts (needs an email provider).
2. **Content Security Policy `script-src`** — only framing/object restrictions are enforced today, to avoid
   breaking Firebase sign-in; add a full CSP after testing on the production domain.
3. Session tokens are stored in `localStorage`; consider httpOnly cookies with CSRF protection.
4. Chat uses 4-second polling; move to a realtime channel if usage grows.
5. Photos are stored in Postgres (≤ 1.5 MB each); move to object storage (e.g. S3/R2 with signed URLs) at scale.
6. Automated content moderation for photos and messages.

---

# Follow-up audit — October 2026

Scope: the repository at commit `8177f2d`, after the search page, dual-channel chat and admin preview were added.

## Findings

| # | Severity | Finding | Status |
|---|---|---|---|
| 17 | High | **Same-gender browsing.** `GET /api/seekers/search` honoured a `gender` query parameter from any member, so a seeker could list profiles of their own gender, bypassing the opposite-gender rule the feed enforces. | Fixed — `gender` is honoured for administrators only (preview); covered by `tests/discovery.test.ts`. |
| 18 | High | **Hidden fields could be inferred through search.** Filters and the keyword search matched columns the member had hidden (location, age, profession, bio, …). The value was stripped from the response, but the profile still appeared for "location = Pretoria", revealing it. Sorting by age leaked hidden ages the same way. | Fixed — every filter, the keyword search and the age ordering ignore hidden fields. |
| 19 | Medium | Keyword and location search passed `%` and `_` straight into `ILIKE`, so `%` matched everyone and patterns could be used to probe values. | Fixed — wildcards are escaped (one shared `escapeLike`). |
| 20 | Medium | Dismissing the report dialog (Cancel, Escape, clicking away) removed the profile from the list as if it had been reported. | Fixed — a profile is only removed after a report is actually submitted. |
| 21 | Medium | The shortlist lived in `localStorage` under one key for the whole browser: it was shared between accounts on the same device, lost on another device, and the "My Shortlist" tab only filtered the page of results already loaded, so its count and its contents disagreed. | Fixed — saves and passes are stored per member in `profile_reactions`. |
| 22 | Medium | Typing in the search box or an age field sent a request per keystroke with no ordering guarantee, so a slow earlier response could overwrite a newer one; a half-typed age ("2" on the way to "25") failed validation and replaced the results with an error. | Fixed — input is debounced, stale responses are discarded, and only complete ages are sent. |
| 23 | Medium | Chat: a poll that was in flight while the user switched between the family lounge and the direct chat was merged into the other room's message list, and the previous room's messages stayed on screen under the new tab until the switch finished loading. | Fixed. |
| 24 | Low | The "Deen Match" percentage returned a fixed 85% when there was no viewer, added points for *missing* data, and was clamped to 65–99%, so it never reflected a poor match. | Replaced by `src/lib/compatibility.ts`: compares only what both members shared and shows no score when there is too little. |
| 25 | Low | `vite.config.ts` still injected `GEMINI_API_KEY` into the client bundle (finding 15 was recorded as removed but the `define` had come back). | Removed. |
| 26 | Low | The admin user search claimed to cover usernames but did not; transcripts did not say which chat room a message was sent in. | Fixed. |
| 27 | Low | Documentation said chats close after 7 idle days; the code uses 3 (`STALE_CONNECTION_DAYS`). UI copy hard-coded "3". | Docs corrected; UI reads the constant. |
| 28 | Low | The profile detail dialog asked for `max-w-2xl` but the dialog primitive's `sm:max-w-sm` still applied, so it rendered 24rem wide on desktop. | Replaced by the new profile sheet. |
| 29 | Low | The page reserved bottom padding under the full-height chat screen, so it always scrolled slightly. | Fixed — full-height screens opt out of the padding. |

## Product change: Discover

The separate "Matches" (daily batch) and "Search" pages are now one **Discover** page with a swipeable card
deck (see the README). This deliberately reverses the original "no swiping" positioning. What keeps it
intentional is unchanged and still enforced on the server: the readiness gate, 5 pending requests and 3 active
chats at a time, 10 requests a day, recipient consent, wali approval and a mahram before any chat opens.

## New recommendations

7. **Read receipts / unread counts.** Navigation badges now show requests awaiting a decision, but there is
   still no per-message read state, so a new chat message is only visible inside the chat.
8. **Saved-profile notes.** Members shortlist people to discuss with family; a private note per saved profile
   would make that conversation easier.

## Mobile pass — October 2026

Every screen was checked for every role at 320×568, 360×740, 390×844, 430×932 and 768×1024 with touch
emulation, for sideways overflow, clipped labels and tap targets under 36 px.

| # | Finding | Status |
|---|---|---|
| 30 | The card deck did not fit phones shorter than about 700 px: the action buttons sat under the tab bar, and the "Saved" tab was clipped at 320 px. | Fixed — the deck is sized from shared layout variables and the card adapts to its own height. |
| 31 | Most controls were 25–32 px tall (buttons, tabs, inputs, filter chips, a 16 px show-password icon). | Fixed — shared controls grow to 40–44 px on touch devices; one-off controls were enlarged. |
| 32 | `<select>`, `<textarea>` and the chat box used 14 px text, which makes iOS Safari zoom the page on focus. | Fixed — 16 px on phones. |
| 33 | Chat room: banners and the room notice left about a third of a small screen for messages; the two room tabs wrapped or clipped; the header truncated the name to make room for three icon buttons. | Fixed — full-screen on phones, compact header with an overflow menu, short labels. |
| 34 | Wali dashboard tab labels overlapped at 320 px; the section heading collapsed to a sliver. | Fixed. |
| 35 | Admin tables (8 columns, 860–900 px minimum) were cut off on phones with no hint that they scrolled. | Fixed — one card per row below `md`. |
| 36 | The admin user list displayed seeded demo e-mail addresses and the demo password ("Live Testing Hint"). | Removed. It belongs in the README, not in a production screen. |
| 37 | Client-side navigation kept the previous page's scroll position, so a new page could open half-way down. | Fixed — each page starts at the top. |
| 38 | Request cards stacked a large avatar above the name on phones, pushing the actions off the first screen. | Fixed — avatar beside the name. |

Not verifiable in this environment: real iOS Safari (toolbar collapse, the on-screen keyboard, the home
indicator inset) and real touch drags on the deck. They were exercised with an emulated touch browser and a
simulated pointer; check them once on a physical iPhone and an Android phone before release.

## Completion pass — 13 October 2026

Work carried out on the items left open above.

| Item | Outcome |
|---|---|
| Production migration | `0004_profile_reactions` and `0005_chat_reads_and_saved_notes` applied to the Neon production database. Both are additive; row counts of every existing table were identical before and after, and a second run was a no-op. The code that uses them is **not deployed yet**. |
| Major upgrades | Express 4→5, Vite 6→8, `@vitejs/plugin-react` 5→6, TypeScript 5.8→7, Firebase 12→13, lucide-react 0.5→1, motion 12→14, dotenv 17→18, concurrently 9→10, `@types/node` 22→24 (matching the Node 24 runtime), `@types/express` 4→5. No source changes were needed beyond `import.meta.dirname` in `vite.config.ts`. |
| `shadcn` dependency | Removed. It was a runtime dependency (214 packages, including Babel) only so one stylesheet could be imported; the nine variants actually used now live in `src/ui-variants.css`. |
| `npm audit` | 4 high-severity advisories, all `@grpc/grpc-js` via Firestore, which this app never loads. Pinned to a patched release with an `overrides` entry; the audit is clean. |
| Recommendation 2 — CSP `script-src` | Done. Checked against the production build: no violations while signing up, uploading a photo, opening dialogs and starting Google sign-in (helper script, frame and sign-in window all load). |
| Recommendation 7 — unread counts | Done (`chat_reads`, navigation badge, per-conversation and per-room counts). Deliberately no read receipts: a member is not told whether their message was read. |
| Recommendation 8 — notes on saved profiles | Done. |
| Vercel hand-over under Express 5 | `api/index.ts` now answers malformed JSON itself, the JSON middleware honours the pre-parsed flag explicitly, and `tests/vercel-entry.test.ts` reproduces Vercel's buffered-body hand-over. |
| Navigation badges | Refresh the moment a chat is read or a request answered, instead of on the next 45-second tick. |
| Inactivity sweep | Ran four statements on every poll of the connections list; now at most once a minute per process. |
| Raw Firebase errors | Google sign-in failures the member can act on have plain-language messages. |
| Admin | The moderation queue opens a member's record by id instead of searching by e-mail; the user list reloads after an account is changed from the detail dialog. |

### Still outstanding

1. **Deploy.** The database is ahead of the deployed code, which is safe (the old code ignores the new tables),
   but members see none of this until it ships.
2. **Google sign-in on the production domain.** The policy was verified as far as a local address allows:
   Firebase rejects sign-in from an unregistered origin. Complete one real Google sign-in after deploying; if
   it fails, the browser console will name the directive to widen.
3. **A real iPhone and Android phone** — keyboard, home-indicator inset and touch drags were only emulated.
4. **Password reset and e-mail verification** — needs an e-mail provider (original recommendation 1).
5. **httpOnly session cookies** in place of `localStorage` (original recommendation 3). The new CSP reduces the
   exposure, since injected script is what makes `localStorage` tokens stealable, but it does not remove it.
6. Realtime chat instead of polling, object storage for photos, automated content moderation (original
   recommendations 4–6): each needs a service to be chosen.

