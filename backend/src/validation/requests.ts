import { z } from "zod";

/** zod schemas for every request body (CONTRACT.md §4/§5). Unknown keys are rejected. */

const id = (label: string) => z.string({ error: `${label} is required` }).trim().min(1, `${label} is required`).max(100);

export const ExtractRequestSchema = z
  .strictObject({
    role_id: id("role_id"),
    mode: z.enum(["prepare", "defense"], { error: "mode must be \"prepare\" or \"defense\"" }).optional(),
    resume_text: z.string().max(20_000, "resume_text must be at most 20000 characters").nullish(),
    declared_skills: z
      .array(z.string().trim().min(1, "declared skills cannot be empty").max(60, "each declared skill must be at most 60 characters"))
      .max(20, "at most 20 declared skills")
      .optional(),
  })
  .refine((b) => Boolean(b.resume_text?.trim()) || (b.declared_skills?.length ?? 0) > 0, {
    message: "Provide resume_text or at least one declared skill",
  });

export const ConfirmRequestSchema = z.strictObject({
  session_id: id("session_id"),
  claims: z
    .array(
      z.strictObject({
        id: z.string().max(20).nullable(),
        text: z.string().trim().min(1, "claim text is required").max(300),
        resume_line: z.string().max(500).nullable(),
        skill_id: z.string().max(100).nullable(),
      }),
    )
    .min(1, "at least one claim is required")
    .max(8, "at most 8 claims"),
});

export const InterrogateRequestSchema = z.strictObject({
  session_id: id("session_id"),
  claim_id: id("claim_id"),
  mode: z.enum(["assess", "retest"]).optional(),
  // null is accepted and treated exactly like an omitted answer (start/resume).
  answer: z.string().trim().min(1, "answer cannot be empty").max(4000, "answer must be at most 4000 characters").nullish(),
});

export const FixTaskRequestSchema = z.strictObject({
  session_id: id("session_id"),
  claim_id: id("claim_id"),
});
