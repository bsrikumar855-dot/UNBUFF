# Phase 4: online coding workspace

## Architecture

```
Browser (Monaco) --Bearer token--> Express API --HTTPS + server-side credential--> Judge0 (sandbox)
                                       |
                    suites (server-only) + submissions + DSA progress
```

- Student code **never runs in the API process**. The API calls an `ExecutionProvider` (`src/code/provider.ts`); `Judge0Provider` (`src/code/judge0.ts`) is the only implementation. The browser never sees the provider URL or credential, and no request can choose a provider URL (it comes only from validated environment variables).
- **Languages come from the service.** The product wants Python, JavaScript, C++ and Java. Each is matched by name against what the deployment's own `GET /languages` returns, taking the newest matching version (`src/code/languages.ts`). Judge0 ids differ between deployments, so none are hard-coded. A language the service lacks is simply absent, and when no service is configured or reachable the language list is empty.
- **Run** (`POST /api/code/run`): custom stdin, or one visible sample. Output, compiler diagnostics, status, time and memory come straight from the service. Not stored; never changes progress.
- **Submit** (`POST /api/code/submit`): the server runs every hidden test (first test alone, so a compile error is found once; the rest with concurrency 3), compares output after ignoring trailing spaces and trailing blank lines, and decides the verdict. Verdicts: accepted, wrong_answer, compile_error, runtime_error, time_limit_exceeded, judge_error (also used if the judging deadline passes before all tests run). Only **accepted** (every hidden test passed) marks the DSA question `solved`; nothing else changes progress, and a later failure never downgrades it.
- **No suite, no verdict.** Without a validated hidden suite `submit` returns `409 GRADING_UNAVAILABLE` and records nothing; the UI disables Submit and says so.
- **Hidden tests stay on the server.** `SuiteRegistry.publicExercise` returns samples, starter code, limits, and only the *count* of hidden tests. Responses for failed submissions say which test number failed, never its data. Tests assert that no response from any code route contains a hidden input or output.
- **Persistence.** Submissions are stored per owner (`SubmissionStore`: memory, or Firestore collection `unbluff_code_submissions`, one document per submission id) with: id, owner uid, question id, language, **source code**, verdict, passed/total, failed test number, compile output (for compile errors), time/memory maxima, suite revision, whether progress was updated, timestamp. No provider token, no hidden test data. Reads and deletes re-check the owner; other users' ids behave exactly like missing ones (`404 SUBMISSION_NOT_FOUND`).
- **Drafts** are kept only in the browser's `localStorage` under the signed-in uid, never for signed-out visitors, and removed on sign-out. Nothing is uploaded until you Submit.

## Limits and protection

| Control | Where |
|---|---|
| Source at most 50,000 bytes (UTF-8), stdin at most 20,000 bytes, language must be one of four ids, strict bodies (unknown keys rejected) | `routes/code.ts`, `code/service.ts` |
| CPU time (default 2 s) and memory (default 128 MB), no network (`enable_network: false`), wall time derived from CPU time | passed to Judge0 on every submission, enforced by Judge0 |
| Per-user rate limits (20 runs/min, 8 submits/min), keyed by verified uid, plus the existing per-IP limits | `middleware/rateLimit.ts` |
| At most 2 runs and 1 judging job in flight per user | `code/service.ts` |
| Each request to Judge0 times out after 8 s; each program waits at most 30 s (polling, no indefinite blocking); judging has a total deadline (default 60 s) | `judge0.ts`, `service.ts` |
| Judge0 responses validated with zod (token format, status, languages); HTTP/timeout/credential failures become generic `503 EXECUTION_UNAVAILABLE` with no URLs, hosts or tokens; redirects refused | `judge0.ts` |
| Source and tokens are not logged (only ids, verdicts and counts) | `service.ts`, `judge0.ts` |

## Configuration (all server-side; placeholders only)

| Variable | Meaning |
|---|---|
| `EXECUTION_PROVIDER` | `none` (default: runs report unavailable) or `judge0` |
| `JUDGE0_URL` | Base URL of **your** Judge0, e.g. `https://<your-judge0-host>`. https required in production; `http://localhost:2358` allowed only outside production; no credentials, query or fragment |
| `JUDGE0_AUTH_TOKEN`, `JUDGE0_AUTH_HEADER` | Secret and header name (Judge0 default `X-Auth-Token`; administrators can rename it) |
| `CODE_CPU_TIME_SECONDS`, `CODE_MEMORY_MB`, `CODE_JUDGE_DEADLINE_MS` | Limits for custom runs and judging deadline (must stay within your Judge0's configured maxima) |
| `CODE_SUITES_PATH` | Server-only hidden suites file. Unset: dev fixture locally, none in production |

### Setting up a real execution service
This repository does **not** ship or run an execution service, and none was available while building this phase, so **no real compilation or execution was performed here** (see Verification). Options, from the official Judge0 docs (<https://ce.judge0.com/>):
1. **Self-host Judge0 CE** (Docker). Judge0 needs a host that allows its sandbox (isolate) to run, which is usually a dedicated Linux VM, not a typical PaaS web service. Enable authentication (`AUTHN_HEADER`/`AUTHN_TOKEN` in Judge0's config) and put the service behind HTTPS.
2. A hosted Judge0 offering (for example through a marketplace) with an API key. Check its terms, limits and pricing yourself.
3. The public instance `ce.judge0.com` is for evaluation. It is not suitable for production, and student code and answers would leave your control. It was used here only to read `GET /languages` and `GET /config_info` (metadata) to check the language-name patterns.

Then set `EXECUTION_PROVIDER=judge0`, `JUDGE0_URL`, `JUDGE0_AUTH_TOKEN` on the backend (Render dashboard secrets) and verify with `GET /api/code/languages`: it should list the languages with the service's real version names. Judge0 keeps submissions it receives (its `enable_submission_delete` is off by default), so source code also lives in that service; account for it in your privacy notice.

### Test suites
```bash
cd backend
# Validate and merge authorized suites (server-only file; do not serve or publish it)
npm run code:import-suite -- --input approved-suites.json --out data/code/suites.json --catalogue data/dsa/catalogue.json [--dry-run]
CODE_SUITES_PATH=data/code/suites.json npm run dev
```
Input: `{ "schema_version": 1, "suites": [...] }` (schema in `src/code/suites.ts`): per question a revision, provenance and licence (`own_work`, `licensed`, `permission_granted`, `public_domain`, or `development_fixture`), up to 5 visible samples, 1 to 50 hidden tests (inputs/outputs up to 20,000 characters), per-exercise limits and optional per-language starter code. Re-importing identical content changes nothing; changed content needs a new revision; `development_fixture` content is refused as real data; hidden tests identical to the samples are refused. No LeetCode statements, solutions or test suites are included or imported.

## Language support and grading limits
- Offered: Python 3, JavaScript (Node.js), C++ (GCC) and Java (JDK/OpenJDK), each only if the service reports it. Java solutions must use the class name `Main` (the starter code does).
- Programs read stdin and write stdout. Output is compared exactly after trimming trailing whitespace; there are no special judges (floating-point tolerance, multiple valid answers) or interactive problems.
- Judge0 reports memory-limit kills as runtime errors, so there is no separate "memory limit exceeded" verdict.
- Judging is synchronous inside one HTTP request (bounded by the deadline). With a slow or busy service a long suite can end as `judge_error`.
- Only three authored **demonstration** exercises exist (`q_fixture_01` Window Maximum, `q_fixture_04` Prefix Query, `q_fixture_06` Pair Sum), each marked as not a real interview question. Their hidden tests are in `backend/data/code/fixture-suites.json`, a file in the repository, so they are not secret. That is acceptable for demonstrations and **wrong for real graded content**: keep real suites out of git and out of images that others can read.

## Verification (what was and was not proven)
- Automated tests use `FakeProvider` (marker words in the source choose the outcome) and a fake `fetch` for the Judge0 adapter. They prove our request construction, polling, status mapping, validation, authorization, persistence, progress rules and data isolation. **They do not prove that real code compiles or runs.**
- A browser check ran the real frontend, real Express API, real `Judge0Provider` and the Firebase Auth emulator against a throwaway local HTTP stand-in that speaks the Judge0 protocol with canned output (kept outside the repository). It confirmed Monaco renders with syntax highlighting, drafts persist per account, Run/Submit/History work, and an "accepted" result marks the question solved. Outputs there were canned, not computed.
- **Not verified:** any real Judge0 deployment (credentials, real compilation, sandbox limits, real timing and memory), the real Firebase project, screen-reader behaviour of Monaco, and a physical mobile device (a 375 px emulated viewport showed no horizontal overflow).

## Tests (this run)
| Suite | Result |
|---|---|
| Backend lint, typecheck, build | pass |
| Backend unit + integration | **306/306** (31 files); coverage 92.3% statements, 86.2% branches, 93.7% lines; `src/core` threshold passes |
| Backend emulator (`npm run test:emulator`) | **15/15** (4 files), includes submissions on the Firestore emulator |
| Frontend lint, typecheck, build | pass |
| Frontend tests | **81/81** (10 files) |
| `npm audit --omit=dev` | backend: 0; frontend: only the 2 pre-existing moderate `react-router` advisories |

## Frontend and dependencies
- New: `CodeWorkspacePage`, `components/code/{CodeEditor,monacoSetup}`, `lib/drafts.ts`, "Open code workspace" link on the question page; route `/dsa/questions/:id/code` (readable by anyone; Run, Submit and history need sign-in).
- Monaco: `@monaco-editor/react@4.7.0` and `monaco-editor@0.57.0`, **bundled locally (no CDN)** with a small feature set (find, clipboard, comments, indentation, multi-cursor, four languages) and only the base editor worker. It is a separate lazy chunk of about 3 MB (about 790 kB gzip); the main bundle grew by about 10 kB. A "Plain text editor" toggle is provided (Monaco is difficult on small touch screens and for some assistive technology). Keyboard: Tab indents inside Monaco; Esc then Tab leaves it.
- `monaco-editor` pins `dompurify@3.4.15`, which has two low-severity advisories (GHSA-p98j-92pf-mc4p, GHSA-6688-9rhm-gjv2; patched in 3.4.16). A `~3.4.16` override installs 3.4.17. Hover/markdown widgets (the code that uses it) are not included, and dompurify is not in the browser bundle either way.

## Security notes and remaining work
- Isolation depends entirely on the execution service's sandbox and configuration. Review Judge0's own hardening guidance, keep it off the public internet except through the API (or behind its auth token), and keep it patched.
- Source code retained in submissions is private to its owner and deletable (`DELETE /api/code/submissions/:id`). No automatic retention limit exists; account deletion does not yet remove submissions. Suggested: delete after a fixed period and on account deletion.
- Judge0 itself stores what it receives (see above). Callbacks are not used.
- Judging is not queued: a spike of submissions competes for the service. A job queue (return 202 and poll) is the next step if usage grows.
- Rate limits and the in-flight caps are per process; several API instances multiply them.
- The earlier note stands: `D:\scratch_lock_backup.json` (an accidental copy of a lockfile outside the repo) still needs manual deletion.

## Commands
```bash
# Backend
cd backend && npm ci
LLM_MODE=mock npm run lint && npm run typecheck && npm run test:coverage && npm run build
npm run test:emulator            # needs Java; downloads firebase-tools and emulators on first use
LLM_MODE=mock STORE=memory PORT=8090 CORS_ORIGIN=http://localhost:5173 npm run dev
# with a real service: add EXECUTION_PROVIDER=judge0 JUDGE0_URL=... JUDGE0_AUTH_TOKEN=...

# Frontend
cd frontend && npm ci
npm run lint && npm run typecheck && npm test && npm run build && npm run dev
```
