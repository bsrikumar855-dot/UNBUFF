import type {
  Claim,
  ClaimsResponse,
  Criterion,
  CriterionResult,
  Grade,
  Progress,
  TurnResponse,
} from "@/types/contract";

/** Contract-complete builders so tests never drift from backend/src/types.ts. */

export function makeClaim(overrides: Partial<Claim> = {}): Claim {
  return {
    id: "CL-001",
    text: "Built a React dashboard with Redux",
    resume_line: "Built a React dashboard with Redux",
    skill_id: "react_state",
    source: "resume",
    verdict: "pending",
    levels_passed: 0,
    proficiency: 0,
    missing_concepts: [],
    evidence: [],
    qa: [],
    retest: null,
    fix_task: null,
    rewrite: null,
    root_cause: null,
    retest_status: "none",
    retest_unlocks_after: null,
    ...overrides,
  };
}

export function makeProgress(overrides: Partial<Progress> = {}): Progress {
  return { claims_total: 3, claims_done: 0, next_claim_id: "CL-001", next_mode: "assess", ...overrides };
}

const CRITERIA: Criterion[] = ["accuracy", "specificity", "mechanism", "ownership", "tradeoff"];

export function makeGrade(levelPassed: boolean, overrides: Partial<Grade> = {}): Grade {
  const criteria = Object.fromEntries(
    CRITERIA.map((c): [Criterion, CriterionResult] => [
      c,
      levelPassed
        ? { passed: true, evidence_quote: "I wrote the cart slice", missing_concept: null }
        : { passed: false, evidence_quote: null, missing_concept: `missing ${c}` },
    ]),
  ) as Record<Criterion, CriterionResult>;
  return {
    criteria,
    admits_gap: false,
    needs_clarification: false,
    level_passed: levelPassed,
    guard_flips: [],
    root_cause: null,
    ...overrides,
  };
}

/** A TurnResponse with the aliases filled consistently from the canonical fields. */
export function makeTurn(overrides: Partial<Omit<TurnResponse, "last_grade" | "verdict" | "levels_passed" | "next_claim_id" | "retest">> = {}): TurnResponse {
  const claim = overrides.claim ?? makeClaim();
  const progress = overrides.progress ?? makeProgress();
  const grade = overrides.grade ?? null;
  return {
    session_id: "s_test",
    claim_id: claim.id,
    mode: "assess",
    turn: "question",
    level: 1,
    question: "What exactly did you build, and which part did you personally do?",
    teach_now: false,
    ...overrides,
    claim,
    progress,
    grade,
    next_mode: progress.next_mode,
    last_grade: grade,
    verdict: claim.verdict,
    levels_passed: claim.levels_passed,
    next_claim_id: progress.next_claim_id,
    retest: claim.retest,
  };
}

export function makeClaimsResponse(claims: Claim[], overrides: Partial<ClaimsResponse> = {}): ClaimsResponse {
  return {
    session_id: "s_test",
    role_id: "frontend_developer",
    mode: "prepare",
    claims,
    blind_spots: [{ skill_id: "accessibility", name: "Accessibility", weight: 0.1 }],
    progress: makeProgress({ claims_total: claims.length }),
    ...overrides,
  };
}
