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

export interface ApiErrorBody {
  error: { code: ErrorCode; message: string };
}
