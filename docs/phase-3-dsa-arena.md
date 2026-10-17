# Phase 3: company-wise DSA Arena

## Data source and licensing status

**No external dataset has been imported, cloned, scraped or bundled.** The reference repository `liquidslr/leetcode-company-wise-problems` declares no licence (checked in Phase 0: GitHub reports `license: null`), so it is treated as not reusable.

- The catalogue supports any **explicitly approved** CSV/JSON file through `npm run dsa:import`, which requires a licence/permission statement (`licensed`, `permission_granted`, `public_domain` or `own_work`) plus a note, and records the source name, URL, import time and the source's own update date.
- The importer refuses that repository's URL unless it is declared `licensed` or `permission_granted` with a note recording the permission.
- The app ships only a **development fixture** (`backend/data/dsa/fixture.json`): 24 invented problems on `example.com` URLs, three "Fixture Company" entries (one deliberately without questions), and company-to-question links that are made up. It is labelled `development_fixture`, and the UI shows a "Sample data: not real company interview data" notice whenever it is loaded.
- Nothing in the model represents interview frequency, acceptance rate or "asked by" claims. Question counts are computed from the loaded associations. Problem pages are linked, never copied.
- **Production without `DSA_CATALOGUE_PATH` serves an empty catalogue** (an honest empty state), never the fixture.

## What was built

**Catalogue (public, read-only).** A validated JSON file loaded at startup, like the role definitions, so no second database was added. Schema: `source` (provenance), `companies`, `questions`, and `associations` (company to question, many-to-many). Question ids are `q_` plus a hash of the canonical URL, so they stay stable across refreshes. The loader rejects duplicate ids/URLs/associations and dangling references, and fails fast at startup on a bad file.

**Server-side querying.** Search (title substring), company, difficulty, topic (all combined with AND), sort (title or difficulty, either order) and pagination (default 20, max 100), plus facets scoped to the company.

**Personal progress (authenticated).** One record per student and question: status (`not_started`, `attempted`, `solved`, `needs_revision`), bookmark, notes (max 5000 characters), created/updated timestamps. Firestore document id is `<uid>~<questionId>` (so a duplicate is structurally impossible) with `owner_uid` as a top-level field for the single-field list query. Writes to one record are serialized in-process. The uid comes only from the verified token; there is no user id in any request, and unknown body keys are rejected.

**Catalogue refresh safety.** Progress is stored separately and keyed by question id, so a refresh never touches it. If a question leaves the catalogue, the record survives and shows as "no longer in the catalogue"; its owner can still edit or delete it, but no new record can be created for a question that is not in the catalogue.

**Frontend.** `/dsa` (searchable companies; counts only from real data; "No catalogue available" for empty companies), `/dsa/companies/:id` and `/dsa/questions` (explorer with filters kept in the URL so reload and shared links keep them, server pagination, loading/error/empty states), `/dsa/questions/:id` (verified metadata, original-problem link in a new tab, status, bookmark, notes), `/dsa/progress` (signed-in only; joins titles). The catalogue is public; the progress controls show a sign-in prompt for signed-out visitors. There is no Run or Submit button. Radio-group status buttons, labelled form controls, `aria-live` result counts and the existing visible focus style keep it keyboard-accessible.

## API added (documented in `CONTRACT.md`)

Public: `GET /api/companies`, `/api/companies/:companyId`, `/api/companies/:companyId/questions`, `/api/questions`, `/api/questions/:questionId`.
Authenticated: `GET /api/me/dsa-progress`, `PUT /api/me/dsa-progress/:questionId` (partial update, creates if absent), `DELETE /api/me/dsa-progress/:questionId` (idempotent, 204).
New error codes: `COMPANY_NOT_FOUND`, `QUESTION_NOT_FOUND`. Also corrected a Phase 2 omission: the `/api/sessions` rows and the public/private endpoint note were missing from the endpoint table in `CONTRACT.md` and are now there.

## Files and storage

- Backend: `src/dsa/{catalogue,importer,progressStore,progressService}.ts`, `src/routes/dsa.ts`, wiring in `app.ts`/`server.ts`/`config.ts`/`errors.ts`/`types.ts`, `scripts/dsa_import.ts`, `scripts/dsa_validate.ts`, `data/dsa/fixture.json`.
- Storage: new Firestore collection `unbluff_dsa_progress` (created on first write; no index needed). The catalogue is a file, not a collection.
- Frontend: pages `DsaArenaPage`, `DsaQuestionsPage`, `DsaQuestionPage`, `DsaProgressPage`, `components/dsa/DsaBits.tsx`, `hooks/useDsaProgress.ts`, `lib/dsa.ts`, plus routes, nav link ("DSA Arena"), endpoints and error copy.

## Setup and import commands

```bash
# Validate a catalogue file
cd backend && npm run dsa:validate -- data/dsa/fixture.json

# Import an approved file (never downloads anything). Re-running the same import changes nothing.
npm run dsa:import -- --input approved.csv \
  --source-name "Provider name" --license-status permission_granted \
  --license-note "Permission from <who> on <date>, ref <id>" \
  [--source-url https://...] [--source-updated-at 2026-01-01] \
  [--allowed-hosts leetcode.com] [--out data/dsa/catalogue.json] [--replace] [--dry-run]

# Serve it
DSA_CATALOGUE_PATH=data/dsa/catalogue.json npm run dev
```
Input columns: `company, title, url, difficulty (easy|medium|hard), topics (separated by ; | or ,)`; JSON may be an array of such records or `{ "records": [...] }`. The import is all-or-nothing and lists every bad row. By default it merges into the existing file (same source only; question ids stay stable); `--replace` rebuilds from the input alone. To deploy a catalogue, ship the generated file with the backend (the Docker image already copies `data/`) and set `DSA_CATALOGUE_PATH`.

## Tests executed (this run)

| Suite | Result |
|---|---|
| Backend lint, typecheck, build | pass |
| Backend unit + integration | **220/220** (28 files); coverage 93.2% statements, 85.8% branches, 94.4% lines; `src/core` threshold passes |
| Backend Firebase emulator (`npm run test:emulator`) | **12/12** (3 files), includes DSA progress on the real Firestore emulator |
| Frontend lint, typecheck, build | pass |
| Frontend tests | **57/57** (9 files) |

New coverage: import schema validation, duplicate rows/ids/URLs/associations, company-to-question links, search and combined filters, difficulty and topic filters, sorting, pagination, unavailable and empty catalogues, progress create/update/no-duplicates, bookmark and notes persistence (memory, mocked Firestore and emulator), 401s, cross-user isolation (including spoofed uid in body/query/header), idempotent import (library and command line), and progress surviving a catalogue refresh that removes a question. Existing interview, scoring, auth and ownership tests are unchanged and pass. A live check in the browser against the real backend rendered the company page with filters and the sample-data notice.

Not run: any test against real Firebase or a real catalogue (none exists), a signed-in browser session (frontend Firebase config is not set up here), and screen-reader testing.

## Known limitations and remaining work

- **No real data.** Until an authorized source is imported, the Arena shows fixture data locally and an empty state in production. Obtaining permission or an alternative source is a business/legal task, not a code task.
- The catalogue is loaded fully into memory (fine for tens of thousands of questions; revisit for much more) and changes require a restart or redeploy.
- `GET /api/me/dsa-progress` returns all of a student's records (no pagination), and the progress page looks up titles per record (capped at 100 lookups). Bookmark-only and status filters inside the explorer are not implemented.
- Progress writes are serialized per process; across several instances the last write wins (still one record per question).
- Notes are stored in plaintext in Firestore; account deletion does not yet remove DSA progress.
- The importer's `unknown`-licence guard relies on the operator's declaration; it cannot verify permission.
- The frontend lazy-loads the new pages, and the entry chunk grew by about 9 kB (mostly shared routing/UI code).
