import type { Claim, Report, Role, SessionMode, SkillHistoryEntry, SkillReport } from "../types.js";
import { buildPlan, buildPriorities } from "./plan.js";
import { buildResumeLines } from "./resumeLines.js";
import { isWeakVerdict } from "./rules.js";
import {
  blindSpots,
  claimsForSkill,
  coverage,
  progress,
  readiness,
  skillProficiency,
  skillState,
} from "./scoring.js";

/** The subset of a session the report needs. */
export interface ReportInput {
  session_id: string;
  mode: SessionMode;
  resume_text: string | null;
  claims: readonly Claim[];
  history: readonly (SkillHistoryEntry & { skill_id: string })[];
}

/** Pure: builds the full Report. `generatedAt` is injected so the output is deterministic. */
export function buildReport(input: ReportInput, role: Role, generatedAt: string): Report {
  const claims = input.claims.map((c) => ({
    ...c,
    // Rewrites only make sense for weak claims (e.g. hidden again after a successful retest).
    rewrite: isWeakVerdict(c.verdict) ? c.rewrite : null,
  }));

  const skills: SkillReport[] = role.skills.map((skill) => {
    const skillClaims = claimsForSkill(skill.id, claims);
    const proficiency = skillProficiency(skill.id, claims);
    return {
      skill_id: skill.id,
      name: skill.name,
      weight: skill.weight,
      state: skillState(skillClaims, proficiency),
      proficiency,
      claim_ids: skillClaims.map((c) => c.id),
      history: input.history
        .filter((h) => h.skill_id === skill.id)
        .map(({ at, mode, claim_id, proficiency: p }) => ({ at, mode, claim_id, proficiency: p })),
    };
  });

  const priorities = buildPriorities(role, claims);
  return {
    session_id: input.session_id,
    mode: input.mode,
    role: { id: role.id, name: role.name },
    generated_at: generatedAt,
    readiness: readiness(role, claims),
    coverage: coverage(role, claims),
    claims,
    skills,
    deprioritized_claim_ids: claims.filter((c) => c.skill_id === null).map((c) => c.id),
    blind_spots: blindSpots(role, claims),
    resume_lines: buildResumeLines(input.resume_text, claims),
    priorities,
    plan: buildPlan(role, claims, priorities),
    progress: progress(claims),
  };
}
