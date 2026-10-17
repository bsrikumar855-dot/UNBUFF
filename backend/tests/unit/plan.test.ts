import { describe, expect, it } from "vitest";
import { buildPlan, buildPriorities } from "../../src/core/plan.js";
import { claim, role } from "../helpers.js";
import { example } from "../fixtures/claims.js";

describe("priorities", () => {
  it("top 3 by weight × (1 − proficiency), ties by weight then role order", () => {
    // scores: rest .15, css .15, a11y .10, testing .10, git .10, react .08, js .03
    expect(buildPriorities(role, example)).toEqual([
      { rank: 1, skill_id: "rest_apis", claim_id: "CL-004", score: 0.15, reason: "15% role weight, not assessed yet" },
      { rank: 2, skill_id: "responsive_css", claim_id: "CL-005", score: 0.15, reason: "15% role weight, failed at L1" },
      { rank: 3, skill_id: "accessibility", claim_id: null, score: 0.1, reason: "Required by role, never claimed" },
    ]);
  });

  it("uses the weakest claim and explains shaky / gap / defended reasons", () => {
    const cs = [
      claim("CL-001", "js_fundamentals", "shaky", 0.25, { levels_passed: 1 }),
      claim("CL-002", "react_state", "honest_gap", 0, { levels_passed: 1 }),
      claim("CL-003", "rest_apis", "defended", 0.85, { levels_passed: 3 }),
      ...["responsive_css", "accessibility", "testing", "git"].map((s, i) => claim(`CL-01${i}`, s, "defended", 1)),
    ];
    const reasons = buildPriorities(role, cs).map((p) => [p.skill_id, p.reason]);
    expect(reasons).toEqual([
      ["react_state", "20% role weight, gap admitted at L2"],
      ["js_fundamentals", "20% role weight, failed at L2"],
      ["rest_apis", "15% role weight, defended but not retested"],
    ]);
  });

  it("skills at full proficiency are never priorities", () => {
    const perfect = role.skills.map((s, i) => claim(`CL-00${i}`, s.id, "defended", 1));
    expect(buildPriorities(role, perfect)).toEqual([]);
  });
});

describe("7-day plan", () => {
  it("priorities first, then remaining weak claims, max 2 per day", () => {
    const plan = buildPlan(role, example, buildPriorities(role, example));
    expect(plan.map((p) => [p.day, p.claim_id ?? p.skill_id])).toEqual([
      [1, "CL-004"],
      [1, "CL-005"],
      [2, "accessibility"],
      [2, "CL-002"],
      [3, "CL-003"],
      [3, "CL-006"],
    ]);
    expect(plan[0]?.task).toMatch(/Finish the interrogation/);
    expect(plan[2]?.title).toBe("Accessibility: cover the basics");
  });

  it("uses the cached LLM fix-task exercise when present, template otherwise", () => {
    const withTask = claim("CL-001", "git", "bluff", 0, {
      missing_concepts: ["merge vs rebase"],
      fix_task: { claim_id: "CL-001", skill_id: "git", root_cause: null, missing_concepts: ["merge vs rebase"], explanation: "e", exercise: "Rebase a branch" },
    });
    const noTask = claim("CL-002", "testing", "shaky", 0.25, { missing_concepts: ["mocking fetch"] });
    const plan = buildPlan(role, [withTask, noTask], []);
    expect(plan[0]?.task).toBe("Rebase a branch");
    expect(plan[1]?.task).toContain("- mocking fetch");
  });

  it("caps at 7 days", () => {
    const many = Array.from({ length: 20 }, (_, i) => claim(`CL-${100 + i}`, null, "bluff", 0));
    const plan = buildPlan(role, many, []);
    expect(plan).toHaveLength(14);
    expect(Math.max(...plan.map((p) => p.day))).toBe(7);
    expect(plan[0]?.title.startsWith("Other: ")).toBe(true);
  });
});
