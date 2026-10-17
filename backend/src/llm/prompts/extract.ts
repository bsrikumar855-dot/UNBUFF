import type { Role } from "../../types.js";
import { skillsJson, studentBlock } from "./shared.js";

export function extractPrompt(role: Role, resumeText: string): string {
  return `Extract verifiable claims from a student resume for the target role ${role.name}.
A claim is something an interviewer could probe: a project, skill, metric or achievement.
Map each claim to ONE skill id from this list, or null if unrelated: ${skillsJson(role)}

Rules:
- Max 8 claims; prioritize projects and metrics.
- "resume_line" must be copied verbatim from ONE line of the resume.
- "text" restates the claim faithfully. Never upgrade a claim: "used React" must not become "expert in React performance".
- Do not invent claims. Skip contact details, headings and lines with nothing an interviewer could probe.

${studentBlock("student_resume", resumeText)}

Output JSON: { "claims": [ { "text": string, "resume_line": string, "skill_id": string | null } ] }`;
}
