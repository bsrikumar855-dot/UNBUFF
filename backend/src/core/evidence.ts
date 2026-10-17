import type { Criterion, CriterionResult } from "../types.js";

export const CRITERIA: readonly Criterion[] = [
  "accuracy",
  "specificity",
  "mechanism",
  "ownership",
  "tradeoff",
];

/** Lowercase, unify quote characters and collapse whitespace so trivial formatting never fails a quote. */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/** True when `quote` is a non-empty verbatim substring of `answer` (after normalization). */
export function isVerbatimQuote(quote: string | null, answer: string): boolean {
  if (quote === null) return false;
  const q = normalizeText(quote);
  return q.length > 0 && normalizeText(answer).includes(q);
}

export interface GuardResult {
  criteria: Record<Criterion, CriterionResult>;
  flips: Criterion[];
}

/**
 * Evidence guard: a criterion may only pass if it cites a verbatim quote from the answer.
 * Any passed criterion whose quote is missing or not a substring is forced to false.
 * Failed criteria keep their quote only if it is verbatim (never show invented text).
 */
export function applyEvidenceGuard(
  criteria: Record<Criterion, CriterionResult>,
  answer: string,
): GuardResult {
  const flips: Criterion[] = [];
  const guarded = {} as Record<Criterion, CriterionResult>;
  for (const name of CRITERIA) {
    const c = criteria[name];
    const verbatim = isVerbatimQuote(c.evidence_quote, answer);
    if (c.passed && !verbatim) flips.push(name);
    guarded[name] = {
      passed: c.passed && verbatim,
      evidence_quote: verbatim ? c.evidence_quote : null,
      missing_concept: c.missing_concept,
    };
  }
  return { criteria: guarded, flips };
}
