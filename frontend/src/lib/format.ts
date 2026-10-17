import type { Claim, Verdict } from "@/types/contract";

/** 0..1 → "85%" */
export function percent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

export const WEAK_VERDICTS: readonly Verdict[] = ["shaky", "bluff", "honest_gap"];

export function isWeak(claim: Pick<Claim, "verdict">): boolean {
  return WEAK_VERDICTS.includes(claim.verdict);
}

/** "1 concept" / "2 concepts" */
export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}
