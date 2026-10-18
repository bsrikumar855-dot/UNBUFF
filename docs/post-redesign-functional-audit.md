# Post-redesign functional audit: DSA catalogue and live AI Mentor

Date: 2026-10-18. Scope: two reported problems after the Phase 11 redesign. Nothing was committed, pushed or deployed, no production data was touched, and no secret, token or private conversation is printed here. All live checks used the local Firebase Auth and Firestore **emulators**, synthetic users and synthetic messages.

## 1. DSA Arena shows only 10 questions

### Verified root cause

It is **data, not a pagination or rendering defect.** The request path is clean: `DsaArenaPage` / `DsaQuestionsPage` → `api.getCompanies` / `api.getQuestions` → `GET /api/companies`, `GET /api/questions` → `Catalogue` (in memory, loaded once from a validated JSON file) → server-side `paginate()` → rendered list with `total`, `total_pages` and a pager.

* The backend picks its catalogue file in `server.ts`: `DSA_CATALOGUE_PATH` if set, otherwise **`data/dsa/practice-pack.json` when `NODE_ENV=production`** (this is what `render.yaml` sets) and `data/dsa/fixture.json` otherwise.
* `practice-pack.json` is the first-party pack: **10 questions, 0 companies, 0 associations**, `license_status: own_work`. That is exactly the "10 questions, no companies" the Arena showed.
* `fixture.json` (local development) holds 24 invented sample questions and 3 invented sample companies, and is labelled `development_fixture` / sample data.
* No authorised company-wise dataset exists in the repository. `liquidslr/leetcode-company-wise-problems` declares no licence (Phase 0 and Phase 3), so it was **not** fetched, cloned, scraped or bundled, and no company links were invented.

### Numbers measured (this run)

| Catalogue | Stored | API `total` | Rendered | Pager |
|---|---|---|---|---|
| First-party practice pack (the production default) | 10 | 10 | 10 links on `/dsa/questions`, "10 questions" | none: one page |
| Development fixture | 24 | 24 (`page_size=10` gives `total_pages: 3`) | covered by tests | 3 pages |

Pagination limits: page size defaults to 20 (frontend `PAGE_SIZE = 20`), the server caps it at 100, and the browser never loads an unbounded list. The 10 is not a limit anywhere in the code.

### What changed

* The Arena's empty state used to say only "This catalogue lists no companies." It now says how many questions the loaded catalogue holds, that none are linked to a company, and that company-wise lists appear only after an approved dataset with company links is imported (`DsaArenaPage.tsx`).
* Source labelling was already correct and is now pinned by tests: the practice pack is `own_work` and not sample data; the fixture is `development_fixture`, sample data, and its licence note says the links are invented.
* The import workflow already existed and was kept (`npm run dsa:import` / `dsa:validate`, `backend/src/dsa/importer.ts`, Phase 3 document). It is documented below.

### Importing a real company catalogue (requirements)

Only with documented rights. The importer refuses to run without a licence statement.

* **Input**: CSV with the header `company,title,url,difficulty,topics` (`difficulty` is `easy|medium|hard`; topics separated by `;`, `|` or `,`), or JSON as an array of those records or `{ "records": [...] }`.
* **Provenance** (all required): `--source-name`, `--license-status` (`licensed`, `permission_granted`, `public_domain` or `own_work`), `--license-note` (who gave permission, when, reference), plus optional `--source-url`, `--source-updated-at`, `--allowed-hosts`.
* **Behaviour**: all-or-nothing with every bad row listed; idempotent (re-importing the same input changes nothing, not even `imported_at`); merges into the existing file by default with stable question ids; `--replace` rebuilds; `--dry-run` writes nothing. It never downloads anything, and it will not accept the reference repository's URL unless the status is `licensed` or `permission_granted` with a note.
* **Deploying it**: ship the generated file with the backend and set `DSA_CATALOGUE_PATH` (and `CODE_SUITES_PATH` for judged exercises). Company question frequency and acceptance rates are not part of the schema and must never be invented.

**Still blocked:** an authorised company-wise dataset. Until one is supplied, company lists stay honestly empty.

## 2. AI Mentor possibly showing mocked answers

### Verified root cause

The code path is **correct**; the cause is configuration plus weak labelling.

* The path: `MentorPage` → `api.mentorChat` → `POST /api/mentor/chat` (authenticated, `uidOf`) → `MentorService.chat` → the injected `LLMProvider` → Gemini → conversation and memory stores. There are no hard-coded assistant replies, no mock imports in production components, and no catch block that substitutes an answer: a model failure becomes `502` and nothing is stored. (The one scripted assistant message is the documented hint-gating rule, shown when a full solution is requested before enough hints; it is not model output.)
* `backend/src/config.ts` already defaults `LLM_MODE` to `live`. But **`backend/.env.example` ships `LLM_MODE=mock`, and the README run command uses mock**, so a local `backend/.env` copied from it answers with the canned stand-in. The local `backend/.env` did contain `LLM_MODE=mock` (with a Gemini key present but unused).
* The only mock label was a small note under the *latest* reply; nothing on the page said which engine was active, and history gives no hint.
* Production could be started with `LLM_MODE=mock` and would present canned answers as an AI mentor.

### What changed

* **Local config**: `backend/.env` `LLM_MODE` changed from `mock` to `live` (a gitignored local file; the key itself was not read or printed). `.env.example` and the README now say what mock is for.
* **Production guard** (`config.ts`): `NODE_ENV=production` with `LLM_MODE=mock` is refused unless `ALLOW_MOCK_LLM=true` (mirrors `ALLOW_EPHEMERAL_STORE`). Live mode in production still requires `GEMINI_API_KEY`.
* **Provider selection** moved to `backend/src/llm/select.ts` (`createProvider`) so it can be tested; behaviour unchanged. The Gemini key stays server-side.
* **Always-visible engine note** on the Mentor page, read from `GET /api/health`: "Live model. Answers come from <model> through the UNBLUFF server." or "Mock mode. This server answers with a built-in stand-in, not an AI model." Nothing is shown if the server cannot be asked. The per-reply "Mock mentor" note is kept.
* **Honest failure wording**: a model/provider failure (`LLM_INVALID_OUTPUT`, which the backend uses for any non-timeout provider error) used to show "The model returned something we couldn't grade", which is interview-grading wording. The Mentor now says it could not get an answer from the AI model, that nothing was saved, and offers "Retry the same message". `ErrorState` gained an optional `message` override. A redundant nested `role="alert"` (double announcement) was removed.

### Live verification (real Gemini, local emulators)

Backend started with `LLM_MODE=live`, `STORE=firestore` (emulator), Auth emulator, using the server-side key from `backend/.env`. Model reported by health: `gemini-3.1-flash-lite`.

| Check | Result |
|---|---|
| API: new message | `200`, `mock: false`, about 14 s, a genuine model answer, `persistence: saved/saved` |
| API: a stated fact | saved as a `learning` memory, provenance `student_provided` |
| API: a **separate new conversation** asking what was said earlier | the answer used the stored memory ("...you find Dynamic Programming the hardest topic") |
| History | the conversation returns both messages; 2 conversations listed |
| User isolation | a second user gets `404` on the first user's conversation and sees 0 conversations |
| Real UI (Vite + the live backend, signed up through the form) | "Live model" note visible; message sent through the page; `OPTIONS` 204 then `POST /api/mentor/chat` 200; genuine answer rendered; **no** "Mock mentor" note; after a reload the conversation is in the history list |
| Failure: server started with a deliberately invalid key | `502 LLM_INVALID_OUTPUT`, 0.3 s, message "The mentor could not answer right now. Please try again."; no answer fabricated, nothing stored |
| Local user-facing backend after the change | `GET /api/health` → `llm_mode: live` |

The live answers were checked for being real model output (varying, context-aware text and a memory-aware follow-up); the content of the test messages is synthetic.

## 3. Tests added or changed

Backend (844 → **854**):
* `dsaCatalogue.test.ts`: a 250-question synthetic catalogue (generated inside the test only) walks 13 pages exactly once, last page has 10, the largest page size, exact company and filter counts; the production default (practice pack) has its real count, `own_work`, no companies, not sample data; the fixture is flagged sample data and says its links are invented.
* `authConfig.test.ts`: production refuses mock without `ALLOW_MOCK_LLM`, accepts it with the opt-in, allows mock in development, and requires a Gemini key in live mode.
* `llmSelect.test.ts` (new): `mock` selects the mock and reports `mock`; `live` selects Gemini and never the mock; live is the default.
* `mentor.test.ts` (integration): a reply is `mock: true` for the mock and `mock: false` when a live-mode provider answers.
* `githubConfig.test.ts`, `prompts.test.ts`: fixtures now set `ALLOW_MOCK_LLM` explicitly where they use mock with production.
* Already covering the rest (unchanged): provider failure and timeout storing nothing, retry with the same id, no provider detail leaked, per-user isolation, memory persistence across a restart (`mentor.test.ts`), importer validation and idempotency (`dsaImporter.test.ts`).

Frontend (199 → **205**): Arena empty state with a practice pack (counts, no sample labelling), explorer total and page walk with 250 questions, engine note for live, mock and unreachable server, and a model failure that shows an error and retry and never an invented answer.

## 4. Final results (this run)

| Command | Result |
|---|---|
| Backend `npm run lint` | exit 0 |
| Backend `npm run typecheck` | exit 0 |
| Backend `npm test` | 56 files, **854 passed** |
| Backend `npm run build` | exit 0 |
| Backend `npm run test:emulator` | 9 files, **34 passed** |
| Frontend `npm run lint` / `typecheck` | exit 0 |
| Frontend `npm test` | 15 files, **205 passed** |
| Frontend `npm run build` | exit 0 |

One backend unit test (`practicePack.test.ts`, re-seeding) timed out once under full-suite load (6.5 s) and passed on its own and on the full re-run.

## 5. Files changed

Backend: `src/config.ts`, `src/server.ts`, `src/llm/select.ts` (new), `.env.example`, and the tests listed above. Frontend: `src/pages/DsaArenaPage.tsx`, `src/pages/MentorPage.tsx`, `src/components/ui/ErrorState.tsx`, `tests/dsa.test.tsx`, `tests/mentor.test.tsx`. Other: `README.md`, this document. Local, ignored: `backend/.env` (`LLM_MODE`).

## 6. Remaining configuration and limits

* **Authorised company-wise dataset**: not available; company lists remain empty by design until one is imported with provenance.
* **Hosted deployment**: `render.yaml` already sets `LLM_MODE=live` and `GEMINI_API_KEY` is supplied in the dashboard; with the new guard a hosted instance that was ever set to `mock` will now fail to start with a readable message instead of silently serving canned answers. Live Gemini was verified locally against the key in `backend/.env`, not against the hosted instance.
* **Durable memory** was verified with the Firestore emulator, not a real Firestore project.
* Past conversations made in mock mode are stored like any other; individual messages carry no mock marker, so the page-level note describes the *current* server only.
* `gemini-3.1-flash-lite` answers took about 14 s each here; the client timeout is 60 s.
* Code Run/Submit is unavailable unless `EXECUTION_PROVIDER` is configured (unrelated to these two problems; `EXECUTION_PROVIDER_VERIFIED` was not set).
