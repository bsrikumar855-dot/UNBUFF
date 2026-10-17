# Phase 10: End-to-end integration and release readiness

Date of the run: 2026-10-17. Scope: validate and stabilise what Phases 1 to 9 built. No product features were added.
Nothing was committed, pushed, deployed or created in any cloud project. No secret value was printed or written to a file.

## Verdict

**Not ready for production release.** No critical defect is known in the application code, and everything that can be proven locally passes. But the four things a real release depends on were **not verified against the real service**, because the configuration for them does not exist on this machine: the code-judging service (Judge0), a Firebase project (sign-in and Firestore), GitHub OAuth, and durable AI-mentor storage. Until an operator completes the steps in "Operator actions", those paths are BLOCKED, not passing.

## Status legend

| Label | Meaning |
|---|---|
| PASS | Verified against the real service with real configuration |
| LOCAL PASS | Verified on this machine with real code and no external service |
| EMULATOR PASS | Verified against the Firebase Auth/Firestore emulators (local; **not** proof about a real project) |
| MOCK PASS | Verified with a stand-in for the dependency (deterministic provider, scripted GitHub, mock model). Proves wiring and logic only |
| BLOCKED | Not run, because a named dependency is missing |
| FAIL | Run and failed |

## Summary

| Area | Status | Blocking dependency |
|---|---|---|
| Baseline (install, lint, typecheck, tests, coverage, build) | LOCAL PASS | none |
| Judge0 code execution | **BLOCKED** (logic: MOCK PASS) | no `JUDGE0_URL` / token, `EXECUTION_PROVIDER_VERIFIED` unset |
| Firebase Auth and Firestore, real project | **BLOCKED** (EMULATOR PASS) | no Firebase project credentials; CLI not logged in |
| AI mentor, live model | **PASS** for the live request path, memory logic and failure handling | none for the model |
| AI mentor, durable storage | **BLOCKED** | real Firestore (see above) |
| GitHub OAuth and GraphQL | **BLOCKED** (logic: MOCK PASS) | no OAuth app, no `GITHUB_*` variables |
| End-to-end student journey | LOCAL PASS and MOCK PASS (policy variants); live run BLOCKED | Judge0, Firebase project, GitHub app |
| Authentication on every route | LOCAL PASS | none |
| Security review | 3 findings fixed, remaining items documented below | n/a |
| Deployment configuration | gaps documented, **not changed** | operator |

## 1. Baseline

All commands run from a clean tree (HEAD `e7cd091`), Node v24.13.1, npm 11.8.0. Final numbers are from the last run, after all Phase 10 changes.

| Command | Exit | Result |
|---|---|---|
| backend `npm ci` | 0 | installed from lockfile |
| backend `npm run lint` | 0 | clean |
| backend `npm run typecheck` | 0 | clean |
| backend `npm run test:coverage` | 0 | 54 files, **843 tests passed**; statements 90.08 %, branches 84.66 %, functions 89.43 %, lines 92.28 % |
| backend `npm run build` | 0 | clean |
| backend `npm run indexes:check -- --config-only` | 0 | 1 composite index defined and consistent |
| backend `npm run test:emulator` | 0 | 9 files, **34 tests passed** (Firestore and Auth emulators, local) |
| backend `dsa:validate -- data/dsa/practice-pack.json` | 0 | 10 questions, own work |
| frontend `npm ci` | 0 | installed from lockfile |
| frontend `npm run lint`, `typecheck`, `build` | 0, 0, 0 | clean |
| frontend `npm test -- --run` | 0 | 15 files, **199 tests passed** |
| backend `npm audit --omit=dev` | 0 | 0 vulnerabilities |
| backend `npm audit` (with dev) | 1 | 1 high: `source-map-js` (build toolchain only, not shipped) |
| frontend `npm audit --omit=dev` | 1 | 2 moderate: `react-router` 6.x (see security finding S5) |

Notes:

* `npm run dsa:validate` with no argument fails because it expects a catalogue path. That is the script's design, not a defect; give it a file.
* `npm run grade-check` is a **live** script: it called the real Gemini model six times with synthetic answers and passed 6/6. It is not part of the unit suite.
* Phase 10 added 16 backend tests (827 to 843): 4 route-authentication, 5 journey, 6 link-safety, 1 production-config.

## 2. Judge0 (code execution): BLOCKED

* **Evidence:** `backend/.env` defines no `JUDGE0_*` or `EXECUTION_*` variable. No request was sent to any execution service.
* **What is proven (MOCK PASS):** the provider contract, timeouts, limits, hidden-test non-disclosure, the rule that only verified, non-mock results reach analytics, and the exclusion statuses (`excluded_mock_execution`, `excluded_unverified_provider`), all against a deterministic stand-in.
* **Not proven:** that a real Judge0 compiles and runs code, enforces limits, and returns the fields the adapter expects.
* `EXECUTION_PROVIDER_VERIFIED` was **not** set and must not be set until the smoke test below passes against the real service and the operator decides it is verified. Student code is never run on the app server, and no execution URL can come from a client.
* **Operator steps:** set `JUDGE0_URL` (and token variables per `backend/.env.example`) for a **non-production** Judge0, run `npm run smoke:judge0` from `backend`, read every line of its output, and only then set `EXECUTION_PROVIDER_VERIFIED=true` by hand.

## 3. Firebase Auth and Firestore: BLOCKED (EMULATOR PASS)

* **Evidence:** `.firebaserc` names a default project, but the Firebase CLI reports no authorised account, `backend/.env` has no `FIREBASE_*` variable, and `frontend/.env` has no Firebase web configuration. No real project was contacted and nothing was created or deployed.
* **EMULATOR PASS:** 34 emulator tests (stores, ownership, ordering, the composite index query path, deletion). The Auth emulator was also used with the smoke script (section 6). An emulator does **not** prove production IAM, quotas, real index builds, latency, or token verification against Google's public keys.
* **Operator steps** (in a non-production project):
  1. Create or choose the project; put its id in `FIREBASE_PROJECT_ID`; provide credentials (`FIREBASE_SERVICE_ACCOUNT_JSON` or a cloud identity).
  2. Add the web app configuration to the frontend build (`VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, … see `frontend/.env.example` and `frontend/src/auth/firebaseClient.ts`).
  3. Deploy the index and the rules with explicit authorisation: `firebase deploy --only firestore --project <id>`. The composite index is `unbluff_code_submissions (owner_uid ASC, created_at DESC)`. Wait for it to become READY.
  4. Run `npm run indexes:check` (without `--config-only`) against the project.
  5. Start the backend with `STORE=firestore`, perform the journey, **restart the backend**, and confirm the data is still there.

## 4. AI mentor against the live model: PASS (live path), BLOCKED (durable storage)

Run with `npx tsx scripts/live_ai_check.ts` (new, operator tool). It sends a handful of short **synthetic** messages through the real `GeminiProvider` with the key already in `backend/.env`. It prints only PASS/FAIL lines. Storage is in memory.

Run twice; **17/17 checks passed** both times (model `gemini-3.1-flash-lite`):

* a live, non-empty, non-mock reply; the conversation was stored;
* memory provenance is set by the application, never by the model;
* a saved memory is retrieved in a separate conversation;
* a second student's context contains none of it; the second student cannot list or read the first student's conversation;
* a deleted memory is no longer retrieved;
* prompts contain no API key; the verified-activity block says no verified practice exists (nothing was invented);
* a provider timeout becomes `LLM_TIMEOUT`; an invalid key becomes a handled `LLM_INVALID_OUTPUT`, not a crash;
* logs contain neither the API key nor the student's message text.

Not proven: durable persistence (needs real Firestore), behaviour under sustained load, and cost.

## 5. GitHub OAuth and GraphQL: BLOCKED (MOCK PASS)

* **Evidence:** no `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_REDIRECT_URI` or `GITHUB_TOKEN_ENCRYPTION_KEY`. No call was made to github.com.
* **MOCK PASS:** state and PKCE handling, token vault (AES-256-GCM), refusal of wrong or reused state, no-scope request, sync normalisation, privacy of the data given to the mentor, disconnect and deletion, against scripted responses.
* **Not proven:** the real authorisation redirect, the real token exchange, the real GraphQL schema and rate limits.
* **Operator steps:** create a **non-production** GitHub OAuth App; callback URL `https://<api-host>/api/github/oauth/callback`; request **no scopes** and no write access; set all four `GITHUB_*` variables (generate the encryption key with a secure random generator, 32 bytes); connect with a test account; sync; disconnect; confirm the token is gone from storage.

## 6. End-to-end student journey

Two layers, deliberately separate.

**Automated: `backend/tests/integration/e2eJourney.test.ts` (5 tests).** Real HTTP API (supertest), real services, in-memory storage, test sign-in verifier, mock mentor model, and a stand-in code judge whose verdict is chosen by a marker word. The stand-in is allowed to count **only** in the first test, through the test-only `allowMockToCount` switch that production never enables.

| Step | Result |
|---|---|
| 1 Sign in | no token gives 401; with a token the dashboard asks for a profile |
| 2 Goals, timeline, availability | profile saved |
| 3 Plan from real content | the diagnostic and Lab tasks point at questions and exercises that exist in the catalogue |
| 4 Open an exercise | only the public projection is returned; the hidden-test count is shown, the cases are not |
| 5 Edit and run | a sample run is not stored and not counted |
| 6 Judged submission (wrong, then correct) | stored for the owner, no expected output disclosed |
| 7 Analytics | only eligible attempts are counted |
| 8 Revision | the question is queued once, never duplicated; the diagnostic task completes from the record; refreshing again adds nothing |
| 9 GraphQL Lab | a passed exercise completes its task and unlocks the next |
| 10 Mentor memory | a statement is remembered, retrieved in a separate conversation, and the verified-activity block reflects the real judged work |
| 11 Planner and assistant | the assistant answers from the application's own numbers; skill evidence is marked `verified` |
| 12 Plan changes | postpone, daily-minutes change and its logged reason |
| 13 Isolation and deletion | a second student sees none of it (404/empty); deleting planner data leaves practice records alone; a deleted memory is not retrieved |

Other tests in the same file:

* **Production policy:** a mock-executed accepted submission is `excluded_mock_execution`; it is not counted, creates no revision item, does not complete the task, and the dashboard says the result was excluded. DSA skills stay at "no estimate".
* **Unverified provider:** the same exclusion (`excluded_unverified_provider`), and the planner marks the task as self-attested.
* **No execution service configured:** judging answers `503 EXECUTION_UNAVAILABLE`, the planner schedules no DSA work, interview and Lab work still plan.
* **GitHub disconnected:** nothing breaks, no project task is planned, and the limitation is shown as informational.

Classification: **MOCK PASS and LOCAL PASS**. A genuine, all-live run is **BLOCKED** by Judge0, a Firebase project and a GitHub app. Mock achievements are never merged into real analytics: that is exactly what the production-policy tests assert.

**Smoke script: `backend/scripts/smoke.sh`.** It had no sign-in support, so it failed with 401 since Phase 2 (defect, fixed: `AUTH_TOKEN` is now supported and a 401 prints a hint). Verified two ways: without a token it stops with HTTP 401 and the hint; with a throwaway user on the **local Auth emulator** it completed ("readiness 59 to 70, SMOKE OK") against the mock model and in-memory store. EMULATOR PASS and MOCK PASS only.

**Route authentication audit: `backend/tests/integration/routeAudit.test.ts` (4 tests).** Reads every route from the route source files (at least 72), so a route added later is audited automatically. Every private route returns `401 UNAUTHENTICATED` for a missing header, a bare `Bearer`, an invalid token, Basic auth and an expired token, with no stack, Firebase or token detail. The 12 intentionally public routes are listed explicitly and checked to exist and to answer.

## 7. Security and privacy review

### Fixed in this phase

| # | Severity | Finding | Fix |
|---|---|---|---|
| S1 | **High** (when misconfigured) | If `FIREBASE_AUTH_EMULATOR_HOST` were set in a production environment, the Firebase Admin SDK would accept **unsigned** tokens: anyone could sign in as anyone. Nothing stopped the server from starting that way. | `loadConfig` now refuses to start with `NODE_ENV=production` if `FIREBASE_AUTH_EMULATOR_HOST` or `FIRESTORE_EMULATOR_HOST` is set. Test added. |
| S2 | Low (defence in depth) | Links taken from GitHub responses were only checked as "some URL", so a `javascript:` or other-host link would have been stored and rendered in an `href`. GitHub is trusted, but the check cost nothing. | All four link fields now require `https://github.com/...`. Test added (6 cases). |
| S3 | Medium (missing control) | No Firestore security rules were in the repository. The browser never reads Firestore (the app uses Firebase Auth only on the client; all data goes through the backend's Admin SDK, which ignores rules), but a project left in an open mode would expose every collection, including GitHub connections and mentor memory, to anyone with the web config. | Added `firestore.rules` denying all client access, and referenced it in `firebase.json`. **Not deployed.** Operator must deploy it (section 3). Not verified against a real project. |

### Checked and found sound

* Every private route requires a verified token (audit above); public routes are limited to non-student data and GitHub's redirect.
* `helmet` is on; request bodies are limited to 100 kB; `x-powered-by` is off; production refuses `CORS_ORIGIN=*` and refuses to start without a Firestore store.
* Rate limiting: a global limiter plus specific limiters on model-calling, code, GitHub, Lab and planner routes.
* Logging: the request log records method, path, status and duration only (never headers, bodies or query strings, so the OAuth `code` and `state` are never logged). The logger redacts keys, tokens, `code`, `state`, PKCE verifier and client secret. The live check confirmed the key and message text do not reach logs.
* Error responses use one contract shape; unhandled errors return a generic message with no stack or internal detail.
* Hidden test cases are never in an API response (journey test asserts the exact field list); sample runs are not stored; student code is never run on the app server.
* No client-supplied execution or GitHub URL is accepted; the OAuth authorise URL is checked again in the browser before redirecting.
* Mentor: student text and GitHub text are given to the model as data; the application, not the model, sets memory provenance; one student's context never contains another's.
* Frontend: no `dangerouslySetInnerHTML`; external links use `rel="noopener noreferrer"` (GitHub links use `noreferrer`, which implies it); the post-sign-in return path (`from`) comes only from in-app router state, not from a query parameter.
* `.env` files are git-ignored and not tracked. No secret was found in tracked files.

### Open findings (documented, not fixed)

| # | Severity | Finding | Evidence | Remediation |
|---|---|---|---|---|
| S4 | Low | Backend dev dependency `source-map-js` has a high advisory (denial of service when processing crafted source maps). Build and test tooling only; `npm audit --omit=dev` shows 0. | `npm audit` | Update the tooling chain when a compatible release exists. |
| S5 | Low (not exploitable in current code) | Frontend `react-router` 6.x has two moderate advisories: an open redirect via a backslash in `Link`/`useNavigate` input, and an SSR hydration issue. The fix is a **breaking** upgrade to v7.18+. Not exploitable here: no navigation target is built from URL parameters or user input (`from` is router state set by the app), and there is no server-side rendering. | `npm audit --omit=dev`; code search of every `navigate`/`Navigate`/`window.location` use | Plan the v7 upgrade as its own change with the frontend tests. |
| S6 | Info | Frontend dev-only advisories (`braces` high, `esbuild`, `@vitest/mocker`, `postcss-selector-parser`). Not shipped. | `npm audit` | Update with the toolchain. |
| S7 | Medium (operational) | Firestore rules, indexes and CORS origin are **not verified** against a real deployment. | section 3 | Operator steps in section 3. |
| S8 | Medium (operational) | The GitHub token vault key (`GITHUB_TOKEN_ENCRYPTION_KEY`) has no rotation procedure. Losing or changing it makes all stored GitHub tokens unreadable (students must reconnect). | `src/github/vault.ts` design | Document an operator rotation procedure (re-encrypt or force reconnect) before enabling GitHub in production. |
| S9 | Low | No data-retention or backup policy for Firestore data (submissions, mentor memory, plans). Students can delete their data through the API, but there is no time-based expiry. | no such code or config | Decide retention periods and enable Firestore backups/PITR in the project. |

No finding above is critical. S1 would have been critical in a misconfigured production; it is now blocked at start-up.

## 8. Deployment readiness

Reviewed only; **no production configuration was changed and nothing was deployed.**

| Item | State |
|---|---|
| `.gitignore` | ignores `node_modules`, `dist`, `coverage`, `.firebase`, `.env`, `.env.*` (keeps `.env.example`), logs, `*.tsbuildinfo`. `git status` shows no env file, log or build output. |
| `backend/.env.example` | already lists names (no values) for `JUDGE0_*`, `EXECUTION_*`, `GITHUB_*`, `MENTOR_*`; no change needed |
| `render.yaml` | **gap:** no `GITHUB_*`, no `JUDGE0_*`/`EXECUTION_*`, no `MENTOR_*`. Add them as `sync: false` entries before enabling those features. Code judging stays off without them (safe default). |
| `backend/scripts/deploy.sh` (Cloud Run) | **gap:** same missing variables; secrets (`GITHUB_CLIENT_SECRET`, token key, Judge0 token) should come from Secret Manager like `GEMINI_API_KEY` |
| CI (`.github/workflows/ci.yml`) | runs lint, typecheck, coverage and build for both apps on Node 20 (matches `engines: >=20`; local runs used Node 24, so a Node 20 run on CI is the first proof for 20). **Gap:** no emulator tests, no `indexes:check`, no `npm audit` step. |
| Firestore index | one composite index in `firestore.indexes.json`; must be deployed and READY before code submissions are listed in production |
| Firestore rules | `firestore.rules` (deny all) added; must be deployed by the operator |
| Frontend | needs `VITE_API_URL` and the Firebase web configuration at build time; local `frontend/.env` has only `VITE_API_URL` |
| Hosting | `firebase.json` serves `frontend/dist` with an SPA rewrite and a long cache for `/assets/**` |
| Monitoring | JSON logs with Cloud Logging severity; health at `/api/health`. No alerting is configured in the repository. |

## 9. Operator actions required (in order)

1. Choose a **non-production** Firebase project; supply credentials and the web configuration; do not use production data.
2. With explicit authorisation, deploy the index and rules (`firebase deploy --only firestore --project <id>`); wait for READY; run `indexes:check` without `--config-only`.
3. Run the backend with `STORE=firestore`; perform the journey; restart; confirm persistence (also closes the mentor-storage gap).
4. Provide a non-production Judge0; run `npm run smoke:judge0`; read the output; set `EXECUTION_PROVIDER_VERIFIED=true` yourself only if it is correct.
5. Create a non-production GitHub OAuth App (no scopes); set the four `GITHUB_*` variables; connect, sync, disconnect with a test account.
6. Add the missing variables to `render.yaml` / `deploy.sh`; add emulator tests, `indexes:check` and an audit step to CI.
7. Set a real `CORS_ORIGIN`, confirm `NODE_ENV=production` start-up passes, and confirm no emulator variable is set.
8. Decide retention, backups, key rotation (S8, S9) and alerting.
9. Plan the `react-router` v7 upgrade (S5).

## 10. Remaining release blockers

1. Judge0 is unverified: until it is, DSA submissions cannot count as achievements in production (by design; this is the safe state, not a malfunction).
2. Firebase sign-in and Firestore are unverified against a real project (including index, rules, restart persistence).
3. GitHub OAuth is unverified against GitHub.
4. Production deployment files lack the variables for features 1 and 3, and CI lacks emulator/index/audit steps.
5. No retention/backup/rotation procedures (S8, S9).

There are no known critical code defects. Blockers 1 to 3 need external configuration that this environment does not have; they are not fixable by code changes.

## 11. Changes made in this phase

* New: `backend/tests/integration/e2eJourney.test.ts`, `routeAudit.test.ts`, `backend/tests/github/urlSafety.test.ts`, `backend/scripts/live_ai_check.ts`, `firestore.rules`, this report.
* Modified: `backend/scripts/smoke.sh` (sign-in support), `backend/tests/placement/harness.ts` (optional real code service with a stand-in provider), `backend/src/config.ts` (production refuses emulator addresses), `backend/tests/unit/authConfig.test.ts`, `backend/src/github/queries.ts` (link check), `firebase.json` (rules entry).
* Not done, by instruction: commit, push, deploy, cloud resource creation, production data changes, setting `EXECUTION_PROVIDER_VERIFIED`.

---

# Phase 10.1: Live integration verification (2026-10-17)

Starting point: HEAD `b9ac2f3`, clean working tree, 11 commits ahead of `origin/main`. Nothing was committed, pushed, deployed or created; `EXECUTION_PROVIDER_VERIFIED` was not touched. No secret value was printed.

## What is actually configured

Checked by variable **name and whether it has a value** only (in `backend/.env`, `frontend/.env` and the process environment), plus the Firebase CLI login state, Google Application Default Credentials file, and a local Judge0 port probe.

| Service | Configured? | Evidence |
|---|---|---|
| AI model (Gemini) | **Yes** | `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL` have values (`LLM_MODE=mock` in `.env`; the live check builds the real provider directly) |
| Judge0 | **No** | no `EXECUTION_PROVIDER`, `JUDGE0_URL` or token; nothing listening on 127.0.0.1:2358; Docker not installed |
| Firebase Auth / Firestore | **No** | no `FIREBASE_*` variable; Firebase CLI: "No authorized accounts"; no Application Default Credentials file; frontend has no `VITE_FIREBASE_*`; `STORE=memory` |
| GitHub OAuth | **No** | no `GITHUB_*` variable |

An example file listing a name was not treated as configuration.

## Results

| Area | Status | Detail |
|---|---|---|
| Judge0 (Python, C++, Java, JavaScript, error handling, genuine accepted submission) | **BLOCKED** | `npm run smoke:judge0` refused to run (exit 2): `EXECUTION_PROVIDER` must be `judge0` and `JUDGE0_URL` is required. No request was sent. Provider flag left unverified. |
| Firebase Auth, token verification, Firestore, isolation, persistence, index | **BLOCKED** (live). EMULATOR PASS from Phase 10 (34 tests) | no project, credentials or login. Nothing created or deployed. |
| AI mentor, live model | **PASS** | `npx tsx scripts/live_ai_check.ts`, exit 0, 17/17 checks, model `gemini-3.1-flash-lite`: a real non-empty (752 characters) non-mock reply; memory saved with application-set provenance; retrieved in a separate conversation; second student sees none of it and cannot read the first student's conversation; deletion honoured; prompts and logs contain neither the key nor the message text; timeout and bad key handled. Synthetic data only. |
| AI mentor, persistence across restarts / real storage | **BLOCKED** | the check uses in-memory storage; durable persistence needs real Firestore |
| GitHub OAuth callback, state, token exchange, GraphQL, rate limits, disconnect | **BLOCKED** (MOCK PASS from Phase 7/10) | no OAuth app. With no `GITHUB_*` variables the integration stays disconnected; this is covered by the configuration tests. |
| End-to-end journey | **LOCAL PASS / MOCK PASS only** | cannot be run live: it needs Judge0 (real judged submissions), Firebase (real sign-in and storage) and GitHub. It is not claimed as verified. |
| Regression after this phase | **LOCAL PASS** | no code changed; backend 54 files / 843 tests passed; frontend 15 files / 199 tests passed |

Commands run: `git status`, `git rev-list --count origin/main..HEAD`, `npx firebase-tools login:list`, a local port probe, `npm run smoke:judge0` (refused), `npx tsx scripts/live_ai_check.ts` (17/17), `npm test` in backend and frontend.

## Genuinely verified so far

* The live Gemini request path, structured output, memory rules, isolation between two students, deletion, failure handling and log hygiene (against the real model, in-memory storage).
* Everything in the Phase 10 local, emulator and mock results.

## Not verified (operator must act)

Nothing about Judge0, Firebase, GitHub or the full journey has been verified against a real service. Required, in this order, all in **non-production** services (exact steps are in section 9 above):

1. **Judge0:** run
   `EXECUTION_PROVIDER=judge0 JUDGE0_URL=https://<your-judge0-host> JUDGE0_AUTH_TOKEN=<token> npm run smoke:judge0` from `backend`, read the output for all four languages, then decide yourself whether to set `EXECUTION_PROVIDER_VERIFIED=true`.
2. **Firebase:** log in (`firebase login`), choose a non-production project, supply `FIREBASE_PROJECT_ID` and credentials and the `VITE_FIREBASE_*` web config; with your authorisation run `firebase deploy --only firestore --project <id>` (index and deny-all rules); `npm run indexes:check`; run with `STORE=firestore`, repeat the journey and restart the server to prove persistence.
3. **GitHub:** create a non-production OAuth App (no scopes; callback `https://<api-host>/api/github/oauth/callback`), set the four `GITHUB_*` variables, then connect, sync and disconnect with a test account.
4. Then re-run this phase to turn the BLOCKED rows into PASS and run the full journey live.

---

## Phase 10.1 update: Firebase verified live (2026-10-17)

Operator created a **non-production** project (`unbluff-test-babus01-91131`), enabled Email/Password sign-in, created the Firestore database, and deployed `firestore.indexes.json` and `firestore.rules` (deny-all) with `firebase deploy --only firestore`. The backend used the operator's Application Default Credentials.

| Area | Status | Evidence |
|---|---|---|
| Composite index (`unbluff_code_submissions`) | **PASS** | `FIREBASE_PROJECT_ID=... npm run indexes:check`: first FAILED_PRECONDITION (index building), then PASS once built |
| Firebase Auth, token verification, Firestore reads/writes, ownership isolation, durable persistence, deletion | **PASS** (23/23 checks) | `FIREBASE_PROJECT_ID=... npx tsx scripts/live_firebase_check.ts` (new): two throwaway real users; no, malformed and broken-signature tokens refused (401); real ID token accepted; memory, profile and a 4-task plan written to real Firestore; second student could not see, change or delete them; **all data still present after a backend restart**; deletion honoured; logs contain no token, password or test text; both users deleted. |
| AI mentor durable storage | **PASS** for memory persistence on real Firestore (model replies remain mock in this run; the live model was verified separately) | same run |
| Firestore rules | deployed and compiled; the deny-all effect against a direct client was **not** tested | |

Still BLOCKED: Judge0 and GitHub OAuth. The full live journey also needs those, so it remains not fully verified. Not tested live: sign-in through the frontend UI, and the production `CORS_ORIGIN` / `NODE_ENV=production` start-up.

---

## Phase 10.1 update: GitHub OAuth and GraphQL verified live (2026-10-17)

Operator registered a **non-production** GitHub OAuth App (single exact callback `http://localhost:8094/api/github/oauth/callback`, no wildcard, no device flow) and set the four `GITHUB_*` variables in `backend/.env`. Port 8080 was occupied by an unrelated Windows service, so the callback uses 8094. The check used the real test Firebase project and one throwaway Firebase user (deleted afterwards). The operator authorised in the browser with their own GitHub account.

`FIREBASE_PROJECT_ID=... npx tsx scripts/live_github_check.ts` (new; interactive): **PASS, 30 of 30 checks**.

| Area | Status | Evidence |
|---|---|---|
| Authorisation address | **PASS** | github.com authorise URL with this app's client id and callback, a one-time state, PKCE S256, **no scope**, no secret |
| State validation | **PASS** | a forged state and a callback with no parameters were handled (302), nothing connected |
| Real callback and token exchange | **PASS** | after the operator authorised, status became `connected`; access reported `public_only` |
| Token storage | **PASS** | credential record exists and contains no readable token; connection record owned by the student; no leftover state records |
| Authenticated GraphQL sync | **PASS** | outcome `synced`; contributions, repositories (30) and activity returned; all repository links `https://github.com/...` |
| Rate-limit handling | **PASS** (partial) | GitHub's remaining allowance was read (4977); an immediate second sync was served from cache (minimum interval). A real rate-limit **exhaustion** was not provoked. |
| Privacy | **PASS** | no response, stored record or log contained a token, the client secret, the encryption key or the authorisation code |
| Disconnect | **PASS** | status back to disconnected; credential, connection and synced data deleted; reads refused afterwards; `revoked_at_github=true` |

Not tested live: a second student connecting the same GitHub account (conflict handling), token expiry/refresh, the key-rotation path, a production HTTPS callback, and the frontend click-through (the browser went to a frontend address with nothing listening).

Remaining BLOCKED: **Judge0**. Because of it, the full live journey (real judged submissions feeding progress, analytics, revision and the plan) is still not verified.

---

## Phase 10.1 update: Judge0 and judged submissions verified live (2026-10-17)

Service used: Judge0's **public community instance** `https://ce.judge0.com` (no credential), chosen by the operator for testing. It is a shared third-party service, so this proves the adapter against a real Judge0 and **does not** verify any production deployment. `EXECUTION_PROVIDER_VERIFIED` was **not set** by anyone or anything in this phase.

| Area | Status | Evidence |
|---|---|---|
| Judge0 protocol, languages, execution, compile errors | **PASS** (operator run) | `EXECUTION_PROVIDER=judge0 JUDGE0_URL=https://ce.judge0.com npm run smoke:judge0`: 71 languages; Python, JavaScript, C++, Java resolved and each printed the expected output; invalid C++ and Java reported as compile errors; `RESULT: PASS` |
| Real judged submissions against a first-party suite | **PASS** (30 of 30 checks) | `JUDGE0_URL=https://ce.judge0.com FIREBASE_PROJECT_ID=... npx tsx scripts/live_judge0_check.ts` (new): the first-party, non-demonstration "balanced brackets" exercise (12 hidden tests). Correct Python, JavaScript, C++ and Java solutions each judged **accepted 12/12** in the real sandbox; a wrong answer judged `wrong_answer`; broken C++ judged `compile_error`; hidden inputs and expected outputs never appeared in any response; sample run executed but was not stored; all six submissions stored for the owner on real Firestore (which also proves the composite index) and invisible to a second student; no source code or token in logs; test data and users deleted. |
| Honest exclusion while the flag is unset | **PASS** | every accepted submission reported `analytics_status = excluded_unverified_provider`; analytics showed zero eligible attempts and nothing solved; no revision item was created; student B unaffected |
| Counting path (accepted submission updates the right student's progress, analytics, revision queue and plan) | **BLOCKED on an operator decision** | needs `EXECUTION_PROVIDER_VERIFIED=true`, which only the operator may set. Until then the live counting path is covered only by the mock and local tests (Phase 10 journey tests). |
| Full live student journey | **Not fully verified** | the counting path above, plus the frontend click-through, were not exercised live |

Caveats: the public instance is rate-limited, shared and outside this project's control; it must not be the production judge. A production release still needs the operator's own Judge0 deployment, its own smoke-test run, and the operator's decision to set the flag.

---

# Phase 10.2: Live browser verification (2026-10-17)

Everything below was run locally against the **non-production** Firebase project (`unbluff-test-babus01-91131`), Judge0's **public community instance** (`https://ce.judge0.com`, no credential), the real Gemini model and the test GitHub OAuth App. Nothing was deployed, committed or pushed in this phase. No secret was printed; logs were scanned for secrets (below).

## Environment used (names only, no values)

* Backend: `npm start` on port 8094 with `STORE=firestore`, `LLM_MODE=live`, `EXECUTION_PROVIDER=judge0`, `JUDGE0_URL` (public instance), the first-party practice pack and suites, `CORS_ORIGIN=http://localhost:5173`, GitHub variables from `backend/.env`. **`EXECUTION_PROVIDER_VERIFIED=true` was set only in the process environment of these test runs**; it is in no file and was never committed. Health reported `llm_mode: live` and `store: firestore`, before and after the restart (no fallback to memory).
* Frontend: Vite dev server on `127.0.0.1:5173` with `VITE_API_URL` pointing at the backend; the browser used `http://localhost:5173` (same origin as the CORS setting and the GitHub return address).
* Needed to run: the frontend also requires `VITE_FIREBASE_APP_ID` (a public identifier). It was missing, so the login page said Firebase was not configured. It was added to the git-ignored `frontend/.env`. Port 8080 is held by an unrelated Windows service, so the backend runs on 8094.
* Test account: one throwaway account created by the operator in the browser (the assistant does not enter passwords or create accounts). Its test data remains in the test project.
* No Playwright or similar exists in the repository; the built-in browser pane was used.

## 1. Flag-on judged-submission run: PASS

Judge0 smoke (`EXECUTION_PROVIDER=judge0 JUDGE0_URL=https://ce.judge0.com npm run smoke:judge0`): exit 0, `RESULT: PASS` (71 languages; Python, JavaScript, C++ and Java ran and printed the expected output; invalid C++ and Java reported as compile errors).

Flag-on check (sanitised command; the flag is set for this invocation only):

```
EXECUTION_PROVIDER_VERIFIED=true JUDGE0_URL=https://ce.judge0.com FIREBASE_PROJECT_ID=unbluff-test-babus01-91131 npx tsx scripts/live_judge0_check.ts
```

* **First run: exit 1, one FAIL (36 passed).** Eligible attempts were 6, expected 7. Cause: the 7th submission was a compile error. Judging stops after the first test on a compile error, so the record said 1 test judged out of 12, and the eligibility rule (every hidden test must have a provider result) refused to count it, although the documented analytics treat compile errors as counted "technical" failures. This is a **real defect found only by the live run**; local tests used synthetic records and never hit it.
* **Fix** (`backend/src/code/service.ts`): when the first result is a compile error it holds for every test, so the record counts all tests as judged. Nothing else about eligibility changed. Regression test added: `backend/tests/integration/compileCounting.test.ts`.
* **Second run: exit 0, 37 of 37 checks passed**, including:
  * two wrong answers (counted failures) created **exactly one** revision item (pending, due now); analytics showed 2 eligible attempts and nothing solved; progress was not marked solved;
  * the first accepted submission set `progress_updated` and turned the revision item into **spaced review** (`scheduled`, stage 0), not a second item (a clean first-try solve creates none, per the documented rules);
  * correct Python, JavaScript, C++ and Java solutions each judged **accepted 12/12** in the real sandbox; broken C++ judged `compile_error`;
  * final analytics: 1 solved, 4 accepted attempts, 7 eligible attempts; solved for this student only; one revision item, no duplicates; student B had none;
  * hidden inputs and expected outputs never appeared in any response; sample runs are not stored; seven submissions stored for the owner on real Firestore (the composite index is in use);
  * all test records and both throwaway users were deleted afterwards (verified: 0 left).
* **Still excluded, but not exercised live (LOCAL PASS only):** demonstration exercises, stand-in or mock providers, and an unverified provider. A real-Judge0 run cannot create those cases; they are covered by the Phase 5 and Phase 10 local tests.

## 2. Browser journey

| Step | Result | Evidence |
|---|---|---|
| A. Authentication | **PASS** | signed out, `/placement` redirected to `/login`; after the operator signed in with Firebase the protected page opened; with the API forced to return 401 (by patching `fetch` in the page, not a real token expiry) the app redirected to login with "Your session expired. Please sign in again." |
| B. Profile and plan | **PASS** | goals saved (Frontend Developer, 60 min, Mon to Fri); plan built from real first-party questions (Balanced Brackets, Pair Count, First Not Less) and GraphQL exercises; a task was postponed and still showed "postponed to 2026-10-20" after a reload and after a backend restart. Tasks were not marked done by hand; one completed automatically from a verified record (step H). |
| C. DSA editor and live execution | **PASS** | exercise page listed the four live languages; a sample run executed on real Judge0 and is labelled as never changing progress; a wrong answer gave "Wrong answer, 4 of 12 hidden tests passed (first failure: test 2)"; a correct solution gave "Accepted, 12 of 12" and "marked solved"; the browser's network responses held no hidden inputs or outputs (`analytics_status: counted`, `progress_updated: true`); both submissions listed under the signed-in student; analytics page: 1 solved, 1 attempted, 2 counted submissions, 1 accepted, with honest "not enough data" notices; revision page: 1 upcoming item, 0 due, no duplicate |
| D. Restart persistence on real Firestore | **PASS** | backend stopped and restarted (health showed `store: firestore`); after reloading the frontend the plan (version 1), the postponed task, DSA evidence ("Verified result, 2 judged submissions"), the GraphQL result, mentor conversation history, memories and the GitHub connection were all still there |
| D. Cross-account isolation in the browser | **Not re-run in the browser** | needs a second signed-in UI account. Isolation was **PASS with two real accounts** in the Phase 10.1 scripts (`live_firebase_check.ts`, `live_judge0_check.ts`). Here only unauthenticated and bad-token requests were checked: both `401 UNAUTHENTICATED` |
| E. Live mentor with durable memory | **PASS** | real Gemini reply; it said "you have solved 1 question according to our verified records" (matches the real count); two memories saved (a Frontend Developer goal and "finds stacks difficult"); **after the backend restart** a new conversation recalled both from Firestore; deleting the "stacks" note in the UI (with its confirmation step) made a further new conversation say no difficult topic is saved, while the goal was still recalled. **Live model and Firestore-backed memory were tested together.** Cross-user memory rejection: PASS in the Phase 10.1 live scripts, not repeated in the browser. |
| F. GitHub OAuth | **PASS** | connect started from the frontend; the operator signed in and authorised on github.com (no scopes); the real callback ran (backend log: account connected, 302 to the frontend); sync completed; the page showed the authorised account's contributions and repositories (including this project's own repository with today's push date; 38 public repositories); private activity was shown as a count only; the connection and synced data persisted across the backend restart; disconnect (with confirmation) returned the UI to "Connect GitHub", the backend logged `revoked: true`, and the planner then **removed** the GitHub project task with the stated reason. A real rate-limit exhaustion was not provoked. |
| G. GraphQL Lab | **PASS** | the valid starter query ran against the training API; an invalid query showed the real validation error ("Cannot query field nonexistentField on type Role", line 1, column 17); the graded multiple-choice exercise passed and the module showed "1 of 4 exercises passed"; the result persisted across reload and restart and appeared on the dashboard as "1 of 55 exercises passed"; the mentor's explanation used the server-run result and schema excerpt and no secrets |
| H. Integrated dashboard | **PASS** | "First measurement, Stack: Balanced Brackets" shown **done**, completed automatically from the verified record; the DSA Stack area showed "Verified result, 2 judged submissions" with "not enough evidence" for a confident estimate (no invented score); the next GraphQL exercises were scheduled; GraphQL "Developing: 2%, 1 of 55 passed"; GitHub appeared only as context and only while connected; the revision item was upcoming, not due, so no revision task was created |

Observation (low severity, model wording): when asked "Why did you prioritize this?", the live assistant also described the GitHub project task as something it had added, although the planner had already removed that task on disconnect (the plan and its change log are correct). The explanation draws on plan history and can mention superseded tasks as if still current.

## 3. Security checks

* Another user's records: no endpoint accepts a user id; unauthenticated and bad-token requests returned `401 UNAUTHENTICATED` after the restart. Two-account isolation: PASS in the Phase 10.1 live scripts.
* Backend logs (194 lines across both runs): no Gemini key, GitHub client secret or encryption key; no token or JWT pattern; no submitted source code; no stack traces. (A first version of this scan read empty files because of a path mismatch and was discarded; the result above is from the shell-based re-run.)
* The served frontend files contained none of the three secret values; the frontend environment holds only `VITE_` names (public configuration).
* Hidden grading cases: never in any browser response inspected (exercise and submit responses).
* Student code ran only in Judge0's sandbox, never in the backend process.
* A disconnected GitHub account produced no fabricated data; the planner removed the dependent task.
* The restart did not fall back to memory storage (health reported Firestore both times).
* The backend binds `0.0.0.0` by design (not changed here). On this machine that makes port 8094 reachable from the local network while it runs; use a firewall or bind to localhost for development.
* Errors seen in the browser were the application's own messages; no stack trace or secret appeared.

## 4. Regression results (after the compile-error fix)

| Command | Result |
|---|---|
| backend `npm run lint`, `typecheck`, `build` | exit 0, 0, 0 |
| backend `npm run test:coverage` | 55 files, **844 tests passed** (843 plus the new regression test); statements 90.08 % |
| backend `npm run test:emulator` | 9 files, **34 tests passed** (EMULATOR PASS) |
| frontend `lint`, `typecheck`, `npm test` | 0, 0; 15 files, **199 tests passed** |

## 5. Classification and what remains

| Area | Status |
|---|---|
| Flag-on counting path (real Judge0, real Firestore) | **PASS** |
| Browser journey A to H on live services | **PASS** (two items not repeated in the browser are marked in the table) |
| Live Gemini mentor with Firestore memory, tested together | **PASS** |
| GitHub OAuth through the frontend | **PASS** |
| Demonstration, stand-in and unverified-provider exclusions, live | **LOCAL PASS** only |
| Second-account isolation through the browser UI | **Not run** (live-script PASS from 10.1) |
| Real Judge0 rate-limit behaviour, GitHub rate-limit exhaustion, load | **Not run** |

**This does not make the product production-ready.** Remaining release concerns: the public Judge0 instance is shared and not yours, so production needs your own deployment, its own smoke run and your own decision on `EXECUTION_PROVIDER_VERIFIED`; the deployment files (`render.yaml`, `deploy.sh`) still lack the Judge0, GitHub and mentor variables and CI lacks emulator, index and audit steps; the production HTTPS callback and `CORS_ORIGIN` are untested; there is no backup, retention or encryption-key rotation procedure; the `react-router` advisory is open; there is no monitoring or load testing; and the compile-error fix is uncommitted.
