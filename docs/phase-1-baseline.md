# Phase 1: baseline stabilization

Scope: reproducible installs, explicit CORS, config validation, and a persistence review. No product features, auth, DSA ingestion, or deployments.

## 1. Baseline results (my own run, Node 24.13.1 / npm 11.8.0, Windows 11)

`npm ci` succeeded in both `backend/` and `frontend/` (both lockfiles are valid). `npm audit` reports advisories in both trees; none were acted on in this phase.

| Check | Backend | Frontend |
|---|---|---|
| lint | pass | pass |
| typecheck | pass | pass |
| tests | 129/129 (21 files) before changes; **134/134 (22 files) after** | 26/26 (7 files) |
| coverage | stmts 92.2%, branches 85.0%, lines 93.5%. The only configured threshold (`src/core/**` ≥95/90) passes | n/a (no coverage script) |
| build | pass | pass (`tsc -b && vite build`) |

The frontend was not modified, so it was not re-run after the changes. The backend was fully re-run after the changes.

Not verified: the live Gemini path (`grade-check`, `LLM_MODE=live`), Firestore against a real database (only the mocked unit test ran), Docker image build, Render and Cloud Run deploys, and the frontend e2e script.

## 2. Changes

| File | Change |
|---|---|
| `render.yaml` | `npm install` → `npm ci`. `rootDir: backend` contains `package-lock.json`, so `ci` is valid. `CORS_ORIGIN` is now `sync: false`, so Render prompts for it instead of using `*`. |
| `backend/src/config.ts` | New `NODE_ENV`, `TRUST_PROXY` (int 0–5, default 1) and a stricter `CORS_ORIGIN`. Details below. |
| `backend/src/app.ts` | `trust proxy` is now `deps.trustProxy ?? 1` (same behavior by default). |
| `backend/src/server.ts` | Passes `TRUST_PROXY`. Logs a warning when `NODE_ENV=production` and `STORE=memory`. |
| `backend/scripts/deploy.sh` | `CORS_ORIGIN` is now required (no `*` default). |
| `backend/.env.example` | Documents `CORS_ORIGIN` and `TRUST_PROXY`. |
| Tests | Config tests in `tests/unit/prompts.test.ts`. New `tests/integration/cors.test.ts` checks allowed and blocked origins at the HTTP level. |

No dependency versions or lockfiles changed. The API contract and scoring code were not touched.

### CORS rules (verified by unit tests and a real `node dist/src/server.js` run)
- `NODE_ENV=production`: `CORS_ORIGIN` is **required**, `*` is rejected, and the server refuses to start otherwise.
- Every entry must be a bare origin (`https://host[:port]`). Paths, trailing slashes and missing schemes are rejected, in every environment.
- Not production and unset: defaults to `http://localhost:5173,http://127.0.0.1:5173`. An explicit `*` is still accepted for local use.
- Multiple origins are comma-separated. The CORS test confirmed an unlisted origin gets no `Access-Control-Allow-Origin` header.

Note: a local, git-ignored `backend/.env` containing `CORS_ORIGIN=*` was loaded when I tested production startup. That is why one run showed the wildcard error instead of "required". It does not affect dev.

## 3. Exact deployment configuration

**Render (backend):** the production frontend origin is not known to this repo, so I did not invent one. Set in the Render dashboard:

- `CORS_ORIGIN` = the deployed frontend origin(s), e.g. `https://<frontend-origin>` (comma-separated for several)
- `GEMINI_API_KEY` = your key (already `sync: false`)
- `TRUST_PROXY` is optional (default 1). Raise it only if you put another proxy or CDN in front of Render.
- Existing: `NODE_ENV=production`, `LLM_MODE=live`, `STORE=memory`, model names.

**Required infrastructure change:** the next Render deploy will fail at startup until `CORS_ORIGIN` is set. That is intentional (fail-fast). The existing deployment is unaffected until it is redeployed.

**Cloud Run:** `CORS_ORIGIN=https://<frontend-origin> bash backend/scripts/deploy.sh`.

**Frontend:** `VITE_API_URL` must be set at build time to the backend URL (see `frontend/.env.example`).

I simulated Render's build in a scratch copy with `NODE_ENV=production npm ci && npm run build` (dev dependencies omitted). It succeeded, because `typescript` and the `@types` packages are runtime dependencies.

## 4. Persistence review

| | `memory` | `firestore` |
|---|---|---|
| Code path | `MemoryStore`: a `Map`, capped at 5000 sessions, oldest evicted | `FirestoreStore`: one JSON string per session in `unbluff_sessions`, no TTL |
| Survives restart or redeploy | **No** (by construction; I did not kill a process to demonstrate it) | Expected yes, but **not verified** against a real database |
| Shared across instances | No | Yes |
| Prerequisites | none | Firestore database; Application Default Credentials (automatic on Cloud Run with the `roles/datastore.user` role granted by `deploy.sh`); no code change |

Consequences of memory storage on Render's free plan:
- All sessions, reports and retests are lost on every restart, redeploy or idle spin-down. A user mid-interview gets a session-not-found error.
- Eviction after 5000 sessions can silently drop the oldest ones.
- It cannot run more than one instance.

Firestore is **not usable on Render as configured**: nothing in `render.yaml` provides Google credentials, and I did not add any. Options: (a) run the backend on Cloud Run, which `deploy.sh` already supports; (b) add a service-account credential to Render, which needs a decision on secret handling; (c) accept ephemeral sessions for demos. The Firestore constructor does not check connectivity, so a bad setup only fails on the first request.

No data was migrated and no database was configured.

## 5. Remaining risks
- Rate limits are per instance, in memory.
- Resume text is stored in plaintext JSON with no TTL and no delete endpoint (privacy).
- Session IDs are the only access control for reports.
- `trust proxy` hop count must match the real topology; a wrong value skews or lets clients spoof rate-limit IPs.
- `npm audit` findings in both projects are unreviewed. Dependency versions differ between the projects (ESLint 9 vs 10, Vitest 2 vs 5) and were deliberately left alone.
- CI only runs lint, typecheck, test and build. It does not run a production-mode startup check.
- The frontend has no coverage script, and the live Gemini path is only checked manually.

## 6. Must be resolved before authentication and student-progress features
1. Choose and provision a durable store (Firestore on Cloud Run, or another database) and verify restart persistence with a real test.
2. Define a data model with a user ID owning sessions, and replace the bearer-ID access pattern.
3. Add retention rules and a deletion endpoint for resume text and reports.
4. Decide where secrets live per host (Render vs Cloud Run) and how Firestore credentials reach the backend.
5. Make rate limiting shared or per-user once there are multiple instances.
6. Set the real frontend origin(s) in `CORS_ORIGIN`, and decide whether auth uses cookies (needs `credentials` and a non-wildcard origin) or bearer tokens.
7. Triage `npm audit` and align dependency versions deliberately.
8. Add a CI check that boots the production build with a valid config.

## 7. Commands

Backend (`backend/`):
```bash
npm ci
npm run lint && npm run typecheck && npm test
npm run test:coverage
npm run build
LLM_MODE=mock STORE=memory PORT=8090 CORS_ORIGIN=http://localhost:5173 npm run dev
```

Frontend (`frontend/`):
```bash
npm ci
cp .env.example .env
npm run lint && npm run typecheck && npm test
npm run build
npm run dev
```
