import type { Claim, Role, RoleSkill } from "../../types.js";
import { studentBlock } from "./shared.js";

/** Teach me mode: a short lesson on the skill, given BEFORE the first question, tied to what the student claims. */
export function primerPrompt(role: Role, skill: RoleSkill, claim: Claim): string {
  return `A student preparing for a ${role.name} interview is about to be asked about this skill: "${skill.name}" (${skill.description}).
Concepts they should know first: ${skill.prerequisites.join("; ")}.
${studentBlock("student_claim", `Claim: "${claim.text}"`)}

Write "lesson": a short lesson (at most 180 words, markdown allowed) that teaches the core ideas of the prerequisite concepts above, in plain words, using one tiny concrete example that fits the student's claim. Do NOT quiz them and do NOT ask questions. No generic advice such as "read the docs" or "practice more".

Output JSON: { "lesson": string }`;
}
