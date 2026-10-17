import { z } from "zod";

/**
 * Strict zod mirror of CONTRACT.md §4 response types. `strictObject` fails on any extra or
 * missing key, so parsing a real response proves it matches the contract exactly.
 */
const Level = z.union([z.literal(1), z.literal(2), z.literal(3)]);
const LevelsPassed = z.union([z.literal(0), Level]);
const Verdict = z.enum(["pending", "defended", "shaky", "bluff", "honest_gap", "error"]);
const SkillState = z.enum(["ready", "needs_work", "unverified", "blind_spot", "deprioritized"]);
const Criterion = z.enum(["accuracy", "specificity", "mechanism", "ownership", "tradeoff"]);
const Mode = z.enum(["assess", "retest"]);
const SessionMode = z.enum(["prepare", "defense"]);
const RetestStatus = z.enum(["none", "scheduled", "due", "done"]);
const unit = z.number().min(0).max(1);
const pct = z.number().int().min(0).max(100);

const CriterionResult = z.strictObject({
  passed: z.boolean(),
  evidence_quote: z.string().nullable(),
  missing_concept: z.string().nullable(),
});

export const GradeSchema = z.strictObject({
  criteria: z.strictObject({
    accuracy: CriterionResult,
    specificity: CriterionResult,
    mechanism: CriterionResult,
    ownership: CriterionResult,
    tradeoff: CriterionResult,
  }),
  admits_gap: z.boolean(),
  needs_clarification: z.boolean(),
  level_passed: z.boolean(),
  guard_flips: z.array(Criterion),
  root_cause: z.string().nullable(),
});

const QA = z.strictObject({
  level: Level,
  kind: z.enum(["question", "clarify", "retest"]),
  mode: Mode,
  question: z.string(),
  answer: z.string().nullable(),
  grade: GradeSchema.nullable(),
  asked_at: z.iso.datetime(),
});

const RetestSchema = z.strictObject({
  attempted: z.boolean(),
  passed: z.boolean(),
  before: unit,
  after: unit,
  interleaved_claims: z.number().int().min(0),
});

const FixTask = z.strictObject({
  claim_id: z.string(),
  skill_id: z.string().nullable(),
  root_cause: z.string().nullable(),
  missing_concepts: z.array(z.string()),
  explanation: z.string(),
  exercise: z.string(),
});

export const ClaimSchema = z.strictObject({
  id: z.string().regex(/^CL-\d{3}$/),
  text: z.string(),
  resume_line: z.string().nullable(),
  skill_id: z.string().nullable(),
  source: z.enum(["resume", "declared"]),
  verdict: Verdict,
  levels_passed: LevelsPassed,
  proficiency: unit,
  missing_concepts: z.array(z.string()),
  evidence: z.array(z.strictObject({ level: Level, criterion: Criterion, passed: z.boolean(), quote: z.string() })),
  qa: z.array(QA),
  retest: RetestSchema.nullable(),
  fix_task: FixTask.nullable(),
  rewrite: z.string().nullable(),
  root_cause: z.string().nullable(),
  retest_status: RetestStatus,
  retest_unlocks_after: z.number().int().min(0).nullable(),
});

const BlindSpot = z.strictObject({ skill_id: z.string(), name: z.string(), weight: unit });
export const ProgressSchema = z.strictObject({
  claims_total: z.number().int(),
  claims_done: z.number().int(),
  next_claim_id: z.string().nullable(),
  next_mode: Mode.nullable(),
});

export const ReportSchema = z.strictObject({
  session_id: z.string(),
  mode: SessionMode,
  role: z.strictObject({ id: z.string(), name: z.string() }),
  generated_at: z.iso.datetime(),
  readiness: pct,
  coverage: pct,
  claims: z.array(ClaimSchema),
  skills: z.array(
    z.strictObject({
      skill_id: z.string(),
      name: z.string(),
      weight: unit,
      state: SkillState,
      proficiency: unit,
      claim_ids: z.array(z.string()),
      history: z.array(z.strictObject({ at: z.iso.datetime(), mode: Mode, claim_id: z.string(), proficiency: unit })),
    }),
  ),
  deprioritized_claim_ids: z.array(z.string()),
  blind_spots: z.array(BlindSpot),
  resume_lines: z.array(
    z.strictObject({ index: z.number().int(), text: z.string(), verdict: Verdict.nullable(), claim_ids: z.array(z.string()) }),
  ),
  priorities: z.array(
    z.strictObject({ rank: z.number().int().min(1).max(3), skill_id: z.string(), claim_id: z.string().nullable(), score: z.number(), reason: z.string() }),
  ),
  plan: z.array(
    z.strictObject({ day: z.number().int().min(1).max(7), skill_id: z.string().nullable(), claim_id: z.string().nullable(), title: z.string(), task: z.string() }),
  ),
  progress: ProgressSchema,
});

export const ClaimsResponseSchema = z.strictObject({
  session_id: z.string(),
  role_id: z.string(),
  mode: SessionMode,
  claims: z.array(ClaimSchema),
  blind_spots: z.array(BlindSpot),
  progress: ProgressSchema,
});

export const TurnResponseSchema = z.strictObject({
  session_id: z.string(),
  claim_id: z.string(),
  mode: Mode,
  turn: z.enum(["question", "clarify", "done"]),
  level: Level.nullable(),
  question: z.string().nullable(),
  grade: GradeSchema.nullable(),
  claim: ClaimSchema,
  progress: ProgressSchema,
  next_mode: Mode.nullable(),
  teach_now: z.boolean(),
  last_grade: GradeSchema.nullable(),
  verdict: Verdict,
  levels_passed: LevelsPassed,
  next_claim_id: z.string().nullable(),
  retest: RetestSchema.nullable(),
});

export const ErrorSchema = z.strictObject({
  error: z.strictObject({
    code: z.enum([
      "BAD_REQUEST",
      "NOT_FOUND",
      "ROLE_NOT_FOUND",
      "SESSION_NOT_FOUND",
      "CLAIM_NOT_FOUND",
      "RATE_LIMITED",
      "LLM_INVALID_OUTPUT",
      "LLM_TIMEOUT",
      "INTERNAL",
    ]),
    message: z.string().min(1),
  }),
});
