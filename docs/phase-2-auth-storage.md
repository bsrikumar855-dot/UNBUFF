# Phase 2: authentication, session ownership, durable storage

## What changed

**Authentication (Firebase Auth, email + password)**
- Frontend: official Firebase client SDK (`firebase`). Register, sign in, sign out, password reset, persisted sign-in (SDK default IndexedDB persistence), loading/validation/error states, a `/login` page, a `RequireAuth` layout route, and a "My sessions" page. Sign-out also clears in-memory claims and answers.
- Backend: `firebase-admin` verifies the ID token (`src/auth/verifier.ts`). Only the project id is needed; verification uses Google's public certificates, so authentication needs no service-account secret.
- `requireAuth` (`src/middleware/auth.ts`) reads `Authorization: Bearer <token>` and takes the uid **only** from the verified token. A uid in a body, query or header is ignored. Missing, malformed, oversized, invalid and expired tokens all get the same `401 UNAUTHENTICATED` response, which never echoes the token. Tokens are not logged.
- No password storage or crypto of our own. There is **no auth bypass**: local development uses a Firebase project or the Auth emulator, and tests inject a fake verifier.

**Ownership**
- Every new session stores `owner_uid`. All session operations (`confirm`, `interrogate`, `fix-task`, `report`, list, delete) check it in `AssessmentService.withSession`.
- Someone else's session, an unknown session and a **legacy session with no owner** all return the same `404 SESSION_NOT_FOUND`, so existence is never revealed and legacy data is exposed to nobody.
- Public (no token): `GET /api/health`, `/api/roles[/:roleId]`, `/api/demo/report`. The demo report is the synthetic CONTRACT §7 mock (a test asserts it has no `owner_uid` or `resume_text`).

**New endpoints** (documented in `CONTRACT.md`)
- `GET /api/sessions`: the caller's sessions, newest first (`session_id, role_id, mode, created_at, claims_total, claims_done`). `Cache-Control: no-store`.
- `DELETE /api/sessions/:sessionId`: `204`. Deletes the whole stored document: resume text, answers, grades, cached report content. Owner only.
- New error code `UNAUTHENTICATED` (401). `SESSION_NOT_FOUND` now also means "not yours".

**Storage**
- `SessionStore` gained `listByOwner(uid)` and `delete(id)`. `MemoryStore` (dev/tests) and `FirestoreStore` both implement them.
- Firestore documents are `{ json, owner_uid, updated_at }`. `owner_uid` is duplicated at the top level for a single-field equality query (no composite index needed). The copy inside `json` is the authority for access checks.
- Startup validation (`src/config.ts`): with `NODE_ENV=production`, `FIREBASE_PROJECT_ID` and `CORS_ORIGIN` are required, and `STORE=memory` is **rejected** unless `ALLOW_EPHEMERAL_STORE=true` (logged as a warning). The server will not silently run on ephemeral storage in production.

## Verification status (honest)

| Claim | Status |
|---|---|
| Token rejection, ownership, listing, deletion, legacy handling | Verified by automated tests against `MemoryStore` and a fake verifier |
| Firestore ownership/list/delete/legacy logic and restart behavior | Verified only against a **mocked** Firestore client (a second store instance over the same fake database sees the data). **Not verified against real Firestore.** |
| Real Firebase token verification | Not exercised end to end. The Admin SDK path was only shown to reject a garbage token. Needs a real project or the emulator |
| Frontend sign-in against real Firebase | Not exercised. Frontend tests use a fake `AuthClient` |
| "Sessions survive a restart in production" | **Not verified.** It depends on Firestore being provisioned and credentialed (below) |

## Required setup (not done for you)

### 1. Firebase project (`.firebaserc` default is `unbluff-promptwars`; confirm it is yours)
1. Firebase console > Build > Authentication > Get started > enable **Email/Password**.
2. Authentication > Settings > **Authorized domains**: add your deployed frontend domain.
3. Project settings > Your apps > add a **Web app**; copy its config values into the frontend env below.
4. Build > Firestore Database > create a database (Native mode) in your chosen region.
5. Firestore rules: the backend is the only client and uses the Admin credential, which bypasses rules. Set **deny-all** rules so browsers can never read sessions directly:
   `rules_version = '2'; service cloud.firestore { match /databases/{db}/documents { match /{document=**} { allow read, write: if false; } } }`

### 2. Backend environment (Render dashboard; placeholders only)
| Variable | Value |
|---|---|
| `NODE_ENV` | `production` (already in `render.yaml`) |
| `STORE` | `firestore` (now in `render.yaml`) |
| `FIREBASE_PROJECT_ID` | your Firebase project id |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | full service-account JSON for a service account with the **Cloud Datastore User** role (Firebase console > Project settings > Service accounts > generate key, or create a dedicated least-privilege account in Google Cloud). Secret, dashboard only. Never commit it |
| `CORS_ORIGIN` | your exact frontend origin(s), e.g. `https://<frontend-origin>` |
| `GEMINI_API_KEY`, `LLM_MODE`, model names | as before |

Cloud Run instead: `FIREBASE_PROJECT_ID=<id> CORS_ORIGIN=https://<frontend-origin> bash backend/scripts/deploy.sh`. The service identity is used for Firestore, so no JSON key is needed.

The next deploy will fail at startup until `FIREBASE_PROJECT_ID` is set (intended fail-fast). Existing in-memory sessions cannot be migrated: they are lost on that deploy regardless.

### 3. Frontend environment (build time)
`VITE_API_URL`, `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID` (see `frontend/.env.example`). These Firebase web values identify the project and are not secrets. With them blank the app runs, but sign-in shows "not configured".

## Local setup

Real Firebase project: fill the five frontend variables, set `FIREBASE_PROJECT_ID` in `backend/.env`, then:
```bash
cd backend && npm ci && LLM_MODE=mock STORE=memory PORT=8090 CORS_ORIGIN=http://localhost:5173 npm run dev
cd frontend && npm ci && cp .env.example .env && npm run dev
```
Auth emulator (no cloud project; not verified in this phase): set `VITE_FIREBASE_AUTH_EMULATOR_URL=http://127.0.0.1:9099`, fill the other `VITE_FIREBASE_*` values with any placeholders, start `npx firebase-tools emulators:start --only auth`, and start the backend with `FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099` (project id defaults to `demo-unbluff`; use the same id in the frontend).

## Legacy records (explicit, safe approach)
Documents written before this phase have no `owner_uid`. They are inaccessible to everyone (tests cover this), so nothing leaks. There is no automatic migration, because the original owner is unknowable. Options, all manual and operator-run:
1. **Leave them.** Harmless but they still hold resume text.
2. **Delete them** after a dry run: list documents in `unbluff_sessions` where `owner_uid` is absent (Firestore console or an Admin script that only prints ids first), review, then delete. Take a Firestore export first if you want a rollback.
3. **Claim them** only if an operator can establish ownership out of band: set `owner_uid` in both the top-level field and inside `json`.

On Render today the old store was in memory, so there are likely no legacy Firestore documents at all.

## Data retention (proposal, not enforced)
- Sessions are kept until the student deletes them (`DELETE /api/sessions/:id`) or an operator removes them.
- `updated_at` is stored on every write, so a Firestore **TTL policy** on a dedicated expiry field, or a scheduled cleanup job, can be added later. Suggested default: delete sessions not updated in 12 months, with a notice to students first. Nothing irreversible is configured here; choosing the period is a product/privacy decision.
- Account deletion (removing all of a user's sessions when they delete their Firebase user) is **not implemented**.

## Known limitations
- Deletion removes the Firestore document, but Firestore/GCP backups and logs are outside this app's control. Request paths are logged (they contain session ids); bodies, resume text and tokens are not.
- Token revocation is not checked on each request (it would need an Admin credential lookup per call). Tokens expire after about 1 hour.
- No email verification requirement, no social login, no per-user rate limiting (limits are still per IP and per instance).
- `listByOwner` loads and parses full session JSON per document; fine for small histories, wasteful at scale.
- The main frontend bundle grew from about 230 kB to about 407 kB (Firebase Auth in the entry chunk). Code-splitting the login flow would reduce it.
- The "Open report" action loads reports only; resuming an unfinished interview from history is not implemented.
- Local emulator flow is documented but unverified.
