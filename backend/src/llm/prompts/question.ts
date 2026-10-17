import type { QuestionContext } from "../provider.js";
import { criteriaList, historyText, LEVEL_FOCUS, studentBlock } from "./shared.js";

export function claimHeader(ctx: QuestionContext): string {
  const source = ctx.claim.resume_line ? `\nSource line: "${ctx.claim.resume_line}"` : "";
  return `You are a campus placement interviewer for ${ctx.role.name}.
${studentBlock("student_claim", `Claim: "${ctx.claim.text}"${source}`)}
Skill: ${ctx.skill?.name ?? "General (not a core skill for this role)"}`;
}

export function questionPrompt(ctx: QuestionContext): string {
  return `${claimHeader(ctx)}

Ask the Level ${ctx.level} question. Focus: ${LEVEL_FOCUS[ctx.level]}.

What a good answer must show:
${criteriaList(ctx.skill, ctx.level)}

Previous Q/A for this claim:
${studentBlock("student_history", historyText(ctx.history))}

Ask ONE short, pointed question specific to this claim. No praise, no hints, no multi-part questions.

Output JSON: { "question": string }`;
}
