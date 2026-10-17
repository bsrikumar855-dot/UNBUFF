import type { QuestionContext } from "../provider.js";
import { claimHeader } from "./question.js";
import { criteriaList, LEVEL_FOCUS } from "./shared.js";

export function retestPrompt(
  ctx: QuestionContext & { missingConcepts: string[]; rootCause: string | null; previousQuestions: string[] },
): string {
  const previous = ctx.previousQuestions.map((q) => `- ${q}`).join("\n") || "- (none)";
  const gaps = ctx.missingConcepts.map((c) => `- ${c}`).join("\n");
  const target = ctx.rootCause
    ? `the root-cause prerequisite "${ctx.rootCause}". Their visible gaps were:\n${gaps}`
    : `these concepts:\n${gaps}`;
  return `${claimHeader(ctx)}

This is a RETEST, asked after a delay and after other topics. Target ${target}

Write ONE new, realistic scenario question at Level ${ctx.level} (${LEVEL_FOCUS[ctx.level]}) that tests exactly that through application: debugging a failure, a changed requirement, or an unfamiliar case.

What a good answer must show:
${criteriaList(ctx.skill, ctx.level)}

Do NOT repeat or paraphrase any of these previous questions:
${previous}

One short question, no hints, no multi-part questions.

Output JSON: { "question": string }`;
}
