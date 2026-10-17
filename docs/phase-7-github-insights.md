# Phase 7: GitHub contribution intelligence

**Verified against real GitHub, a real OAuth app or a real Firebase project? No.** GitHub was replaced by a scripted stand-in (`backend/tests/github/fakeGithub.ts`) that speaks the documented shapes (OAuth token exchange, revocation, GraphQL `data`/`errors`, rate-limit headers). Storage was tested in memory and on the Firestore **emulator**. The stand-in proves our request construction and response handling; it does not prove the real service behaves identically. Live OAuth is **pending** (section 11).

The GraphQL Learning Lab is not part of this phase and was not implemented.

## 1. What was built

- **Settings page** (`/settings`): connect, sync, disconnect GitHub; shows status, account, last synchronisation, freshness and errors. GitHub returns the browser here.
- **GitHub insights page** (`/github`): contribution heatmap with date range, GitHub's own total, active days, longest streak, monthly and weekly totals, repository cards, recent pull requests/issues/reviews, and a portfolio checklist. Every block shows its source, sync time and freshness, plus loading, error, empty, unavailable and disconnected states.
- **Backend** `backend/src/github/`: `vault.ts` (token encryption), `store.ts` (memory and Firestore), `oauth.ts`, `client.ts` (GraphQL transport), `queries.ts` (documents and response schemas), `normalize.ts` (normalisation, summaries, checklist), `sync.ts`, `service.ts`, `context.ts` (mentor summary); routes in `routes/github.ts`.
- **Mentor**: the existing Phase 6 mentor receives a short summary of the saved data when the message is about GitHub or projects.

## 2. Authorisation flow and permissions

1. Signed in, the student presses **Connect GitHub**. `POST /api/github/connect` (bearer token) creates a random `state` and PKCE verifier, stores `sha256(state)` with the verified uid, the verifier and a 10-minute expiry, and returns GitHub's authorization URL. The student's UNBLUFF session is untouched.
2. GitHub redirects the browser to `GET /api/github/oauth/callback`. This request cannot carry a bearer token, so it is the only unauthenticated GitHub route. It accepts only `code`, `state` and `error` (validated), consumes the state exactly once, and identifies the student **only** by the stored record, never by anything in the request.
3. The server exchanges the code (with the client secret and PKCE verifier), checks the granted scopes, reads the viewer identity, claims the GitHub account for this student, encrypts and stores the token, and redirects to `<app>/settings?github=connected` (or `?github=error&reason=...`). No code, state or token is placed in any URL.

**Permissions:** no scope is requested (GitHub then grants read access to public information). `read:user` is tolerated. A token carrying anything wider (`repo`, `write:*`, `admin:*`, `workflow`, `delete_repo`, ...) is revoked and refused with `excessive_permissions`. Nothing in the code can write to GitHub (no mutation exists in the query documents; a test asserts it).

**Private repositories are not supported.** GitHub OAuth apps only have the `repo` scope for private repositories, which includes write access. Read-only private access would need a separate GitHub App with fine-grained read permissions; that is a possible later addition, would need separate explicit authorisation, and is not built.

Known, accepted limitation: because the callback is identified by `state`, someone could send another person their own authorization link; completing it links *the victim's public GitHub data to the sender's UNBLUFF account*, never the reverse. Only public data is involved, and the victim can see the app in their GitHub authorised applications.

## 3. Credential protection and retention

- Tokens are encrypted before storage with **AES-256-GCM**. The key is `GITHUB_TOKEN_ENCRYPTION_KEY` (32 random bytes, base64) from the environment or a secret manager, **never stored in the database**. The uid and GitHub account id are authenticated data, so a ciphertext copied to another student or account does not decrypt. A key id is stored for rotation: put the new key in `GITHUB_TOKEN_ENCRYPTION_KEY` and the old in `GITHUB_TOKEN_ENCRYPTION_KEY_RETIRED`.
- Tokens never appear in API responses, URLs, logs (logger redaction covers token, code, state, verifier and secret fields), local/session storage, frontend variables, the mentor's context or cached data. Tests scan responses, redirects, logs, stored records and model prompts for the token, client secret, code, verifier, state and key.
- Firebase auth does not protect these records. Collections are read only by the backend (Admin SDK); production should also deny all client access to them in Firestore rules.
- Before every sync the token is decrypted for that student and account and the viewer id GitHub reports must equal the linked account; a mismatch, a 401 or an undecryptable record marks the connection `reauthorization_required` and deletes the dead credential.
- **Disconnect** stops synchronisation immediately: it deletes the connection, credential, cached insights and the account link, discards pending authorizations, then revokes the grant at GitHub (`DELETE /applications/{client_id}/grant`). If GitHub cannot be reached the local deletion still happens and the response says `revoked_at_github: false`. A disconnect during a running sync wins; nothing is resurrected.
- **Retention:** cached summaries are kept until disconnect or the next sync replaces them; there is no raw payload storage. There is no scheduled deletion job.

## 4. GraphQL operations actually used

All are fixed documents in `src/github/queries.ts` sent to `https://api.github.com/graphql`; values are GraphQL variables; each asks for `rateLimit { cost remaining resetAt }`.

| Operation | Fields used |
|---|---|
| `UnbluffViewer` | `viewer { id databaseId login url }` |
| `UnbluffContributions($from,$to)` | `viewer.contributionsCollection { startedAt endedAt restrictedContributionsCount totalCommitContributions totalIssueContributions totalPullRequestContributions totalPullRequestReviewContributions contributionCalendar { totalContributions weeks { firstDay contributionDays { date contributionCount } } } }` (at most 364 days) |
| `UnbluffRepositories($after,$since,$authorId)` | `viewer.repositories(first: 25, ownerAffiliations: OWNER, privacy: PUBLIC, orderBy: PUSHED_AT desc)`: `nameWithOwner name url description isPrivate isFork isArchived pushedAt updatedAt stargazerCount primaryLanguage languages(first: 5) licenseInfo repositoryTopics(first: 5) issues/pullRequests(OPEN){totalCount}`, your commit count in the last 90 days via `defaultBranchRef.target.history(since, author:{id})`, and the root file listing `object(expression:"HEAD:")` (names and types only). At most 2 pages. |
| `UnbluffActivity($from,$to)` | `viewer.pullRequests(first: 15)`, `viewer.issues(first: 15)` (title, url, state, date, repository), `contributionsCollection.pullRequestReviewContributions(first: 15)` |
| `UnbluffReadmes` | up to 10 aliased `repository(owner,name).object(expression: $e){ ... on Blob { byteSize isTruncated text } }`, only for README names GitHub itself listed |

These fields were taken from GitHub's published GraphQL schema and OAuth documentation; they were **not** run against the live API (no credentials), so any field-level difference would surface only on the first real sync (the response schemas reject unexpected shapes instead of guessing, and the section is then reported unavailable).

Handling: 10 s timeout; two retries with backoff for network errors, timeouts and 502/503/504; no retry for 401/403/rate limits; rate limits recognised from `x-ratelimit-remaining`, `Retry-After`, 429 and the GraphQL `RATE_LIMITED` type, and the reset time is honoured; a response with both `data` and `errors` keeps the data and records only the error type and path; an invalid shape is rejected. Items from private repositories are dropped even if GitHub sent them.

## 5. Synchronisation, caching and freshness

- Reads (`/contributions`, `/repositories`, `/activity`) never call GitHub; each response states the account, sync time, date range, `cached: true` and `freshness` (`fresh` within `GITHUB_FRESH_MINUTES`, default 360, otherwise `stale`; `never_synced` before the first sync).
- A manual sync within `GITHUB_MIN_SYNC_INTERVAL_MINUTES` (default 5) of the previous one, or before GitHub's rate-limit reset, is answered from the saved copy without a GitHub request. Concurrent syncs share one run; a stored lock (90 s, self-expiring) covers several server instances.
- Sections are stored independently; a failing section keeps its older copy, labelled with its older time, and the response lists `unavailable_sections`.
- Bounds: 2 repository pages (30 kept), 10 README reads, 100 KB of README text examined, 1 year of calendar, 15 pull requests/issues/reviews.

## 6. Portfolio checklist

For the student's own, public, non-fork, non-archived repositories (at most 10 are checked): description, README at the root, licence, install/run instructions, test instructions. Each item is `pass`, `fail` or `unknown`, with the evidence. `fail` is only reported when the needed data was retrieved (for example, the root listing showed no README, or the README was read in full without any install section); an empty repository, a truncated README or an unread README is `unknown`. When there is no README, install/test instructions are `unknown` (a docs folder is not checked). README text is only pattern-matched; it is never executed, followed or sent to the model.

## 7. AI mentor integration

When (and only when) the message is about GitHub, repositories, a portfolio, commits or projects, the mentor prompt includes `<github_activity>`: GitHub login, sync time and a STALE flag, the contribution totals, pull request/issue totals, up to 6 own repositories with names, language shares, last push date, your 90-day commits and yes/no/unknown checklist flags. It contains **no** tokens, repository descriptions, README text, pull request titles, day-by-day history or private data. If GitHub is not connected or storage fails, the prompt says there is no GitHub data and the mentor still answers. The system prompt requires the model to treat the block as data, quote it as observed facts, call its own judgements opinions, never judge code quality as measured, and never treat contributions as DSA practice or mastery. The response includes `github_context` and the UI says when a GitHub summary was used.

GitHub is separate from analytics: no GitHub module imports analytics, and a test asserts DSA analytics are byte-identical after connecting, syncing and chatting.

## 8. Routes, pages, persistence

- Routes: see CONTRACT.md section 5, "GitHub contribution insights". Rate limits: connect/disconnect 10/min and sync 6/min per student, callback 30/min per IP.
- Pages: `/settings`, `/github`; nav links "GitHub" and "Settings"; the mentor page shows when a GitHub summary was used.
- Firestore collections: `unbluff_github_states`, `unbluff_github_connections`, `unbluff_github_credentials`, `unbluff_github_identities`, `unbluff_github_insights`. Only single-document reads and single-field equality queries are used, so **no new index is required**. Nothing was deployed.

## 9. Tests

| Level | What | Result |
|---|---|---|
| Unit | vault (encryption, binding, tamper, rotation), GraphQL client (construction, errors, retry, rate limits, timeout, partial), OAuth requests, normalisation, checklist, mentor context, configuration | pass |
| Integration (Supertest, scripted GitHub, in-memory store) | 58 tests: state validation/replay/expiry, cancelled and failed callbacks, excess scopes, account-link ownership, token confidentiality across responses/logs/records/prompts, sync, pagination bounds, caching and staleness, duplicate-sync prevention, partial errors, rate limits, timeouts, reauthorisation, disconnect and cleanup, disconnect during sync, student isolation, public/private boundary, mentor context minimisation, DSA analytics unchanged | pass |
| Firestore **emulator** | store races (one-time state, identity claim, sync lock), isolation, end-to-end flow with nothing left after disconnect | 7 new, 29 emulator tests pass in total |
| Frontend (Testing Library, mocked API) | connection panel states, return-from-GitHub handling, insights page states, mentor note | 27 new, 143 pass in total |
| **Real GitHub / real OAuth app / real Firebase** | not run | **Not verified** |

Totals: backend 626 unit and integration tests pass (coverage 90.3 % statements; `src/github` 83.6 %), lint and typecheck clean, build succeeds; `npm audit --omit=dev` finds 0 backend vulnerabilities. Frontend lint, typecheck and build pass; `npm audit --omit=dev` still reports the 2 moderate `react-router` 6.x advisories noted in Phase 6.

## 10. Environment variables

| Variable | Purpose |
|---|---|
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | the OAuth App (secret: server only) |
| `GITHUB_REDIRECT_URI` | must equal the app's callback URL, `https://<api-host>/api/github/oauth/callback` (http allowed only for localhost outside production) |
| `GITHUB_TOKEN_ENCRYPTION_KEY` | 32 random bytes, base64, from a secret manager |
| `GITHUB_TOKEN_ENCRYPTION_KEY_RETIRED` | optional, earlier keys for decryption only |
| `GITHUB_FRONTEND_URL` | optional app origin to return to (defaults to the first `CORS_ORIGIN`) |
| `GITHUB_FRESH_MINUTES` (360), `GITHUB_MIN_SYNC_INTERVAL_MINUTES` (5), `GITHUB_TIMEOUT_MS` (10000) | tuning |

Set all of the first four or none: a partial setup fails at startup naming what is missing (never the values). With none set, the feature reports `not_configured` and everything else works.

Generate a key: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.

**Registering the GitHub OAuth App (non-production first):** GitHub > Settings > Developer settings > OAuth Apps > New OAuth App; Homepage URL = the app's URL; Authorization callback URL = `GITHUB_REDIRECT_URI`; enable no extra features; generate a client secret and put it in your secret manager. Do not request scopes.

## 11. Pending, requires a real environment

1. Create a non-production GitHub OAuth App and run the full flow once by hand: connect, sync, check the heatmap and repositories against github.com, revoke the app on GitHub and confirm "reconnect" appears, disconnect.
2. Confirm every GraphQL field in section 4 against the live schema (a first real sync will report any section GitHub rejects as unavailable).
3. Run `npm run test:emulator` in CI and the flow once against a non-production Firebase project; add Firestore rules that deny all client access to the five `unbluff_github_*` collections.
4. Decide on private-repository support (would require a GitHub App with fine-grained read-only permissions).
5. Decide whether to add a Firestore TTL or scheduled cleanup (none exists).
6. Frontend `react-router` 7 upgrade (carried over).

## 12. Commands

```bash
cd backend
npm run lint && npm run typecheck && npm run test:coverage && npm run build
npm run test:emulator
cd ../frontend
npm run lint && npm run typecheck && npm test && npm run build
```
