import type {
  Criterion,
  CriterionResult,
  Evidence,
  Grade,
  Level,
  LevelsPassed,
  Mode,
  Verdict,
} from "../types.js";
import { applyEvidenceGuard, CRITERIA } from "./evidence.js";
import { validateRootCause } from "./schedule.js";

/** Criteria that must ALL pass for a level to pass. */
export const LEVEL_RULES: Record<Level, readonly Criterion[]> = {
  1: ["accuracy", "specificity", "ownership"],
  2: ["accuracy", "mechanism"],
  3: ["accuracy", "tradeoff"],
};

export const PROFICIENCY_BY_LEVELS: Record<LevelsPassed, number> = {
  0: 0,
  1: 0.25,
  2: 0.6,
  3: 0.85,
};

/** Proficiency after a retest that passes all the way through L3. */
export const RETEST_FULL_PROFICIENCY = 1.0;

/** Verdicts that can be retested and get fix tasks / rewrites. */
export const WEAK_VERDICTS: readonly Verdict[] = ["shaky", "bluff", "honest_gap"];

export function isWeakVerdict(verdict: Verdict): boolean {
  return WEAK_VERDICTS.includes(verdict);
}

/** Raw grade as returned by the LLM (no pass/fail decision). */
export interface RawGrade {
  criteria: Record<Criterion, CriterionResult>;
  admits_gap: boolean;
  needs_clarification: boolean;
  root_cause?: string | null;
}

export function levelPassed(level: Level, criteria: Record<Criterion, CriterionResult>): boolean {
  return LEVEL_RULES[level].every((name) => criteria[name].passed);
}

/** Evidence guard first, then the deterministic level rule; root_cause must be a listed prerequisite. */
export function finalizeGrade(raw: RawGrade, answer: string, level: Level, prerequisites: readonly string[] = []): Grade {
  const { criteria, flips } = applyEvidenceGuard(raw.criteria, answer);
  const passed = !raw.admits_gap && levelPassed(level, criteria);
  return {
    criteria,
    admits_gap: raw.admits_gap,
    needs_clarification: raw.needs_clarification,
    level_passed: passed,
    guard_flips: flips,
    root_cause: passed ? null : validateRootCause(raw.root_cause, prerequisites),
  };
}

export function verdictForLevels(levelsPassed: LevelsPassed): Verdict {
  if (levelsPassed === 3) return "defended";
  if (levelsPassed === 0) return "bluff";
  return "shaky";
}

export function proficiencyForLevels(levelsPassed: LevelsPassed): number {
  return PROFICIENCY_BY_LEVELS[levelsPassed];
}

/**
 * What the student failed to show at this level: the LLM's missing_concept for each
 * failing required criterion, falling back to the role's criteria text.
 */
export function missingConcepts(level: Level, grade: Grade, levelCriteria: string[]): string[] {
  if (grade.admits_gap) return [...levelCriteria];
  const out: string[] = [];
  for (const name of LEVEL_RULES[level]) {
    const c = grade.criteria[name];
    if (c.passed) continue;
    const concept = c.missing_concept?.trim() || levelCriteria[0] || name;
    if (!out.includes(concept)) out.push(concept);
  }
  return out;
}

/** Points to target in a clarify follow-up: the concepts the LLM marked as missing. */
export function vaguePoints(grade: Grade): string[] {
  return CRITERIA.map((name) => grade.criteria[name])
    .filter((c) => !c.passed && c.missing_concept)
    .map((c) => c.missing_concept as string);
}

export function evidenceFromGrade(level: Level, grade: Grade): Evidence[] {
  const out: Evidence[] = [];
  for (const name of CRITERIA) {
    const c = grade.criteria[name];
    if (c.evidence_quote) {
      out.push({ level, criterion: name, passed: c.passed, quote: c.evidence_quote });
    }
  }
  return out;
}

/** Whether a claim with this verdict may be started in this mode. */
export function canStart(mode: Mode, verdict: Verdict): boolean {
  return mode === "assess" ? verdict === "pending" || verdict === "error" : isWeakVerdict(verdict);
}

/** Retest starts at the first failed level; L1 for bluff and honest_gap. */
export function retestStartLevel(verdict: Verdict, levelsPassed: LevelsPassed): Level {
  if (verdict === "shaky" && (levelsPassed === 1 || levelsPassed === 2)) {
    return (levelsPassed + 1) as Level;
  }
  return 1;
}
