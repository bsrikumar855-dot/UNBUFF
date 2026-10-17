import { describe, expect, it } from "vitest";
import type { Level } from "../../src/types.js";
import { finalizeGrade, type RawGrade } from "../../src/core/rules.js";
import {
  decideTurn,
  levelsImplied,
  resolveAssess,
  resolveRetest,
  startCursor,
  type ClaimScore,
  type Cursor,
  type Outcome,
} from "../../src/core/stateMachine.js";
import { ALL, rawGrade } from "../helpers.js";

const ANSWER = "I wired useState into the cart and React re-rendered the list";
const QUOTE = "useState into the cart";

/** Runs the pure ladder over a scripted list of raw grades, like the service does. */
function runLadder(grades: RawGrade[], start: Cursor = startCursor("assess", 1)) {
  let cursor = start;
  const turns: string[] = [];
  for (const raw of grades) {
    const grade = finalizeGrade(raw, ANSWER, cursor.level);
    const d = decideTurn(cursor, grade);
    turns.push(d.turn);
    if (d.turn === "done") return { turns, outcome: d.outcome };
    cursor = d.cursor;
  }
  throw new Error("ladder did not finish");
}

describe("interrogation ladder (required cases)", () => {
  it("1. all three levels pass → defended, proficiency 0.85", () => {
    const { turns, outcome } = runLadder([rawGrade(ALL, QUOTE), rawGrade(ALL, QUOTE), rawGrade(ALL, QUOTE)]);
    expect(turns).toEqual(["question", "question", "done"]);
    expect(resolveAssess(outcome)).toEqual({ verdict: "defended", levels_passed: 3, proficiency: 0.85 });
  });

  it("2. L2 fails → shaky with levels_passed 1", () => {
    const { outcome } = runLadder([rawGrade(ALL, QUOTE), rawGrade(["accuracy"], QUOTE)]);
    expect(outcome).toEqual({ kind: "failed", level: 2 });
    expect(resolveAssess(outcome)).toEqual({ verdict: "shaky", levels_passed: 1, proficiency: 0.25 });
  });

  it("3. admits_gap → honest_gap immediately", () => {
    const { turns, outcome } = runLadder([rawGrade([], null, { admits_gap: true })]);
    expect(turns).toEqual(["done"]);
    expect(resolveAssess(outcome)).toMatchObject({ verdict: "honest_gap", proficiency: 0 });
  });

  it("4. clarify is used once per level, then the answer passes", () => {
    const vague = rawGrade(["specificity", "ownership"], QUOTE, { needs_clarification: true });
    const { turns, outcome } = runLadder([vague, rawGrade(ALL, QUOTE), rawGrade(ALL, QUOTE), rawGrade(ALL, QUOTE)]);
    expect(turns).toEqual(["clarify", "question", "question", "done"]);
    expect(resolveAssess(outcome).verdict).toBe("defended");
  });

  it("4b. second needs_clarification at the same level applies the pass rules as-is", () => {
    const vague = rawGrade(["specificity"], QUOTE, { needs_clarification: true });
    const { turns, outcome } = runLadder([vague, vague]);
    expect(turns).toEqual(["clarify", "done"]);
    expect(resolveAssess(outcome).verdict).toBe("bluff");
  });

  it("4c. the clarify slot resets on the next level", () => {
    const vague = rawGrade(["specificity"], QUOTE, { needs_clarification: true });
    const { turns } = runLadder([vague, rawGrade(ALL, QUOTE), vague, rawGrade(ALL, QUOTE), rawGrade(ALL, QUOTE)]);
    expect(turns).toEqual(["clarify", "question", "clarify", "question", "done"]);
  });

  it("5. hallucinated evidence quote → criterion flipped → level fails", () => {
    const hallucinated = rawGrade(ALL, "I benchmarked React Fiber with the profiler");
    const grade = finalizeGrade(hallucinated, ANSWER, 1);
    expect(grade.guard_flips).toEqual(ALL);
    expect(grade.criteria.accuracy.passed).toBe(false);
    expect(grade.level_passed).toBe(false);
    const { outcome } = runLadder([hallucinated]);
    expect(resolveAssess(outcome).verdict).toBe("bluff");
  });

  it("needs_clarification on an answer that already passes just advances", () => {
    const { turns } = runLadder([rawGrade(ALL, QUOTE, { needs_clarification: true }), rawGrade([], null)]);
    expect(turns).toEqual(["question", "done"]);
  });
});

describe("levelsImplied / resolveAssess", () => {
  it.each<[Outcome, number]>([
    [{ kind: "failed", level: 1 }, 0],
    [{ kind: "failed", level: 3 }, 2],
    [{ kind: "gap", level: 2 }, 1],
    [{ kind: "passed_all" }, 3],
  ])("%o → %i levels", (outcome, n) => {
    expect(levelsImplied(outcome)).toBe(n);
  });

  it("two levels → shaky 0.60, zero → bluff 0", () => {
    expect(resolveAssess({ kind: "failed", level: 3 })).toEqual({ verdict: "shaky", levels_passed: 2, proficiency: 0.6 });
    expect(resolveAssess({ kind: "failed", level: 1 })).toEqual({ verdict: "bluff", levels_passed: 0, proficiency: 0 });
  });
});

describe("resolveRetest", () => {
  const shaky: ClaimScore = { verdict: "shaky", levels_passed: 1, proficiency: 0.25 };

  it("8. passing through L3 → after 1.0, passed, verdict defended", () => {
    const r = resolveRetest(shaky, { kind: "passed_all" });
    expect(r).toEqual({
      verdict: "defended",
      levels_passed: 3,
      proficiency: 1,
      retest: { attempted: true, passed: true, before: 0.25, after: 1, interleaved_claims: 0 },
    });
  });

  it("records the interleaving gap it is given", () => {
    expect(resolveRetest(shaky, { kind: "passed_all" }, 3).retest.interleaved_claims).toBe(3);
  });

  it("partial improvement raises proficiency but keeps the verdict", () => {
    const r = resolveRetest(shaky, { kind: "failed", level: 3 });
    expect(r.verdict).toBe("shaky");
    expect(r.retest).toEqual({ attempted: true, passed: true, before: 0.25, after: 0.6, interleaved_claims: 0 });
  });

  it("failing again never lowers proficiency", () => {
    const r = resolveRetest({ verdict: "shaky", levels_passed: 2, proficiency: 0.6 }, { kind: "failed", level: 1 as Level });
    expect(r.proficiency).toBe(0.6);
    expect(r.levels_passed).toBe(2);
    expect(r.retest.passed).toBe(false);
  });
});
