import { describe, expect, it } from "vitest";
import {
  canStart,
  evidenceFromGrade,
  finalizeGrade,
  levelPassed,
  missingConcepts,
  retestStartLevel,
  vaguePoints,
  verdictForLevels,
} from "../../src/core/rules.js";
import { ALL, rawGrade } from "../helpers.js";

const ANSWER = "Flexbox grows items along the main axis using flex-grow";
const Q = "flex-grow";

describe("level pass rules", () => {
  it("L1 needs accuracy, specificity and ownership", () => {
    expect(levelPassed(1, rawGrade(["accuracy", "specificity", "ownership"], Q).criteria)).toBe(true);
    expect(levelPassed(1, rawGrade(["accuracy", "specificity", "mechanism", "tradeoff"], Q).criteria)).toBe(false);
  });
  it("L2 needs accuracy and mechanism", () => {
    expect(levelPassed(2, rawGrade(["accuracy", "mechanism"], Q).criteria)).toBe(true);
    expect(levelPassed(2, rawGrade(["mechanism", "specificity", "ownership", "tradeoff"], Q).criteria)).toBe(false);
  });
  it("L3 needs accuracy and tradeoff", () => {
    expect(levelPassed(3, rawGrade(["accuracy", "tradeoff"], Q).criteria)).toBe(true);
    expect(levelPassed(3, rawGrade(["accuracy", "mechanism"], Q).criteria)).toBe(false);
  });
  it("an admitted gap never passes, even if criteria say so", () => {
    expect(finalizeGrade(rawGrade(ALL, Q, { admits_gap: true }), ANSWER, 1).level_passed).toBe(false);
  });
});

describe("verdicts, missing concepts and evidence", () => {
  it("maps levels to verdicts", () => {
    expect([0, 1, 2, 3].map((n) => verdictForLevels(n as 0 | 1 | 2 | 3))).toEqual(["bluff", "shaky", "shaky", "defended"]);
  });

  it("collects missing concepts only from the failing level's required criteria", () => {
    const grade = finalizeGrade(rawGrade(["accuracy", "specificity"], Q), ANSWER, 2);
    expect(missingConcepts(2, grade, ["role criterion"])).toEqual(["missing mechanism"]);
  });

  it("falls back to role criteria when the LLM gave no missing concept", () => {
    const raw = rawGrade([], null);
    raw.criteria.accuracy.missing_concept = null;
    raw.criteria.mechanism.missing_concept = "  ";
    const grade = finalizeGrade(raw, ANSWER, 2);
    expect(missingConcepts(2, grade, ["explain the event loop"])).toEqual(["explain the event loop"]);
  });

  it("an admitted gap misses the whole level", () => {
    const grade = finalizeGrade(rawGrade([], null, { admits_gap: true }), ANSWER, 1);
    expect(missingConcepts(1, grade, ["a", "b"])).toEqual(["a", "b"]);
  });

  it("vague points are the missing concepts of failed criteria", () => {
    const grade = finalizeGrade(rawGrade(["accuracy", "specificity", "ownership"], Q), ANSWER, 1);
    expect(vaguePoints(grade)).toEqual(["missing mechanism", "missing tradeoff"]);
  });

  it("evidence keeps only verbatim quotes", () => {
    const grade = finalizeGrade(rawGrade(["accuracy", "mechanism"], Q), ANSWER, 2);
    expect(evidenceFromGrade(2, grade)).toEqual([
      { level: 2, criterion: "accuracy", passed: true, quote: Q },
      { level: 2, criterion: "mechanism", passed: true, quote: Q },
    ]);
  });
});

describe("start rules", () => {
  it("assess only from pending/error; retest only from weak verdicts", () => {
    expect(canStart("assess", "pending")).toBe(true);
    expect(canStart("assess", "error")).toBe(true);
    expect(canStart("assess", "shaky")).toBe(false);
    expect(canStart("retest", "defended")).toBe(false);
    expect(canStart("retest", "pending")).toBe(false);
    expect(["shaky", "bluff", "honest_gap"].every((v) => canStart("retest", v as "shaky"))).toBe(true);
  });

  it("retest starts at the first failed level; L1 for bluff and honest_gap", () => {
    expect(retestStartLevel("shaky", 1)).toBe(2);
    expect(retestStartLevel("shaky", 2)).toBe(3);
    expect(retestStartLevel("bluff", 0)).toBe(1);
    expect(retestStartLevel("honest_gap", 1)).toBe(1);
  });
});
