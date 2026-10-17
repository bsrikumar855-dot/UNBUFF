import type { Claim, ClaimSource } from "../types.js";

export const MAX_CLAIMS = 8;
/** Limits enforced by POST /api/claims/confirm; extract must never return more. */
export const MAX_CLAIM_TEXT = 300;
export const MAX_RESUME_LINE = 500;

/** Cuts text to `max` characters on a word boundary, adding "…" when it had to cut. */
export function clampText(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/**
 * Resumes pasted from PDFs often arrive as one giant line. Bullets (•, ●, ▪, ◦) start a new line,
 * runs of spaces collapse and blank lines drop, so each item becomes its own claim / heatmap row.
 */
export function normalizeResume(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\s*[•●▪◦]\s*/g, "\n")
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .filter((l) => l.length > 0)
    .join("\n");
}

export function claimId(seq: number): string {
  return `CL-${String(seq).padStart(3, "0")}`;
}

export function newClaim(
  id: string,
  fields: { text: string; resume_line: string | null; skill_id: string | null; source: ClaimSource },
): Claim {
  return {
    id,
    ...fields,
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
  };
}

/** Keyword match for declared chips / mock extraction: first skill whose keyword appears. */
export function matchSkillByKeywords(
  text: string,
  skills: readonly { id: string; name: string; keywords: string[] }[],
): string | null {
  const t = ` ${text.toLowerCase().replace(/[^a-z0-9.+#\s]/g, " ")} `;
  for (const s of skills) {
    if (t.includes(` ${s.name.toLowerCase()} `)) return s.id;
    if (s.keywords.some((k) => t.includes(` ${k.toLowerCase()} `))) return s.id;
  }
  return null;
}
