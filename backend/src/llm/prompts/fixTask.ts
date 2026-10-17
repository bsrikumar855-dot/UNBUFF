import type { Claim, Role } from "../../types.js";
import { studentBlock } from "./shared.js";

export function fixTaskPrompt(role: Role, claim: Claim, missingConcepts: string[], rootCause: string | null): string {
  const focus = rootCause
    ? `Their root-cause gap is the prerequisite "${rootCause}". Teach that FIRST, then connect it to what they missed:`
    : "They failed to demonstrate these concepts:";
  return `A student preparing for a ${role.name} interview needs targeted help.
${focus}
${missingConcepts.map((c) => `- ${c}`).join("\n")}
${studentBlock("student_claim", `Claim: "${claim.text}"`)}

Write:
- "explanation": a short explanation (at most 120 words, markdown allowed) teaching exactly that (root cause first, if given), in the context of the claim.
- "exercise": ONE small hands-on exercise (coding or reasoning, doable in under an hour) that practises it, ending with a clear "Done when" check.
No generic advice such as "read the docs" or "practice more".

Output JSON: { "explanation": string, "exercise": string }`;
}
