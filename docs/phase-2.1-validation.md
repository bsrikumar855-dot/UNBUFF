# Phase 2.1: dependency and integration validation

Starting point: local `main` at `783b7e4` (Phase 2), one commit ahead of `origin/main`, working tree clean. Nothing was committed, amended, reset, pushed or deployed during this validation. Changes: `frontend/package.json` + lockfile (grpc-js override), `firebase.json` (emulators block), `backend/package.json` (`test:emulator` script), `backend/vitest.config.ts` (excludes emulator tests from the default run), new `backend/vitest.emulator.config.ts` and `backend/tests/emulator/`, and this document.

## 1. Frontend audit findings

Full `npm audit` before the fix: 20 vulnerabilities (7 moderate, 11 high, 2 critical). The parent commit (`fc3a264`) had 16, so **exactly 4 are new**, all from `firebase`. The other 16 are dev-tooling findings that existed before Phase 2 (vitest, vite, esbuild, tailwindcss, tinypool, braces and others; none ship to browsers).

Production dependencies only (`npm audit --omit=dev`):

| | Before Phase 2 | After Phase 2 | After this fix |
|---|---|---|---|
| react-router-dom, react-router (moderate) | yes | yes | yes (unchanged) |
| firebase, @firebase/firestore, @firebase/firestore-compat, @grpc/grpc-js (high) | no | **yes (new)** | **no** |

**Exact path** (`npm ls`/`npm explain`): `firebase@13.0.0` → `@firebase/firestore@4.18.0` (also via `@firebase/firestore-compat@0.4.15`) → `@grpc/grpc-js@1.9.16`. Root cause: `@firebase/firestore@4.18.0`, the latest published, pins `@grpc/grpc-js: ~1.9.0`, which can never reach a patched version.

**Advisories** (verified against the GitHub Advisory Database; both fixed in `@grpc/grpc-js` 1.13.6 and 1.14.5):
- GHSA-m9gg-hp2v-232j / CVE-2026-101916, high (CVSS 7.4): `getAuthContext` can report unauthorized client certificates as authorized when a gRPC **server** is created with `requireClientCertificate: false`. Affects `< 1.13.6` and `>= 1.14.0, < 1.14.5`.
- GHSA-f596-whhp-79r4 / CVE-2026-101915, low (CVSS 3.7): a gRPC **server** includes thrown handler error messages in status sent to clients.

Both concern gRPC *servers*. This frontend neither runs a gRPC server nor imports Firestore. npm reports the package as "high" because it takes the maximum severity.

npm's suggested fix (`firebase@9.14.0`, flagged major) is a **downgrade** across four majors and was not used. `npm audit fix --force` was not run.

## 2. Production bundle

Clean build, then a temporary script (kept outside the repo) read every source map and every emitted JS asset.
- Packages in the browser bundle: react, react-dom, react-router, `@remix-run/router`, `@firebase/app`, `@firebase/auth`, `@firebase/util`, `@firebase/component`, `@firebase/logger`, `idb`, pdfjs-dist, tailwind-merge, lucide-react, clsx.
- **No** `@grpc/grpc-js`, `@firebase/firestore`, `protobufjs` or `@grpc/proto-loader` sources in any source map. No Node `http2` reference.
- The only "firestore" text is two library-name strings (`"@firebase/firestore"`, `"@firebase/firestore-compat"`) in `@firebase/app`'s version-registration table. It is data, not Firestore code.
- Size: main chunk 229.6 kB (Phase 1) → 407.0 kB (Phase 2) because of Firebase Auth and App. Unchanged by the dependency fix.

Why audit and runtime differ: `npm audit` analyses the installed package graph, and `firebase` declares Firestore as a dependency, so it is installed whether or not the app imports it. The bundler includes only what the entry points reach. The browser exposure is therefore nil, but **this does not fix the installed dependency**, which is why it was remediated separately below.

## 3. Remediation (the only dependency change)

Added to `frontend/package.json`:
```json
"overrides": { "@grpc/grpc-js": "~1.13.6" }
```
Result: `@grpc/grpc-js@1.13.7` (patched), `package-lock.json` changes only the grpc-js entry and one new transitive package (`@js-sdsl/ordered-map@4.4.2`). `firebase` stays at 13.0.0 with modular `firebase/app` and `firebase/auth` untouched.

Why this is acceptable: `@firebase/firestore`'s grpc code runs only in Node, never in this browser app. Stayed within 1.13.x (the smaller jump from 1.9; `1.14.x` is also patched). Checks: `npm ci` from the lockfile in a clean scratch directory succeeds, `npm ls` reports a single grpc-js 1.13.7, and `require("@firebase/firestore")` in Node loads with it. The override is **outside Firebase's tested range**, and Firestore over gRPC from Node was not exercised with it (the app does not do that).

Alternative not taken: depend on `@firebase/app` and `@firebase/auth` directly, dropping the umbrella `firebase` package. It removes the whole Firestore tree, but it departs from Firebase's documented import pattern. Reconsider if upstream still pins `~1.9` after the override becomes a maintenance burden. Remove the override when `@firebase/firestore` ships with a patched grpc-js.

After the fix, full audit: 16 total (the pre-existing dev-tooling set), prod audit: only the 2 pre-existing moderate react-router findings (open-redirect and SSR-hydration advisories; fixes need `react-router-dom` 7, a major migration, left alone). Backend: prod audit 0; one pre-existing dev-only finding (`source-map-js`).

## 4. Regression results (this run)

| | lint | typecheck | tests | coverage | build |
|---|---|---|---|---|---|
| Backend | pass | pass | 162/162 (24 files) | 91.8% stmts, 84.3% branches, 93.4% lines; `src/core` threshold passes | pass |
| Frontend | pass | pass | 41/41 (8 files) | not configured | pass |

Includes the Phase 2 auth, ownership, legacy-record and mocked-Firestore tests. Interview flow, report and demo tests are unchanged and passing.

## 5. Integration verification level

The Firebase **emulators** were installed on demand (`firebase-tools@15.34.0` via `npx`, nothing added to `package.json` dependencies; the emulator jars are cached in the user's home directory) and `firebase.json` gained an `emulators` block (auth 127.0.0.1:9099, firestore 127.0.0.1:8085, UI off). Everything runs under the demo project id `demo-unbluff`, which cannot reach a real project. The test helpers also refuse to run unless both emulator hosts are local.

`npm run test:emulator` (backend) starts both emulators, runs `tests/emulator/**` and shuts them down: **8/8 passing**.

| Suite | What it proves against the real emulators |
|---|---|
| `firestore.emulator.test.ts` (5 tests) | `FirestoreStore` create, read, update, delete in a unique throwaway collection (removed afterwards); `owner_uid` stored in the JSON and as a top-level field; a second Firestore client sees the data (restart); `listByOwner` with the **real** equality query returns only that owner's sessions; a legacy document with no owner is never listed; full HTTP flow (extract, report, list, owner-only delete, deletion removes the document) over `FirestoreStore` |
| `auth.emulator.test.ts` (3 tests) | Genuine ID tokens issued by the Auth emulator are verified by the **real `firebase-admin` verifier**; uid comes from the token; Alice/Bob ownership holds for read, delete and list; garbage, malformed, tampered (claims edited) and missing tokens give 401; a valid token stays valid until expiry (revocation is not checked per request) |

| Integration | Level reached |
|---|---|
| Firestore store | **Emulator-verified**; not run against real Firestore |
| Firebase Auth backend verification | **Emulator-verified** with real Admin SDK; signature verification against Google's public certificates is **not** exercised (the emulator issues unsigned tokens) |
| Firebase Auth frontend (SDK sign-in/register/reset) | Fake provider only. No browser sign-in against the emulator was performed |
| Real Firebase project | **Not done**: no configuration or test account supplied, and no real project was touched; no environment values were read |
| Firestore security rules / indexes | Not tested. The backend uses an Admin credential, which bypasses rules; the single-field query needs no composite index |

Earlier finding: the Admin SDK's emulator mode contacts the emulator even for unsigned tokens (`ECONNREFUSED` with none running), so it cannot be tested offline. That is why the earlier offline attempt was dropped in favour of these suites.

Side effects of running the emulators: `firestore-debug.log` is written in `backend/` (already covered by `*.log` in `.gitignore`), and the Admin/Firestore clients log a harmless "MetadataLookupWarning" while probing for cloud credentials.

## 6. Reproduce

```bash
git status -sb && git log --oneline -3
cd frontend && npm ci && npm audit --omit=dev && npm ls @grpc/grpc-js firebase
npm run lint && npm run typecheck && npm test && npm run build
cd ../backend && npm ci && LLM_MODE=mock npm run lint && npm run typecheck && npm run test:coverage && npm run build && npm audit --omit=dev
npm run test:emulator   # needs Java 21+; first run downloads firebase-tools and the emulators (~2 min)
```

## 7. Is the branch safe to consider for push?

Code-wise nothing blocks it: all checks above are green and the prod-dependency audit is back to its pre-Phase-2 state. Blockers before relying on it in production:
1. **Real Firebase is still unverified** (section 5). The emulator suites now pass, which covers query, ownership and token-claim logic, but not Google certificate verification, security rules, quotas, IAM or the real Render credential path. Run one smoke test against a throwaway non-production project before calling it production-ready. Pushing source is low risk.
2. The `overrides` entry, `firebase.json` emulators block, emulator tests and this document are **uncommitted**: commit them before pushing, or the pushed lockfile still carries the vulnerable grpc-js.
3. Deployment needs the Firebase setup from `docs/phase-2-auth-storage.md` (project, Email/Password provider, authorized domain, Firestore, service account, Render variables). Render will refuse to start until `FIREBASE_PROJECT_ID`, `CORS_ORIGIN` and Firestore credentials are set.
4. Remaining known risks: react-router moderate advisories (need v7), Firebase Auth enlarging the entry chunk by about 180 kB, dev-tooling advisories (vitest/vite/tailwind chain).

Housekeeping: while taking a lockfile backup I accidentally created `D:\scratch_lock_backup.json` (outside the repo, a copy of the frontend lockfile). The deletion was blocked by a safety check, so please remove it manually.
