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
  | "NOT_FOUND"
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

export interface ApiErrorBody {
  error: { code: ErrorCode; message: string };
}
