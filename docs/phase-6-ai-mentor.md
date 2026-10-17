# Phase 6: Personalized AI Mentor with persistent memory

**Verified against a live model or live Firestore? No.** Everything below was verified with a deterministic mock mentor (no model is called), an in-memory store, and the Firestore *emulator*. No Gemini key, Firebase project or Judge0 service was used. Each test group is labelled with the level it reached (section 10).

GitHub contribution monitoring and the GraphQL Learning Lab are **not** part of this phase and were not implemented.

## 1. What was built

- **AI Mentor page** (`/mentor`): conversation list (history), new/continue/delete, four modes (DSA Coach, Code Explainer, Interview Practice, Placement Mentor), follow-ups, a graduated hint ladder, retry, loading, empty, error, rate-limit and degraded states. Opening it from a question (`/mentor?question=<id>`) attaches that question.
- **Memory page** (`/mentor/memory`): explains what is kept and for how long; edit the profile; browse memories by type with provenance labels; edit, delete or add goals; "Clear all mentor memory" (optionally with conversation history).
- **Memory** of four types (profile, learning, summary, goal), each with provenance, timestamps and, where relevant, expiry and review dates.
- **Backend** `MentorService` over a `MentorStore` (memory implementation and Firestore implementation), a new `/api/mentor/*` router, and two new methods on the existing Gemini provider.

## 2. Design principles

1. **Deterministic core, language layer only.** Practice statistics, goal completion and revision state come from application code. The model never writes them and never decides them.
2. **Verified practice is read live from analytics, not stored as memory.** It cannot go stale or be forged through chat.
3. **Provenance is set by the backend, never by the model.** Students' own statements are `student_provided`; AI summaries are `model_summary`; model guesses are `inferred`.
4. **Evidence guard.** A model-proposed memory is kept only if its `evidence_quote` is a verbatim substring (whitespace/case normalised) of the *student's own latest message*. A quote from pasted code, a document, a prior assistant message or the model's imagination is dropped. This blocks memory poisoning through prompt injection.
5. **Honest degradation.** If storage fails, the answer is still returned with `degraded: true` and a `persistence` object saying exactly what was not saved.

## 3. Data model

Firestore collections (owner-scoped by `owner_uid`, equality queries only, so no composite index is required):

| Collection | Document id | Content |
|---|---|---|
| `unbluff_mentor_conversations` | `conv_<24 hex>`; when the client gives none, `sha1(uid:client_message_id)` | owner, title, mode, messages, `turns`, `summarized_turns`, `hint_level` (0 to 3), timestamps, `expires_at` |
| `unbluff_mentor_memories` | `mem_<random>`; profile fields `profile_<field>`; summaries `sum_<conversation id>` (one per conversation) | owner, type, key, topic, content, provenance, confidence, signal, goal status/track, source conversation, timestamps, `expires_at`, `review_at` |

Public types are in `CONTRACT.md` section 4 (`MentorMemory`, `MentorConversation`, `MentorChatRequest`, `MentorChatResponse`, ...), mirrored in `backend/src/types.ts` and `frontend/src/types/contract.ts` (a test fails if the three drift).

Provenance values: `student_provided`, `verified_record`, `model_summary`, `inferred`. `mock_*`, demonstration and unknown-provenance records have no representation here at all; see section 6.

## 4. Endpoints (all require the verified Firebase ID token)

| Method and path | Purpose |
|---|---|
| `POST /api/mentor/chat` | One turn. Body: `message` (max 2000), `mode`, optional `conversation_id`, `client_message_id`, `assist` (`hint` or `solution`), `question_id`. |
| `GET /api/mentor/conversations` | Paginated history |
| `GET /api/mentor/conversations/:id` | Messages of one conversation |
| `POST /api/mentor/conversations/:id/summary` | Summarise on demand |
| `DELETE /api/mentor/conversations/:id` | Delete (its derived summary is deleted too unless `?keep_summary=true`) |
| `GET /api/mentor/memories` | Paginated; filter by `type` |
| `POST /api/mentor/memories` | Add a goal (optionally tracked) or a learning note |
| `PATCH /api/mentor/memories/:id` | Edit content or goal status |
| `DELETE /api/mentor/memories/:id` | Delete one |
| `DELETE /api/mentor/memories` | Clear all (`?conversations=true` also removes history) |
| `GET/PUT /api/mentor/profile` | Read or replace the structured profile |

The owner is always the token's `uid`; no endpoint accepts a uid. Another student's ids answer 404 (`CONVERSATION_NOT_FOUND`, `MEMORY_NOT_FOUND`) rather than 403, so existence is not disclosed. Errors: `BAD_REQUEST`, `RATE_LIMITED` (429), `LLM_TIMEOUT` (504), `LLM_UNAVAILABLE`/`LLM_ERROR` (502), plus the two new 404 codes.

## 5. Retrieval, context and update rules

- **Retrieval is explicit**: owner, type, topic and recency. Expired items are excluded; only *active* goals are used; a topic match outranks recency. Caps: 8 learning, 5 summary, 6 goal, 3 000 characters of memory in total.
- **Context bounds**: message 2 000 characters; recent conversation 8 turns / 6 000 characters; verified-activity block 2 800 characters. Nothing else is sent.
- **Prompt layout**: `<verified_activity>`, `<student_profile>`, `<student_memories>`, `<recent_conversation>`, `<student_message>`. All student- or memory-derived text is passed through `defang`, which strips look-alike delimiters, and the system prompt tells the model these blocks are data. The system prompt is trusted policy text only.
- **Hint ladder**: `hint_level` is stored on the conversation. `assist: "solution"` is refused server-side with a hint until `hint_level >= 2`; the UI mirrors this but is not the control.
- **Updates**: at most 5 memory proposals per turn; profile fields come from a whitelist; arrays merge and de-duplicate; "understood" supersedes "difficult" on the same topic; caps of 10 active goals and 300 memories per student.
- **Goals with a `track`** (`question_solved`, `revision_completed`, `topic_practice`) are completed only by `evaluateGoals`, using the stats rollup and revision history. A student can still mark any goal done themselves; that is recorded as `completed_by: student`, never as verified.
- **Summaries**: automatic every 4 user turns (one per conversation, idempotent id), or on demand; Email addresses and phone-number-like digit runs are redacted from stored memory text (a best-effort filter, not a guarantee). Labelled "written by AI (may be wrong)".
- **Idempotency**: a retry with the same `client_message_id` replays the stored reply and does not call the model again. One reply in flight per student; chat is rate limited per student (default 12 per minute).

## 6. Trusted analytics and what is never presented as an achievement

The mentor reads `AnalyticsService` (Phase 5.1 rules). Only counted judged submissions appear as practice. Self-reported progress marks are shown to the model and to the student labelled **NOT VERIFIED**. When there is no verified activity, the response carries `analytics_note` explaining why (for example demonstration exercises, mock execution, an unverified provider, an ineligible suite, or unknown provenance), and the prompt tells the model it has no statistics to quote. The model cannot add, alter or hide an analytics record; memory updates cannot reference or write analytics collections.

## 7. Privacy and security

- UID only from the verified token; Firestore access goes through the Admin SDK with explicit owner checks on every read, update and delete.
- No private content is logged: logs carry ids, lengths, counts and error codes, never messages, memory text or model output.
- Deletion: single memory, single conversation, all memory, or everything including history. Retention (configurable): conversations 90 days, summaries 365, learning notes 180; profile and goals until deleted. Expiry is enforced by a **lazy purge on reads**; there is **no scheduled job**. Operators who want guaranteed physical removal should add a Firestore TTL policy on `expires_at` for both collections (not created here: no cloud resources were touched).
- The conversation text of the current exchange is sent to the model provider (Gemini) when a live key is configured. The memory page says so.
- Untrusted content: pasted code, memories and history are treated as data; injection is covered by tests (section 10).

## 8. Configuration (`backend/.env.example`)

`MENTOR_MODEL` (defaults to the interview model), `MENTOR_TEMPERATURE` (0.5), `MENTOR_TIMEOUT_MS` (30000), `MENTOR_CONVERSATION_RETENTION_DAYS` (90), `MENTOR_SUMMARY_RETENTION_DAYS` (365), `MENTOR_LEARNING_RETENTION_DAYS` (180). The Gemini key and fallback model are the existing `GEMINI_*` variables. With no key the existing mock provider answers and the response is flagged `mock: true`; the UI shows a "Mock mentor" badge.

## 9. Limitations

- **No live model verification.** Reply quality, hint pacing and the injection resistance of the real model are untested; only the surrounding guards (evidence quote, whitelist, server-side hint gating) are deterministic and tested.
- **No streaming**: the provider architecture is request/response; replies arrive whole.
- The mock mentor is a set of regexes, not a model.
- **Retention purge is lazy** (section 7). No semantic or vector search: retrieval is by type, topic keyword and recency.
- Memory extraction depends on the model proposing a quoted statement; implicit preferences are not captured (a deliberate trade for safety).
- A summary is a model output and can be wrong; it is labelled and deletable but not fact-checked.
- Firestore emulator results do not prove production rules, quotas or indexes.

## 10. Verification

| Level | What | Result |
|---|---|---|
| Unit (no I/O) | memory validation, evidence guard, PII redaction, retrieval, goal evaluation | 22 tests passed |
| Integration (mock LLM + in-memory store, Supertest) | conversation CRUD, cross-session memory, provenance, summaries, deletion, owner isolation, injection, limits, LLM and storage failure, analytics integration (mock/demo/unknown/self-reported excluded), idempotent retry, hint gating, rate limit | 41 tests passed |
| Firestore **emulator** | same stores and service on a real Firestore engine, including owner isolation and batched clear | 22 emulator tests passed (whole emulator suite) |
| Frontend (Testing Library, mocked API) | mentor chat and memory pages (22 tests) | 116 frontend tests passed in total |
| **Live model / live Firestore** | not run | **Not verified** |

Totals at completion: backend 521 unit and integration tests passed (coverage statements 91.98 %), lint and typecheck clean, build succeeds; frontend 116 tests passed, lint and typecheck clean, build succeeds. `npm audit --omit=dev`: backend 0 vulnerabilities; frontend 2 moderate advisories in `react-router` 6.x (open redirect with backslashes; SSR hydration `deserializeErrors`). They are in dependencies unchanged since earlier phases; the fix is the breaking upgrade to react-router 7 and was not applied here (the app is client-only and does not use SSR hydration).

## 11. Commands

```bash
cd backend
npm run lint && npm run typecheck && npm run test:coverage && npm run build
npm run test:emulator            # Auth + Firestore emulators, project demo-unbluff, no real project
cd ../frontend
npm run lint && npm run typecheck && npm test && npm run build
```

Run locally with the mock mentor: leave `GEMINI_API_KEY` empty.

## 12. Outstanding integration requirements

1. Set a real `GEMINI_API_KEY` in a non-production environment and play through each mode, the hint ladder and an injection attempt by hand; check that the evidence guard drops fabricated memories.
2. Run `npm run test:emulator` in CI and then once against a non-production Firebase project.
3. Decide on a Firestore TTL policy on `expires_at` for the two collections if hard deletion is required.
4. For analytics to appear in mentor answers, the Phase 5.1 checklist (real Judge0, `EXECUTION_PROVIDER_VERIFIED` set deliberately by an operator) still applies; it is not done here.
5. Decide on the react-router 7 upgrade.
