import type { QuestionContext } from "../provider.js";
import { claimHeader } from "./question.js";
import { criteriaList, historyText, LEVEL_FOCUS, studentBlock } from "./shared.js";

export function clarifyPrompt(ctx: QuestionContext & { vaguePoints: string[] }): string {
  const vague =
    ctx.vaguePoints.length > 0
      ? ctx.vaguePoints.map((p) => `- ${p}`).join("\n")
      : "- the answer lacked concrete detail";
  return `${claimHeader(ctx)}

The student's last answer at Level ${ctx.level} (${LEVEL_FOCUS[ctx.level]}) was plausible but too vague to judge.
Ask ONE follow-up question at the SAME level that targets exactly what was vague:
${vague}

What a good answer must show:
${criteriaList(ctx.skill, ctx.level)}

Previous Q/A for this claim:
${studentBlock("student_history", historyText(ctx.history))}

One short question. No praise, no hints, do not repeat the previous question.

Output JSON: { "question": string }`;
}
