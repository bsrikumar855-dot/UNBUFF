import type { Grade, Level, LevelsPassed, Mode, RetestResult, Verdict } from "../types.js";
import {
  proficiencyForLevels,
  RETEST_FULL_PROFICIENCY,
  verdictForLevels,
} from "./rules.js";

/** Where an in-progress claim is in its level ladder. */
export interface Cursor {
  mode: Mode;
  level: Level;
  start_level: Level;
  clarify_used: boolean; // for the current level
  interleaved_claims: number; // retest only: other claims completed between fix task and retest start
}

/** How a ladder run ended. */
export type Outcome =
  | { kind: "gap"; level: Level }
  | { kind: "failed"; level: Level }
  | { kind: "passed_all" };

export type TurnDecision =
  | { turn: "clarify"; cursor: Cursor }
  | { turn: "question"; cursor: Cursor }
  | { turn: "done"; outcome: Outcome };

export function startCursor(mode: Mode, level: Level, interleavedClaims = 0): Cursor {
  return { mode, level, start_level: level, clarify_used: false, interleaved_claims: interleavedClaims };
}

/** Deterministic turn transition from a finalized (guarded) grade. */
export function decideTurn(cursor: Cursor, grade: Grade): TurnDecision {
  if (grade.admits_gap) return { turn: "done", outcome: { kind: "gap", level: cursor.level } };
  if (grade.needs_clarification && !cursor.clarify_used && !grade.level_passed) {
    return { turn: "clarify", cursor: { ...cursor, clarify_used: true } };
  }
  if (!grade.level_passed) {
    return { turn: "done", outcome: { kind: "failed", level: cursor.level } };
  }
  if (cursor.level === 3) return { turn: "done", outcome: { kind: "passed_all" } };
  return {
    turn: "question",
    cursor: { ...cursor, level: (cursor.level + 1) as Level, clarify_used: false },
  };
}

/** Levels passed implied by an outcome (the ladder only moves up on a pass). */
export function levelsImplied(outcome: Outcome): LevelsPassed {
  return outcome.kind === "passed_all" ? 3 : ((outcome.level - 1) as LevelsPassed);
}

export interface ClaimScore {
  verdict: Verdict;
  levels_passed: LevelsPassed;
  proficiency: number;
}

export function resolveAssess(outcome: Outcome): ClaimScore {
  const levels = levelsImplied(outcome);
  if (outcome.kind === "gap") return { verdict: "honest_gap", levels_passed: levels, proficiency: 0 };
  return {
    verdict: verdictForLevels(levels),
    levels_passed: levels,
    proficiency: proficiencyForLevels(levels),
  };
}

export const ERROR_SCORE: ClaimScore = { verdict: "error", levels_passed: 0, proficiency: 0 };

export interface RetestScore extends ClaimScore {
  retest: RetestResult;
}

/**
 * Retest result: 1.0 if it passes through L3, otherwise the proficiency implied by levels
 * passed, never lower than before. Verdict becomes `defended` only on a full pass.
 */
export function resolveRetest(previous: ClaimScore, outcome: Outcome, interleavedClaims = 0): RetestScore {
  const before = previous.proficiency;
  const implied = levelsImplied(outcome);
  const full = outcome.kind === "passed_all";
  const after = full
    ? RETEST_FULL_PROFICIENCY
    : Math.max(before, proficiencyForLevels(implied));
  return {
    verdict: full ? "defended" : previous.verdict,
    levels_passed: Math.max(previous.levels_passed, implied) as LevelsPassed,
    proficiency: after,
    retest: { attempted: true, passed: after > before, before, after, interleaved_claims: interleavedClaims },
  };
}
