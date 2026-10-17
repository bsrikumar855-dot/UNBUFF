# Phase 8: Interactive GraphQL Learning Lab

**Verified against a live model, live Firestore or real students? No.** The Lab was verified with deterministic local schema execution, the mock mentor (no model is called), an in-memory store and the Firestore *emulator*, plus one manual run in a real browser against a local backend and the Auth emulator (section 11). Phase 7's live GitHub OAuth is still unverified and was not touched; its limitations in `docs/phase-7-github-insights.md` stand.

The cross-module placement-readiness orchestrator was **not** built.

## 1. What was built

- **GraphQL Lab** (`/graphql-lab`): learning path of 10 modules with your progress, definitions of every metric, recent activity, concepts that need another attempt, and a way to delete your Lab data.
- **Module page** (`/graphql-lab/modules/:id`): objectives and completion rule, lessons with runnable examples, an exercise list, and one exercise at a time with task, requirements, how it is graded, editor, variables, run, check, hints and result.
- **Playground** (`/graphql-lab/playground`): a free editor against the same training API (not graded).
- **Editor**: the existing Monaco build with a small GraphQL tokenizer (highlighting, bracket matching, auto-closing, `#` comments), loaded on demand, with a plain-text alternative. No second editor library.
- **Schema explorer**: types, fields, arguments, defaults and descriptions, built from the server's actual schema, with "insert" buttons and the enforced limits.
- **Response panel**: formatted JSON, `data` and `errors` side by side, the stage that stopped the request in words, and each error's category (syntax, validation, variables, execution, authorization, limit).
- **AI mentor help** (explain query, why it fails, hint, explain schema types, explain result, practice question).
- **Backend** `backend/src/graphqllab/`: `trainingApi.ts` (schema, data, resolvers), `engine.ts` (parse, validate, limits, execute), `model.ts` and `content/` (curriculum, trusted), `curriculum.ts` (registry and public views), `grading.ts`, `store.ts`, `service.ts`; routes in `routes/graphqlLab.ts`.

## 2. Curriculum

20 lessons and 55 exercises across 10 modules (27 query, 4 mutation, 16 multiple choice, 5 schema reading, 3 written explanation). Each module states objectives, completion criteria, lessons with explanations and examples, and exercises. Each of the ten modules has at least one query or mutation exercise and (from module 1 to 9) runnable examples.

| # | Module | Exercises | Covers |
|---|---|---|---|
| 1 | GraphQL fundamentals | 4 | what GraphQL is, client/server exchange, versus REST, request and response, first query |
| 2 | Schemas, object types and scalars | 5 | object and scalar types, fields, Query root, non-null, lists, introspection, predicting a response from a schema |
| 3 | Queries and nested fields | 5 | selections, relationships, minimal requests, aliases |
| 4 | Arguments and variables | 5 | arguments, enums, variable declarations, required and optional variables, defaults, reuse |
| 5 | Mutations | 6 | Mutation root, input objects, payloads, validation as `userErrors`, safe retries (per-student data only) |
| 6 | Fragments and reusable selections | 4 | named fragments, spreads, reuse, inline fragments on a union, when fragments help |
| 7 | Pagination | 5 | why paginate, cursors versus offsets, connections, edges, pageInfo, next page, variables |
| 8 | GraphQL errors and validation | 7 | syntax, validation, variable coercion, resolver and authorization errors, partial data |
| 9 | Practical API design | 5 | types and relationships, query and mutation boundaries, exposure, validation, resolver responsibilities |
| 10 | Interview practice | 9 | conceptual, schema-reading, query-writing and explanation questions of rising difficulty |

Prerequisites are declared and shown as "recommended first"; they are not enforced. Modules always open.

Exercise model (`model.ts`): stable id, module and lesson, type, difficulty, description, objectives, concepts, public requirements, starter query, public example, hint sequence, explanation (shown only after passing), a generic failure nudge, and trusted grading data (reference solution, hidden variable sets, structural rules, answer key or rubric). Version is 1 and provenance `authored_original`: all content was written for this project.

## 3. The training API

An invented, fixed "campus placement hub": 6 companies, 12 roles, 8 skills, plus each student's own applications. The schema (SDL in `trainingApi.ts`) has:

- Types `Company`, `Role`, `Skill`, `Application`, `Student`, a `SearchResult` union, enums, input types, mutation payloads with `userErrors`, and a cursor-based `CompanyConnection` (`edges`, `pageInfo`, `totalCount`; `first` 1 to 10, default 3; companies are paged in id order, so paging is deterministic).
- Queries `hello`, `company`, `companies`, `roles`, `role`, `skills`, `search`, `me`, plus two deliberate failure demonstrations: `adminStats` and `Company.hiringContact` (always `FORBIDDEN`, the first an authorization error beside valid data) and `unavailableReport` (a resolver error).
- Mutations `applyToRole`, `updateApplication`, `withdrawApplication` (safe to repeat), `resetTrainingData`. Rules: unknown role, duplicate application, note length (140), status machine, at most 12 applications. Dates and ids are derived from a counter, never the clock.

Resolvers are plain deterministic functions over this data and the caller's own state. Students supply only a document and variables.

## 4. Security controls

- Every route needs the verified token; the uid is never taken from the request; bodies are strict (an unknown field such as `url`, `headers` or `uid` is a 400). There is **no proxy**: the training schema is the only schema, and the code never fetches a URL or reads a header from a request.
- Before execution: query at most 4000 characters, variables at most 2000, at most 1500 tokens, depth at most 7 and at most 120 fields **after fragment expansion** (computed with memoisation, so a fragment bomb costs nothing; cycles are rejected by validation), one operation chosen explicitly, no subscriptions. During execution: a 1.5 s timeout and a 60 000-byte response limit. Introspection is allowed with its own, larger bounds.
- Unexpected exceptions are masked ("not caused by your query"); only errors the API raises on purpose are shown.
- **Hidden answers**: references, hidden variable sets, answer keys, rubrics, failure nudges, hint text and explanations are absent from every public response (tests check each endpoint and every exercise). The frontend source contains none either (a test scans it), so even its source maps cannot leak any.
- **Isolation**: all progress, attempts and training data are keyed by the verified uid and re-checked on read. Mutations change only the caller's record; grading runs on a scratch copy of the starting data. Another student's attempt id is a separate attempt, never a replay.
- Per-student rate limits: execute 60/min, submit, hint and reset 30/min, help 12/min.
- The student's query and variables are untrusted data to the model: delimiter look-alikes are defanged, and the system prompt marks the Lab context as data.

## 5. Grading

- **Query and mutation exercises**: the student's document is validated against the schema and executed once per hidden variable set on fresh training data; the trusted reference is executed the same way; the responses (data and error shapes) must be equal, ignoring key order. Mutations are also compared by the resulting data, so an extra write fails. Structural rules on the parsed document apply where the task names a technique (variables instead of literals, alias, named fragment spread twice, inline fragment, `__typename`). Equivalent documents pass (different order, fragments, operation name); a query pasted into a comment does not.
- The student's own variables are ignored for grading, so they cannot be used to pass.
- **Choice and schema-reading**: compared with the answer key; multi-select needs exactly the right set.
- **Written explanations**: a fixed rubric of key points (patterns), a number of which must be covered; the feedback names how many were covered and gives a nudging question for the first missing one. **The model does not grade or decide completion.**
- A failure explains: the real validation or syntax error, "extra data", "missing data", or a generic message; it gives the exercise's generic nudge and a link to the lesson. It does not reveal expected values, the reference or the rubric. The explanation of the answer is shown only after passing.

## 6. Persistence

Firestore collections (all owner-scoped; single-document reads and equality queries only, so **no new index is required**; nothing was deployed):

| Collection | Id | Content |
|---|---|---|
| `unbluff_graphql_lab_state` | uid | the student's training data |
| `unbluff_graphql_lab_progress` | uid | per exercise: attempts, passed, `passed_at`, hints used, counted attempt ids; recent activity |
| `unbluff_graphql_lab_attempts` | derived from uid, exercise and client attempt id | query/answer, result, feedback, checks |

Progress is updated in a transaction. A submission stores the attempt first and counts its id at most once, so a retry after a failure is safe; `passed_at` is set only by the first pass and a later failure never undoes a pass. Only the newest 20 attempts per exercise are kept. A student can delete everything (`DELETE /api/graphql-lab/progress`). There is no scheduled deletion job and no expiry.

## 7. AI mentor behaviour

`POST /api/graphql-lab/help` runs the student's query itself (on a throw-away copy of their data) and sends the existing mentor (same provider, memory store and rules as chat) a context block: the action, the public exercise text, the real schema types the query touches, the query, variables, the **actual** result (stage, errors with messages, truncated data) and a list of completed modules. The mentor therefore bases explanations on parser and validation messages. It never receives the reference, hidden checks, hints or explanations, so it cannot reveal them; it is told not to claim success without a result, not to invent fields, and not to call external APIs. It receives no secrets (the Lab handles none). Memory: only the existing evidence guard applies, against the student's own typed question (not their query); saved items are ordinary mentor memories, visible and deletable on the memory page. If the model fails, help returns an error and the playground, grading and progress continue unaffected.

## 8. Analytics

`GET /api/graphql-lab/progress` returns modules started and completed, lessons completed, exercises attempted and passed, attempts, the current module, recent activity and the concepts of exercises attempted but not yet passed, with a definition of each metric, and an honest empty state before the student starts. Playground runs are not attempts. Nothing is combined with DSA analytics or any readiness score, and a test shows DSA analytics are unchanged by Lab use.

## 9. Verification

| Level | What | Result |
|---|---|---|
| Unit | schema validity and derived documentation, queries, nesting, aliases, fragments, unions, variables and coercion, pagination, syntax/validation/execution/authorization errors, masking, limits (size, tokens, depth, fragment bomb, cycles, result size, timeout), mutations and isolation | 36 tests pass |
| Unit | curriculum structure, every runnable lesson example, every reference passes and every starter fails its own grader, hints never contain the solution, choice and rubric grading, public views leak nothing | 19 tests pass |
| Integration (Supertest, in-memory store, mock model) | authentication, no-proxy boundary, endpoints, playground, grading including equivalent queries and variable/mutation/pagination exercises, idempotent retries, duplicate completion, lesson and module completion, hints, attempts retention, progress, cross-student isolation, deletion, storage failures, mentor help (context, errors, no leaked answers, injection, failure fallback, memory), regressions | 45 tests pass |
| Firestore **emulator** | atomic progress updates, owner isolation, deletion, end-to-end flow | 3 new, 32 emulator tests pass in total |
| Frontend (Testing Library, mocked API, Monaco replaced by a textarea) | overview, playground, module and exercise flows, failure states, hints, help | 28 new, 171 pass in total |
| Real browser (manual, local) | Monaco GraphQL editor, real execution, real grading of the unchanged starter | ran; see section 11 |

Totals: backend 726 unit and integration tests pass (coverage statements 90.1 %; `src/graphqllab` 88.9 %), lint and typecheck clean, build succeeds, `npm audit --omit=dev` 0 vulnerabilities. Frontend lint, typecheck and build pass; the audit still reports the two moderate `react-router` 6.x advisories noted in Phase 6. **Not run:** anything against a live model, live Firestore or live GitHub.

## 10. Setup, commands, limitations

No configuration is needed: the Lab has no environment variables. It uses the mentor's model settings when a live model is configured; otherwise the mock mentor answers and is labelled.

```bash
cd backend
npm run lint && npm run typecheck && npm run test:coverage && npm run build
npm run test:emulator
cd ../frontend
npm run lint && npm run typecheck && npm test && npm run build
```

Limitations:

- **Live model not verified.** Help quality and the model's resistance to hostile queries are untested; only the deterministic guards (no answer in context, defanging, evidence guard) are tested.
- No autocomplete popup in the editor (see DECISIONS.md); the schema reference replaces it. The Monaco GraphQL mode was checked once by hand, not by an automated browser test (Monaco cannot run in jsdom).
- Written answers are graded by keyword patterns, which can miss a correct answer phrased unusually or accept a superficial one.
- Prerequisites are recommendations; the mock mentor is a regex stand-in; there is no streaming; attempts are pruned to 20 per exercise; no scheduled deletion.
- Content was authored once and has had no review by teachers or real students.
- The training API is not federated or real-time: no subscriptions, directives beyond the built-in ones, or file upload.

## 11. Manual browser check (local, not automated)

Auth emulator, backend (memory store, mock model) and the Vite app were started locally, a throwaway account was created in the **emulator**, and the playground and module pages were opened in a browser: the editor loaded with GraphQL highlighting, a query ran against the real backend and its `data` was shown, the schema reference listed the real types, and submitting the unchanged starter of exercise 1.2 returned "Not yet" with the actual syntax error and no pass. All processes were stopped afterwards. This does not replace automated browser tests.
