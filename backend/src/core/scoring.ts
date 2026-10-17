import type { BlindSpot, Claim, Progress, Role, RoleSkill, SkillState, Verdict } from "../types.js";
import { nextStep } from "./schedule.js";

/** Pending and error claims are "not assessed". */
export function isAssessed(verdict: Verdict): boolean {
  return verdict !== "pending" && verdict !== "error";
}

export function claimsForSkill(skillId: string, claims: readonly Claim[]): Claim[] {
  return claims.filter((c) => c.skill_id === skillId);
}

/** Skill proficiency = max over its claims (0 when none). */
export function skillProficiency(skillId: string, claims: readonly Claim[]): number {
  return claimsForSkill(skillId, claims).reduce((max, c) => Math.max(max, c.proficiency), 0);
}

export const READY_THRESHOLD = 0.6;

export function skillState(skillClaims: readonly Claim[], proficiency: number): SkillState {
  if (skillClaims.length === 0) return "blind_spot";
  if (!skillClaims.some((c) => isAssessed(c.verdict))) return "unverified";
  return proficiency >= READY_THRESHOLD ? "ready" : "needs_work";
}

/** round(100 × Σ weight × proficiency) */
export function readiness(role: Role, claims: readonly Claim[]): number {
  const sum = role.skills.reduce((acc, s) => acc + s.weight * skillProficiency(s.id, claims), 0);
  return Math.round(100 * sum);
}

/** round(100 × Σ weight over skills with ≥1 assessed claim) */
export function coverage(role: Role, claims: readonly Claim[]): number {
  const sum = role.skills
    .filter((s) => claimsForSkill(s.id, claims).some((c) => isAssessed(c.verdict)))
    .reduce((acc, s) => acc + s.weight, 0);
  return Math.round(100 * sum);
}

export function blindSpots(role: Role, claims: readonly Claim[]): BlindSpot[] {
  return role.skills
    .filter((s: RoleSkill) => claimsForSkill(s.id, claims).length === 0)
    .map((s) => ({ skill_id: s.id, name: s.name, weight: s.weight }));
}

export function progress(claims: readonly Claim[]): Progress {
  return {
    claims_total: claims.length,
    claims_done: claims.filter((c) => c.verdict !== "pending").length,
    ...nextStep(claims),
  };
}
