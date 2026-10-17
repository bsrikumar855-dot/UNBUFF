import { z } from "zod";

/** zod schemas for every LLM output. Anything that fails these is treated as invalid output. */

export const ExtractOutput = z.object({
  claims: z
    .array(
      z.object({
        text: z.string().min(1).max(300),
        resume_line: z.string().max(500),
        skill_id: z.string().nullable(),
      }),
    )
    .max(20),
});
export type ExtractOutput = z.infer<typeof ExtractOutput>;

export const QuestionOutput = z.object({ question: z.string().min(5).max(600) });
export type QuestionOutput = z.infer<typeof QuestionOutput>;

const CriterionOutput = z.object({
  passed: z.boolean(),
  evidence_quote: z.string().nullable(),
  missing_concept: z.string().nullable(),
});

export const GradeOutput = z.object({
  criteria: z.object({
    accuracy: CriterionOutput,
    specificity: CriterionOutput,
    mechanism: CriterionOutput,
    ownership: CriterionOutput,
    tradeoff: CriterionOutput,
  }),
  admits_gap: z.boolean(),
  needs_clarification: z.boolean(),
  root_cause: z.string().nullable().optional(), // validated against the skill's prerequisites in code
});
export type GradeOutput = z.infer<typeof GradeOutput>;

export const FixTaskOutput = z.object({
  explanation: z.string().min(1).max(2000),
  exercise: z.string().min(1).max(2000),
});
export type FixTaskOutput = z.infer<typeof FixTaskOutput>;

export const RewriteOutput = z.object({ rewrite: z.string().min(1).max(400) });
export type RewriteOutput = z.infer<typeof RewriteOutput>;

/** One memory the model proposes. The backend decides whether to keep it (see src/mentor/updates.ts). */
export const MentorMemoryProposal = z.object({
  type: z.enum(["profile", "learning", "goal"]),
  /** profile: the field (target_roles, target_companies, preferred_languages, daily_study_minutes, placement_timeline, explanation_style, current_goals) */
  field: z.string().max(40).nullable(),
  topic: z.string().max(60).nullable(),
  content: z.string().min(1).max(300),
  /** Must be copied verbatim from the STUDENT's latest message; otherwise the proposal is discarded. */
  evidence_quote: z.string().min(1).max(300),
  /** learning: what the student said about the topic */
  signal: z.enum(["understood", "difficult", "studied", "helpful"]).nullable(),
  /** goal: what in the application would show it is done (optional) */
  track_kind: z.enum(["question_solved", "revision_completed", "topic_practice"]).nullable(),
  track_question_id: z.string().max(64).nullable(),
  track_topic: z.string().max(60).nullable(),
  track_target: z.number().int().min(1).max(50).nullable(),
});
export type MentorMemoryProposal = z.infer<typeof MentorMemoryProposal>;

export const MentorChatOutput = z.object({
  reply: z.string().min(1).max(6000),
  memory_updates: z.array(MentorMemoryProposal).max(5),
});
export type MentorChatOutput = z.infer<typeof MentorChatOutput>;

export const MentorSummaryOutput = z.object({
  topic: z.string().min(1).max(80),
  summary: z.string().min(1).max(600),
  decisions: z.array(z.string().max(200)).max(5),
  unresolved: z.array(z.string().max(200)).max(5),
  next_steps: z.array(z.string().max(200)).max(5),
});
export type MentorSummaryOutput = z.infer<typeof MentorSummaryOutput>;
