import type { Claim, ResumeLine, Verdict } from "../types.js";
import { normalizeText } from "./evidence.js";

/** Higher = worse. The heatmap shows the worst verdict on a line. */
export const VERDICT_SEVERITY: Record<Verdict, number> = {
  bluff: 5,
  shaky: 4,
  honest_gap: 3,
  error: 2,
  pending: 1,
  defended: 0,
};

export function worstVerdict(verdicts: readonly Verdict[]): Verdict | null {
  let worst: Verdict | null = null;
  for (const v of verdicts) {
    if (worst === null || VERDICT_SEVERITY[v] > VERDICT_SEVERITY[worst]) worst = v;
  }
  return worst;
}

function textsMatch(a: string, b: string): boolean {
  const x = normalizeText(a);
  const y = normalizeText(b);
  return x.length > 0 && y.length > 0 && (x === y || x.includes(y) || y.includes(x));
}

/** A claim sits on a line when the line matches its resume_line (or, failing that, its text). */
function claimOnLine(line: string, claim: Claim): boolean {
  if (claim.source !== "resume") return false;
  return claim.resume_line !== null ? textsMatch(line, claim.resume_line) : textsMatch(line, claim.text);
}

export function buildResumeLines(resumeText: string | null, claims: readonly Claim[]): ResumeLine[] {
  if (!resumeText) return [];
  return resumeText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((text, index) => {
      const onLine = claims.filter((c) => claimOnLine(text, c));
      return {
        index,
        text,
        verdict: worstVerdict(onLine.map((c) => c.verdict)),
        claim_ids: onLine.map((c) => c.id),
      };
    });
}
