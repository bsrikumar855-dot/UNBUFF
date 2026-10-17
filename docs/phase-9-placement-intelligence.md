# Phase 9: Unified placement intelligence

**Verified against a live model, live Firestore, a real Judge0 service or live GitHub OAuth? No.** The planner was verified with the deterministic mock mentor, in-memory stores, a scripted GitHub stand-in, directly written analytics and interview records, and the Firestore *emulator*, plus one manual run in a real browser (section 12). Nothing in this phase changes the outstanding requirements in `docs/phase-5.1-operational-readiness.md` (real Judge0), `docs/phase-7-github-insights.md` (live GitHub OAuth) or `docs/phase-8-graphql-lab.md` (live model).

## 1. What was built

One personalised study plan on top of the existing modules, without a second mentor, a second memory store or a second analytics engine:

- **Goals and availability** (`/placement`): target roles, optional placement date, study days, daily minutes, language, self-reported level, strengths, weak areas, priorities. Editable at any time.
- **Evidence aggregation**: reads what DSA analytics, the revision queue, interview sessions, the GraphQL Lab, the GitHub cache and the mentor's memory already know.
- **Skill assessments per area**: estimate, amount of evidence, recency, confidence, gaps, next assessment, provenance. **There is no overall readiness score and no offer probability.**
- **Adaptive plan**: deterministic planner, daily and weekly views, task lifecycle, rescheduling, a change log with reasons.
- **Plan assistant**: the existing Phase 6 mentor explains the plan; a deterministic answer is always returned; changes are proposed, then validated and applied by the backend only when the student presses Apply.
- **Dashboard**: today, week, skills, readiness, history, limitations.

## 2. Architecture (`backend/src/placement/`)

| File | Role |
|---|---|
| `profile.ts`, `dates.ts` | strict validation of goals (real dates, today to two years ahead, roles in the catalogue, 15 to 480 minutes, at least one day, no topic both strength and weakness), calendar helpers |
| `evidence.ts` | `EvidenceService.collect(uid)`: one bounded read per source; a failing source becomes a limitation instead of an error |
| `skills.ts` | pure `assessSkills`: per-area assessments, coverage, limitations, method text |
| `planner.ts` | pure rules: candidate generation, scheduling, feasibility |
| `service.ts` | orchestration: profile, `reconcile` (the only place plan state changes automatically), task actions, assistant, change application, dashboard read model |
| `assistant.ts` | intent detection, deterministic answers, proposed changes, the facts given to the mentor |
| `store.ts` | memory and Firestore stores |

Reuse, not duplication: DSA numbers come from `AnalyticsService` (a small `questionOutcomes` accessor was added over its own statistics), interview skill states from the existing `buildReport`, GraphQL results from `LabService` (a read-only `studentExercises` accessor was added), project context from `GithubService.cachedForMentor`, goals and defaults from the mentor's memory, conversational help through `MentorService.tutorHelp` (extended with a `plan` kind and a plan system prompt; the same provider, memory rules and evidence-quote guard).

## 3. What counts as evidence

| Source | Counts as | Does not count |
|---|---|---|
| DSA | counted judged submissions only (analytics rules: eligible suite, execution service declared verified, not mock, all hidden tests judged) | runs, sample runs, demonstration or fixture suites, mock or stand-in results, unverified provider, unknown provenance, self-reported progress marks |
| Interview | the existing report's skill state and proficiency for the target roles | results graded by the built-in mock model: shown as *demonstration*, with no estimate |
| GraphQL Lab | exercises whose check passed (decided by running the query against a reference) | reading a lesson; there is no reading-only completion |
| GitHub | context: observed checklist gaps and counts | skill (no estimate, never counted in coverage); absence costs nothing |
| Self-reported | shown beside the reading ("You listed this as a weak area") | never part of an estimate or of a status |

Every limitation is listed on the dashboard: code execution not configured, execution service not declared verified, demonstration suites, excluded submissions, mock-model interviews, GitHub not set up, not connected, needing reconnection, stale, and any source that could not be read. Those marked "limits accuracy" are shown first.

## 4. Skill assessment rules (`skills.ts`, `SKILL_RULES`)

- **DSA topic**: estimate = questions solved / questions attempted, only when the analytics minimum sample is met; status from the analytics weakness status (weak, technical issues or watch, strong), falling back to estimate thresholds (strong at 0.75, developing at 0.4). Confidence: low from 3 judged submissions on 1 question, medium from 6 on 3, high from 12 on 5. Below that the area is *provisional* (some evidence, no estimate).
- **Interview skill**: estimate = proficiency; ready is strong, needs work is developing (proficiency 0.4 or more) or weak; confidence from the number of recorded assessments (1 low, 2 or a retest medium, 3 high). Skills not yet assessed are *unassessed*.
- **GraphQL**: estimate = exercises passed / all exercises, once any exercise has been attempted; confidence from exercises attempted (1 low, 6 medium, 15 high).
- **Recency**: days since the last evidence: recent up to 14, ageing up to 45, old after that.
- **Coverage** = the number of areas with at least medium confidence out of the areas in scope. It describes how much has been measured, not how well the student is doing, and says so.
- Areas in scope: DSA topics that have a judging suite, interview skills of the chosen roles, GraphQL when the student chose it, has used the Lab or the role lists an API skill. The model supplies none of these numbers.

## 5. Planning rules (`planner.ts`)

Candidates, in priority order (1 is most urgent). Each carries a stated reason, the record or rule behind it, completion criteria, and whether it completes automatically (`verified_event`) or by the student:

| Rule | Task | Priority | Reason is grounded in |
|---|---|---|---|
| R1 | DSA revision for each revision-queue item that is due | from the queue's own priority (1, 2 or 3) | the revision item's reason and failure count |
| R2 | practice for up to 2 weak topics (1 question each in a reduced plan), easiest unattempted, judgeable questions first | 2 | the analytics weakness explanation |
| R3 | up to 3 first measurements for unassessed topics (the student's own weak areas first) | 2 for the first, 3 after | "no verified result for X yet" |
| R4 | one technical interview a week per target role, focused on weak or unassessed skills; skipped when a session already happened this week | 2 with an unresolved gap, else 3 | the latest assessed skill state |
| R5 | HR and communication practice in the mentor's Interview Practice mode, only when chosen | 3 | the student's own priority |
| R6 | the next 1 or 2 unpassed GraphQL Lab exercises; the second depends on the first | 2 if chosen, else 3 | Lab progress and the role's API skill |
| R7 | one project task per observed GitHub checklist gap | 4 | the observed checklist failure |
| R8 | a 15-minute weekly review | 5 | planning rule |

Not planned: DSA tasks when code execution is not configured or no question has a suite (no valid completion criteria); anything about companies (the planner has no company question data and says so); a question already attempted (those belong to the revision queue); a question completed, skipped or removed in the last 30 days. Open tasks never push the same need to a different question, so refreshing does not grow the plan (a cap of 14 open tasks also applies).

Scheduling: tasks are placed greedily by priority on the first study day with room (dependencies first), never beyond the daily minutes, only within 14 days and before the placement date; a task longer than a day is placed alone on an empty day. **Feasibility**: required = open priority 1 and 2 work plus new priority 1 and 2 candidates; available = the student's own study minutes until the day before the placement date. Required up to 80 % of available is *ok*, up to 100 % *tight*, more is *insufficient*, in which case a reduced plan (priority 3 and above only, fewer tasks) is made automatically and the message states both numbers. With no date, feasibility is `no_deadline` and says so.

## 6. Task lifecycle and adaptation

Task fields: stable id (sha-1 of the student and the activity, with a cycle key for revisions and weeks), owner, type, title, description, skill area, priority, minutes, due date, link, reference, completion criteria and check, evidence source, reason and codes, dependencies, status, postponed count, skip reason, completion time and source, history.

Student actions (`POST /api/placement/tasks/:id/action`): start, complete, postpone (1 to 14 days to the next study day), skip (reason required), reschedule (today to 90 days), remove, reopen. A task that waits for another cannot be started or completed. Completing a task yourself is recorded as such; for a `verified_event` task it is **not** evidence.

`reconcile` (called by Refresh, the first plan creation and Regenerate; it is idempotent and bounded) does, in order:

1. completes tasks the real record proves, once: a counted judged solve (or any counted attempt for a first measurement made after the task existed), a revision review recorded after creation, a passed Lab exercise, an assessed interview session created after the task, a mentor conversation of at least two exchanges after the task, a GitHub synchronisation after the task showing the check passing;
2. supersedes planned tasks that can no longer apply (revision no longer due, question no longer judgeable, GitHub disconnected, a past week's weekly task), with the reason; unrelated tasks are untouched;
3. follows the revision queue's own priority when it changes;
4. on Regenerate, supersedes only planned, non-student-scheduled tasks the rules no longer recommend; completed, skipped, removed, started and student-scheduled tasks are kept;
5. moves unfinished work from past days forward, in priority order, **without** counting it as postponement or failure;
6. adds new tasks that fit, skipping any whose id already exists in any state (so duplicates are impossible and finished or skipped work is not recreated).

Changing goals or availability moves work that no longer fits (lowest priority first) and records `profile_changed` and each move. Every change appears in the plan's change log (bounded to 60) with its reason.

## 7. Plan assistant

`POST /api/placement/assistant` detects the question (today, why, what changed, feasibility, weakest verified skill, lighter plan, revise, other) and always returns a deterministic `answer` built from the stored dashboard: the task list with reasons, the stored feasibility message, the change log, the weakest area **with enough evidence** (otherwise it says it cannot name one and what to do instead), and revision tasks. It then asks the mentor, through the same provider and rules as chat, to explain the same facts: the context block contains only application-calculated values and states that the mentor cannot change the plan, may not invent scores or probabilities, and must label self-reported, demonstration and unavailable evidence. If the model is unavailable the response still contains the answer and says why there is no explanation. **Proposed changes** (lighter day, postpone a day, set daily minutes) come from the application's own parsing of the request; nothing changes until the student applies one, and `POST /api/placement/changes/apply` validates it again. A learning memory can be saved only through the existing evidence-quote guard from the student's own message.

## 8. Persistence

Collections (owner-scoped; single-document reads and `owner_uid` equality queries only, so **no new Firestore index is required**; nothing was deployed): `unbluff_placement_profiles` and `unbluff_placement_plans` (id = uid), `unbluff_placement_tasks` (id derived from the activity). A read lists at most 400 tasks; closed tasks beyond the newest 120 are dropped (skipped and removed ones are kept so they are not suggested again). Operations are serialised per student within one server process. With several server instances two concurrent refreshes could interleave; deterministic task ids make duplicate tasks impossible, but the last write to a task wins. `DELETE /api/placement/data` removes goals, plan and tasks and leaves every other module's records alone.

## 9. Dashboard (`/placement`, nav "Placement plan")

Goals form (with mentor-memory suggestions that are never applied without Save); plan status with feasibility, version and buttons (Refresh from my results, Edit goals, Regenerate with a reduced option, behind a confirmation); today's plan with per-task reason, completion rule, link, Start, Mark done, Postpone a day, Move to a date and Skip with a reason; the next seven days with planned, completed and available minutes; the assistant; skills overview with evidence line and gaps; readiness (enough evidence, needs work, not assessed, recommended next assessments); progress history (completed tasks and how, validated improvements, repeated difficulties, revision summary, change log); and the limitations. Every value comes from the API; empty states are explicit and no readiness percentage exists.

## 10. Endpoints

See CONTRACT.md section 5, "Unified placement intelligence": `GET/PUT /api/placement/profile`, `GET /api/placement/dashboard`, `POST /api/placement/refresh`, `POST /api/placement/plan/generate`, `POST /api/placement/tasks/:id/action`, `POST /api/placement/assistant`, `POST /api/placement/changes/apply`, `DELETE /api/placement/data`. New errors `PLACEMENT_PROFILE_REQUIRED` (409) and `PLACEMENT_TASK_NOT_FOUND` (404).

## 11. Verification

| Level | What | Result |
|---|---|---|
| Unit | profile validation, calendar, slotting and feasibility, skill assessment (provisional, estimate, weak, self-reported, stale, unverified, demonstration, GraphQL, GitHub context, coverage), completion proof and obsolescence, rebalancing, intents, deterministic answers, proposals | 44 tests pass |
| Integration (Supertest, in-memory store, mock model, scripted GitHub) | authentication and strict bodies, goals, empty student, generation (explained, feasible, deterministic ids, dependencies, idempotent), evidence honesty (no execution, unverified execution, demonstration suites, mock interviews, weak topics, provisional), GitHub optionality, adaptation (revision, GraphQL unlock, practice, interview, weekly expiry, missed days, infeasible deadline, availability change), task lifecycle, regeneration, bounded reads, ownership and deletion, storage failure, assistant (answers, model failure, proposals, application, validation, injection, memory, rate limit), role and priority rules, regressions | 57 tests pass |
| Firestore **emulator** | store ownership and bounds, planner end to end, isolation, deletion | 2 new, 34 emulator tests pass in total |
| Frontend (Testing Library, mocked API) | goals, today, week, actions, plan status, skills and evidence labelling, history, readiness, assistant | 28 new, 199 pass in total |
| Real browser (manual, local) | goals form, plan creation, honest "code execution not configured" and mock-model limitations | ran; section 12 |
| **Live model, real Judge0, live GitHub OAuth, real Firestore** | not run | **Not verified** |

Totals: backend 827 unit and integration tests pass (coverage statements 90.0 %; `src/placement` 89.4 %), lint, typecheck and build clean, `npm audit --omit=dev` 0 vulnerabilities, index check OK. Frontend lint, typecheck and build pass; its audit still reports the two moderate `react-router` 6.x advisories noted in Phase 6.

## 12. Manual browser check (local, not automated)

Auth emulator, backend (memory store, mock model, no code execution configured) and the Vite app were started locally; a throwaway account was created in the **emulator**; the goals form was filled and saved. The plan was created with 4 tasks (two GraphQL exercises with the second waiting for the first, a technical-interview task, a weekly review), no DSA task, "Fits your time", and the dashboard listed that code execution is not configured and that interview results are demonstrations. All processes were stopped afterwards. This is not an automated browser test.

## 13. Limitations and what needs a real environment

1. A live model has not been tried: explanations, and the mentor's adherence to "facts only", are tested only through the mock and through assertions on the prompt.
2. DSA evidence needs a real, operator-verified Judge0 deployment (Phase 5.1 checklist). Until then DSA areas show "cannot be assessed" and DSA tasks can only be marked done by the student.
3. GitHub context needs live OAuth (Phase 7 checklist); here it was a scripted stand-in.
4. Real Firestore: run the emulator suite in CI and the flow once against a non-production project.
5. The catalogue has one role (`frontend_developer`); role-based rules are generic (any role listing an API skill triggers GraphQL work) and have only been exercised with that role.
6. No company question data exists; target companies are stored as the student's own goal and are never used to claim what a company asks.
7. Adaptation runs when the student refreshes or acts (there is no scheduler), and evidence is read on every dashboard request (bounded: up to 5 000 statistics, 10 interview sessions).
8. Interview and conversation tasks complete from the existence of a new assessed session or a conversation of two exchanges; the planner cannot judge how well the interview went (the interview module does).
9. Multi-instance concurrency is described in section 8. Time zones: plans work in UTC calendar days.

## 14. Commands

```bash
cd backend
npm run lint && npm run typecheck && npm run test:coverage && npm run build
npm run test:emulator
cd ../frontend
npm run lint && npm run typecheck && npm test && npm run build
```

Local use: start the backend (mock model needs no key), sign in, open **Placement plan**, save goals, and use Refresh after practising, taking an interview or passing a Lab exercise.
