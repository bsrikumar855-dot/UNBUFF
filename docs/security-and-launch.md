# Security audit and launch checklist (22 October 2026)

This records what was checked before deploying UNBLUFF, what was found and fixed, what is proven by tests, and what only
the operator can do. It complements `production-readiness.md` (earlier state) and `phase-10-release-readiness.md` §9
(step-by-step deployment).

## Verdict

The application is **safe to deploy from a data-isolation and hardening point of view**, and a production-mode build
boots, validates its configuration and serves correctly. It is **not launchable until the operator completes the items under
"Before you launch"**, two of which are decisions only the owner can make: the company question data licence, and rotating
credentials that were pasted into chat during development.

## Data isolation between students

Model: every private record belongs to one student, and the owner is **only ever the uid of the verified Firebase ID
token**. A uid in a query string, header or body is ignored or rejected. Records are either keyed by the uid itself
(profile, plan, résumé, learn progress, LeetCode and GitHub connections, career preferences) or carry `owner_uid` and are
read through services that check it (sessions, mentor conversations and memories, code submissions, placement tasks,
DSA progress). Firestore is closed to browsers (`firestore.rules` denies everything); only the backend's Admin SDK touches it.

`backend/tests/integration/tenantIsolation.test.ts` proves it across every domain. Alice writes a unique canary string into
sessions, DSA progress, mentor conversation and memory, placement, career, LeetCode, résumé, learn progress and code
submissions. Then:

- Bob walks all 19 private read routes: none returns any of Alice's data, even with `?uid=alice`, `X-User-Id: alice`
  and similar spoofing.
- Bob tries Alice's record ids (report, session delete, conversation get/summary/delete/continue, memory patch/delete,
  submission get/delete): all refused (404/403), and Alice's data is intact afterwards.
- Bob's own "delete my data" calls never touch Alice's.
- A body that names another owner is rejected (400); normal writes land on the token's student.
- Every private route returns 401 for a missing, forged or wrong-scheme token.
- Private responses carry `Cache-Control: no-store`, so no shared cache can serve one student's response to another.
- Public routes (health, roles, learn content, catalogue, demo report, exercises) contain no student data, and the
  hidden test cases of a code exercise are never sent.

Frontend: code drafts are stored per uid and cleared on sign-out together with the in-memory audit state; nothing is
rendered with `dangerouslySetInnerHTML`; mentor markdown is rendered as text nodes.

## Findings fixed in this change

| Finding | Risk | Fix |
| --- | --- | --- |
| Authentication protected a hand-maintained list of path prefixes. A new route outside the list would silently be public. | A future leak by omission. | **Private by default:** everything not answered by an explicitly public router now requires a token (`app.ts`). A test proves an unknown path is 401 signed out and 404 signed in. |
| The static frontend host sent no security headers. | Clickjacking, MIME sniffing, no CSP. | `firebase.json` now sends CSP (self-only scripts, no framing, no plugins), `X-Frame-Options: DENY`, `nosniff`, referrer and permissions policies, COOP and HSTS. Verified in Chrome on a production build: zero CSP violations on the landing page (WebGL hero), sign-in, learn, DSA and the code editor. |
| Node's default 5 s keep-alive is shorter than a platform proxy's, which shows up as sporadic 502s. No process-level crash logging. | Reliability. | Keep-alive 65 s, bounded graceful shutdown (10 s), `unhandledRejection` and `uncaughtException` are logged with the redacting logger and exit so the platform restarts the process. |
| `render.yaml` lacked the GitHub, LaTeX, LeetCode and mentor variables. | A deploy would silently run without them. | Added (secrets as `sync: false`). |
| An intermittent CI failure on `main`. | Red CI hides real failures. | It was a real race in the learn page (a late progress load overwriting a saved mark); fixed with tests (PR 15). |

Already in place and re-verified: production refuses to start with mock sign-in, the mock model, in-memory storage, a
wildcard CORS origin, the Docker code runner or Docker LaTeX compiler; CORS allows only the configured origin; request bodies
are capped at 100 kB; errors are generic (no stack traces); the logger redacts tokens and keys; the container runs as the
unprivileged `node` user; `npm audit` reports 0 vulnerabilities (backend and frontend); no secret-shaped string exists in
the repository history.

## Not verified (cannot be from here)

- **Firestore store classes against a real or emulated Firestore.** The isolation test runs on the in-memory stores, which
  share the same service-layer ownership checks; the Firestore stores were reviewed (every list query filters by
  `owner_uid`, per-student documents are keyed by uid) and have their own emulator tests, but those need Java and are not
  run by CI. A non-blocking CI job was added for them.
- Real GitHub OAuth, Judge0 execution and the production Firebase project. See `production-readiness.md`.
- The signed-in screens' look on a phone and on real GPUs (the landing hero uses WebGL; it falls back cleanly without it).

## Addendum: continuity, account controls and a sign-out leak (22 October 2026, later)

Found by using the app as two students in a browser against the Firebase **emulators** (Auth + Firestore, live Gemini),
then fixed and covered by tests.

| Finding | Effect | Fix |
| --- | --- | --- |
| The claim ledger kept its session only in memory (`/ledger`). | Reloading the ledger after extraction showed "No session yet"; the extracted claims could not be reached again. | The ledger lives at `/ledger/:sessionId`, and a new read-only `GET /api/sessions/:id` (no LLM call) rehydrates it. |
| A reloaded workspace replaced the claim list with only the current claim (a stale closure in the turn handler), and rehydrated through the report, which can trigger LLM enrichment. | Claims vanished from the list; reloads could spend LLM calls. | Claims are merged in the reducer (`UPSERT_CLAIM`); the workspace rehydrates from `GET /api/sessions/:id` and resumes the open question first (free). |
| My sessions only offered "Open report", even for an unfinished session. | No way to continue a session after closing the tab or on another device. | Each session now has a `stage` (`review` / `interrogate` / `complete`) and a matching action (Review claims / Continue interview / Open report). |
| A long typed answer was lost on reload. | Lost work. | Unsent answers are kept as drafts under the signed-in uid, exactly like code drafts, and cleared on sign-out. |
| Signing out on a private page sent the sign-in screen the student's last address. | The **next** person to sign in on that browser was taken to the previous student's page (e.g. their session id). No data was served (ownership checks held), but the address leaked. | A deliberate sign-out now goes home with no return address. Token-expiry sign-outs still return the same student to their page. |
| "This session has expired" was shown for a deleted or another student's session. | Misleading. | Copy now says it could not be found and points to My sessions. |

New account controls (Settings): **profile** (display name, college, graduation year, target role) via
`GET/PUT /api/me/profile`; **change password** (current password re-checked by Firebase) and a reset email; **download
my data** (`GET /api/me/export`, every domain as stored, never GitHub tokens); and **delete my account and all data**
(`DELETE /api/me` with the typed phrase `DELETE MY DATA`). Deletion checks the password first, then removes data in every
domain (each step attempted even if one fails, idempotent, so a retry finishes the job), then deletes the Firebase
sign-in account. The cached profile is tagged with its uid and cleared on sign-out, so one student's name never shows for
another. `tenantIsolation.test.ts` now also covers the profile, the export and `DELETE /api/me`.

Verified in this pass: two-student isolation on every session route with real emulator tokens, persistence across a
backend restart (Firestore emulator), a production-mode boot (all new routes 401 without a token; CORS limited to the
configured origin; emulator hosts refused), `npm audit --omit=dev` 0 vulnerabilities for both apps, and the full emulator
suite (44 tests). The new Firestore collection `unbluff_profiles` is read by document id only, so it needs no index, and
`firestore.rules` already denies all browser access.

## Before you launch (operator)

1. **Rotate exposed credentials.** The Firebase service-account key and the GitHub OAuth client secret were pasted into a
   chat during development. Create a new service-account key, delete the old one, and generate a new GitHub client secret.
   Use new values in the host's dashboard only.
2. **Decide the company question data.** The company-wise list imported for development comes from a repository that
   declares no licence. Production deliberately refuses to serve it, so the DSA Arena shows only UNBLUFF's own practice
   pack (original exercises, no company data) until you supply licensed data (`DSA_CATALOGUE_PATH`, `CODE_SUITES_PATH`) or
   obtain permission.
3. **Create the production Firebase project.** Enable Email/Password, add the deployed domain under Authentication, set
   `FIREBASE_PROJECT_ID`, deploy `firestore.rules` and `firestore.indexes.json`.
4. **Backend (Render blueprint):** set `GEMINI_API_KEY`, `FIREBASE_SERVICE_ACCOUNT_JSON`, `CORS_ORIGIN` (the exact frontend
   origin), and, to enable GitHub, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_REDIRECT_URI` (https, exactly as
   registered), `GITHUB_FRONTEND_URL`, `GITHUB_TOKEN_ENCRYPTION_KEY` (`openssl rand -base64 32`). The free plan sleeps when
   idle; the app already shows a "waking up" notice, but use a paid plan for real users.
5. **Frontend:** build with `VITE_API_URL` set to the backend's **https** URL and the `VITE_FIREBASE_*` values, then
   `firebase deploy --only hosting`. The CSP allows any `https:` API origin; tighten `connect-src` to your API and the
   Google auth hosts once the domains are fixed.
6. **Code execution:** leave `EXECUTION_PROVIDER=none` (Run and Submit report "unavailable") until a Judge0 you control is
   verified (`npm run smoke:judge0`). The résumé PDF compiler is disabled in production for the same reason.
7. **Operations:** turn on Firestore backups/exports, set a log alert on `severity=ERROR`/`CRITICAL`, watch Gemini quota,
   and decide the retention periods in `MENTOR_*_RETENTION_DAYS`.
