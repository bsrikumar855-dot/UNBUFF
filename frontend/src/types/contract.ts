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
  | "CAREER_UNAVAILABLE"
  | "CAREER_RATE_LIMITED"
  | "CAREER_JOB_NOT_FOUND"
  | "LEETCODE_IMPORT_INVALID"
  | "LEETCODE_IMPORT_CONFLICT"
  | "LEETCODE_UNAVAILABLE"
  | "LATEX_UNAVAILABLE"
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
export type DsaLicenseStatus = "licensed" | "permission_granted" | "public_domain" | "own_work" | "development_fixture" | "unlicensed_local_use"; // unlicensed_local_use: the source declares no licence; local evaluation only, refused in production

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
  career_context?: boolean; // include the student's own best-matching job listings (computed by the app) as context
  leetcode_context?: boolean; // include a short summary of the LeetCode data the student imported (never live data)
  resume_context?: boolean; // include the saved résumé, its ATS score and the fixes (the score is a heuristic, never an employer verdict)
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
  leetcode_context?: { used: boolean; captured_at: string | null; stale: boolean }; // used: a summary of the student's imported LeetCode data was given to the mentor
  resume_context?: { used: boolean; score: number | null; updated_at: string | null }; // used: a summary of the saved résumé and its ATS result went into the answer
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
  source: "dsa" | "interview" | "graphql" | "github" | "memory" | "leetcode";
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

// ---------- Career opportunities (Freehire public API, read-only; see docs/career-job-matching.md) ----------
export type CareerTab = "for_you" | "internships" | "jobs" | "explore";
export type CareerSeniority = "intern" | "junior" | "middle" | "senior" | "lead" | "staff" | "principal" | "c_level";
export type CareerWorkMode = "remote" | "hybrid" | "onsite";
export type CareerEmployment = "full_time" | "part_time" | "contract" | "internship" | "fellowship";
export type CareerReality = "fresh" | "stale" | "likely-evergreen";
export type CareerApplicationStatus = "saved" | "interested" | "applied" | "interviewing" | "offer" | "rejected" | "withdrawn";
export type CareerComponentKey = "skills" | "category" | "seniority" | "location" | "work_mode" | "employment";
export type CareerComponentState = "match" | "partial" | "mismatch" | "unknown" | "not_set";

export interface CareerSalary {
  min: number | null;
  max: number | null;
  currency: string | null;
  period: string | null;
}
export interface CareerRequirement {
  text: string;
  priority: "required" | "preferred" | "unknown";
}
/** One posting from Freehire, normalized. Every optional field is null (or empty) when upstream did not state it. */
export interface CareerJob {
  id: string; // "freehire:<public_slug>"
  slug: string;
  source: "freehire";
  source_board: string | null; // the ATS or board the posting was crawled from, for example greenhouse
  title: string;
  company: string | null; // null when upstream gives only an opaque identifier instead of a name
  location: string | null; // the posting's own location text
  countries: string[];
  regions: string[];
  cities: string[];
  work_mode: CareerWorkMode | null;
  skills: string[]; // Freehire skill slugs
  seniority: CareerSeniority | null;
  employment_type: CareerEmployment | null;
  category: string | null;
  experience_years_min: number | null;
  salary: CareerSalary | null;
  summary: string | null; // a one or two sentence synopsis written by Freehire's enrichment
  preview: string | null; // plain-text preview of the description (never HTML)
  requirements: CareerRequirement[];
  apply_url: string | null; // the employer's own application page (https only)
  freehire_url: string;
  posted_at: string | null;
  updated_at: string | null;
  last_seen_at: string | null;
  closed_at: string | null;
  reality: { class: CareerReality | null; age_days: number | null; repost_count: number | null; fake_freshness: boolean | null } | null;
  ghost_level: string | null; // a hedged upstream signal that the posting may not be an active opening
}
export interface CareerMatchComponent {
  key: CareerComponentKey;
  label: string;
  weight: number;
  state: CareerComponentState;
  value: number | null; // 0..1 when known
  note: string;
}
/** A deterministic comparison of one posting with the student's own profile. Not a probability of an interview or offer. */
export interface CareerMatch {
  score: number | null; // 0..100, null when there is not enough evidence to score
  confidence: "high" | "medium" | "low" | "insufficient";
  matched_skills: { skill: string; provenance: "verified" | "resume" | "self_reported" }[];
  missing_skills: string[]; // skills the posting lists that the student has not stated or shown
  components: CareerMatchComponent[];
  reasons: string[];
  hard_mismatches: string[]; // mandatory preferences the posting is known to violate
  unverified_constraints: string[]; // mandatory preferences the posting's data cannot confirm
}
export interface CareerTracker {
  saved: boolean;
  status: CareerApplicationStatus | null;
  applied_on: string | null; // YYYY-MM-DD, as the student recorded it
  follow_up_on: string | null;
  notes: string;
  posting_state: "unknown" | "possibly_unavailable";
  updated_at: string;
}
export interface CareerJobCard {
  job: CareerJob;
  match: CareerMatch;
  tracker: CareerTracker | null;
}
export interface CareerSourceInfo {
  name: "Freehire";
  url: string;
  api: string;
}
export interface CareerFeedResponse {
  tab: CareerTab;
  jobs: CareerJobCard[];
  total: number | null; // upstream's own count of matching postings; null when it was not reported
  limit: number;
  offset: number;
  has_more: boolean;
  ranked_window: number | null; // for_you: how many candidates were scored and ranked
  filters: Record<string, string[]>; // the documented upstream parameters actually sent
  relaxed: string[]; // filters dropped because they matched nothing (for_you only)
  ignored_params: { param: string; did_you_mean: string | null }[]; // parameters upstream ignored: results may be broader than asked
  personalization: { level: "full" | "limited" | "none"; notes: string[] };
  source: CareerSourceInfo;
  fetched_at: string;
}
export interface CareerFacetValue {
  value: string;
  count: number;
}
export interface CareerFacetsResponse {
  total: number | null;
  facets: Record<string, CareerFacetValue[]>;
  source: CareerSourceInfo;
  fetched_at: string;
}
export interface CareerJobDetailResponse {
  job: CareerJob;
  description: string | null; // plain text, bounded
  match: CareerMatch;
  tracker: CareerTracker | null;
  source: CareerSourceInfo;
}
export interface CareerPreferences {
  categories: string[]; // Freehire category slugs, at most 6
  skills: string[]; // self-reported Freehire skill slugs, at most 20
  countries: string[]; // lowercase ISO country codes, at most 8
  cities: string[]; // at most 8
  work_modes: CareerWorkMode[];
  employment_types: CareerEmployment[];
  must_match_location: boolean;
  must_match_work_mode: boolean;
  must_match_employment: boolean;
}
export interface CareerPreferencesResponse {
  preferences: CareerPreferences | null;
  updated_at: string | null;
  /** What the matching engine will use from the student's existing placement profile and verified results. */
  profile: {
    role_names: string[];
    experience_level: PlacementExperience | null;
    derived_categories: string[];
    verified_skills: string[];
    resume_skills: string[]; // confirmed by the student from their own resume; counted as self-reported, never as verified
    resume_skills_saved_at: string | null;
    self_reported_skills: string[];
    target_companies: string[];
    placement_date: string | null;
  };
}
export interface CareerTrackerUpdate {
  saved?: boolean;
  status?: CareerApplicationStatus | null;
  applied_on?: string | null;
  follow_up_on?: string | null;
  notes?: string;
}
export interface CareerTrackedItem {
  slug: string;
  title: string;
  company: string | null;
  apply_url: string | null;
  freehire_url: string;
  tracker: CareerTracker;
}
export interface CareerTrackedResponse {
  items: CareerTrackedItem[];
  total: number;
}

/** One skill the resume text mentions. The snippet is shown to the student for review and is never stored. */
export interface ResumeSkillSuggestion {
  slug: string; // Freehire skill slug
  label: string;
  mentions: number;
  evidence: string;
}
export interface ResumeSkillsExtractResponse {
  skills: ResumeSkillSuggestion[];
  text_chars: number;
  vocabulary_size: number;
}
export interface SavedResumeSkill {
  slug: string;
  label: string;
}
export interface ResumeSkillsResponse {
  skills: SavedResumeSkill[];
  saved_at: string | null;
}

// ---------- LeetCode profile link and student-supplied progress import ----------
// LeetCode offers no official API, OAuth or export, and its terms forbid scraping, so UNBLUFF never contacts LeetCode.
// A student links a public username and imports numbers they supply themselves. Nothing here is live data, nothing is
// verified against LeetCode, and none of it is merged into UNBLUFF's own judged submissions.
export type LeetCodeFreshness = "none" | "recent" | "aging" | "stale"; // from the date the numbers were captured, not the date they were imported
export type LeetCodeSourceKind = "manual_entry" | "json_file" | "csv_file" | "public_lookup";
export type LeetCodeDifficulty = "easy" | "medium" | "hard";
export interface LeetCodeSourceInfo {
  kind: LeetCodeSourceKind;
  description: string | null; // the student's own note on where the numbers came from
}
export interface LeetCodeStates {
  profile_linked: boolean; // a username and profile link are saved
  ownership_unverified: boolean; // always true: no supported way to prove the student owns the profile exists
  imported_data_available: boolean; // the student supplied data that passed validation
  officially_connected: false; // never true: there is no official integration
  live_sync_unavailable: true; // always true: no compliant live data provider exists
}
export interface LeetCodeConnection {
  linked: boolean;
  username: string | null;
  profile_url: string | null; // built by the server from the username; opens on leetcode.com
  linked_at: string | null;
  mode: "profile_link_and_manual_import"; // the only connection mode that exists
  states: LeetCodeStates;
  imported: { snapshot_count: number; last_imported_at: string | null; last_captured_at: string | null; last_source: LeetCodeSourceInfo | null; freshness: LeetCodeFreshness; age_days: number | null };
  limits: { max_import_bytes: number; max_snapshots: number };
  notes: string[]; // plain statements of what is and is not supported
}
export interface LeetCodeConnectionRequest {
  profile: string; // a username, or a leetcode.com profile address
}
export interface LeetCodeConnectionResponse {
  connection: LeetCodeConnection;
}
export interface LeetCodeUnlinkResponse {
  connection: LeetCodeConnection;
  deleted_snapshots: number;
}

export interface LeetCodeSnapshotData {
  captured_at: string; // ISO 8601 UTC: when the numbers were true on LeetCode, as stated by the student
  totals: { solved: number; easy: number | null; medium: number | null; hard: number | null };
  available: { easy: number; medium: number; hard: number } | null; // problems LeetCode offered at the time, when supplied
  topics: { topic: string; solved: number }[] | null;
  contest: { rating: number | null; global_rank: number | null; attended: number | null } | null;
  activity: { date: string; problems_solved: number }[] | null; // problems first accepted on each date (YYYY-MM-DD)
}
export interface LeetCodeSnapshot extends LeetCodeSnapshotData {
  id: string; // the content hash: the same data is never stored twice
  source: LeetCodeSourceInfo;
  imported_at: string;
  linked_username: string | null; // the username that was linked when this was imported
}
export interface LeetCodeSnapshotSummary {
  id: string;
  captured_at: string;
  imported_at: string;
  solved: number;
  easy: number | null;
  medium: number | null;
  hard: number | null;
  source: LeetCodeSourceInfo;
  linked_username: string | null;
  fields: ("difficulty" | "available" | "topics" | "contest" | "activity")[]; // which optional parts this snapshot holds
}

export type LeetCodeImportFormat = "json" | "csv";
export type LeetCodeImportOrigin = "manual" | "file";
export interface LeetCodeImportRequest {
  format: LeetCodeImportFormat;
  origin: LeetCodeImportOrigin; // manual: typed into the form; file: uploaded by the student
  content: string;
}
export interface LeetCodeImportConfirmRequest extends LeetCodeImportRequest {
  content_hash: string; // from the preview: confirms the student is importing exactly what they reviewed
}
export interface LeetCodeImportIssue {
  path: string; // where in the data, for example totals.hard
  message: string;
}
export interface LeetCodeImportPreview {
  valid: boolean;
  issues: LeetCodeImportIssue[]; // reasons the data was rejected
  warnings: LeetCodeImportIssue[]; // accepted, but worth a second look
  snapshot: LeetCodeSnapshotData | null;
  source: LeetCodeSourceInfo | null;
  content_hash: string | null;
  already_imported: boolean; // identical data was imported before: confirming changes nothing
  previous: { id: string; captured_at: string; solved: number } | null; // the closest earlier snapshot, for comparison
  changes: { days: number; solved: number; easy: number | null; medium: number | null; hard: number | null } | null;
}
export interface LeetCodeImportConfirmResponse {
  status: "imported" | "already_imported";
  snapshot: LeetCodeSnapshotSummary;
  connection: LeetCodeConnection;
}
/** GET /api/leetcode/lookup. True only when the operator enabled the unofficial public lookup (LEETCODE_PUBLIC_LOOKUP). */
export interface LeetCodeLookupStatusResponse {
  available: boolean;
}

// ---------- Resume builder and ATS score ----------
export type AtsCheckStatus = "pass" | "warn" | "fail";
export interface AtsCheck {
  id: string; // contact | sections | keywords | impact | verbs | length | format
  label: string;
  score: number; // points earned, at most `max`
  max: number;
  status: AtsCheckStatus;
  detail: string; // what was found
  fix: string | null; // what to change; null when the check passed
}
export interface AtsResult {
  score: number; // 0 to 100, the sum of the check scores. A heuristic estimate, never an employer's real ATS verdict
  rating: "strong" | "good" | "needs_work" | "weak";
  checks: AtsCheck[];
  keywords: { matched: string[]; missing: string[]; source: "role" | "job_description" | "both" };
  stats: { words: number; bullets: number; sections: string[] };
  role_id: string | null;
  scored_at: string; // ISO 8601 UTC
  disclaimer: string;
}
export interface ResumeDocument {
  latex: string;
  role_id: string | null; // the target role the score is measured against
  job_description: string | null; // optional pasted job description, used for keyword matching
  updated_at: string; // ISO 8601 UTC
}
/** GET /api/resume. The score is computed fresh from the saved LaTeX every time, so it can never be stale. */
export interface ResumeResponse {
  document: ResumeDocument | null;
  ats: AtsResult | null;
  compiler_available: boolean; // false when no LaTeX compiler is configured on this server
  max_bytes: number;
}
export interface ResumeSaveRequest {
  latex: string;
  role_id?: string | null;
  job_description?: string | null;
}
/** POST /api/resume/ats. Scores the given text without saving it. */
export interface AtsRequest {
  latex: string;
  role_id?: string | null;
  job_description?: string | null;
}
export interface ResumeCompileRequest {
  latex: string;
}
export interface ResumeCompileResponse {
  ok: boolean; // true when a PDF was produced
  pdf_base64: string | null; // the compiled PDF, base64; null when compilation failed
  log: string; // the compiler's own messages, trimmed (errors are listed here)
  pages: number | null;
  duration_ms: number;
}
export interface ResumeTemplate {
  id: string;
  name: string;
  description: string;
  latex: string;
}
export interface ResumeTemplatesResponse {
  templates: ResumeTemplate[];
}
/** POST /api/resume/import. Converts the plain text of an existing résumé (read from a PDF in the browser, or pasted) into editable LaTeX. Nothing is stored. */
export interface ResumeImportRequest {
  text: string;
}
export interface ResumeImportResponse {
  latex: string; // the converted document, in the classic template
  warnings: string[]; // what could not be read, and what to check
  sections: string[]; // the section headings that were recognised
}
export interface LeetCodeHistoryResponse {
  snapshots: LeetCodeSnapshotSummary[]; // newest capture first
  total: number;
}

export interface LeetCodeInsightsResponse {
  connection: LeetCodeConnection;
  available: boolean; // false until the student has imported data
  source: { kind: LeetCodeSourceKind; description: string | null; captured_at: string; imported_at: string; freshness: LeetCodeFreshness; age_days: number; label: string } | null;
  totals: LeetCodeSnapshotData["totals"] | null;
  difficulty: { difficulty: LeetCodeDifficulty; solved: number; available: number | null; share_of_solved: number }[] | null;
  topics: { topic: string; solved: number; share_of_solved: number }[] | null;
  contest: LeetCodeSnapshotData["contest"];
  activity: { items: { date: string; problems_solved: number }[]; total: number; last_active_date: string | null } | null;
  history: { id: string; captured_at: string; solved: number; easy: number | null; medium: number | null; hard: number | null }[]; // oldest first
  trend: { available: boolean; reason: string | null; from: string | null; to: string | null; solved_change: number | null; days: number | null };
  unavailable: ("difficulty_breakdown" | "topics" | "contest" | "recent_activity" | "trend")[]; // shown as unavailable, never guessed
  unbluff: { judged_solved_unique: number | null; judged_available: boolean }; // UNBLUFF's own judged results, kept separate and never added to the LeetCode numbers
  notes: string[];
}
