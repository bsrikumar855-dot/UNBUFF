# Phase 5: DSA analytics and revision engine

## What counts as real activity

Each stored submission now carries provenance (`analytics_status`, plus internal `provider`, `provider_verified`, `suite_license`). A submission is **counted** only if all of these hold:

1. It is a *judged submission* (Submit, not Run). Run and sample runs are never stored, so they cannot count.
2. The suite is not a demonstration or `development_fixture` suite.
3. The execution service was declared a real, verified deployment by the operator when it was judged (`EXECUTION_PROVIDER_VERIFIED=true`, default **false**).
4. The judge did not fail (`judge_error` is excluded: it says nothing about the student's code).

Everything else is stored but excluded, with a reason: `excluded_demonstration`, `excluded_unverified_provider`, `excluded_judge_error`, or `excluded_unknown_provenance` (records written before this phase, treated conservatively and never promoted, not even by a rebuild). A self-reported "solved" mark from the DSA progress page is shown in its own `self_reported` block and never feeds the judged numbers.

The verification flag exists because Phase 4 has not been checked against a real Judge0: the code cannot tell a real service from a stand-in. Until you set the flag, the dashboard honestly shows "no counted activity" plus how many submissions were excluded and why.

## Metric definitions (`src/analytics/metrics.ts`)

| Metric | Definition |
|---|---|
| `solved_unique` | distinct questions with at least one counted accepted submission (many accepted submissions of one question count once) |
| `attempted_unique` | distinct questions with at least one counted submission |
| `eligible_attempts`, `accepted_attempts` | counted submissions, and the accepted ones among them |
| `submission_success` | accepted / counted submissions |
| `first_attempt_success` | among attempted questions, the share whose **first recorded counted submission** was accepted. "First recorded" means since tracking began; attempts made earlier (or excluded ones) are not known |
| topic or difficulty `accuracy` | accepted / counted submissions inside that topic or difficulty |
| topic or difficulty `solve_rate` | questions solved / questions attempted inside it |
| weekly buckets | counted submissions, accepted submissions and first solves per week (Monday, UTC), zeros included |
| comparison | last 28 days against the 28 days before; available only if both have at least 5 submissions |

A question with several topics counts once in each of its topics. Every ratio is returned as `{ value, numerator, denominator, available, min_sample, note }`. Below the minimum (5 submissions, 3 questions for solve rates) `value` is null and the UI says how much data is missing instead of showing a percentage.

## Weakness rules (`src/analytics/weakness.ts`, thresholds in `config.ts`)

Failures are split: **algorithmic** = wrong answer and time limit exceeded; **technical** = compile and runtime errors. Per topic, evaluated in this order:

1. `insufficient_data`: fewer than 3 distinct questions or fewer than 5 submissions. One failed question never makes a topic weak.
2. `weak`: at least 3 algorithmic failures and a question solve rate of 50% or less; **or** at least 2 solved questions that failed 2+ more times afterwards (forgetting).
3. `technical_issues`: at least 3 technical failures and at least as many as algorithmic ones (reported as syntax/input/crash trouble, not a topic gap).
4. `watch`: at least 2 algorithmic failures with a solve rate under 75%, or mixed results.
5. `strong`: solve rate 75% or more and accuracy 60% or more.

A trend (`improving`, `declining`, `stable`, `insufficient_data`) compares the last 14 days with the 14 before (3+ submissions each, 20-point change). Each result carries the evidence counts and plain-language explanation lines. Nothing is learned or AI-generated.

## Revision queue (`src/analytics/revision.ts`)

One item per student and question (document id `<uid>~<questionId>`), so duplicates cannot exist. Tiers: **1** repeated failure (3+ failures in a row), **2** unsolved with previous attempts, **3** spaced review overdue, **4** spaced review upcoming, **5** a weak-topic suggestion the student chose to add. Order: tier, then earlier due date, then question id. Maximum 200 items per student.

- A counted failed submission creates the item (due now) or updates the existing one (reason, context, history; due now, stage 0). It never creates a second item. Replaying the same submission changes nothing.
- A counted accepted submission turns an existing item into spaced review (stage 0, due in 1 day). A clean first-try solve creates no item.
- Review intervals (days): 1, 3, 7, 14, 30 (the last repeats). **Actions** (`POST /api/me/dsa-revision/:questionId/actions`): `start`; `complete` with outcome `remembered` (next stage) or `struggled` (back to stage 0), only for due or in-progress items; `postpone` by 1 to 14 days (default 2); `revisit` to bring a scheduled or postponed item back to due. A later failure reopens the item whatever its state.
- Each item records question id, owner, reason, priority, due date, status (`pending`, `in_progress`, `scheduled`, `postponed`), stage, last reviewed time, postpone count, performance context and up to 20 history events.
- Weak-topic **suggestions** (unsolved questions from `weak` topics, one per topic first, at most 5) are computed on request and never added automatically; adding is idempotent.

## Storage and consistency

| Collection | Key | Purpose |
|---|---|---|
| `unbluff_code_submissions` (extended) | submission id | provenance fields added; old records read as unknown provenance |
| `unbluff_dsa_stats` (new) | `<uid>~<questionId>` | per-question rollup: counters, first attempt, failure kinds by type, streaks, last 50 events |
| `unbluff_dsa_revision` (new) | `<uid>~<questionId>` | the revision item |

Dashboards read a student's rollup records (at most one per catalogue question), not their submission history. The excluded-submission counts look at the latest 200 submissions and need the new Firestore index `(owner_uid asc, created_at desc)` on `unbluff_code_submissions`, defined in `firestore.indexes.json` (and referenced from `firebase.json`). **An operator must deploy it** (`firebase deploy --only firestore:indexes --project <id>`); this phase did not. If it is missing, only those counts degrade ("unavailable"); everything else works. The emulator does not enforce indexes, so that path was not exercised for real.

Updates are not one transaction (submission, statistics and revision are separate writes). Order: submission saved first; then statistics and revision, each **idempotent per submission id**. If the analytics step fails, the submission is still returned and stored, the error is logged, and the next submission on that question, a retry, or `POST /api/me/dsa-analytics/refresh` repairs the state (refresh rebuilds statistics from stored counted submissions, fills in missing revision items for failing questions, and never modifies existing items). Provider failures store nothing and update nothing. Within one process updates for a student are serialized; across several instances two simultaneous submissions could race (the idempotent event ids keep totals from double counting, but one write could overwrite the other until the next refresh).

## API and routes

Backend (all under `/api/me`, token required; the owner is always the verified uid): `GET /dsa-analytics` (everything the dashboard needs: totals, rates, topic and difficulty breakdowns, weaknesses, weekly trend, recent activity, repeated failures, comparison, self-reported and exclusion counts), `GET /dsa-analytics/history?from&to`, `POST /dsa-analytics/refresh`, `GET /dsa-revision?view&page&page_size`, `GET /dsa-revision/:questionId`, `POST /dsa-revision`, `POST /dsa-revision/:questionId/actions`. Documented in `CONTRACT.md`; `CodeSubmission` gained `analytics_status`. Topic and difficulty breakdowns are part of the overview response rather than separate endpoints, to avoid several reads per page load.

Frontend: `/dsa/analytics` (dashboard) and `/dsa/revision` (queue with actions, views and suggestions), both sign-in only, linked from the DSA Arena page. Charts are plain DOM bars (no charting library) with the numbers as text, a `figcaption` summary, and screen-reader text for every week. Every figure comes from the API; the empty state explains what counts, and excluded submissions and demonstration data are called out separately.

## Tests (this run)

| Suite | Result |
|---|---|
| Backend lint, typecheck, build | pass |
| Backend unit + integration | **373/373** (34 files); coverage 92.1% statements, 85.5% branches, 93.7% lines |
| Backend emulator (`npm run test:emulator`) | **18/18** (5 files), includes statistics, revision and submission queries on the Firestore emulator |
| Frontend lint, typecheck, build | pass |
| Frontend tests | **94/94** (11 files); one timing-dependent test was found flaky and made deterministic, then 5 consecutive full runs passed |
| `npm audit --omit=dev` | backend 0; frontend only the 2 pre-existing moderate `react-router` advisories |

Covered: unique solved counts, attempted versus solved, first-attempt rates, topic and difficulty aggregation, insufficient data, exclusion of fixture, unverified-provider, judge-error and legacy records, Run and sample runs never counted, self-reported marks kept separate, weak-topic rules with small and large samples, technical versus algorithmic failures, trends, revision priority, due dates, deduplication, completion, postponement, later failures, duplicate delivery, refresh equivalence, user isolation, and storage or provider failures.

## Limits, mainly from the missing real Judge0

- **No real execution has been verified.** Automated tests use `FakeProvider`; a browser check used a throwaway local stand-in that speaks the Judge0 protocol with canned output (outside the repo), with `EXECUTION_PROVIDER_VERIFIED=true` and non-demonstration copies of the suites, only to see the dashboard and queue render real API data. Those numbers were produced by canned results and prove only that the pipeline counts what it is given. With the default configuration nothing counts.
- The flag is an operator declaration, not a check. Setting it for a service that is not real would let stand-in results count.
- The only authored suites are the three demonstration exercises, so out of the box no submission counts even with a verified service. Real analytics need real, licensed suites (Phase 4 import flow).
- First-attempt success covers attempts since tracking began. Topic and difficulty on a rollup are the catalogue's values at the last update (a rebuild refreshes them).
- Weekly and comparison figures use each question's last 50 events; counters (totals, rates, streaks) are lifetime.
- Thresholds are sensible defaults, not validated against real student data. They are in one config object so they can be tuned.
- Judged submissions are not yet removed from analytics when the student deletes the submission or their account (statistics are derived data; a rebuild only reads existing submissions, so it would drop them). Account deletion is not implemented.

## Commands

```bash
# Backend
cd backend && npm ci
LLM_MODE=mock npm run lint && npm run typecheck && npm run test:coverage && npm run build
npm run test:emulator            # needs Java; downloads firebase-tools and emulators on first use
# Analytics only count when you set EXECUTION_PROVIDER=judge0, JUDGE0_URL, JUDGE0_AUTH_TOKEN, CODE_SUITES_PATH (real suites)
# and, after confirming the service is real, EXECUTION_PROVIDER_VERIFIED=true.

# Frontend
cd frontend && npm ci
npm run lint && npm run typecheck && npm test && npm run build && npm run dev
```
