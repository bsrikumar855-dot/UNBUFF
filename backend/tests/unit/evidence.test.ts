import { describe, expect, it } from "vitest";
import { applyEvidenceGuard, isVerbatimQuote, normalizeText } from "../../src/core/evidence.js";
import { ALL, rawGrade } from "../helpers.js";

describe("evidence guard", () => {
  it("normalizes case, curly quotes and whitespace", () => {
    expect(normalizeText("  React’s   \n Virtual\tDOM ")).toBe("react's virtual dom");
  });

  it("accepts verbatim substrings regardless of case/whitespace", () => {
    expect(isVerbatimQuote("the  VIRTUAL dom", "React diffs the virtual\nDOM tree")).toBe(true);
  });

  it("rejects null, empty and invented quotes", () => {
    expect(isVerbatimQuote(null, "anything")).toBe(false);
    expect(isVerbatimQuote("   ", "anything")).toBe(false);
    expect(isVerbatimQuote("uses Fiber lanes", "React re-renders")).toBe(false);
  });

  it("flips passed criteria with bad quotes and reports them", () => {
    const raw = rawGrade(ALL, "keys match list items");
    raw.criteria.accuracy.evidence_quote = "React re-renders";
    raw.criteria.tradeoff.evidence_quote = null;
    const { criteria, flips } = applyEvidenceGuard(raw.criteria, "React re-renders the list");
    expect(criteria.accuracy.passed).toBe(true);
    expect(flips).toEqual(["specificity", "mechanism", "ownership", "tradeoff"]);
    expect(criteria.mechanism).toEqual({ passed: false, evidence_quote: null, missing_concept: null });
  });

  it("does not count already-failed criteria as flips", () => {
    const { flips } = applyEvidenceGuard(rawGrade([], null).criteria, "x");
    expect(flips).toEqual([]);
  });
});
