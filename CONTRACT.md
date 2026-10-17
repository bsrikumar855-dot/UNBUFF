# UNBLUFF — API Contract (FROZEN)

> Source of truth for frontend ↔ backend. Field names, enum values, nesting and paths are exact.
> Changes require both teams to agree; log them in `DECISIONS.md`.

## 1. Overview

A student picks a target role and gives a resume and/or declared skills. The backend extracts
**claims**, the student confirms them, then every claim is interrogated on three levels:

| Level | Probes |
|---|---|
| L1 | What they built/know, and **their** personal part |
| L2 | How it works internally |
| L3 | Why this design: alternatives, trade-offs, what broke |

Each claim ends as `defended`, `shaky`, `bluff`, `honest_gap` (or `error` if the LLM failed).
The report shows readiness, coverage, a resume heatmap, per-skill states, blind spots, priorities,
a 7-day plan, fix tasks and retests.

**The LLM never decides a score.** It returns per-criterion booleans plus verbatim evidence quotes;
backend code decides pass/fail, verdicts, proficiency, readiness, coverage and plans.

## 2. Conventions

- Base URL: `${VITE_API_URL}/api` (backend default port `8080`).
- JSON in, JSON out. `Content-Type: application/json`. Max body size: 100 kB.
- All ids are strings. Claim ids look like `CL-001`, stable for the session.
- Timestamps are ISO-8601 UTC strings.
- Numbers: `proficiency` is `0..1`; `readiness` and `coverage` are integers `0..100`.
- Sessions live in server memory (local dev/tests) or Firestore (production).
- **Auth (Phase 2):** every endpoint except `GET /api/health`, `GET /api/roles[/:roleId]` and
  `GET /api/demo/report` requires `Authorization: Bearer <Firebase ID token>`. The backend verifies the
  token and derives the user id (`uid`) from it; a uid is never accepted from the client. Each session is
  owned by the uid that created it. Someone else's session, an unknown session and a legacy session with no
  owner all return the same `404 SESSION_NOT_FOUND`.
- Every non-2xx response has this shape:

```json
{ "error": { "code": "SESSION_NOT_FOUND", "message": "Session s_123 not found" } }
```

| HTTP | code | When |
|---|---|---|
| 400 | `BAD_REQUEST` | Body fails validation, or the action isn't allowed in the current state |
| 401 | `UNAUTHENTICATED` | Missing, malformed, invalid or expired bearer token |
| 404 | `NOT_FOUND` | Unknown route |
| 404 | `ROLE_NOT_FOUND` | Unknown `role_id` |
| 404 | `COMPANY_NOT_FOUND` | Unknown company id |
| 404 | `QUESTION_NOT_FOUND` | Unknown question id |
| 404 | `CONVERSATION_NOT_FOUND` | Unknown mentor conversation, or one the caller does not own |
| 404 | `MEMORY_NOT_FOUND` | Unknown mentor memory, or one the caller does not own |
| 503 | `GITHUB_NOT_CONFIGURED` | The operator has not configured the GitHub OAuth application or the token-encryption key |
| 409 | `GITHUB_NOT_CONNECTED` | No GitHub account is connected for this student |
| 409 | `GITHUB_REAUTH_REQUIRED` | GitHub rejected the stored credential (revoked or expired); connect again |
| 429 | `GITHUB_RATE_LIMITED` | GitHub's API rate limit is exhausted; the message says when it resets |
| 502 | `GITHUB_UNAVAILABLE` | GitHub timed out, failed, or returned a response that did not match the expected shape |
| 404 | `MODULE_NOT_FOUND` | Unknown GraphQL Lab module id |
| 404 | `EXERCISE_NOT_FOUND` | Unknown GraphQL Lab exercise id |
| 503 | `GRAPHQL_LAB_UNAVAILABLE` | The Lab's progress storage failed, so the result could not be saved or loaded |
| 409 | `PLACEMENT_PROFILE_REQUIRED` | Set your placement goals and availability before generating a plan |
| 404 | `PLACEMENT_TASK_NOT_FOUND` | Unknown plan task id, or one the caller does not own |
| 404 | `REVISION_NOT_FOUND` | Unknown revision item, or one the caller does not own |
| 404 | `SUBMISSION_NOT_FOUND` | Unknown submission id, or one the caller does not own |
| 409 | `GRADING_UNAVAILABLE` | The question has no validated hidden test suite, so it cannot be judged |
| 503 | `EXECUTION_UNAVAILABLE` | No execution service configured, or it is unreachable, timed out or returned an invalid response |
| 404 | `SESSION_NOT_FOUND` | Unknown `session_id`, or a session the caller does not own |
| 404 | `CLAIM_NOT_FOUND` | Unknown `claim_id` in that session |
| 429 | `RATE_LIMITED` | Too many requests; retry later |
| 502 | `LLM_INVALID_OUTPUT` | LLM output invalid after one retry (extraction only; grading turns this into verdict `error`) |
| 504 | `LLM_TIMEOUT` | LLM call exceeded 25 s (extraction only; same rule as above) |
| 500 | `INTERNAL` | Anything else |

## 3. Enums

| Type | Values |
|---|---|
| `Level` | `1` `2` `3` |
| `Verdict` | `pending` `defended` `shaky` `bluff` `honest_gap` `error` |
| `SkillState` | `ready` `needs_work` `unverified` `blind_spot` `deprioritized` |
| `Criterion` | `accuracy` `specificity` `mechanism` `ownership` `tradeoff` |
| `ClaimSource` | `resume` `declared` |
| `Mode` | `assess` `retest` |
| `TurnType` | `question` `clarify` `done` |
| `QuestionKind` | `question` `clarify` `retest` |
| `LlmMode` | `live` `mock` |
| `SessionMode` *(added)* | `prepare` `defense` |
| `RetestStatus` *(added)* | `none` `scheduled` `due` `done` |

`deprioritized` is never used in `Report.skills`; it describes claims whose `skill_id` is `null`
(listed in `Report.deprioritized_claim_ids`).

## 4. Types (copy verbatim into `types.ts`)

```ts
// ===== UNBLUFF shared types — copied EXACTLY from CONTRACT.md §4 =====

// ---------- Enums ----------
export type Level = 1 | 2 | 3;
export type LevelsPassed = 0 | 1 | 2 | 3;
export type Verdict = "pending" | "defended" | "shaky" | "bluff" | "honest_gap" | "error";
export type SkillState = "ready" | "needs_work" | "unverified" | "blind_spot" | "deprioritized";
export type Criterion = "accuracy" | "specificity" | "mechanism" | "ownership" | "tradeoff";
export type ClaimSource = "resume" | "declared";
export type Mode = "assess" | "retest";
export type TurnType = "question" | "clarify" | "done";
export type QuestionKind = "question" | "clarify" | "retest";
export type LlmMode = "live" | "mock";
export type SessionMode = "prepare" | "defense"; // added (learning loop)
export type RetestStatus = "none" | "scheduled" | "due" | "done"; // added (learning loop)
export type ErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHENTICATED"
  | "NOT_FOUND"
  | "COMPANY_NOT_FOUND"
  | "QUESTION_NOT_FOUND"
  | "SUBMISSION_NOT_FOUND"
  | "REVISION_NOT_FOUND"
  | "CONVERSATION_NOT_FOUND"
  | "MEMORY_NOT_FOUND"
  | "GITHUB_NOT_CONFIGURED"
  | "GITHUB_NOT_CONNECTED"
  | "GITHUB_REAUTH_REQUIRED"
  | "GITHUB_RATE_LIMITED"
  | "GITHUB_UNAVAILABLE"
  | "MODULE_NOT_FOUND"
  | "EXERCISE_NOT_FOUND"
  | "GRAPHQL_LAB_UNAVAILABLE"
  | "PLACEMENT_PROFILE_REQUIRED"
  | "PLACEMENT_TASK_NOT_FOUND"
  | "EXECUTION_UNAVAILABLE"
  | "GRADING_UNAVAILABLE"
  | "ROLE_NOT_FOUND"
  | "SESSION_NOT_FOUND"
  | "CLAIM_NOT_FOUND"
  | "RATE_LIMITED"
  | "LLM_INVALID_OUTPUT"
  | "LLM_TIMEOUT"
  | "INTERNAL";

// ---------- Roles ----------
export interface LevelCriteria {
  L1: string[];
  L2: string[];
  L3: string[];
}

export interface RoleSkill {
  id: string;
  name: string;
  weight: number; // all weights in a role sum to 1.0
  description: string;
  keywords: string[];
  levels: LevelCriteria;
  prerequisites: string[]; // added: 3–5 concepts, most fundamental first
}

export interface Role {
  id: string;
  name: string;
  description: string;
  skills: RoleSkill[];
}

export interface RoleSummary {
  id: string;
  name: string;
  description: string;
  skill_count: number;
}

// ---------- Grading ----------
export interface CriterionResult {
  passed: boolean;
  evidence_quote: string | null; // verbatim substring of the answer, or null
  missing_concept: string | null;
}

export interface Grade {
  criteria: Record<Criterion, CriterionResult>;
  admits_gap: boolean;
  needs_clarification: boolean;
  level_passed: boolean; // computed by backend code, never by the LLM
  guard_flips: Criterion[]; // criteria forced to false because the quote was not in the answer
  root_cause: string | null; // added: one of the skill's prerequisites (validated in code) or null
}

// ---------- Claims ----------
export interface QA {
  level: Level;
  kind: QuestionKind;
  mode: Mode;
  question: string;
  answer: string | null; // null while the question is waiting for an answer
  grade: Grade | null;
  asked_at: string;
}

export interface Evidence {
  level: Level;
  criterion: Criterion;
  passed: boolean;
  quote: string; // verbatim from the student's answer
}

export interface RetestResult {
  attempted: boolean;
  passed: boolean; // after > before
  before: number;
  after: number;
  interleaved_claims: number; // added: other claims completed between the fix task and the retest start
}

export interface FixTask {
  claim_id: string;
  skill_id: string | null;
  root_cause: string | null; // added: the prerequisite the task targets first, if diagnosed
  missing_concepts: string[];
  explanation: string; // markdown, <= 120 words
  exercise: string; // markdown
}

export interface Claim {
  id: string; // "CL-001"
  text: string;
  resume_line: string | null; // verbatim resume line; null for declared skills
  skill_id: string | null; // null => deprioritized (not in the role)
  source: ClaimSource;
  verdict: Verdict;
  levels_passed: LevelsPassed;
  proficiency: number; // 0..1
  missing_concepts: string[];
  evidence: Evidence[];
  qa: QA[];
  retest: RetestResult | null;
  fix_task: FixTask | null;
  rewrite: string | null; // honest resume rewrite, only for shaky/bluff/honest_gap
  root_cause: string | null; // added: root cause from the failing level (null if none / passed)
  retest_status: RetestStatus; // added
  retest_unlocks_after: number | null; // added: other claims still to finish before the retest is due
}

export interface ClaimInput {
  id: string | null; // null => new claim, gets a fresh id
  text: string;
  resume_line: string | null;
  skill_id: string | null;
}

export interface BlindSpot {
  skill_id: string;
  name: string;
  weight: number;
}

export interface Progress {
  claims_total: number;
  claims_done: number; // claims whose verdict is not "pending"
  next_claim_id: string | null; // first due retest, else first "pending" claim, else null (see §5)
  next_mode: Mode | null; // added: what to do with next_claim_id
}

// ---------- Report ----------
export interface SkillHistoryEntry {
  at: string;
  mode: Mode;
  claim_id: string;
  proficiency: number; // skill proficiency after this event
}

export interface SkillReport {
  skill_id: string;
  name: string;
  weight: number;
  state: SkillState;
  proficiency: number;
  claim_ids: string[];
  history: SkillHistoryEntry[];
}

export interface ResumeLine {
  index: number; // 0-based over non-empty lines
  text: string;
  verdict: Verdict | null; // worst verdict of mapped claims; null if none
  claim_ids: string[];
}

export interface Priority {
  rank: number; // 1..3
  skill_id: string;
  claim_id: string | null; // null for blind spots
  score: number; // weight * (1 - proficiency), 3 decimals
  reason: string;
}

export interface PlanItem {
  day: number; // 1..7, max 2 items per day
  skill_id: string | null;
  claim_id: string | null;
  title: string;
  task: string; // markdown
}

export interface Report {
  session_id: string;
  mode: SessionMode; // added
  role: { id: string; name: string };
  generated_at: string;
  readiness: number; // 0..100
  coverage: number; // 0..100
  claims: Claim[];
  skills: SkillReport[]; // one per role skill, role order
  deprioritized_claim_ids: string[];
  blind_spots: BlindSpot[];
  resume_lines: ResumeLine[];
  priorities: Priority[];
  plan: PlanItem[];
  progress: Progress;
}

// ---------- Requests / responses ----------
export interface HealthResponse {
  status: "ok";
  llm_mode: LlmMode;
  model: string | null;
}

export interface RolesResponse {
  roles: RoleSummary[];
}

export interface ExtractRequest {
  role_id: string;
  mode?: SessionMode; // added, default "defense"
  resume_text?: string | null; // <= 20000 chars
  declared_skills?: string[]; // <= 20 chips, each <= 60 chars
}

export interface ClaimsResponse {
  session_id: string;
  role_id: string;
  mode: SessionMode; // added
  claims: Claim[];
  blind_spots: BlindSpot[];
  progress: Progress;
}

export interface ConfirmRequest {
  session_id: string;
  claims: ClaimInput[]; // 1..8
}

export interface InterrogateRequest {
  session_id: string;
  claim_id: string;
  mode?: Mode; // default "assess"
  answer?: string | null; // omit (or null) to start/resume the claim; <= 4000 chars
}

export interface TurnResponse {
  session_id: string;
  claim_id: string;
  mode: Mode;
  turn: TurnType;
  level: Level | null; // level of `question`; null when turn is "done"
  question: string | null; // null when turn is "done"
  grade: Grade | null; // grade of the answer just submitted; null on start
  claim: Claim;
  progress: Progress;
  next_mode: Mode | null; // added: same as progress.next_mode
  teach_now: boolean; // added: prepare mode and this turn finished the claim as shaky/bluff/honest_gap
  // Backward-compatible aliases (always equal to the canonical field):
  last_grade: Grade | null; // alias of grade
  verdict: Verdict; // alias of claim.verdict
  levels_passed: LevelsPassed; // alias of claim.levels_passed
  next_claim_id: string | null; // alias of progress.next_claim_id
  retest: RetestResult | null; // alias of claim.retest
}

export interface FixTaskRequest {
  session_id: string;
  claim_id: string;
}

export type FixTaskResponse = FixTask;

export interface SessionSummary {
  session_id: string;
  role_id: string;
  mode: SessionMode;
  created_at: string;
  claims_total: number;
  claims_done: number; // claims whose verdict is not "pending"
}

export interface SessionsResponse {
  sessions: SessionSummary[]; // the caller's own sessions, newest first
}

// ---------- Company-wise DSA Arena ----------
export type DsaDifficulty = "easy" | "medium" | "hard";
export type DsaStatus = "not_started" | "attempted" | "solved" | "needs_revision";
export type DsaLicenseStatus = "licensed" | "permission_granted" | "public_domain" | "own_work" | "development_fixture";

/** Provenance of the loaded catalogue. `null` in a response means no catalogue is loaded. */
export interface DsaSource {
  name: string;
  license_status: DsaLicenseStatus;
  license_note: string;
  url: string | null;
  imported_at: string;
  source_updated_at: string | null; // freshness as stated by the source, if it said so
  is_sample_data: boolean; // true for development fixtures: NOT real company interview data
}

export interface CompanySummary {
  id: string;
  name: string;
  question_count: number; // derived from the loaded catalogue only
  catalogue_available: boolean; // false when no questions are loaded for this company
}

export interface PageInfo {
  page: number; // 1-based
  page_size: number;
  total: number;
  total_pages: number;
}

export interface CompaniesResponse extends PageInfo {
  companies: CompanySummary[];
  source: DsaSource | null;
}

export interface CompanyDetailResponse {
  company: CompanySummary;
  topics: string[];
  difficulties: Record<DsaDifficulty, number>;
  source: DsaSource | null;
}

export interface QuestionSummary {
  id: string;
  title: string;
  url: string | null; // canonical external problem page (statements are never copied); null for first-party practice problems, whose statement lives in the coding workspace
  difficulty: DsaDifficulty;
  topics: string[];
  company_ids: string[];
}

export interface QuestionsResponse extends PageInfo {
  questions: QuestionSummary[];
  facets: { topics: string[]; difficulties: DsaDifficulty[] }; // options within the requested company scope
  source: DsaSource | null;
}

export interface QuestionDetailResponse {
  question: QuestionSummary;
  companies: { id: string; name: string }[];
  source: DsaSource | null;
}

export interface DsaProgress {
  question_id: string;
  status: DsaStatus;
  bookmarked: boolean;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface DsaProgressListResponse {
  progress: DsaProgress[]; // the caller's own records, newest update first
}

export interface DsaProgressUpdate {
  status?: DsaStatus;
  bookmarked?: boolean;
  notes?: string; // at most 5000 characters
}

// ---------- Coding workspace (Phase 4) ----------
export type CodeLanguageId = "python" | "javascript" | "cpp" | "java";
export type RunStatus = "completed" | "compile_error" | "runtime_error" | "time_limit_exceeded" | "judge_error";
export type SubmissionVerdict = "accepted" | "wrong_answer" | "compile_error" | "runtime_error" | "time_limit_exceeded" | "judge_error";

/** A language the execution service actually offers. `name` is the provider's own label (with its real version). */
export interface CodeLanguage {
  id: CodeLanguageId;
  name: string;
  starter_code: string;
}

export interface CodeLanguagesResponse {
  languages: CodeLanguage[]; // empty when no execution service is configured or reachable
  execution_available: boolean;
}

export interface CodeSample {
  input: string;
  expected_output: string;
}

/** Public part of an exercise. Hidden grading tests never appear here, only how many there are. */
export interface CodeExerciseResponse {
  question_id: string;
  statement: string | null; // only for authored demonstration exercises; real problems are linked, never copied
  is_demonstration: boolean;
  samples: CodeSample[];
  starter_code: Partial<Record<CodeLanguageId, string>>;
  gradable: boolean; // true only when a validated hidden test suite is configured
  hidden_test_count: number;
  test_revision: string | null;
  limits: { cpu_time_seconds: number; memory_mb: number };
}

export interface CodeRunRequest {
  language: CodeLanguageId;
  source: string;
  stdin?: string; // custom input
  question_id?: string; // with sample_index: run one of that exercise's visible samples
  sample_index?: number;
}

export interface CodeRunResponse {
  status: RunStatus;
  stdout: string;
  stderr: string;
  compile_output: string;
  time_ms: number | null;
  memory_kb: number | null;
  sample_passed: boolean | null; // null unless a sample was run
}

export interface CodeSubmitRequest {
  question_id: string;
  language: CodeLanguageId;
  source: string;
}

export interface CodeSubmission {
  id: string;
  question_id: string;
  language: CodeLanguageId;
  verdict: SubmissionVerdict;
  passed: number; // hidden tests passed
  total: number; // hidden tests in the suite
  failed_test: number | null; // 1-based index of the first failing hidden test; its contents are never revealed
  compile_output: string | null;
  time_ms: number | null; // slowest test
  memory_kb: number | null; // largest test
  test_revision: string;
  progress_updated: boolean; // true only when this accepted submission marked the question solved
  analytics_status: AnalyticsStatus; // whether this submission counts toward real-practice analytics
  created_at: string;
}

export interface CodeSubmissionDetail extends CodeSubmission {
  source: string;
}

export interface CodeSubmissionsResponse {
  submissions: CodeSubmission[]; // the caller's own, newest first
}

// ---------- DSA analytics and revision (Phase 5) ----------
/** Whether a stored submission counts toward real-practice analytics, and if not, why. */
export type AnalyticsStatus =
  | "counted"
  | "excluded_demonstration" // judged against a demonstration/fixture exercise
  | "excluded_ineligible_suite" // the suite was not declared analytics-eligible
  | "excluded_unverified_provider" // the execution service was not declared to be a verified real deployment
  | "excluded_mock_execution" // judged by a mock or test execution provider
  | "excluded_judge_error" // the judge failed; says nothing about the student's code
  | "excluded_unknown_provenance"; // stored before provenance was recorded; treated conservatively

/** A ratio with its sample size. `value` is null (and `available` false) when there is too little data. */
export interface RateMetric {
  value: number | null; // 0..1
  numerator: number;
  denominator: number;
  available: boolean;
  min_sample: number;
  note: string | null;
}

export interface BreakdownRow {
  key: string; // topic name or difficulty
  attempts: number; // eligible judged submissions
  accepted: number; // accepted submissions
  questions_attempted: number; // distinct questions with at least one eligible submission
  questions_solved: number; // distinct questions with at least one accepted eligible submission
  accuracy: RateMetric; // accepted / attempts
  solve_rate: RateMetric; // questions_solved / questions_attempted
}

export type WeaknessStatus = "weak" | "watch" | "technical_issues" | "strong" | "insufficient_data";
export type WeaknessTrend = "improving" | "declining" | "stable" | "insufficient_data";

export interface TopicWeakness {
  topic: string;
  status: WeaknessStatus;
  trend: WeaknessTrend;
  explanation: string[]; // plain-language reasons, each backed by the counts below
  evidence: {
    questions_attempted: number;
    questions_solved: number;
    attempts: number;
    accepted: number;
    algorithmic_failures: number; // wrong answer or time limit exceeded
    technical_failures: number; // compilation or runtime errors
    repeated_failure_questions: number;
    revision_regressions: number; // solved questions that later failed again
  };
}

export interface WeeklyBucket {
  week_start: string; // Monday, YYYY-MM-DD (UTC)
  attempts: number;
  accepted: number;
  first_solves: number; // questions solved for the first time that week
}

export interface RecentActivity {
  submission_id: string;
  question_id: string;
  title: string | null;
  verdict: SubmissionVerdict;
  at: string;
}

export interface RepeatedFailure {
  question_id: string;
  title: string | null;
  consecutive_failures: number;
  attempts: number;
  last_verdict: SubmissionVerdict | null;
  last_attempt_at: string | null;
}

export interface PeriodStats {
  from: string;
  to: string;
  attempts: number;
  accepted: number;
  accuracy: RateMetric;
}

export interface PeriodComparison {
  available: boolean;
  note: string | null;
  current: PeriodStats; // last 28 days
  previous: PeriodStats; // the 28 days before that
}

export interface DsaAnalyticsResponse {
  generated_at: string;
  totals: { solved_unique: number; attempted_unique: number; eligible_attempts: number; accepted_attempts: number };
  first_attempt_success: RateMetric;
  submission_success: RateMetric;
  topics: BreakdownRow[];
  difficulties: BreakdownRow[];
  weaknesses: TopicWeakness[];
  untouched_topics: string[]; // catalogue topics with no eligible activity yet
  weekly: WeeklyBucket[];
  recent: RecentActivity[];
  repeated_failures: RepeatedFailure[];
  comparison: PeriodComparison;
  self_reported: { solved: number; attempted: number; needs_revision: number; bookmarked: number }; // from the student's own progress marks, not judged
  exclusions: { available: boolean; sampled_submissions: number; demonstration: number; ineligible_suite: number; unverified_provider: number; mock_execution: number; judge_error: number; unknown_provenance: number };
  has_eligible_activity: boolean;
  revision_due: number;
}

export interface AnalyticsHistoryResponse {
  from: string;
  to: string;
  weekly: WeeklyBucket[];
}

export type RevisionReason = "repeated_failure" | "unsolved_attempted" | "spaced_review" | "topic_weakness";
export type RevisionStatus = "pending" | "in_progress" | "scheduled" | "postponed";
export type RevisionEventKind = "created" | "failed" | "started" | "completed" | "postponed" | "revisited" | "solved" | "added";

export interface RevisionEvent {
  at: string;
  event: RevisionEventKind;
  detail: string | null;
}

export interface RevisionItem {
  question_id: string;
  title: string | null;
  reason: RevisionReason;
  priority: 1 | 2 | 3 | 4 | 5; // 1 repeated failure, 2 unsolved with attempts, 3 spaced review overdue, 4 spaced review upcoming, 5 topic weakness
  due_at: string;
  due: boolean;
  status: RevisionStatus;
  stage: number; // index into the review interval schedule
  last_reviewed_at: string | null;
  postponed_count: number;
  created_at: string;
  updated_at: string;
  context: {
    attempts: number;
    failures: number;
    consecutive_failures: number;
    last_verdict: SubmissionVerdict | null;
    topics: string[];
    difficulty: DsaDifficulty | null;
    solved: boolean;
  };
  explanation: string;
  history: RevisionEvent[]; // newest last, at most 20
}

export interface RevisionSuggestion {
  question_id: string;
  title: string;
  topic: string;
  difficulty: DsaDifficulty;
  reason: string;
}

export interface RevisionQueueResponse extends PageInfo {
  items: RevisionItem[];
  counts: { due: number; upcoming: number; total: number };
  suggestions: RevisionSuggestion[]; // weak-topic questions the student could add; never added automatically
}

export interface RevisionActionRequest {
  action: "start" | "complete" | "postpone" | "revisit";
  outcome?: "remembered" | "struggled"; // required for complete
  days?: number; // optional for postpone (1 to 14)
}

export interface RevisionAddRequest {
  question_id: string;
}

// ---------- AI mentor (Phase 6) ----------
export type MentorMode = "dsa_coach" | "code_explainer" | "interview_practice" | "placement_mentor";
export type MemoryType = "profile" | "learning" | "summary" | "goal";
/** Where a memory came from. Only "student_provided" and "verified_record" are facts; the rest are labelled as not facts. */
export type MemoryProvenance = "student_provided" | "verified_record" | "model_summary" | "inferred";
export type GoalStatus = "active" | "completed" | "dismissed";
export type LearningSignal = "understood" | "difficult" | "studied" | "helpful";
export type ExplanationStyle = "concise" | "detailed" | "step_by_step";
export type SkillLevel = "beginner" | "intermediate" | "advanced";

export type GoalTrack =
  | { kind: "question_solved"; question_id: string } // done when a counted, accepted judged submission arrives after the goal was set
  | { kind: "revision_completed"; question_id: string } // done when that revision item is completed after the goal was set
  | { kind: "topic_practice"; topic: string; target: number }; // done after `target` counted judged submissions in the topic since the goal was set

export interface MentorMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  at: string;
}

export interface MentorConversationSummary {
  id: string;
  title: string;
  mode: MentorMode;
  message_count: number;
  hint_level: number; // hints given so far in this conversation (0 to 3)
  created_at: string;
  updated_at: string;
}

export interface MentorConversation extends MentorConversationSummary {
  messages: MentorMessage[]; // at most the latest 60
}

export interface MentorConversationsResponse extends PageInfo {
  conversations: MentorConversationSummary[];
}

export interface MentorMemory {
  id: string;
  type: MemoryType;
  key: string | null; // profile field name for profile memories
  topic: string | null;
  content: string;
  provenance: MemoryProvenance;
  confidence: "high" | "medium" | "low" | null;
  signal: LearningSignal | null; // for learning memories
  status: GoalStatus | null; // for goals
  track: GoalTrack | null; // for goals the application can verify
  completed_by: "student" | "verified_activity" | null;
  source_conversation_id: string | null;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
  review_at: string | null;
}

export interface MentorRetention {
  conversation_days: number;
  summary_days: number;
  learning_days: number;
  profile_and_goals: "until you delete them";
}

export interface MentorMemoriesResponse extends PageInfo {
  memories: MentorMemory[];
  counts: Record<MemoryType, number>;
  retention: MentorRetention;
}

export interface MentorProfile {
  target_roles: string[];
  target_companies: string[];
  preferred_languages: CodeLanguageId[];
  daily_study_minutes: number | null;
  placement_timeline: string | null;
  explanation_style: ExplanationStyle | null;
  current_goals: string | null;
  skill_self_assessment: Record<string, SkillLevel>; // the student's own opinion, never a measured result
}

export interface MentorProfileResponse {
  profile: MentorProfile;
  updated_at: string | null;
}

export interface MentorChatRequest {
  conversation_id?: string; // omit to start a new conversation
  mode: MentorMode;
  message: string; // at most 2000 characters
  client_message_id: string; // makes a retry safe: the same id returns the stored answer
  assist?: "hint" | "solution"; // graduated help: a full solution is only given after enough hints
  question_id?: string; // the DSA question being discussed (must exist in the catalogue)
}

export interface MentorReference {
  question_id: string;
  title: string | null;
  relation: "verified_solved" | "verified_attempt" | "revision_due" | "self_reported";
  label: string; // plain-language description of why it is shown and how reliable it is
}

export interface MentorSavedMemory {
  id: string;
  type: MemoryType;
  content: string;
  provenance: MemoryProvenance;
}

export interface MentorChatResponse {
  conversation: MentorConversationSummary;
  reply: MentorMessage;
  memory_saved: MentorSavedMemory[]; // what this turn added to long-term memory
  persistence: {
    conversation: "saved" | "failed"; // whether this exchange was stored in your history
    memory: "saved" | "none" | "failed"; // "none" means nothing was worth remembering
  };
  references: MentorReference[]; // from the application's own records, never from the model
  analytics_note: string | null; // set when verified practice data is missing or unconfirmed
  degraded: boolean; // true when the answer worked but something could not be saved
  mock: boolean; // true when the answer came from the built-in mock mentor, not a live model
  github_context?: { used: boolean; synced_at: string | null; stale: boolean }; // used: a short GitHub summary was given to the mentor
}

// ---------- GitHub contribution insights (Phase 7) ----------
// Read-only, public-data-only. Tokens, authorization codes and raw GitHub payloads never appear in any response.
export type GithubConnectionStatus = "not_configured" | "disconnected" | "connected" | "reauthorization_required";
export type GithubFreshness = "never_synced" | "fresh" | "stale";
export type GithubSyncFailure = "rate_limited" | "unavailable" | "unauthorized" | "invalid_response" | "timeout";
export type GithubSection = "contributions" | "repositories" | "activity";
export type GithubCheckId = "readme_present" | "description_present" | "setup_instructions" | "test_instructions" | "license_present";
export type GithubCheckStatus = "pass" | "fail" | "unknown"; // unknown: GitHub did not return what was needed to decide
// Why the OAuth round trip did not end in a connection. Sent to the app as ?github=error&reason=<this>.
export type GithubCallbackReason =
  | "access_denied"
  | "invalid_state"
  | "expired_state"
  | "exchange_failed"
  | "already_linked"
  | "excessive_permissions"
  | "not_configured"
  | "github_unavailable";

export interface GithubConnection {
  status: GithubConnectionStatus;
  login: string | null;
  profile_url: string | null;
  access: "public_only"; // private repositories are never requested (see docs/phase-7-github-insights.md)
  permissions: string[]; // OAuth scopes GitHub granted; empty = public read-only
  connected_at: string | null;
  last_synced_at: string | null;
  freshness: GithubFreshness;
  fresh_for_minutes: number; // data older than this is shown as stale
  last_sync_error: GithubSyncFailure | null;
  last_sync_error_at: string | null;
  sync_in_progress: boolean;
  next_sync_allowed_at: string | null; // manual syncs are spaced out to protect the GitHub rate limit
}

export interface GithubConnectResponse {
  authorize_url: string; // always https://github.com/login/oauth/authorize?...
  expires_at: string; // the one-time state is valid until then
}

export interface GithubDisconnectResponse {
  connection: GithubConnection;
  revoked_at_github: boolean; // false: GitHub could not be reached; the student can revoke it in GitHub settings
  data_removed: true; // stored credentials and cached GitHub data are deleted either way
}

export interface GithubSourceInfo {
  login: string;
  synced_at: string | null; // when this data was fetched from GitHub
  from: string | null; // date range the data covers
  to: string | null;
  freshness: GithubFreshness;
  cached: true; // always served from the last synchronisation, never fetched live
}

export interface GithubCalendarDay {
  date: string; // YYYY-MM-DD
  count: number;
}
export interface GithubCalendarWeek {
  starts_on: string;
  days: GithubCalendarDay[];
}
export interface GithubPeriodTotal {
  period: string; // week start (YYYY-MM-DD) or month (YYYY-MM)
  total: number;
}

export interface GithubContributionsResponse {
  source: GithubSourceInfo;
  available: boolean; // false until the first successful synchronisation, or when GitHub did not return it
  total: number | null; // GitHub's own total for the range
  weeks: GithubCalendarWeek[];
  weekly: GithubPeriodTotal[]; // most recent 12 weeks
  monthly: GithubPeriodTotal[];
  breakdown: { commits: number; pull_requests: number; reviews: number; issues: number } | null;
  restricted_count: number | null; // contributions to private repositories, count only, if the profile shares it
  active_days: number | null;
  longest_streak_days: number | null;
  notice: string; // contribution counts are partial evidence, not a measure of skill
}

export interface GithubLanguageShare {
  name: string;
  percent: number; // share of the bytes in the repository's top languages
}
export interface GithubRepository {
  name_with_owner: string;
  url: string;
  description: string | null;
  primary_language: string | null;
  languages: GithubLanguageShare[];
  is_fork: boolean;
  is_archived: boolean;
  pushed_at: string | null;
  updated_at: string | null;
  stars: number;
  open_issues: number;
  open_pull_requests: number;
  your_commits_90d: number | null; // null: GitHub did not return it
  has_license: boolean | null;
  topics: string[];
}
export interface GithubChecklistItem {
  repository: string;
  check: GithubCheckId;
  status: GithubCheckStatus;
  label: string; // what was checked
  evidence: string; // what GitHub returned that decided it
}
export interface GithubRepositoriesResponse {
  source: GithubSourceInfo;
  available: boolean;
  repositories: GithubRepository[];
  total_public_repositories: number | null;
  truncated: boolean; // true when the student has more public repositories than were scanned
  checklist: GithubChecklistItem[]; // observed facts only; "unknown" when it could not be checked
}

export interface GithubActivityItem {
  kind: "pull_request" | "issue" | "review";
  title: string;
  url: string;
  repository: string;
  state: string;
  occurred_at: string;
}
export interface GithubActivityResponse {
  source: GithubSourceInfo;
  available: boolean;
  pull_requests_total: number | null;
  issues_total: number | null;
  items: GithubActivityItem[];
}

export type GithubSyncOutcome = "synced" | "partial" | "cached" | "in_progress";
export interface GithubSyncResponse {
  outcome: GithubSyncOutcome; // cached: synced recently, no GitHub request was made
  connection: GithubConnection;
  unavailable_sections: GithubSection[]; // sections GitHub did not return this time (older data, if any, is kept and labelled)
  rate_limit_remaining: number | null;
}

// ---------- GraphQL Learning Lab (Phase 8) ----------
// An educational module. Students run queries against a small, controlled TRAINING API (never an external server).
// Results here are separate from DSA analytics and from any readiness score.
export type LabDifficulty = "beginner" | "intermediate" | "advanced";
export type LabExerciseType = "query" | "mutation" | "multiple_choice" | "schema_reading" | "explanation";
export type LabModuleStatus = "not_started" | "in_progress" | "completed";
export type LabErrorCategory = "syntax" | "validation" | "variables" | "execution" | "authorization" | "limits";
export type LabPhase = "ok" | "syntax" | "validation" | "variables" | "execution";
export type LabHelpAction = "explain_query" | "explain_error" | "hint" | "explain_schema" | "practice_question" | "explain_result";

export type LabBlock =
  | { kind: "p"; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "code"; code: string; language: "graphql" | "json" }
  | { kind: "try"; label: string; query: string; variables?: Record<string, unknown> }; // a runnable example

export interface LabError {
  message: string;
  locations?: { line: number; column: number }[];
  path?: (string | number)[];
  category: LabErrorCategory;
  code: string | null;
}
export interface LabResult {
  data?: unknown;
  errors?: LabError[];
}
export interface LabExecuteRequest {
  query: string; // max 4000 characters
  variables?: Record<string, unknown> | null; // max 2000 characters as JSON
  operation_name?: string;
}
export interface LabExecuteResponse {
  phase: LabPhase; // where it stopped: syntax, validation, variables (coercion) or execution; "ok" when it ran
  operation: "query" | "mutation" | "subscription" | null;
  result: LabResult; // a standard GraphQL response ({ data, errors })
  state_changed: boolean; // true when a mutation changed YOUR training data
  training_data: "per_student" | "read_only"; // read_only: storage is unavailable, so mutations are refused
}

export interface LabModuleSummary {
  id: string;
  order: number;
  title: string;
  summary: string;
  difficulty: LabDifficulty;
  prerequisites: string[]; // module ids; recommended first, not enforced
  recommended_first: string[]; // the prerequisites this student has not completed yet
  lesson_count: number;
  exercise_count: number;
  status: LabModuleStatus;
  lessons_completed: number;
  exercises_passed: number;
}
export interface LabModulesResponse {
  modules: LabModuleSummary[];
  current_module_id: string | null;
}
export interface LabLesson {
  id: string;
  title: string;
  objectives: string[];
  blocks: LabBlock[];
  exercise_ids: string[];
  completed: boolean;
}
export interface LabChoiceOption {
  id: string;
  text: string;
}
export interface LabExerciseStudent {
  attempts: number;
  passed: boolean;
  passed_at: string | null;
  hints_used: number;
  last_attempt_at: string | null;
}
export interface LabExercise {
  id: string;
  module_id: string;
  lesson_id: string;
  order: number;
  title: string;
  type: LabExerciseType;
  difficulty: LabDifficulty;
  description: string;
  objectives: string[];
  concepts: string[];
  requirements: string[]; // what the solution must do; each is checked by the grader
  starter_query: string | null;
  starter_variables: Record<string, unknown> | null;
  example: { query: string; variables?: Record<string, unknown> } | null;
  options: LabChoiceOption[] | null; // choice and schema-reading questions
  multi_select: boolean;
  schema_excerpt: string | null;
  hints_total: number;
  max_answer_chars: number | null; // explanation questions
  grading: string; // how it is graded, in words
  version: number;
  provenance: "authored_original";
  student: LabExerciseStudent;
}
export interface LabModuleDetail {
  module: LabModuleSummary;
  objectives: string[];
  completion_criteria: string;
  lessons: LabLesson[];
  exercises: LabExercise[];
}
export interface LabExercisesResponse {
  exercises: LabExercise[];
}

export interface LabSchemaArg {
  name: string;
  type: string;
  default: string | null;
  description: string | null;
}
export interface LabSchemaField {
  name: string;
  type: string;
  description: string | null;
  args: LabSchemaArg[];
}
export interface LabSchemaType {
  name: string;
  kind: "OBJECT" | "INPUT_OBJECT" | "ENUM" | "UNION" | "INTERFACE" | "SCALAR";
  description: string | null;
  fields: LabSchemaField[]; // object types and input objects
  enum_values: { name: string; description: string | null }[];
  possible_types: string[]; // unions
}
export interface LabTrainingSchemaResponse {
  sdl: string; // the actual schema the server executes against
  types: LabSchemaType[]; // derived from that same schema
  query_type: string;
  mutation_type: string | null;
  limits: { max_query_chars: number; max_variables_chars: number; max_depth: number; max_fields: number; max_result_bytes: number };
}

export interface LabSubmitRequest {
  client_attempt_id: string; // 8 to 64 letters, digits, - or _; a retry with the same id returns the stored result
  query?: string;
  variables?: Record<string, unknown> | null;
  answer?: string | string[]; // choice ids, or the written explanation
}
export interface LabCheck {
  label: string;
  passed: boolean;
}
export interface LabAttempt {
  id: string;
  exercise_id: string;
  at: string;
  passed: boolean;
  query: string | null;
  variables: Record<string, unknown> | null;
  answer: string | string[] | null;
  feedback: string;
  checks: LabCheck[];
}
export interface LabSubmitResponse {
  attempt: LabAttempt;
  outcome: "passed" | "needs_improvement";
  feedback: string;
  checks: LabCheck[];
  hint: string | null; // a nudge when it did not pass (never the answer)
  explanation: string | null; // shown only after passing
  lesson: { module_id: string; lesson_id: string; title: string };
  newly_completed: { lesson: boolean; module: boolean };
  exercise: LabExerciseStudent;
  execution: LabExecuteResponse | null; // the result of running the student's own query, when there was one
  replayed: boolean; // true when this was a retry of an earlier submission
}
export interface LabAttemptsResponse {
  attempts: LabAttempt[];
}
export interface LabHintResponse {
  hint: string;
  hint_number: number;
  hints_total: number;
}

export interface LabModuleProgress {
  module_id: string;
  title: string;
  status: LabModuleStatus;
  lessons_completed: number;
  lessons_total: number;
  exercises_passed: number;
  exercises_total: number;
}
export interface LabProgressResponse {
  has_started: boolean;
  totals: {
    modules_started: number;
    modules_completed: number;
    modules_total: number;
    lessons_completed: number;
    lessons_total: number;
    exercises_attempted: number;
    exercises_passed: number;
    exercises_total: number;
    attempts: number;
  };
  current_module_id: string | null;
  modules: LabModuleProgress[];
  recent_activity: { at: string; kind: "passed" | "attempt" | "hint"; exercise_id: string; exercise_title: string; module_id: string }[];
  needs_another_attempt: { concept: string; exercise_ids: string[] }[]; // concepts of exercises attempted but not yet passed
  definitions: { metric: string; meaning: string }[];
}

export interface LabHelpRequest {
  action: LabHelpAction;
  exercise_id?: string;
  query?: string;
  variables?: Record<string, unknown> | null;
  message?: string; // the student's own question, max 500 characters
}
export interface LabHelpResponse {
  reply: string;
  mock: boolean; // true when the built-in mock mentor answered
  query_status: { phase: LabPhase; error_count: number } | null; // what actually happened when the server ran the student's query
  memory_saved: MentorSavedMemory[];
}
export interface LabResetResponse {
  application_count: number;
}

// ---------- Unified Placement Intelligence (Phase 9) ----------
// Everything here is computed by the application from stored records. The AI mentor explains it; it never supplies
// a score, a task or a completion. There is deliberately no overall readiness score or offer probability.
export type PlacementExperience = "beginner" | "intermediate" | "advanced";
export type PlacementPriority = "dsa" | "interview" | "graphql" | "projects" | "communication";
export type PlacementTaskType = "dsa_practice" | "dsa_revision" | "graphql" | "technical_interview" | "communication" | "project" | "diagnostic" | "general";
export type PlacementTaskStatus = "planned" | "in_progress" | "completed" | "skipped" | "removed" | "superseded"; // postponing keeps "planned" and moves the due date
export type PlacementTaskAction = "start" | "complete" | "postpone" | "skip" | "reschedule" | "remove" | "reopen";
export type EvidenceProvenance = "verified" | "self_reported" | "demonstration" | "unavailable";
export type EvidenceKind = "dsa_judged" | "interview_assessment" | "graphql_lab" | "github_context" | "none";
export type SkillStatus = "strong" | "developing" | "weak" | "unassessed";
export type EvidenceConfidence = "none" | "low" | "medium" | "high";
export type EvidenceRecency = "recent" | "aging" | "stale" | "none";

export interface PlacementProfile {
  role_ids: string[]; // role catalogue ids, at most 3
  target_companies: string[]; // free text, at most 10; used only as the student's own goal, never to claim company data
  placement_date: string | null; // YYYY-MM-DD, today or later
  available_weekdays: number[]; // 0 = Sunday .. 6 = Saturday, at least one
  daily_minutes: number; // 15 to 480 minutes on each available day
  preferred_language: CodeLanguageId | null;
  experience_level: PlacementExperience | null; // self-reported
  strengths: string[]; // self-reported topic names, at most 8
  weak_areas: string[]; // self-reported topic names, at most 8
  priorities: PlacementPriority[];
}
export interface PlacementProfileResponse {
  profile: PlacementProfile | null;
  updated_at: string | null;
  suggestions: { preferred_language: CodeLanguageId | null; daily_minutes: number | null } | null; // from the AI mentor's saved memory; never applied without the student saving
  roles: RoleSummary[];
  topics: string[];
}

export interface EvidenceLimitation {
  source: "dsa" | "interview" | "graphql" | "github" | "memory";
  severity: "info" | "limits_accuracy";
  message: string;
}
export interface SkillAssessment {
  area: string; // stable key, for example dsa:Arrays, interview:react_state, graphql, project:github
  label: string;
  category: "dsa" | "interview" | "graphql" | "project";
  status: SkillStatus;
  estimate: number | null; // 0..1, only from verified results; null when there is not enough to estimate
  evidence: { kind: EvidenceKind; provenance: EvidenceProvenance; count: number; unit: string; last_at: string | null; recency: EvidenceRecency };
  confidence: EvidenceConfidence;
  gaps: string[];
  self_reported: string | null; // what the student said; never part of the estimate
  next_assessment: { type: PlacementTaskType; description: string } | null;
  note: string | null;
}
export interface PlacementSkillsResponse {
  generated_at: string;
  skills: SkillAssessment[];
  coverage: { in_scope: number; sufficient_evidence: number; provisional: number; unassessed: number; definition: string };
  limitations: EvidenceLimitation[];
  method: string[]; // how the numbers are calculated, in words
}

export interface PlacementTask {
  id: string; // deterministic from the activity, so the same activity is never planned twice
  type: PlacementTaskType;
  title: string;
  description: string;
  skill_area: string;
  priority: 1 | 2 | 3 | 4 | 5; // 1 is most urgent
  estimated_minutes: number;
  due_date: string; // YYYY-MM-DD
  original_due_date: string;
  link: string; // the page where the work happens
  ref: { kind: string; id: string }; // the question, revision item, lesson, role skill or repository this is about
  completion_criteria: string;
  completion_check: "verified_event" | "student"; // verified_event: completed automatically when the real record appears
  evidence_source: string; // the record or rule behind the recommendation
  reason: string; // why it is suggested
  reason_codes: string[];
  depends_on: string[];
  blocked: boolean; // a task it depends on is not done yet
  status: PlacementTaskStatus;
  postponed_count: number;
  skip_reason: string | null;
  completed_at: string | null;
  completed_by: "verified_event" | "student" | null;
  student_scheduled: boolean; // the student chose the date; regeneration keeps it
  created_at: string;
  updated_at: string;
  history: { at: string; event: string; detail: string | null }[];
}
export interface PlacementChange {
  at: string;
  kind: "plan_generated" | "task_added" | "task_completed" | "task_rescheduled" | "task_reprioritized" | "task_superseded" | "profile_changed" | "plan_adjusted";
  summary: string;
  reason: string;
  task_id: string | null;
}
export interface PlacementFeasibility {
  status: "no_deadline" | "ok" | "tight" | "insufficient";
  required_minutes: number; // work that matters most (priority 1 and 2 plus first assessments)
  available_minutes: number; // until the placement date, from your availability
  message: string;
  reduced: boolean; // a smaller, prioritised plan was made
  deferred_task_ids: string[]; // tasks left out or pushed past the deadline for lack of time
}
export interface PlacementDay {
  date: string;
  weekday: string;
  available: boolean;
  capacity_minutes: number;
  planned_minutes: number;
  completed_minutes: number;
  tasks: PlacementTask[];
}
export interface PlacementImprovement {
  at: string | null;
  area: string;
  message: string;
  source: "dsa_judged" | "graphql_lab" | "interview_assessment" | "plan";
}
export interface PlacementDashboard {
  generated_at: string;
  today: string;
  needs_profile: boolean;
  profile: PlacementProfile | null;
  plan: { generation: number; generated_at: string | null; feasibility: PlacementFeasibility | null; days_until_placement: number | null } | null;
  today_tasks: PlacementTask[]; // due today, plus work moved forward from missed days
  today_minutes: number;
  today_capacity_minutes: number;
  week: PlacementDay[]; // the next 7 days
  counts: { planned: number; in_progress: number; completed: number; skipped: number };
  outstanding_priorities: PlacementTask[]; // priority 1 and 2, not done
  skills: PlacementSkillsResponse;
  history: {
    recent_completed: PlacementTask[];
    changes: PlacementChange[];
    improvements: PlacementImprovement[]; // only from verified results
    repeated_difficulties: { area: string; detail: string }[];
    revision: { due: number; items: number };
  };
  readiness: { sufficient_evidence: string[]; weak: string[]; unassessed: string[]; next_diagnostics: { area: string; description: string }[]; note: string };
  limitations: EvidenceLimitation[];
}

export interface PlacementTaskActionRequest {
  action: PlacementTaskAction;
  days?: number; // postpone: 1 to 14
  date?: string; // reschedule: YYYY-MM-DD within the next 90 days
  reason?: string; // skip: 3 to 200 characters
}
export interface PlacementGenerateRequest {
  mode?: "default" | "reduced"; // reduced keeps only the highest-priority work
}

export type PlacementIntent = "today" | "why" | "changes" | "feasibility" | "weakest" | "lighter" | "revise" | "other";
export type PlacementProposedChange =
  | { kind: "lighter_day"; date: string; max_minutes: number; description: string }
  | { kind: "postpone_day"; date: string; days: number; description: string }
  | { kind: "set_daily_minutes"; minutes: number; description: string };
export interface PlacementAssistantRequest {
  message: string; // max 500 characters
}
export interface PlacementAssistantResponse {
  intent: PlacementIntent;
  answer: string; // built by the application from the stored plan and evidence; always present
  mentor_reply: string | null; // the AI mentor's explanation, when available
  mentor: { available: boolean; mock: boolean; error: string | null };
  proposed_changes: PlacementProposedChange[]; // nothing changes until the student applies one
  memory_saved: MentorSavedMemory[];
}
export interface PlacementApplyChangeRequest {
  change: { kind: "lighter_day"; date: string; max_minutes: number } | { kind: "postpone_day"; date: string; days: number } | { kind: "set_daily_minutes"; minutes: number };
}
export interface PlacementApplyChangeResponse {
  summary: string;
  dashboard: PlacementDashboard;
}

export interface ApiErrorBody {
  error: { code: ErrorCode; message: string };
}
```

## 5. Endpoints

| Method | Path | Body | 200 response |
|---|---|---|---|
| GET | `/api/health` | — | `HealthResponse` |
| GET | `/api/roles` | — | `RolesResponse` |
| GET | `/api/roles/:roleId` | — | `Role` |
| POST | `/api/claims/extract` | `ExtractRequest` | `ClaimsResponse` (creates the session) |
| POST | `/api/claims/confirm` | `ConfirmRequest` | `ClaimsResponse` |
| POST | `/api/interrogate` | `InterrogateRequest` | `TurnResponse` |
| POST | `/api/fix-task` | `FixTaskRequest` | `FixTaskResponse` |
| GET | `/api/report/:sessionId` | — | `Report` |
| GET | `/api/demo/report` | — | `Report` (the §7 mock, verbatim) |
| GET | `/api/sessions` | — | `SessionsResponse` (caller's own sessions, newest first) |
| DELETE | `/api/sessions/:sessionId` | — | `204 No Content` (owned sessions only; removes resume text, answers and report data) |

Public (no token): `/api/health`, `/api/roles`, `/api/roles/:roleId`, `/api/demo/report`, and the read-only DSA catalogue (`/api/companies*`, `/api/questions*`). Everything else needs a bearer token.

### Company-wise DSA Arena *(Phase 3)*

Catalogue (public, read-only; filtering and pagination are server-side):

| Method | Path | Query | 200 response |
|---|---|---|---|
| GET | `/api/companies` | `search`, `page`, `page_size` | `CompaniesResponse` |
| GET | `/api/companies/:companyId` | — | `CompanyDetailResponse` |
| GET | `/api/companies/:companyId/questions` | same as `/api/questions` except `company` | `QuestionsResponse` |
| GET | `/api/questions` | `search`, `company`, `difficulty`, `topic`, `sort` (`title`\\|`difficulty`), `order` (`asc`\\|`desc`), `page`, `page_size` | `QuestionsResponse` |
| GET | `/api/questions/:questionId` | — | `QuestionDetailResponse` |

Filters combine with AND (topic and difficulty match exactly, case-insensitively; `search` is a case-insensitive substring of the title). `page` defaults to 1, `page_size` to 20 (max 100). Unknown query keys are rejected with `400`. An unknown `company` filter returns `404 COMPANY_NOT_FOUND`.

Every response carries `source` (provenance and licence status of the loaded catalogue) or `null` when none is loaded. `is_sample_data: true` means a development fixture, not real company data. Counts are derived from loaded data only; no frequencies, acceptance rates or "asked by" claims exist in the model.

Personal progress (**requires a token**; the owner is always the verified uid, never a request field):

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/me/dsa-progress` | — | `DsaProgressListResponse` |
| PUT | `/api/me/dsa-progress/:questionId` | `DsaProgressUpdate` (at least one field) | `DsaProgress` (creates or updates; one record per student and question) |
| DELETE | `/api/me/dsa-progress/:questionId` | — | `204 No Content` |

Progress records are independent of the catalogue: a catalogue refresh never changes or deletes them, and a record whose question has since left the catalogue is still returned by the list.

### Coding workspace *(Phase 4)*

Code runs only in an isolated execution service (Judge0) behind a server-side adapter; it never runs in the API process, and the browser never talks to the provider or sees its credentials. Which languages exist comes from the service itself (`GET /languages`), not from hard-coded ids.

| Method | Path | Auth | Body / query | 200 response |
|---|---|---|---|---|
| GET | `/api/code/languages` | public | | `CodeLanguagesResponse` |
| GET | `/api/code/exercises/:questionId` | public | | `CodeExerciseResponse` (public data only) |
| POST | `/api/code/run` | **token** | `CodeRunRequest` | `CodeRunResponse` |
| POST | `/api/code/submit` | **token** | `CodeSubmitRequest` | `CodeSubmission` |
| GET | `/api/code/submissions` | **token** | `question_id` (optional) | `CodeSubmissionsResponse` |
| GET | `/api/code/submissions/:submissionId` | **token** | | `CodeSubmissionDetail` |
| DELETE | `/api/code/submissions/:submissionId` | **token** | | `204 No Content` |

- **Run** executes the source against custom `stdin`, or against one of a question's visible samples (`question_id` + `sample_index`; then `sample_passed` says whether the output matched). Running never changes progress and is not stored.
- **Submit** grades against the question's hidden test suite on the server. If the question has no validated suite it returns `409 GRADING_UNAVAILABLE`; nothing is judged and nothing is recorded. Each submission is stored (including the source, so the history can show it) under the caller's uid. An `accepted` verdict (every hidden test passed) is the only thing that marks the DSA question `solved`; other verdicts never change progress.
- Hidden test inputs and expected outputs are never returned. A failing submission reveals only which test number failed.
- Limits: source at most 50,000 bytes, `stdin` at most 20,000 bytes. Execution time and memory limits are enforced by the execution service. `run` and `submit` are rate limited per user; a user has at most one judging job in flight (`429 RATE_LIMITED`).
- `503 EXECUTION_UNAVAILABLE`: no execution service is configured, it is unreachable, timed out or returned something invalid. `404 SUBMISSION_NOT_FOUND` covers unknown ids and other users' submissions alike.

### DSA analytics and revision *(Phase 5)*

Everything here is derived from the student's own stored, **judged** submissions. A submission counts (`analytics_status: "counted"`) only if it was judged against a suite declared analytics-eligible (never a demonstration suite), every hidden test actually ran on a non-mock execution service the operator has declared verified, the stored result is internally consistent, and the judge itself did not fail. Run actions, sample runs, demonstration exercises, judge errors and records without provenance never count, and a self-reported progress mark never counts as solved.

| Method | Path | Auth | Notes | 200 response |
|---|---|---|---|---|
| GET | `/api/me/dsa-analytics` | **token** | `weeks` (1-26, default 8) | `DsaAnalyticsResponse` (totals, rates, topics, difficulties, weaknesses, trends) |
| GET | `/api/me/dsa-analytics/history` | **token** | `from`, `to` (YYYY-MM-DD, at most 365 days apart) | `AnalyticsHistoryResponse` |
| POST | `/api/me/dsa-analytics/refresh` | **token** | rebuilds the caller's statistics from their stored submissions (repair after a partial failure) | `DsaAnalyticsResponse` |
| GET | `/api/me/dsa-revision` | **token** | `view` (`due`\|`upcoming`\|`all`, default `due`), `page`, `page_size` | `RevisionQueueResponse` |
| GET | `/api/me/dsa-revision/:questionId` | **token** | | `RevisionItem` |
| POST | `/api/me/dsa-revision` | **token** | `RevisionAddRequest` (adds a suggested weak-topic question) | `RevisionItem` |
| POST | `/api/me/dsa-revision/:questionId/actions` | **token** | `RevisionActionRequest` | `RevisionItem` |

- Percentages carry their numerator, denominator and sample size; below the minimum sample `value` is null and `available` is false.
- One revision item exists per student and question. A new eligible failed submission updates it instead of adding another; an accepted submission moves it to spaced review.
- `404 REVISION_NOT_FOUND` covers unknown items and other students' items alike. The `CodeSubmission` type gained `analytics_status`.

### AI mentor *(Phase 6)*

A chat mentor with persistent, student-controlled memory. All routes require a token; the owner is always the verified uid. Conversations and memories are stored in the server-side database, not carried by the model. Each chat turn retrieves a small, bounded set of relevant memories (profile, active goals, matching learning notes and summaries) and a deterministic summary of the student's **verified** practice (counted judged submissions, topic analytics, revision queue, interview results) and sends them to the model as clearly delimited, untrusted data. The model never computes analytics and cannot overwrite them.

| Method | Path | Notes | 200 response |
|---|---|---|---|
| POST | `/api/mentor/chat` | `MentorChatRequest` | `MentorChatResponse` |
| GET | `/api/mentor/conversations` | `page`, `page_size` | `MentorConversationsResponse` |
| GET | `/api/mentor/conversations/:conversationId` | | `MentorConversation` |
| POST | `/api/mentor/conversations/:conversationId/summary` | creates or refreshes the session summary | `MentorMemory` |
| DELETE | `/api/mentor/conversations/:conversationId` | `keep_summary=true` keeps its summary memory | `204` |
| GET | `/api/mentor/memories` | `type`, `page`, `page_size` | `MentorMemoriesResponse` |
| POST | `/api/mentor/memories` | `{ type: "goal" \| "learning", content, topic?, track?, signal? }` (student-provided) | `MentorMemory` |
| PATCH | `/api/mentor/memories/:memoryId` | `{ content?, topic?, status? }` | `MentorMemory` |
| DELETE | `/api/mentor/memories/:memoryId` | | `204` |
| DELETE | `/api/mentor/memories` | `conversations=true` also deletes all conversations | `204` |
| GET | `/api/mentor/profile` | | `MentorProfileResponse` |
| PUT | `/api/mentor/profile` | `MentorProfile` fields (student-provided corrections) | `MentorProfileResponse` |

- A model-proposed memory is saved only if the student's own message contains the supporting quote verbatim; the backend, not the model, sets provenance. Goals the application can verify (`track`) are completed by application events (counted judged submissions, completed revision), never by the model.
- If an answer succeeds but storage fails, the response says so (`degraded`, `persistence`). If the model call fails, nothing is stored and no memory is created.
- Hint ladder: `assist: "hint"` raises `hint_level` (max 3); `assist: "solution"` is only answered by the model once `hint_level >= 2`.
- Deleting memories or conversations never touches submissions, progress, analytics statistics, revision items or interview results. `404 CONVERSATION_NOT_FOUND` / `404 MEMORY_NOT_FOUND` cover unknown and other students' ids alike. Chat is rate limited per user (`429 RATE_LIMITED`), one reply in flight per user.

### GitHub contribution insights *(Phase 7)*

Read-only and public-data-only. All routes except the OAuth callback require the bearer token; the student is always the verified uid and no route accepts a uid, URL or GraphQL query from the client. Responses are `Cache-Control: no-store`. GitHub tokens, authorization codes and raw GitHub payloads never appear in any response.

| Method | Path | Body / query | Response |
|---|---|---|---|
| GET | `/api/github/connection` | | `GithubConnection` (`status` is `not_configured` when the operator has not set up the OAuth app) |
| POST | `/api/github/connect` | `{}` | `GithubConnectResponse` (open `authorize_url`; `503 GITHUB_NOT_CONFIGURED` if not set up; `400` if already connected) |
| GET | `/api/github/oauth/callback` | GitHub's `code`, `state`, `error` | `302` to `<app>/settings?github=connected` or `?github=error&reason=<GithubCallbackReason>`. **No bearer token** (a browser redirect): the student is identified only by the one-time server-side `state`. |
| DELETE | `/api/github/connection` | | `GithubDisconnectResponse` (idempotent; deletes the credential and cached data, revokes at GitHub when reachable) |
| POST | `/api/github/sync` | `{}` | `GithubSyncResponse` (`429 GITHUB_RATE_LIMITED`, `502 GITHUB_UNAVAILABLE`, `409 GITHUB_REAUTH_REQUIRED`, `409 GITHUB_NOT_CONNECTED`) |
| GET | `/api/github/contributions` | | `GithubContributionsResponse` (from the saved copy; `available: false` before the first sync) |
| GET | `/api/github/repositories` | | `GithubRepositoriesResponse` (public repositories only, plus the portfolio checklist) |
| GET | `/api/github/activity` | | `GithubActivityResponse` |

- Reads never call GitHub. A manual sync is answered from the saved copy (`outcome: "cached"`) until the minimum interval passes or, after a rate limit, GitHub's reset time. Concurrent syncs for one student share a single run.
- Each section (`contributions`, `repositories`, `activity`) is stored with its own time. If one section fails, the others are updated and the older copy of the failed one is kept and labelled with its older `synced_at`.
- `POST /api/mentor/chat` may return `github_context` when the message was about GitHub or projects. The mentor then received a short summary of the saved public data; it never receives tokens or repository text.

### GraphQL Learning Lab *(Phase 8)*

An educational module. Every route requires the bearer token and acts only on the verified uid. The only GraphQL endpoint is the Lab's own **training API**; there is no proxy: no URL, header, token or user id is accepted. Progress and training data are separate from DSA analytics. Responses are `Cache-Control: no-store` except the schema.

| Method | Path | Body / query | Response |
|---|---|---|---|
| GET | `/api/graphql-lab/modules` | | `LabModulesResponse` (ten modules, status from your progress, recommended prerequisites) |
| GET | `/api/graphql-lab/modules/:moduleId` | | `LabModuleDetail` (`404 MODULE_NOT_FOUND`) |
| GET | `/api/graphql-lab/exercises` | | `LabExercisesResponse` |
| GET | `/api/graphql-lab/exercises/:exerciseId` | | `LabExercise` (`404 EXERCISE_NOT_FOUND`) |
| GET | `/api/graphql-lab/training-schema` | | `LabTrainingSchemaResponse` (derived from the schema that executes queries, plus the enforced limits) |
| POST | `/api/graphql-lab/execute` | `LabExecuteRequest` (strict) | `LabExecuteResponse` (always 200 for a bad document: `phase` says syntax, validation, variables or execution) |
| POST | `/api/graphql-lab/exercises/:exerciseId/hint` | `{}` | `LabHintResponse` (next hint; the last one repeats) |
| POST | `/api/graphql-lab/exercises/:exerciseId/submit` | `LabSubmitRequest` (strict) | `LabSubmitResponse` |
| GET | `/api/graphql-lab/progress` | | `LabProgressResponse` |
| GET | `/api/graphql-lab/attempts` | `exercise_id?` | `LabAttemptsResponse` (newest first, at most 20 per exercise are kept) |
| POST | `/api/graphql-lab/training-data/reset` | `{}` | `LabResetResponse` |
| POST | `/api/graphql-lab/help` | `LabHelpRequest` (strict) | `LabHelpResponse` (the Phase 6 mentor; `502/504` if the model is unavailable, the Lab otherwise keeps working) |
| DELETE | `/api/graphql-lab/progress` | | `204`; deletes your progress, attempts and training data |

- **Grading is real.** A query exercise is graded by validating the student's document against the training schema, executing it (once per hidden variable set) on fresh training data, and comparing the response, and for mutations the resulting data, with the trusted reference's. Equivalent documents pass; text is never compared. Hidden references, variable sets, answer keys and rubrics never appear in any response, and hints are returned only by the hint endpoint, one at a time.
- **Completion is idempotent.** `client_attempt_id` (8 to 64 letters, digits, `-`, `_`) makes a submission safe to retry: a repeat returns the stored result with `replayed: true` and counts once. `passed_at` is set by the first pass only.
- **Limits** (see `limits` in the training schema): 4000-character query, 2000-character variables, depth 7, 120 fields after fragment expansion, 60 000-byte response, 1.5 s execution. Rate limits per student: execute 60/min, submit/hint/reset 30/min, help 12/min.
- Mutations change only the caller's own training data. If it cannot be loaded, queries still run (`training_data: "read_only"`) and mutations are refused; if a mutation cannot be saved the request fails with `503 GRAPHQL_LAB_UNAVAILABLE` instead of claiming success.

### Unified placement intelligence *(Phase 9)*

Every route requires the bearer token and acts only on the verified uid. All numbers are calculated by the application from records the other modules already keep; the AI mentor only explains them and can never change a task, score or completion. There is **no overall readiness score and no offer probability**.

| Method | Path | Body / query | Response |
|---|---|---|---|
| GET | `/api/placement/profile` | | `PlacementProfileResponse` (also the role and topic choices, and mentor-memory suggestions that are never applied automatically) |
| PUT | `/api/placement/profile` | `PlacementProfile` (strict) | `PlacementProfileResponse`; if a plan exists, work that no longer fits is moved and the change recorded |
| GET | `/api/placement/dashboard` | | `PlacementDashboard` (read only: no plan changes) |
| POST | `/api/placement/refresh` | `{}` | `PlacementDashboard` after applying verified completions, moving missed work forward and topping the plan up (creates the first plan) |
| POST | `/api/placement/plan/generate` | `PlacementGenerateRequest` | `PlacementDashboard`; replaces future recommendations only (`409 PLACEMENT_PROFILE_REQUIRED` without goals) |
| POST | `/api/placement/tasks/:taskId/action` | `PlacementTaskActionRequest` | `PlacementTask` (`404 PLACEMENT_TASK_NOT_FOUND` also for another student's task) |
| POST | `/api/placement/assistant` | `PlacementAssistantRequest` | `PlacementAssistantResponse` (a deterministic `answer` always; `mentor_reply` when the AI mentor is available; proposed changes are never applied here) |
| POST | `/api/placement/changes/apply` | `PlacementApplyChangeRequest` (strict) | `PlacementApplyChangeResponse` (validated again, applied by the backend) |
| DELETE | `/api/placement/data` | | `204`; deletes goals, plan and tasks only |

- Task ids are derived from the activity, so the same activity is never planned twice. A task completes automatically only when the real record appears (a judged submission, a revision review, a passed Lab exercise, an assessed interview session, a mentor conversation, a GitHub check); marking a task done yourself is recorded as such and is not evidence.
- Evidence limitations (unconfigured or unverified code execution, demonstration suites, mock-model interview results, GitHub not connected) are listed in `limitations`; they reduce what can be assessed and never produce invented values.
- Rate limits per student: refresh/generate 20/min, assistant 12/min, profile, task actions and changes 60/min.

### `POST /api/claims/extract`
- *(added)* Optional `mode`: `"prepare"` (teach as you go) or `"defense"` (default, interview simulation). Stored on the session and echoed as `ClaimsResponse.mode` / `Report.mode`.
- At least one of `resume_text` (non-blank) or `declared_skills` (non-empty) is required → else 400.
- Max 8 claims. Resume claims come first, then one claim per declared chip (`source: "declared"`,
  `text: "Knows <chip>"`, `resume_line: null`).
- All claims start `verdict: "pending"`, `levels_passed: 0`, `proficiency: 0`.

### `POST /api/claims/confirm`
- Replaces the claim list. `id: null` → new id. An existing id keeps its progress only if `text` and
  `skill_id` are unchanged; otherwise it resets to `pending`. Unknown id → 404 `CLAIM_NOT_FOUND`.
- `skill_id` must be a skill of the session's role or `null` → else 400. Blind spots are recomputed.

### `POST /api/interrogate`
One endpoint drives both assessment and retest.

| Request | Behaviour |
|---|---|
| no `answer`, claim idle | Starts the claim. `mode: "assess"` requires verdict `pending` or `error`. `mode: "retest"` requires `shaky`, `bluff` or `honest_gap` **and** `retest_status: "due"` (see Learning loop). Else 400. Returns `turn: "question"`. |
| no `answer`, claim in progress | Returns the current open question again (safe to call on page reload). |
| `answer`, claim in progress | Grades the answer and returns the next turn. |
| `answer`, claim idle | 400. |
| `answer: null` | Same as omitting `answer`. |

`TurnResponse` also carries five **alias** fields for older clients, each always equal to its
canonical field: `last_grade` = `grade`, `verdict` = `claim.verdict`, `levels_passed` =
`claim.levels_passed`, `next_claim_id` = `progress.next_claim_id`, `retest` = `claim.retest`.
New code should read the canonical fields.

Turn rules:

| Situation | Result |
|---|---|
| `admits_gap` | `turn: "done"`, verdict `honest_gap` |
| `needs_clarification` and this level's clarify not used | `turn: "clarify"`, same level, follow-up question |
| Level failed | `turn: "done"` |
| Level passed, level < 3 | `turn: "question"`, next level |
| Level 3 passed | `turn: "done"` |
| LLM invalid/timeout | `turn: "done"`, verdict `error` (assess) — may be re-started |

Level pass rules (code, after the evidence guard): **L1** `accuracy && specificity && ownership`,
**L2** `accuracy && mechanism`, **L3** `accuracy && tradeoff`.

| Outcome | Verdict | Proficiency |
|---|---|---|
| 3 levels passed | `defended` | 0.85 |
| 2 levels passed | `shaky` | 0.60 |
| 1 level passed | `shaky` | 0.25 |
| 0 levels passed | `bluff` | 0 |
| Gap admitted | `honest_gap` | 0 |
| LLM failure | `error` | 0 |
| Retest passed through L3 | `defended` | 1.0 |

Retest starts at the first failed level (L1 for `bluff`/`honest_gap`) with a new scenario question,
and on `done` sets `claim.retest`. A failed retest keeps the old verdict and never lowers proficiency.

### `POST /api/fix-task`
Only for `shaky`, `bluff`, `honest_gap` claims (else 400). Result is cached on `claim.fix_task`.
*(added)* The task targets `root_cause` first when one was diagnosed, and fetching it **schedules the retest**
(`retest_status: "scheduled"`, `retest_unlocks_after: 2`) unless it is already scheduled or due.

### Learning loop *(added)*

**Root cause.** Each role skill lists `prerequisites` (most fundamental first). GRADE also returns
`root_cause`, and code keeps it only if it is exactly one of those prerequisites (else `null`, and
always `null` on a passed level). `Claim.root_cause` is the root cause of the failing level. It costs
no extra LLM call.

**Delayed, interleaved retest.**

| Event | Effect |
|---|---|
| `POST /api/fix-task` on a weak claim | `retest_status: "scheduled"`, `retest_unlocks_after: 2` |
| Another claim's assess or retest reaches `turn: "done"` | every scheduled claim: `retest_unlocks_after − 1`; at 0 → `"due"` |
| No pending claims left, nothing due, some scheduled | the oldest scheduled one is forced `"due"` |
| Retest reaches `done` | `retest_status: "done"`, `retest_unlocks_after: null` |
| Retest start while not due | 400 `BAD_REQUEST`, message `Retest unlocks after N more concepts` |

`RetestResult.interleaved_claims` is the real number of other claims completed between opening the fix
task and starting the retest (0 when forced due early). Retest questions are fresh scenarios on
`root_cause` (else `missing_concepts`), never a repeat of the claim's earlier questions.

**What next.** `Progress.next_claim_id` / `next_mode` (also `TurnResponse.next_mode`): (1) first due retest →
`"retest"`, (2) first pending claim → `"assess"`, (3) the forced-due case above → `"retest"`, (4) `null`.

**teach_now.** `true` only in `prepare` mode on the `done` turn that leaves the claim `shaky`, `bluff` or
`honest_gap`. The UI should then show the fix task immediately. Always `false` in `defense` mode.

**L3 focus.** L3 questions ask why this approach, **when they would NOT use it**, and to defend the
decision against a concrete alternative.

### `GET /api/report/:sessionId`
Builds the report. Rewrites and fix tasks for weak claims are generated once and cached, so
refetching is cheap. Can be called at any time (unassessed claims are `pending`).

- `readiness = round(100 × Σ weight × skill proficiency)`, skill proficiency = max over its claims.
- `coverage = round(100 × Σ weight of skills with ≥1 claim whose verdict is not pending/error)`.
- Skill `state`: `blind_spot` (no claims) → `unverified` (all pending/error) → `ready` (≥ 0.6) → `needs_work`.
- `priorities`: top 3 skills by `weight × (1 − proficiency)`, ties by weight then role order. *(added)* `reason` ends with `(root cause: X)` when the weakest claim has one.
- `plan`: one item per priority, then remaining shaky/bluff/honest_gap claims; days 1..7, 2 per day.
- `resume_lines`: worst verdict per line, severity `bluff > shaky > honest_gap > error > pending > defended`.

## 6. Display mapping (label + icon + color — never color alone)

Colors are chosen for ≥ 4.5:1 contrast as text on white (`fg`) and on their tint (`bg`).
Icon names are from `lucide-react`.

| Verdict | Label | Icon | fg | bg |
|---|---|---|---|---|
| `defended` | Defended | `ShieldCheck` | `#166534` | `#DCFCE7` |
| `shaky` | Shaky | `AlertTriangle` | `#92400E` | `#FEF3C7` |
| `bluff` | Bluff | `XOctagon` | `#991B1B` | `#FEE2E2` |
| `honest_gap` | Honest gap | `HelpCircle` | `#1E40AF` | `#DBEAFE` |
| `error` | Not assessed (error) | `CircleSlash` | `#374151` | `#F3F4F6` |
| `pending` | Not yet assessed | `Clock` | `#334155` | `#F1F5F9` |

| SkillState | Label | Icon | fg | bg |
|---|---|---|---|---|
| `ready` | Ready | `CheckCircle2` | `#166534` | `#DCFCE7` |
| `needs_work` | Needs work | `Wrench` | `#92400E` | `#FEF3C7` |
| `unverified` | Unverified | `Clock` | `#334155` | `#F1F5F9` |
| `blind_spot` | Blind spot | `EyeOff` | `#6B21A8` | `#F3E8FF` |
| `deprioritized` | Not in role | `MinusCircle` | `#374151` | `#F3F4F6` |

Resume heatmap line with `verdict: null` → no highlight, label "No claim".

## 7. Mock report

`GET /api/demo/report` returns exactly this JSON (also `backend/data/demo_report.json` and
`frontend/src/mocks/report.json`). It was generated by the backend's own report builder
(`backend/scripts/build_demo_report.ts`) so it is guaranteed to match §4.

<!-- MOCK_REPORT_START -->
```json
{
  "session_id": "s_demo",
  "mode": "prepare",
  "role": {
    "id": "frontend_developer",
    "name": "Frontend Developer"
  },
  "generated_at": "2026-09-26T09:09:35.000Z",
  "readiness": 45,
  "coverage": 90,
  "claims": [
    {
      "id": "CL-001",
      "text": "Built a React e-commerce dashboard with Redux handling 10k+ products",
      "resume_line": "Built a React e-commerce dashboard with Redux handling 10k+ products",
      "skill_id": "react_state",
      "source": "resume",
      "verdict": "shaky",
      "levels_passed": 1,
      "proficiency": 0.25,
      "missing_concepts": [
        "Reconciliation: the new element tree is diffed against the previous one; the virtual DOM is not a cache",
        "How useSelector subscribes to the store and triggers a re-render when the selected value changes"
      ],
      "evidence": [
        {
          "level": 1,
          "criterion": "accuracy",
          "passed": true,
          "quote": "I wrote the products slice and the cart slice with Redux Toolkit"
        },
        {
          "level": 1,
          "criterion": "specificity",
          "passed": true,
          "quote": "the ProductTable and FilterBar components"
        },
        {
          "level": 1,
          "criterion": "mechanism",
          "passed": true,
          "quote": "The products slice held the paginated list of 10k items"
        },
        {
          "level": 1,
          "criterion": "ownership",
          "passed": true,
          "quote": "I wrote the products slice and the cart slice"
        },
        {
          "level": 1,
          "criterion": "tradeoff",
          "passed": true,
          "quote": "held the paginated list of 10k items and the active filters"
        },
        {
          "level": 2,
          "criterion": "accuracy",
          "passed": false,
          "quote": "hooks make the app faster and the virtual DOM caches everything"
        },
        {
          "level": 2,
          "criterion": "specificity",
          "passed": true,
          "quote": "only the changed rows update"
        },
        {
          "level": 2,
          "criterion": "ownership",
          "passed": true,
          "quote": "React re-renders because hooks make the app faster"
        }
      ],
      "qa": [
        {
          "level": 1,
          "kind": "question",
          "mode": "assess",
          "question": "In the dashboard, which Redux slices and React components did you personally write, and what data did each hold?",
          "answer": "I wrote the products slice and the cart slice with Redux Toolkit, and the ProductTable and FilterBar components. The products slice held the paginated list of 10k items and the active filters.",
          "grade": {
            "criteria": {
              "accuracy": {
                "passed": true,
                "evidence_quote": "I wrote the products slice and the cart slice with Redux Toolkit",
                "missing_concept": null
              },
              "specificity": {
                "passed": true,
                "evidence_quote": "the ProductTable and FilterBar components",
                "missing_concept": null
              },
              "mechanism": {
                "passed": true,
                "evidence_quote": "The products slice held the paginated list of 10k items",
                "missing_concept": null
              },
              "ownership": {
                "passed": true,
                "evidence_quote": "I wrote the products slice and the cart slice",
                "missing_concept": null
              },
              "tradeoff": {
                "passed": true,
                "evidence_quote": "held the paginated list of 10k items and the active filters",
                "missing_concept": null
              }
            },
            "admits_gap": false,
            "needs_clarification": false,
            "level_passed": true,
            "guard_flips": [],
            "root_cause": null
          },
          "asked_at": "2026-09-26T09:00:46.000Z"
        },
        {
          "level": 2,
          "kind": "question",
          "mode": "assess",
          "question": "When a user changes a filter in FilterBar, walk me through what happens from the dispatch to the table re-rendering.",
          "answer": "React re-renders because hooks make the app faster and the virtual DOM caches everything, so only the changed rows update automatically.",
          "grade": {
            "criteria": {
              "accuracy": {
                "passed": false,
                "evidence_quote": "hooks make the app faster and the virtual DOM caches everything",
                "missing_concept": "Reconciliation: the new element tree is diffed against the previous one; the virtual DOM is not a cache"
              },
              "specificity": {
                "passed": true,
                "evidence_quote": "only the changed rows update",
                "missing_concept": null
              },
              "mechanism": {
                "passed": false,
                "evidence_quote": null,
                "missing_concept": "How useSelector subscribes to the store and triggers a re-render when the selected value changes"
              },
              "ownership": {
                "passed": true,
                "evidence_quote": "React re-renders because hooks make the app faster",
                "missing_concept": null
              },
              "tradeoff": {
                "passed": false,
                "evidence_quote": null,
                "missing_concept": null
              }
            },
            "admits_gap": false,
            "needs_clarification": false,
            "level_passed": false,
            "guard_flips": [],
            "root_cause": "Reconciliation"
          },
          "asked_at": "2026-09-26T09:01:09.000Z"
        }
      ],
      "retest": null,
      "fix_task": {
        "claim_id": "CL-001",
        "skill_id": "react_state",
        "root_cause": "Reconciliation",
        "missing_concepts": [
          "Reconciliation: the new element tree is diffed against the previous one; the virtual DOM is not a cache",
          "How useSelector subscribes to the store and triggers a re-render when the selected value changes"
        ],
        "explanation": "The virtual DOM is **not a cache**. On `dispatch`, Redux runs the reducer and notifies subscribers; each `useSelector` re-runs its selector and compares the result with `===`. If it changed, that component **re-renders**: React calls it again, builds a new element tree, **diffs** it against the previous one (reconciliation, matching list rows by `key`) and **commits** only the changed DOM nodes. Hooks don't make anything faster; they're how components subscribe.",
        "exercise": "Build a 50-row product table with a Redux filter. Add `console.count` in each row and use React DevTools \"Highlight updates\". Change the filter and explain which components re-rendered and why. Then memoize the row and select only what it needs.\n\n**Done when** changing the filter re-renders only the table and the rows whose data changed."
      },
      "rewrite": "Built React + Redux Toolkit product and cart slices for a 10k-item dashboard (learning render/reconciliation internals)",
      "root_cause": "Reconciliation",
      "retest_status": "scheduled",
      "retest_unlocks_after": 2
    },
    {
      "id": "CL-002",
      "text": "Implemented REST API integration with Axios and JWT auth",
      "resume_line": "Implemented REST API integration with Axios and JWT auth",
      "skill_id": "rest_apis",
      "source": "resume",
      "verdict": "defended",
      "levels_passed": 3,
      "proficiency": 0.85,
      "missing_concepts": [],
      "evidence": [
        {
          "level": 1,
          "criterion": "accuracy",
          "passed": true,
          "quote": "a request interceptor that adds the Authorization Bearer token"
        },
        {
          "level": 1,
          "criterion": "specificity",
          "passed": true,
          "quote": "GET /products, POST /cart and POST /auth/login"
        },
        {
          "level": 1,
          "criterion": "mechanism",
          "passed": true,
          "quote": "a request interceptor that adds the Authorization Bearer token from memory"
        },
        {
          "level": 1,
          "criterion": "ownership",
          "passed": true,
          "quote": "I wrote an Axios instance with a request interceptor"
        },
        {
          "level": 1,
          "criterion": "tradeoff",
          "passed": true,
          "quote": "adds the Authorization Bearer token from memory"
        },
        {
          "level": 2,
          "criterion": "accuracy",
          "passed": true,
          "quote": "catches the 401, calls POST /auth/refresh once"
        },
        {
          "level": 2,
          "criterion": "specificity",
          "passed": true,
          "quote": "calls POST /auth/refresh once, stores the new token"
        },
        {
          "level": 2,
          "criterion": "mechanism",
          "passed": true,
          "quote": "stores the new token, and replays the original request"
        },
        {
          "level": 2,
          "criterion": "ownership",
          "passed": true,
          "quote": "The response interceptor catches the 401"
        },
        {
          "level": 2,
          "criterion": "tradeoff",
          "passed": true,
          "quote": "If refresh also fails it clears the token and redirects to login"
        },
        {
          "level": 3,
          "criterion": "accuracy",
          "passed": true,
          "quote": "localStorage is readable by any injected script, so an XSS bug would leak the token"
        },
        {
          "level": 3,
          "criterion": "specificity",
          "passed": true,
          "quote": "Keeping it in memory with an httpOnly refresh cookie is safer"
        },
        {
          "level": 3,
          "criterion": "mechanism",
          "passed": true,
          "quote": "logged out on a hard refresh until the refresh call runs"
        },
        {
          "level": 3,
          "criterion": "ownership",
          "passed": true,
          "quote": "which added a loading flash we had to handle"
        },
        {
          "level": 3,
          "criterion": "tradeoff",
          "passed": true,
          "quote": "Keeping it in memory with an httpOnly refresh cookie is safer, but the user is logged out on a hard refresh"
        }
      ],
      "qa": [
        {
          "level": 1,
          "kind": "question",
          "mode": "assess",
          "question": "Which endpoints did you call with Axios, and what exactly did you implement for JWT auth?",
          "answer": "I called GET /products, POST /cart and POST /auth/login. I wrote an Axios instance with a request interceptor that adds the Authorization Bearer token from memory.",
          "grade": {
            "criteria": {
              "accuracy": {
                "passed": true,
                "evidence_quote": "a request interceptor that adds the Authorization Bearer token",
                "missing_concept": null
              },
              "specificity": {
                "passed": true,
                "evidence_quote": "GET /products, POST /cart and POST /auth/login",
                "missing_concept": null
              },
              "mechanism": {
                "passed": true,
                "evidence_quote": "a request interceptor that adds the Authorization Bearer token from memory",
                "missing_concept": null
              },
              "ownership": {
                "passed": true,
                "evidence_quote": "I wrote an Axios instance with a request interceptor",
                "missing_concept": null
              },
              "tradeoff": {
                "passed": true,
                "evidence_quote": "adds the Authorization Bearer token from memory",
                "missing_concept": null
              }
            },
            "admits_gap": false,
            "needs_clarification": false,
            "level_passed": true,
            "guard_flips": [],
            "root_cause": null
          },
          "asked_at": "2026-09-26T09:01:55.000Z"
        },
        {
          "level": 2,
          "kind": "question",
          "mode": "assess",
          "question": "What happens in your client when a request comes back 401 because the token expired?",
          "answer": "The response interceptor catches the 401, calls POST /auth/refresh once, stores the new token, and replays the original request. If refresh also fails it clears the token and redirects to login.",
          "grade": {
            "criteria": {
              "accuracy": {
                "passed": true,
                "evidence_quote": "catches the 401, calls POST /auth/refresh once",
                "missing_concept": null
              },
              "specificity": {
                "passed": true,
                "evidence_quote": "calls POST /auth/refresh once, stores the new token",
                "missing_concept": null
              },
              "mechanism": {
                "passed": true,
                "evidence_quote": "stores the new token, and replays the original request",
                "missing_concept": null
              },
              "ownership": {
                "passed": true,
                "evidence_quote": "The response interceptor catches the 401",
                "missing_concept": null
              },
              "tradeoff": {
                "passed": true,
                "evidence_quote": "If refresh also fails it clears the token and redirects to login",
                "missing_concept": null
              }
            },
            "admits_gap": false,
            "needs_clarification": false,
            "level_passed": true,
            "guard_flips": [],
            "root_cause": null
          },
          "asked_at": "2026-09-26T09:02:18.000Z"
        },
        {
          "level": 3,
          "kind": "question",
          "mode": "assess",
          "question": "Why keep the token in memory instead of localStorage, and what did that choice cost you?",
          "answer": "localStorage is readable by any injected script, so an XSS bug would leak the token. Keeping it in memory with an httpOnly refresh cookie is safer, but the user is logged out on a hard refresh until the refresh call runs, which added a loading flash we had to handle.",
          "grade": {
            "criteria": {
              "accuracy": {
                "passed": true,
                "evidence_quote": "localStorage is readable by any injected script, so an XSS bug would leak the token",
                "missing_concept": null
              },
              "specificity": {
                "passed": true,
                "evidence_quote": "Keeping it in memory with an httpOnly refresh cookie is safer",
                "missing_concept": null
              },
              "mechanism": {
                "passed": true,
                "evidence_quote": "logged out on a hard refresh until the refresh call runs",
                "missing_concept": null
              },
              "ownership": {
                "passed": true,
                "evidence_quote": "which added a loading flash we had to handle",
                "missing_concept": null
              },
              "tradeoff": {
                "passed": true,
                "evidence_quote": "Keeping it in memory with an httpOnly refresh cookie is safer, but the user is logged out on a hard refresh",
                "missing_concept": null
              }
            },
            "admits_gap": false,
            "needs_clarification": false,
            "level_passed": true,
            "guard_flips": [],
            "root_cause": null
          },
          "asked_at": "2026-09-26T09:02:41.000Z"
        }
      ],
      "retest": null,
      "fix_task": null,
      "rewrite": null,
      "root_cause": null,
      "retest_status": "none",
      "retest_unlocks_after": null
    },
    {
      "id": "CL-003",
      "text": "Made the site fully responsive using CSS Grid and Flexbox",
      "resume_line": "Made the site fully responsive using CSS Grid and Flexbox",
      "skill_id": "responsive_css",
      "source": "resume",
      "verdict": "defended",
      "levels_passed": 3,
      "proficiency": 1,
      "missing_concepts": [],
      "evidence": [
        {
          "level": 1,
          "criterion": "accuracy",
          "passed": true,
          "quote": "repeat(auto-fill, minmax(220px, 1fr)) for the cards"
        },
        {
          "level": 1,
          "criterion": "specificity",
          "passed": true,
          "quote": "CSS Grid with repeat(auto-fill, minmax(220px, 1fr))"
        },
        {
          "level": 1,
          "criterion": "mechanism",
          "passed": true,
          "quote": "The listing uses CSS Grid with repeat(auto-fill, minmax(220px, 1fr)) for the cards"
        },
        {
          "level": 1,
          "criterion": "ownership",
          "passed": true,
          "quote": "I did the product listing and checkout pages"
        },
        {
          "level": 1,
          "criterion": "tradeoff",
          "passed": true,
          "quote": "the header and checkout form rows use Flexbox"
        },
        {
          "level": 2,
          "criterion": "accuracy",
          "passed": true,
          "quote": "fits as many 220px tracks as the container allows"
        },
        {
          "level": 2,
          "criterion": "specificity",
          "passed": true,
          "quote": "the 1fr max shares the leftover space equally"
        },
        {
          "level": 2,
          "criterion": "mechanism",
          "passed": true,
          "quote": "fits as many 220px tracks as the container allows, then the 1fr max shares the leftover space equally"
        },
        {
          "level": 2,
          "criterion": "ownership",
          "passed": true,
          "quote": "The browser fits as many 220px tracks"
        },
        {
          "level": 2,
          "criterion": "tradeoff",
          "passed": true,
          "quote": "columns grow until another 220px track fits"
        },
        {
          "level": 3,
          "criterion": "specificity",
          "passed": true,
          "quote": "it looks better on mobile"
        },
        {
          "level": 3,
          "criterion": "ownership",
          "passed": true,
          "quote": "Grid was just easier I think"
        },
        {
          "level": 3,
          "criterion": "accuracy",
          "passed": true,
          "quote": "the last row of 7 items stretches its orphan cards wider than the rest, while Grid keeps every track the same width"
        },
        {
          "level": 3,
          "criterion": "specificity",
          "passed": true,
          "quote": "minmax(min(220px, 100%), 1fr)"
        },
        {
          "level": 3,
          "criterion": "mechanism",
          "passed": true,
          "quote": "Grid keeps every track the same width"
        },
        {
          "level": 3,
          "criterion": "ownership",
          "passed": true,
          "quote": "Keep Grid."
        },
        {
          "level": 3,
          "criterion": "tradeoff",
          "passed": true,
          "quote": "With flex-wrap and flex: 1 1 220px the last row of 7 items stretches its orphan cards wider than the rest"
        }
      ],
      "qa": [
        {
          "level": 1,
          "kind": "question",
          "mode": "assess",
          "question": "Which pages did you make responsive, and where did you use Grid versus Flexbox?",
          "answer": "I did the product listing and checkout pages. The listing uses CSS Grid with repeat(auto-fill, minmax(220px, 1fr)) for the cards, and the header and checkout form rows use Flexbox.",
          "grade": {
            "criteria": {
              "accuracy": {
                "passed": true,
                "evidence_quote": "repeat(auto-fill, minmax(220px, 1fr)) for the cards",
                "missing_concept": null
              },
              "specificity": {
                "passed": true,
                "evidence_quote": "CSS Grid with repeat(auto-fill, minmax(220px, 1fr))",
                "missing_concept": null
              },
              "mechanism": {
                "passed": true,
                "evidence_quote": "The listing uses CSS Grid with repeat(auto-fill, minmax(220px, 1fr)) for the cards",
                "missing_concept": null
              },
              "ownership": {
                "passed": true,
                "evidence_quote": "I did the product listing and checkout pages",
                "missing_concept": null
              },
              "tradeoff": {
                "passed": true,
                "evidence_quote": "the header and checkout form rows use Flexbox",
                "missing_concept": null
              }
            },
            "admits_gap": false,
            "needs_clarification": false,
            "level_passed": true,
            "guard_flips": [],
            "root_cause": null
          },
          "asked_at": "2026-09-26T09:03:27.000Z"
        },
        {
          "level": 2,
          "kind": "question",
          "mode": "assess",
          "question": "How does repeat(auto-fill, minmax(220px, 1fr)) decide how many columns to render at a given width?",
          "answer": "The browser fits as many 220px tracks as the container allows, then the 1fr max shares the leftover space equally, so columns grow until another 220px track fits and the count jumps.",
          "grade": {
            "criteria": {
              "accuracy": {
                "passed": true,
                "evidence_quote": "fits as many 220px tracks as the container allows",
                "missing_concept": null
              },
              "specificity": {
                "passed": true,
                "evidence_quote": "the 1fr max shares the leftover space equally",
                "missing_concept": null
              },
              "mechanism": {
                "passed": true,
                "evidence_quote": "fits as many 220px tracks as the container allows, then the 1fr max shares the leftover space equally",
                "missing_concept": null
              },
              "ownership": {
                "passed": true,
                "evidence_quote": "The browser fits as many 220px tracks",
                "missing_concept": null
              },
              "tradeoff": {
                "passed": true,
                "evidence_quote": "columns grow until another 220px track fits",
                "missing_concept": null
              }
            },
            "admits_gap": false,
            "needs_clarification": false,
            "level_passed": true,
            "guard_flips": [],
            "root_cause": null
          },
          "asked_at": "2026-09-26T09:03:50.000Z"
        },
        {
          "level": 3,
          "kind": "question",
          "mode": "assess",
          "question": "Why Grid for the card list instead of a Flexbox wrap layout, and what broke?",
          "answer": "Grid was just easier I think, it looks better on mobile.",
          "grade": {
            "criteria": {
              "accuracy": {
                "passed": false,
                "evidence_quote": null,
                "missing_concept": "Grid aligns items in two dimensions; flex-wrap leaves an uneven last row"
              },
              "specificity": {
                "passed": true,
                "evidence_quote": "it looks better on mobile",
                "missing_concept": null
              },
              "mechanism": {
                "passed": false,
                "evidence_quote": null,
                "missing_concept": null
              },
              "ownership": {
                "passed": true,
                "evidence_quote": "Grid was just easier I think",
                "missing_concept": null
              },
              "tradeoff": {
                "passed": false,
                "evidence_quote": null,
                "missing_concept": "Concrete trade-off between Grid and flex-wrap for card lists, and a real layout bug"
              }
            },
            "admits_gap": false,
            "needs_clarification": false,
            "level_passed": false,
            "guard_flips": [],
            "root_cause": "CSS Grid tracks & fr"
          },
          "asked_at": "2026-09-26T09:04:13.000Z"
        },
        {
          "level": 3,
          "kind": "retest",
          "mode": "retest",
          "question": "A product manager asks for the card list to keep a perfectly aligned last row even with 7 items, and the design must also work in a 280px sidebar. Would you keep Grid or switch to flex-wrap, and what breaks with the other one?",
          "answer": "Keep Grid. With flex-wrap and flex: 1 1 220px the last row of 7 items stretches its orphan cards wider than the rest, while Grid keeps every track the same width. In a 280px sidebar minmax(220px, 1fr) still fits one column, but I'd use minmax(min(220px, 100%), 1fr) so it never overflows below 220px.",
          "grade": {
            "criteria": {
              "accuracy": {
                "passed": true,
                "evidence_quote": "the last row of 7 items stretches its orphan cards wider than the rest, while Grid keeps every track the same width",
                "missing_concept": null
              },
              "specificity": {
                "passed": true,
                "evidence_quote": "minmax(min(220px, 100%), 1fr)",
                "missing_concept": null
              },
              "mechanism": {
                "passed": true,
                "evidence_quote": "Grid keeps every track the same width",
                "missing_concept": null
              },
              "ownership": {
                "passed": true,
                "evidence_quote": "Keep Grid.",
                "missing_concept": null
              },
              "tradeoff": {
                "passed": true,
                "evidence_quote": "With flex-wrap and flex: 1 1 220px the last row of 7 items stretches its orphan cards wider than the rest",
                "missing_concept": null
              }
            },
            "admits_gap": false,
            "needs_clarification": false,
            "level_passed": true,
            "guard_flips": [],
            "root_cause": null
          },
          "asked_at": "2026-09-26T09:06:54.000Z"
        }
      ],
      "retest": {
        "attempted": true,
        "passed": true,
        "before": 0.6,
        "after": 1,
        "interleaved_claims": 2
      },
      "fix_task": null,
      "rewrite": null,
      "root_cause": null,
      "retest_status": "done",
      "retest_unlocks_after": null
    },
    {
      "id": "CL-004",
      "text": "Wrote unit tests with Jest achieving 80% coverage",
      "resume_line": "Wrote unit tests with Jest achieving 80% coverage",
      "skill_id": "testing",
      "source": "resume",
      "verdict": "bluff",
      "levels_passed": 0,
      "proficiency": 0,
      "missing_concepts": [
        "What line/branch coverage measures and what it doesn't",
        "Tests you personally wrote and what they asserted"
      ],
      "evidence": [
        {
          "level": 1,
          "criterion": "accuracy",
          "passed": false,
          "quote": "The project template came with tests"
        },
        {
          "level": 1,
          "criterion": "specificity",
          "passed": true,
          "quote": "our coverage was 80% overall"
        }
      ],
      "qa": [
        {
          "level": 1,
          "kind": "question",
          "mode": "assess",
          "question": "Which components or functions did you write Jest tests for, and what did the 80% coverage number measure?",
          "answer": "The project template came with tests and a coverage report, and our coverage was 80% overall. I mostly ran npm test before pushing.",
          "grade": {
            "criteria": {
              "accuracy": {
                "passed": false,
                "evidence_quote": "The project template came with tests",
                "missing_concept": "What line/branch coverage measures and what it doesn't"
              },
              "specificity": {
                "passed": true,
                "evidence_quote": "our coverage was 80% overall",
                "missing_concept": null
              },
              "mechanism": {
                "passed": false,
                "evidence_quote": null,
                "missing_concept": null
              },
              "ownership": {
                "passed": false,
                "evidence_quote": null,
                "missing_concept": "Tests you personally wrote and what they asserted"
              },
              "tradeoff": {
                "passed": false,
                "evidence_quote": null,
                "missing_concept": null
              }
            },
            "admits_gap": false,
            "needs_clarification": false,
            "level_passed": false,
            "guard_flips": [],
            "root_cause": "What coverage measures"
          },
          "asked_at": "2026-09-26T09:04:59.000Z"
        }
      ],
      "retest": null,
      "fix_task": {
        "claim_id": "CL-004",
        "skill_id": "testing",
        "root_cause": "What coverage measures",
        "missing_concepts": [
          "What line/branch coverage measures and what it doesn't",
          "Tests you personally wrote and what they asserted"
        ],
        "explanation": "Coverage counts which **lines and branches ran** during tests, not whether behaviour is correct. A test isolates a unit by **rendering** it (e.g. Testing Library), **mocking** its dependencies such as `fetch`, and **asserting** on what the user sees. Owning a test means you can say what it asserts and which bug it would catch.",
        "exercise": "Write 3 Vitest + Testing Library tests for a `<CartSummary>` component: empty cart, one item, and a failed price fetch (mock `fetch` to reject). Run coverage and find one covered line whose bug your tests would *not* catch.\n\n**Done when** all 3 pass and you can name that uncaught bug."
      },
      "rewrite": "Ran and maintained an existing Jest test suite (80% template coverage); writing my own component tests",
      "root_cause": "What coverage measures",
      "retest_status": "none",
      "retest_unlocks_after": null
    },
    {
      "id": "CL-005",
      "text": "Used Git and GitHub for version control in a 4-member team",
      "resume_line": "Used Git and GitHub for version control in a 4-member team",
      "skill_id": "git",
      "source": "resume",
      "verdict": "honest_gap",
      "levels_passed": 1,
      "proficiency": 0,
      "missing_concepts": [
        "Explains what a commit is (snapshot + parent pointer) and how a merge or rebase combines histories",
        "Explains how a merge conflict arises and the steps to resolve it"
      ],
      "evidence": [
        {
          "level": 1,
          "criterion": "accuracy",
          "passed": true,
          "quote": "worked on a feature branch and opened a pull request to main"
        },
        {
          "level": 1,
          "criterion": "specificity",
          "passed": true,
          "quote": "resolved conflicts in package.json twice"
        },
        {
          "level": 1,
          "criterion": "mechanism",
          "passed": true,
          "quote": "opened a pull request to main"
        },
        {
          "level": 1,
          "criterion": "ownership",
          "passed": true,
          "quote": "I reviewed PRs for the frontend folder"
        },
        {
          "level": 1,
          "criterion": "tradeoff",
          "passed": true,
          "quote": "Each of us worked on a feature branch"
        }
      ],
      "qa": [
        {
          "level": 1,
          "kind": "question",
          "mode": "assess",
          "question": "What was your team's Git workflow, and what did you personally do in it?",
          "answer": "Each of us worked on a feature branch and opened a pull request to main. I reviewed PRs for the frontend folder and resolved conflicts in package.json twice.",
          "grade": {
            "criteria": {
              "accuracy": {
                "passed": true,
                "evidence_quote": "worked on a feature branch and opened a pull request to main",
                "missing_concept": null
              },
              "specificity": {
                "passed": true,
                "evidence_quote": "resolved conflicts in package.json twice",
                "missing_concept": null
              },
              "mechanism": {
                "passed": true,
                "evidence_quote": "opened a pull request to main",
                "missing_concept": null
              },
              "ownership": {
                "passed": true,
                "evidence_quote": "I reviewed PRs for the frontend folder",
                "missing_concept": null
              },
              "tradeoff": {
                "passed": true,
                "evidence_quote": "Each of us worked on a feature branch",
                "missing_concept": null
              }
            },
            "admits_gap": false,
            "needs_clarification": false,
            "level_passed": true,
            "guard_flips": [],
            "root_cause": null
          },
          "asked_at": "2026-09-26T09:05:45.000Z"
        },
        {
          "level": 2,
          "kind": "question",
          "mode": "assess",
          "question": "When you resolved that package.json conflict, what did Git actually have to compare to decide it was a conflict?",
          "answer": "Honestly I don't know how Git decides that internally, I just fixed the lines it marked.",
          "grade": {
            "criteria": {
              "accuracy": {
                "passed": false,
                "evidence_quote": null,
                "missing_concept": null
              },
              "specificity": {
                "passed": false,
                "evidence_quote": null,
                "missing_concept": null
              },
              "mechanism": {
                "passed": false,
                "evidence_quote": null,
                "missing_concept": null
              },
              "ownership": {
                "passed": false,
                "evidence_quote": null,
                "missing_concept": null
              },
              "tradeoff": {
                "passed": false,
                "evidence_quote": null,
                "missing_concept": null
              }
            },
            "admits_gap": true,
            "needs_clarification": false,
            "level_passed": false,
            "guard_flips": [],
            "root_cause": null
          },
          "asked_at": "2026-09-26T09:06:08.000Z"
        }
      ],
      "retest": null,
      "fix_task": {
        "claim_id": "CL-005",
        "skill_id": "git",
        "root_cause": null,
        "missing_concepts": [
          "Explains what a commit is (snapshot + parent pointer) and how a merge or rebase combines histories",
          "Explains how a merge conflict arises and the steps to resolve it"
        ],
        "explanation": "A commit is a **snapshot plus a pointer to its parent(s)**. To merge, Git finds the **merge base** (common ancestor) and does a 3-way comparison: base vs yours vs theirs. If both sides changed the **same lines** differently, Git can't choose and writes conflict markers `<<<<<<<`, `=======`, `>>>>>>>`.",
        "exercise": "In a scratch repo, create `main` and `feature`, edit the same line of `package.json` differently on each, then merge. Run `git merge-base main feature` and `git show :1:package.json` / `:2:` / `:3:` to see base, ours and theirs.\n\n**Done when** you can explain the conflict using those three versions."
      },
      "rewrite": "Used feature branches and pull requests in a 4-person team; reviewed PRs and resolved merge conflicts",
      "root_cause": null,
      "retest_status": "none",
      "retest_unlocks_after": null
    },
    {
      "id": "CL-006",
      "text": "Optimized page load time by 40% using lazy loading and code splitting",
      "resume_line": "Optimized page load time by 40% using lazy loading and code splitting",
      "skill_id": "js_fundamentals",
      "source": "resume",
      "verdict": "shaky",
      "levels_passed": 2,
      "proficiency": 0.6,
      "missing_concepts": [
        "Route vs component splitting: chunk count, waterfalls and cache reuse",
        "A real cost of code splitting, such as loading waterfalls or a spinner flash on navigation"
      ],
      "evidence": [
        {
          "level": 1,
          "criterion": "accuracy",
          "passed": true,
          "quote": "lazy loading things"
        },
        {
          "level": 1,
          "criterion": "accuracy",
          "passed": true,
          "quote": "wrapped the Reports and Admin routes in React.lazy with Suspense"
        },
        {
          "level": 1,
          "criterion": "specificity",
          "passed": true,
          "quote": "main bundle going from 1.1 MB to 640 kB and LCP from 4.2s to 2.5s"
        },
        {
          "level": 1,
          "criterion": "mechanism",
          "passed": true,
          "quote": "moved the chart library into that chunk"
        },
        {
          "level": 1,
          "criterion": "ownership",
          "passed": true,
          "quote": "I wrapped the Reports and Admin routes in React.lazy"
        },
        {
          "level": 1,
          "criterion": "tradeoff",
          "passed": true,
          "quote": "moved the chart library into that chunk"
        },
        {
          "level": 2,
          "criterion": "accuracy",
          "passed": true,
          "quote": "React.lazy calls the dynamic import(), which makes the browser fetch the Reports chunk"
        },
        {
          "level": 2,
          "criterion": "specificity",
          "passed": true,
          "quote": "the Suspense boundary shows the fallback spinner"
        },
        {
          "level": 2,
          "criterion": "mechanism",
          "passed": true,
          "quote": "Until the promise resolves, the Suspense boundary shows the fallback spinner, then React renders the real component"
        },
        {
          "level": 2,
          "criterion": "ownership",
          "passed": true,
          "quote": "React.lazy calls the dynamic import()"
        },
        {
          "level": 2,
          "criterion": "tradeoff",
          "passed": true,
          "quote": "fetch the Reports chunk over the network"
        },
        {
          "level": 3,
          "criterion": "ownership",
          "passed": true,
          "quote": "Route splitting was what the tutorial did so I followed it"
        }
      ],
      "qa": [
        {
          "level": 1,
          "kind": "question",
          "mode": "assess",
          "question": "What exactly did you lazy load, and how did you measure the 40% improvement?",
          "answer": "I made the pages load faster by lazy loading things.",
          "grade": {
            "criteria": {
              "accuracy": {
                "passed": true,
                "evidence_quote": "lazy loading things",
                "missing_concept": null
              },
              "specificity": {
                "passed": false,
                "evidence_quote": null,
                "missing_concept": "Which routes or components were split, and the before/after numbers"
              },
              "mechanism": {
                "passed": false,
                "evidence_quote": null,
                "missing_concept": null
              },
              "ownership": {
                "passed": false,
                "evidence_quote": null,
                "missing_concept": "What you personally changed"
              },
              "tradeoff": {
                "passed": false,
                "evidence_quote": null,
                "missing_concept": null
              }
            },
            "admits_gap": false,
            "needs_clarification": true,
            "level_passed": false,
            "guard_flips": [],
            "root_cause": null
          },
          "asked_at": "2026-09-26T09:07:40.000Z"
        },
        {
          "level": 1,
          "kind": "clarify",
          "mode": "assess",
          "question": "Which routes or components did you split out, and what were the before and after numbers?",
          "answer": "I wrapped the Reports and Admin routes in React.lazy with Suspense and moved the chart library into that chunk. Lighthouse showed the main bundle going from 1.1 MB to 640 kB and LCP from 4.2s to 2.5s, about 40%.",
          "grade": {
            "criteria": {
              "accuracy": {
                "passed": true,
                "evidence_quote": "wrapped the Reports and Admin routes in React.lazy with Suspense",
                "missing_concept": null
              },
              "specificity": {
                "passed": true,
                "evidence_quote": "main bundle going from 1.1 MB to 640 kB and LCP from 4.2s to 2.5s",
                "missing_concept": null
              },
              "mechanism": {
                "passed": true,
                "evidence_quote": "moved the chart library into that chunk",
                "missing_concept": null
              },
              "ownership": {
                "passed": true,
                "evidence_quote": "I wrapped the Reports and Admin routes in React.lazy",
                "missing_concept": null
              },
              "tradeoff": {
                "passed": true,
                "evidence_quote": "moved the chart library into that chunk",
                "missing_concept": null
              }
            },
            "admits_gap": false,
            "needs_clarification": false,
            "level_passed": true,
            "guard_flips": [],
            "root_cause": null
          },
          "asked_at": "2026-09-26T09:08:03.000Z"
        },
        {
          "level": 2,
          "kind": "question",
          "mode": "assess",
          "question": "What happens at runtime between a user clicking the Reports link and the lazy component rendering?",
          "answer": "React.lazy calls the dynamic import(), which makes the browser fetch the Reports chunk over the network. Until the promise resolves, the Suspense boundary shows the fallback spinner, then React renders the real component.",
          "grade": {
            "criteria": {
              "accuracy": {
                "passed": true,
                "evidence_quote": "React.lazy calls the dynamic import(), which makes the browser fetch the Reports chunk",
                "missing_concept": null
              },
              "specificity": {
                "passed": true,
                "evidence_quote": "the Suspense boundary shows the fallback spinner",
                "missing_concept": null
              },
              "mechanism": {
                "passed": true,
                "evidence_quote": "Until the promise resolves, the Suspense boundary shows the fallback spinner, then React renders the real component",
                "missing_concept": null
              },
              "ownership": {
                "passed": true,
                "evidence_quote": "React.lazy calls the dynamic import()",
                "missing_concept": null
              },
              "tradeoff": {
                "passed": true,
                "evidence_quote": "fetch the Reports chunk over the network",
                "missing_concept": null
              }
            },
            "admits_gap": false,
            "needs_clarification": false,
            "level_passed": true,
            "guard_flips": [],
            "root_cause": null
          },
          "asked_at": "2026-09-26T09:08:26.000Z"
        },
        {
          "level": 3,
          "kind": "question",
          "mode": "assess",
          "question": "Why split by route rather than by component, and what went wrong after you shipped it?",
          "answer": "Route splitting was what the tutorial did so I followed it. Nothing really went wrong.",
          "grade": {
            "criteria": {
              "accuracy": {
                "passed": false,
                "evidence_quote": null,
                "missing_concept": "Route vs component splitting: chunk count, waterfalls and cache reuse"
              },
              "specificity": {
                "passed": false,
                "evidence_quote": null,
                "missing_concept": null
              },
              "mechanism": {
                "passed": false,
                "evidence_quote": null,
                "missing_concept": null
              },
              "ownership": {
                "passed": true,
                "evidence_quote": "Route splitting was what the tutorial did so I followed it",
                "missing_concept": null
              },
              "tradeoff": {
                "passed": false,
                "evidence_quote": null,
                "missing_concept": "A real cost of code splitting, such as loading waterfalls or a spinner flash on navigation"
              }
            },
            "admits_gap": false,
            "needs_clarification": false,
            "level_passed": false,
            "guard_flips": [],
            "root_cause": "ES modules & dynamic import"
          },
          "asked_at": "2026-09-26T09:08:49.000Z"
        }
      ],
      "retest": null,
      "fix_task": {
        "claim_id": "CL-006",
        "skill_id": "js_fundamentals",
        "root_cause": "ES modules & dynamic import",
        "missing_concepts": [
          "Route vs component splitting: chunk count, waterfalls and cache reuse",
          "A real cost of code splitting, such as loading waterfalls or a spinner flash on navigation"
        ],
        "explanation": "**Route-level** splitting gives few, large chunks that cache well and load once per page. **Component-level** splitting gives many small chunks but can create **waterfalls** (a chunk that imports another chunk) and spinner flashes during navigation. Mitigations are **prefetching** on hover or idle and grouping libraries shared by several routes.",
        "exercise": "In a Vite app, lazy-load two routes that share a chart library. Build with `vite build` and inspect the chunk list. Then add `import()` prefetch on link hover and compare the Network waterfall.\n\n**Done when** you can show the chunk graph and explain one waterfall you removed."
      },
      "rewrite": "Cut main bundle from 1.1 MB to 640 kB with route-level React.lazy code splitting (LCP 4.2s → 2.5s)",
      "root_cause": "ES modules & dynamic import",
      "retest_status": "none",
      "retest_unlocks_after": null
    },
    {
      "id": "CL-007",
      "text": "Organised the college coding club hackathon for 200 students",
      "resume_line": "Organised the college coding club hackathon for 200 students",
      "skill_id": null,
      "source": "resume",
      "verdict": "pending",
      "levels_passed": 0,
      "proficiency": 0,
      "missing_concepts": [],
      "evidence": [],
      "qa": [],
      "retest": null,
      "fix_task": null,
      "rewrite": null,
      "root_cause": null,
      "retest_status": "none",
      "retest_unlocks_after": null
    }
  ],
  "skills": [
    {
      "skill_id": "js_fundamentals",
      "name": "JavaScript Fundamentals",
      "weight": 0.2,
      "state": "ready",
      "proficiency": 0.6,
      "claim_ids": [
        "CL-006"
      ],
      "history": [
        {
          "at": "2026-09-26T09:09:12.000Z",
          "mode": "assess",
          "claim_id": "CL-006",
          "proficiency": 0.6
        }
      ]
    },
    {
      "skill_id": "react_state",
      "name": "React State & Rendering",
      "weight": 0.2,
      "state": "needs_work",
      "proficiency": 0.25,
      "claim_ids": [
        "CL-001"
      ],
      "history": [
        {
          "at": "2026-09-26T09:01:32.000Z",
          "mode": "assess",
          "claim_id": "CL-001",
          "proficiency": 0.25
        }
      ]
    },
    {
      "skill_id": "rest_apis",
      "name": "REST APIs & Async",
      "weight": 0.15,
      "state": "ready",
      "proficiency": 0.85,
      "claim_ids": [
        "CL-002"
      ],
      "history": [
        {
          "at": "2026-09-26T09:03:04.000Z",
          "mode": "assess",
          "claim_id": "CL-002",
          "proficiency": 0.85
        }
      ]
    },
    {
      "skill_id": "responsive_css",
      "name": "HTML/CSS & Responsive UI",
      "weight": 0.15,
      "state": "ready",
      "proficiency": 1,
      "claim_ids": [
        "CL-003"
      ],
      "history": [
        {
          "at": "2026-09-26T09:04:36.000Z",
          "mode": "assess",
          "claim_id": "CL-003",
          "proficiency": 0.6
        },
        {
          "at": "2026-09-26T09:07:17.000Z",
          "mode": "retest",
          "claim_id": "CL-003",
          "proficiency": 1
        }
      ]
    },
    {
      "skill_id": "accessibility",
      "name": "Accessibility",
      "weight": 0.1,
      "state": "blind_spot",
      "proficiency": 0,
      "claim_ids": [],
      "history": []
    },
    {
      "skill_id": "testing",
      "name": "Testing & Debugging",
      "weight": 0.1,
      "state": "needs_work",
      "proficiency": 0,
      "claim_ids": [
        "CL-004"
      ],
      "history": [
        {
          "at": "2026-09-26T09:05:22.000Z",
          "mode": "assess",
          "claim_id": "CL-004",
          "proficiency": 0
        }
      ]
    },
    {
      "skill_id": "git",
      "name": "Git",
      "weight": 0.1,
      "state": "needs_work",
      "proficiency": 0,
      "claim_ids": [
        "CL-005"
      ],
      "history": [
        {
          "at": "2026-09-26T09:06:31.000Z",
          "mode": "assess",
          "claim_id": "CL-005",
          "proficiency": 0
        }
      ]
    }
  ],
  "deprioritized_claim_ids": [
    "CL-007"
  ],
  "blind_spots": [
    {
      "skill_id": "accessibility",
      "name": "Accessibility",
      "weight": 0.1
    }
  ],
  "resume_lines": [
    {
      "index": 0,
      "text": "Priya Sharma - B.Tech Computer Science, 2026",
      "verdict": null,
      "claim_ids": []
    },
    {
      "index": 1,
      "text": "Built a React e-commerce dashboard with Redux handling 10k+ products",
      "verdict": "shaky",
      "claim_ids": [
        "CL-001"
      ]
    },
    {
      "index": 2,
      "text": "Implemented REST API integration with Axios and JWT auth",
      "verdict": "defended",
      "claim_ids": [
        "CL-002"
      ]
    },
    {
      "index": 3,
      "text": "Made the site fully responsive using CSS Grid and Flexbox",
      "verdict": "defended",
      "claim_ids": [
        "CL-003"
      ]
    },
    {
      "index": 4,
      "text": "Wrote unit tests with Jest achieving 80% coverage",
      "verdict": "bluff",
      "claim_ids": [
        "CL-004"
      ]
    },
    {
      "index": 5,
      "text": "Used Git and GitHub for version control in a 4-member team",
      "verdict": "honest_gap",
      "claim_ids": [
        "CL-005"
      ]
    },
    {
      "index": 6,
      "text": "Optimized page load time by 40% using lazy loading and code splitting",
      "verdict": "shaky",
      "claim_ids": [
        "CL-006"
      ]
    },
    {
      "index": 7,
      "text": "Organised the college coding club hackathon for 200 students",
      "verdict": "pending",
      "claim_ids": [
        "CL-007"
      ]
    }
  ],
  "priorities": [
    {
      "rank": 1,
      "skill_id": "react_state",
      "claim_id": "CL-001",
      "score": 0.15,
      "reason": "20% role weight, failed at L2 (root cause: Reconciliation)"
    },
    {
      "rank": 2,
      "skill_id": "accessibility",
      "claim_id": null,
      "score": 0.1,
      "reason": "Required by role, never claimed"
    },
    {
      "rank": 3,
      "skill_id": "testing",
      "claim_id": "CL-004",
      "score": 0.1,
      "reason": "10% role weight, failed at L1 (root cause: What coverage measures)"
    }
  ],
  "plan": [
    {
      "day": 1,
      "skill_id": "react_state",
      "claim_id": "CL-001",
      "title": "React State & Rendering: Built a React e-commerce dashboard with Redux handling 10k+…",
      "task": "Build a 50-row product table with a Redux filter. Add `console.count` in each row and use React DevTools \"Highlight updates\". Change the filter and explain which components re-rendered and why. Then memoize the row and select only what it needs.\n\n**Done when** changing the filter re-renders only the table and the rows whose data changed."
    },
    {
      "day": 1,
      "skill_id": "accessibility",
      "claim_id": null,
      "title": "Accessibility: cover the basics",
      "task": "Never claimed but required. Build one small example that shows:\n- Names concrete accessibility work done (labels, alt text, keyboard support, contrast fixes) on specific components\n- States what they personally tested or fixed\n- Explains how screen readers use the accessibility tree built from semantic elements, names and roles\n- Explains focus management: tab order, focus trapping in dialogs, returning focus"
    },
    {
      "day": 2,
      "skill_id": "testing",
      "claim_id": "CL-004",
      "title": "Testing & Debugging: Wrote unit tests with Jest achieving 80% coverage",
      "task": "Write 3 Vitest + Testing Library tests for a `<CartSummary>` component: empty cart, one item, and a failed price fetch (mock `fetch` to reject). Run coverage and find one covered line whose bug your tests would *not* catch.\n\n**Done when** all 3 pass and you can name that uncaught bug."
    },
    {
      "day": 2,
      "skill_id": "git",
      "claim_id": "CL-005",
      "title": "Git: Used Git and GitHub for version control in a 4-member team",
      "task": "In a scratch repo, create `main` and `feature`, edit the same line of `package.json` differently on each, then merge. Run `git merge-base main feature` and `git show :1:package.json` / `:2:` / `:3:` to see base, ours and theirs.\n\n**Done when** you can explain the conflict using those three versions."
    },
    {
      "day": 3,
      "skill_id": "js_fundamentals",
      "claim_id": "CL-006",
      "title": "JavaScript Fundamentals: Optimized page load time by 40% using lazy loading and code…",
      "task": "In a Vite app, lazy-load two routes that share a chart library. Build with `vite build` and inspect the chunk list. Then add `import()` prefetch on link hover and compare the Network waterfall.\n\n**Done when** you can show the chunk graph and explain one waterfall you removed."
    }
  ],
  "progress": {
    "claims_total": 7,
    "claims_done": 6,
    "next_claim_id": "CL-007",
    "next_mode": "assess"
  }
}
```
<!-- MOCK_REPORT_END -->
