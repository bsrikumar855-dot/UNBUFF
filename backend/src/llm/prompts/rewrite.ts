import type { Claim } from "../../types.js";
import { studentBlock } from "./shared.js";

export function rewritePrompt(claim: Claim, evidenceSummary: string): string {
  return `Rewrite a resume line honestly so it claims only what the student actually proved in an interview.
${studentBlock("student_resume", `Original line: "${claim.resume_line ?? claim.text}"`)}
What they could demonstrate: ${evidenceSummary}

Rules: one line, truthful and still useful (e.g. "Built X; learning Y"), no exaggeration, no new claims, at most 25 words.

Output JSON: { "rewrite": string }`;
}
