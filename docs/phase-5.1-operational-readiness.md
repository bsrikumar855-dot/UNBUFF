# Phase 5.1: operational readiness

**Has a real end-to-end analytics test been completed? No.** No real Judge0 service, no credentials and no non-production Firebase project were available. Everything below that touches execution or Firestore indexes was verified only with test doubles or the Firestore emulator, and is labelled that way. What this phase delivers is the exact tooling and checklist to run the real test, plus tighter rules so that nothing counts unless it was genuinely judged.

## 1. Judge0 smoke test

```bash
cd backend
EXECUTION_PROVIDER=judge0 JUDGE0_URL=https://<your-judge0-host> JUDGE0_AUTH_TOKEN=<token> npm run smoke:judge0
# optional: JUDGE0_AUTH_HEADER (default X-Auth-Token), --languages python,cpp (make them required),
#           --expect-ids python=<id>,cpp=<id> (pin the ids you expect), --json, --timeout 120
```

What it does (`scripts/judge0_smoke.ts`, logic in `src/code/smoke.ts`): requires `EXECUTION_PROVIDER=judge0` and a valid `JUDGE0_URL` (https; `http://localhost` only outside production; no embedded credentials) and reads **only the environment**, never a URL from a flag or request; queries the service's real `GET /languages`; resolves Python, JavaScript, C++ and Java by name exactly as the product does (checking any ids you pinned); submits `2 + 3` programs in each language the service offers and requires status *completed* with output `5`; for C++ and Java also submits broken source and requires a *compilation error*; polls with the adapter's bounded deadlines (8 s per request, 30 s per program) plus a 180 s overall budget, so it cannot poll forever; prints only the host (never the token or full URL); exits 0 (all required checks passed), 1 (a check failed) or 2 (configuration). Python is always required; other languages the service does not offer are reported as information unless you list them with `--languages`.

**It never runs code on this machine** and **never sets `EXECUTION_PROVIDER_VERIFIED`**.

Actual results in this environment:

| Run | Result |
|---|---|
| `npm run smoke:judge0` with no configuration | exit **2**: "EXECUTION_PROVIDER must be set to judge0 ... JUDGE0_URL is required ..." plus the example command |
| Script against an unreachable endpoint (`http://127.0.0.1:1`), tested | exit **1**, `RESULT: FAIL`, token absent from all output |
| Against a real Judge0 | **not run, integration unverified** |
| Automated tests of the smoke logic with a protocol test double (19 tests) | pass; they prove the checks, exit decisions, redaction and timeouts, **not** that any real service works |

### How the operator must verify the endpoint
A protocol-compatible endpoint is not proof that it is the intended deployment. Before setting `EXECUTION_PROVIDER_VERIFIED=true`:
1. Confirm in your hosting console (VM, container or provider account) that `JUDGE0_URL`'s hostname resolves to the instance **you** deployed, and note its Judge0 version and image tag.
2. Confirm authentication is on (`AUTHN_HEADER`/`AUTHN_TOKEN` in that deployment's configuration) and that the service is reachable only from the backend (firewall or private network) and over https.
3. Confirm the sandbox settings (`GET <url>/config_info`, and the deployment's environment): CPU and memory maxima, `enable_network` default off, wall-time and file-size limits at least as strict as `CODE_CPU_TIME_SECONDS` and `CODE_MEMORY_MB`.
4. Run `npm run smoke:judge0` (add `--languages python,javascript,cpp,java --expect-ids ...` using the ids from step 3's language list) and keep the output.
5. Check the service's own logs or dashboard show those four submissions arriving.
6. Manually confirm limits bite: a Python infinite loop must come back *Time Limit Exceeded* and a large allocation must fail, through the workspace or the API.
7. Only then set `EXECUTION_PROVIDER_VERIFIED=true` yourself.

Supported languages: Python 3, JavaScript (Node.js), C++ (GCC) and Java (JDK/OpenJDK), each offered only if the service reports a matching name. Java solutions must use the class name `Main`. Nothing is verified against a real service yet.

## 2. First-party practice pack (production-eligible content)

Thirty original exercises (ten from Phase 5.1, twenty added later, see `docs/post-redesign-functional-audit.md`), written for this project; no company associations, no external pages (`url: null`), no third-party text, solutions or tests. Provenance is `own_work`; every exercise is labelled a first-party practice problem, not a company interview question.

| Id | Title | Difficulty | Topics | Hidden tests |
|---|---|---|---|---|
| fp_001_balanced_brackets | Balanced Brackets | easy | Stack, Strings | 12 |
| fp_002_pair_count | Pair Count | easy | Arrays, Hash Table | 10 |
| fp_003_longest_run | Longest Run | easy | Strings, Two Pointers | 10 |
| fp_004_first_not_less | First Not Less | easy | Binary Search, Arrays | 8 |
| fp_005_coin_ways | Coin Ways | medium | Dynamic Programming, Arrays | 10 |
| fp_006_shortest_hops | Shortest Hops | medium | Graphs, Breadth-First Search | 9 |
| fp_007_covered_time | Covered Time | medium | Sorting, Intervals | 9 |
| fp_008_window_distinct | Window Distinct | medium | Hash Table, Sliding Window | 8 |
| fp_009_island_count | Island Count | medium | Graphs, Matrix | 10 |
| fp_010_edit_cost | Edit Cost | hard | Dynamic Programming, Strings | 11 |

Each has a stated input/output contract, two visible samples, normal, boundary and edge hidden tests (empty-ish, single element, duplicates, negatives, maximum-size and random cases), revision `fp-1`, limits of 2 s and 128 MB, and an explicit eligibility declaration with a reason. Input and output are plain text with one trailing newline; comparison ignores trailing spaces and trailing blank lines.

Files: `data/dsa/practice-pack.json` (public catalogue entries) and `data/code/practice-suites.json` (statements, samples, **hidden tests**, server-only). Both are generated by `npm run practice:build` from `scripts/lib/practicePack.ts`, which holds the reference solutions and seeded test generators. `npm run practice:build -- --check` fails on drift; running the build twice changes nothing. Seeding only writes these two files, so student progress, submissions, statistics and revision items are never touched (tested).

Correctness evidence: every expected output is produced by the reference solution and then re-derived by a **second, independent implementation** in the tests (naive, brute-force or different-algorithm versions); all agree on every sample and hidden test.

Defaults: with `DSA_CATALOGUE_PATH` and `CODE_SUITES_PATH` unset, local development loads the demonstration fixtures, and `NODE_ENV=production` loads this pack (previously an empty catalogue). Setting only one of the two paths mixes content; set them together. Production boot with no execution service was checked: the pack is served and Run/Submit answer "unavailable".

How hidden tests are protected: they exist only in `practice-suites.json`, loaded by the server; `publicExercise` returns samples and the *count* of hidden tests; submissions reveal only the failing test number; the question catalogue contains no grading data. Tests assert that no API response in the full flow and no file in the built frontend bundle contains a hidden input. Caveat: the hidden tests are in this repository and the server image, so anyone with source access can read them. For stronger secrecy keep a private suite file and point `CODE_SUITES_PATH` at it.

An exercise does not count merely because it has a suite: it counts only after a genuine accepted submission passes every eligibility condition below.

## 3. Analytics eligibility rules

A submission feeds analytics only if **all** hold (`analytics_status: "counted"`, re-verified by `isCountable` in `src/analytics/eligibility.ts` on every record and again on rebuilds):

1. It was a judged **Submit** (Run and sample runs are never stored).
2. The suite declares `eligibility.analytics_eligible: true` with a reason, is not a demonstration, and its licence is not `development_fixture`; an eligible suite also needs a visible sample and at least 5 hidden tests (enforced when the suite file is loaded). A suite with no declaration is not eligible.
3. The provider is not a mock/test provider (`provider.mock`); the only exception is the test-only `allowMockToCount` option, which is not reachable from configuration and is recorded on the record.
4. The operator declared the service verified (`EXECUTION_PROVIDER_VERIFIED=true`, default false). The flag alone proves nothing, so the record must also show that every hidden test produced a provider result (`judged_tests === total > 0`), carry a suite revision, and have a verdict consistent with its counts (accepted means all tests passed and no failing test; any other verdict identifies a failing test).
5. The judge did not fail (`judge_error` is excluded).

Everything else is stored with a reason: `excluded_demonstration`, `excluded_ineligible_suite`, `excluded_mock_execution`, `excluded_unverified_provider`, `excluded_judge_error`, `excluded_unknown_provenance` (legacy or inconsistent records, never promoted). Demonstration records stay excluded whatever the flag says. A stored "counted" claim without the supporting evidence is treated as unknown provenance.

## 4. Firestore indexes

| Index | Needed by |
|---|---|
| `unbluff_code_submissions`: `owner_uid` ascending, `created_at` descending (collection scope) | `listRecentByOwner`, the excluded-submission counts on the analytics dashboard |

Every other query is equality-only (several `==` filters are served by Firestore's automatic single-field indexes), so no other composite index is needed. The list is in code (`src/code/indexes.ts`) and in `firestore.indexes.json`; a test fails if they drift or if the store's actual query changes shape. `firebase.json` references the file (`"firestore": {"indexes": "firestore.indexes.json"}`), checked by a test and by `npm run indexes:check -- --config-only` (no network).

The repository's `.firebaserc` default alias is `unbluff-promptwars`. I cannot verify that this project exists or is non-production, so treat it as unconfirmed.

Deploy to a **non-production** project first (replace the placeholder; nothing here deploys anything):
```bash
npx firebase-tools@15.34.0 login
npx firebase-tools@15.34.0 deploy --only firestore:indexes --project <NON_PRODUCTION_PROJECT_ID>
```
Inspect status: `npx firebase-tools@15.34.0 firestore:indexes --project <NON_PRODUCTION_PROJECT_ID> --pretty` lists deployed indexes; in the Firebase console open Firestore Database > Indexes > Composite and wait for the state to change from *Building* to *Enabled* (can take minutes). Then verify the query itself:
```bash
cd backend
FIREBASE_PROJECT_ID=<NON_PRODUCTION_PROJECT_ID> FIREBASE_SERVICE_ACCOUNT_JSON='<service account JSON>' npm run indexes:check
```
It runs the exact read-only query for a made-up owner; `FAILED_PRECONDITION` means the index is missing or still building. Finally load the analytics dashboard: "Counts of excluded submissions are temporarily unavailable" must be gone. The Firestore emulator does **not** enforce indexes, so emulator tests (including the one that runs `checkSubmissionIndex`) show that the query is valid, not that anything is deployed. Without the index only those excluded-submission counts degrade (tested); nothing else breaks, and the provider's error text never reaches the client.

## 5. Tests (this run)

| Suite | Result |
|---|---|
| Backend lint, typecheck, build | pass |
| Backend unit + integration | **458/458** (39 files); coverage 92.8% statements, 86.6% branches, 94.4% lines |
| Backend emulator (`npm run test:emulator`) | **19/19** (5 files) |
| Frontend lint, typecheck, build | pass |
| Frontend tests | **94/94** (11 files) |
| `npm audit --omit=dev` | backend 0; frontend only the 2 pre-existing moderate `react-router` advisories (unchanged) |

New regression coverage: mock, demonstration, non-eligible, unverified and judge-error submissions stay excluded and the eligibility matrix lets exactly the genuine combination count; rejected verdicts never mark solved; tampered or legacy records cannot raise counts, even through a rebuild; missing or invalid provider configuration; invalid suite metadata (too few tests, demonstration marked eligible, fixture licence, missing reason, unknown keys; absent declaration defaults to not eligible); hidden tests absent from every response and from the built bundle; duplicate submission processing and duplicate seeding; index file wiring and drift; index and permission failure handling; ownership and revision-queue isolation (Phase 5 tests, still passing). The end-to-end pipeline test (`tests/integration/e2ePipeline.test.ts`) runs the shipped practice pack through submit, stored history, progress, topic analytics and revision scheduling with a **mock provider** under the test-only policy, and then shows the default policy excludes all of it.

## 6. Operator actions still required

- [ ] Provide or deploy a real Judge0 and set `EXECUTION_PROVIDER=judge0`, `JUDGE0_URL`, `JUDGE0_AUTH_TOKEN` on the backend.
- [ ] Run `npm run smoke:judge0` with all four languages and pinned ids; keep the output.
- [ ] Complete the endpoint verification checklist in section 1, including the limit checks.
- [ ] Set `EXECUTION_PROVIDER_VERIFIED=true` yourself, only after the above.
- [ ] Deploy `firestore.indexes.json` to a non-production project, wait for *Enabled*, run `npm run indexes:check`, then repeat for production.
- [ ] Decide whether the practice pack's hidden tests may live in the repository or should move to a private `CODE_SUITES_PATH`.
- [ ] With a non-production Firebase project: sign in, submit a correct solution to a practice exercise, and confirm it appears in `/dsa/analytics` as counted (this is the real end-to-end test; it has not been done).
- [ ] Review whether the thresholds in `src/analytics/config.ts` suit your students once real data exists.
- [ ] Still open from earlier phases: Firebase Auth and Firestore against a real project, `D:\scratch_lock_backup.json` removal, and the `react-router` advisories.
