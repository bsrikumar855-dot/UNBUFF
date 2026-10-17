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
