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

## Security layers added before launch (22 October 2026)

Threat model, ranked by real risk for this app (an open sign-up in front of a paid language model and students' resumes):

| Risk | Before | Layer now |
| --- | --- | --- |
| Gemini bill run up by scripted accounts | 40 model requests/min **per IP**, no daily cap, open sign-up | **Per-student daily budget** (`LLM_DAILY_BUDGET`, default 150 model calls per UTC day), charged on every model call by a provider wrapper (so no route can bypass it), stored atomically in Firestore (`unbluff_llm_usage`, shared by every instance, TTL 2 days). Plus a per-student model rate limit (20/min) on top of the per-IP one, and a fast refusal on model-only routes once the budget is used. Over budget, reports still render (template text) and an open question can still be resumed. `GET /api/me/usage` and Settings show the allowance. |
| Unlimited throwaway / impersonating accounts | No email verification | **Verified email required** for every private route except the account ones (profile, usage, export, delete, sign out everywhere), so an unverified student can still see or erase their data. The link is sent at sign-up; the app shows a verify screen with resend (60 s cooldown) and re-check. `REQUIRE_EMAIL_VERIFICATION` (default true). |
| Stolen / old tokens keep working after password change, "sign out", or account deletion | Signature + expiry only (valid up to 1 h) | **Revocation guard**: tokens from before the account's `tokensValidAfterTime`, and tokens of deleted or disabled accounts, are refused. State is cached per student for 60 s (one Admin lookup per student per minute). **Sign out of all devices** in Settings. A password change signs other devices out; the device that changed it re-authenticates so it stays signed in (verified on the Auth emulator). If Firebase cannot be reached the guard allows verified tokens and logs an error (at most every 5 min): alert on it. |
| Unbounded storage of resumes | Unlimited audits per student, kept forever | **Cap** of `MAX_SESSIONS_PER_STUDENT` (50) audits, and **retention**: audits untouched for `SESSION_RETENTION_DAYS` (365) are deleted by a sweep that runs a minute after start and every 12 h. |
| Shared / lab computers | Always "remembered"; drafts in localStorage until sign-out | **"Keep me signed in on this device"** at sign-in. Off: Firebase keeps the session for the tab only and drafts go to sessionStorage, so closing the browser leaves nothing. |
| Information disclosure | `/api/health` named the model | The model is only reported outside production. |
| Unnoticed abuse | Ordinary request logs | **Audit events** (`jsonPayload.audit`): profile update, export, account deletion, sign out everywhere, revoked-token and unverified-email refusals, daily-limit hits, session-cap hits, retention deletions. uid only; never tokens, emails or content. |
| Stale dependencies | `npm audit` in CI only | **Dependabot**: weekly grouped npm updates for both apps, monthly GitHub Actions updates. |

Tested: `tests/integration/securityLayers.test.ts` (budget per call, per student, reset at UTC midnight, not reset by deleting data, no partial save when refused mid-turn, per-student rate limit, session cap, verification gate and its exemptions, revocation incl. deleted/disabled accounts, caching and fail-open throttling, retention, health, audit shape); `tests/emulator/security.emulator.test.ts` with the **real Admin SDK and Auth/Firestore emulators** (unverified tokens refused, sign-out-everywhere revokes real tokens, a deleted account's unexpired token is refused, the usage transaction never overshoots under concurrency, retention query); frontend `securityLayers.test.tsx`.

### Console steps that complete these layers (operator)

1. **Admin role for the backend's service account:** the revocation guard calls `getUser` / `revokeRefreshTokens`, so the account in `FIREBASE_SERVICE_ACCOUNT_JSON` (or the Cloud Run identity) needs **Firebase Authentication Admin** in addition to Firestore access. Without it the guard fails open and logs `revocation check unavailable`.
2. **Firebase Authentication → Settings:** turn on **email enumeration protection**; under **Authorized domains** keep only your production domain(s) (remove `localhost` for production); if your project offers a **password policy** (Identity Platform), require at least 8 characters so the client-side minimum cannot be bypassed through the REST API.
3. **Gemini key:** in Google Cloud → APIs & Services → Credentials, restrict the key to the Generative Language API; set a **quota cap** and a **billing budget alert**. The per-student budget limits each account; the quota caps the total.
4. **Firestore:** `firebase deploy --only firestore:indexes` also creates the **TTL policy** on `unbluff_llm_usage.expires_at`. Turn on point-in-time recovery or scheduled exports.
5. **Alerts:** log-based alerts on `severity>=ERROR`, on `jsonPayload.message="revocation check unavailable…"`, and on bursts of `jsonPayload.audit="llm.daily_limit_reached"` or `"auth.revoked_token_refused"`.
6. **Firebase App Check** (built in, off by default): in the Firebase console, App Check → register the web app with
   **reCAPTCHA Enterprise** and copy the site key. Build the frontend with `VITE_FIREBASE_APPCHECK_SITE_KEY=<key>`, deploy,
   set the backend's `APP_CHECK=monitor` and watch `jsonPayload.audit="appcheck.failed"` for a few days; when only
   scripts show up there, set `APP_CHECK=enforce`. Enforced, every API call except `/api/health` and GitHub's OAuth redirect
   needs a valid App Check token, and a failure is a 403 (`APP_CHECK_FAILED`), never a sign-out.

Closed since the first pass (22 October 2026, later):
- **Revocation can no longer be silently off in production.** At startup the backend proves it can use the Admin API (a
  lookup of a uid that cannot exist must answer "not found"). Missing credentials or a missing IAM role stop the process
  with a CRITICAL log naming the fix; a transient network failure is only logged.
- **The browser may only connect where it must.** The production build writes a `connect-src` policy into `index.html`
  from its own settings: this site, the `VITE_API_URL` origin, Firebase Authentication, and (only with App Check)
  reCAPTCHA and the App Check exchange. Browsers enforce it together with the hosting header, so the narrower list wins.
  A production build refuses a plain-http API URL or the Auth emulator. The hosting header now allows reCAPTCHA's script
  and frame (needed by App Check).

Residual: the per-minute rate limits are per instance (in memory); the daily budget, which is what bounds cost, is shared through Firestore.

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
