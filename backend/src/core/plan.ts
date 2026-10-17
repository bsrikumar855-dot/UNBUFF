import type { Claim, PlanItem, Priority, Role, RoleSkill } from "../types.js";
import { isWeakVerdict } from "./rules.js";
import { claimsForSkill, isAssessed, skillProficiency } from "./scoring.js";

export const MAX_PRIORITIES = 3;
export const PLAN_DAYS = 7;
export const ITEMS_PER_DAY = 2;

const pct = (weight: number): string => `${Math.round(weight * 100)}%`;
const round3 = (n: number): number => Math.round(n * 1000) / 1000;

/** The claim that drags a skill down most: lowest proficiency among assessed claims. */
function weakestClaim(skillClaims: readonly Claim[]): Claim | null {
  const assessed = skillClaims.filter((c) => isAssessed(c.verdict));
  const pool = assessed.length > 0 ? assessed : skillClaims;
  return pool.reduce<Claim | null>((w, c) => (w === null || c.proficiency < w.proficiency ? c : w), null);
}

function priorityReason(skill: RoleSkill, claim: Claim | null): string {
  if (claim === null) return "Required by role, never claimed";
  const base = baseReason(skill, claim);
  return claim.root_cause ? `${base} (root cause: ${claim.root_cause})` : base;
}

function baseReason(skill: RoleSkill, claim: Claim): string {
  const w = `${pct(skill.weight)} role weight`;
  const failedAt = `L${claim.levels_passed + 1}`;
  switch (claim.verdict) {
    case "pending":
    case "error":
      return `${w}, not assessed yet`;
    case "honest_gap":
      return `${w}, gap admitted at ${failedAt}`;
    case "defended":
      return `${w}, defended but not retested`;
    default:
      return `${w}, failed at ${failedAt}`;
  }
}

/** Top 3 role skills by weight × (1 − proficiency); ties by weight, then role order. */
export function buildPriorities(role: Role, claims: readonly Claim[]): Priority[] {
  return role.skills
    .map((skill, order) => ({
      skill,
      order,
      score: skill.weight * (1 - skillProficiency(skill.id, claims)),
    }))
    .filter((x) => x.score > 1e-9)
    .sort((a, b) => b.score - a.score || b.skill.weight - a.skill.weight || a.order - b.order)
    .slice(0, MAX_PRIORITIES)
    .map(({ skill, score }, i) => {
      const claim = weakestClaim(claimsForSkill(skill.id, claims));
      return {
        rank: i + 1,
        skill_id: skill.id,
        claim_id: claim?.id ?? null,
        score: round3(score),
        reason: priorityReason(skill, claim),
      };
    });
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

/** Deterministic fallback when no LLM fix task is cached. */
function templateTask(claim: Claim): string {
  const concepts = claim.missing_concepts.length > 0 ? claim.missing_concepts : [claim.text];
  return `Practise and explain out loud:\n${concepts.map((c) => `- ${c}`).join("\n")}`;
}

function claimItem(claim: Claim, skill: RoleSkill | undefined): Omit<PlanItem, "day"> {
  const pending = claim.verdict === "pending" || claim.verdict === "error";
  return {
    skill_id: claim.skill_id,
    claim_id: claim.id,
    title: `${skill?.name ?? "Other"}: ${truncate(claim.text, 60)}`,
    task: pending
      ? `Finish the interrogation for "${truncate(claim.text, 80)}" so it can be scored.`
      : (claim.fix_task?.exercise ?? templateTask(claim)),
  };
}

function blindSpotItem(skill: RoleSkill): Omit<PlanItem, "day"> {
  const topics = [...skill.levels.L1, ...skill.levels.L2];
  return {
    skill_id: skill.id,
    claim_id: null,
    title: `${skill.name}: cover the basics`,
    task: `Never claimed but required. Build one small example that shows:\n${topics.map((t) => `- ${t}`).join("\n")}`,
  };
}

/** One item per priority, then the remaining weak claims; days 1..7, max 2 per day. */
export function buildPlan(role: Role, claims: readonly Claim[], priorities: readonly Priority[]): PlanItem[] {
  const skillById = new Map(role.skills.map((s) => [s.id, s]));
  const claimById = new Map(claims.map((c) => [c.id, c]));
  const items: Omit<PlanItem, "day">[] = [];
  const used = new Set<string>();

  for (const p of priorities) {
    const skill = skillById.get(p.skill_id);
    const claim = p.claim_id ? claimById.get(p.claim_id) : undefined;
    if (claim) {
      items.push(claimItem(claim, skill));
      used.add(claim.id);
    } else if (skill) {
      items.push(blindSpotItem(skill));
    }
  }
  for (const claim of claims) {
    if (!used.has(claim.id) && isWeakVerdict(claim.verdict)) {
      items.push(claimItem(claim, claim.skill_id ? skillById.get(claim.skill_id) : undefined));
    }
  }
  return items
    .slice(0, PLAN_DAYS * ITEMS_PER_DAY)
    .map((item, i) => ({ day: Math.floor(i / ITEMS_PER_DAY) + 1, ...item }));
}
