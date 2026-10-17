import { describe, expect, it } from "vitest";
import { buildReport } from "../../src/core/report.js";
import { matchSkillByKeywords, claimId } from "../../src/core/claims.js";
import { parseRole } from "../../src/services/roles.js";
import { claim, role } from "../helpers.js";
import { example } from "../fixtures/claims.js";

describe("buildReport", () => {
  const report = buildReport(
    {
      session_id: "s_1",
      mode: "defense",
      resume_text: null,
      claims: [...example, claim("CL-008", "git", "defended", 1, { rewrite: "stale rewrite" })],
      history: [{ at: "t1", mode: "assess", claim_id: "CL-001", skill_id: "js_fundamentals", proficiency: 0.85 }],
    },
    role,
    "2026-09-26T10:00:00.000Z",
  );

  it("has one skill entry per role skill in role order, with history", () => {
    expect(report.skills.map((s) => s.skill_id)).toEqual(role.skills.map((s) => s.id));
    expect(report.skills[0]?.history).toEqual([{ at: "t1", mode: "assess", claim_id: "CL-001", proficiency: 0.85 }]);
  });

  it("reports scores, deprioritized claims and blind spots", () => {
    expect(report.readiness).toBe(39); // 29 + 0.10 × 1.0 for git
    expect(report.coverage).toBe(75);
    expect(report.deprioritized_claim_ids).toEqual(["CL-007"]);
    expect(report.blind_spots.map((b) => b.skill_id)).toEqual(["accessibility"]);
    expect(report.resume_lines).toEqual([]);
    expect(report.progress.claims_done).toBe(8);
  });

  it("hides rewrites on claims that are no longer weak", () => {
    expect(report.claims.find((c) => c.id === "CL-008")?.rewrite).toBeNull();
  });
});

describe("claims helpers and role validation", () => {
  it("formats claim ids", () => {
    expect(claimId(1)).toBe("CL-001");
    expect(claimId(42)).toBe("CL-042");
  });

  it("maps free text to skills by keyword", () => {
    expect(matchSkillByKeywords("Redux Toolkit", role.skills)).toBe("react_state");
    expect(matchSkillByKeywords("Accessibility", role.skills)).toBe("accessibility");
    expect(matchSkillByKeywords("Kubernetes", role.skills)).toBeNull();
  });

  it("role weights sum to 1.0", () => {
    expect(role.skills.reduce((a, s) => a + s.weight, 0)).toBeCloseTo(1, 3);
    expect(role.skills.map((s) => [s.id, s.weight])).toEqual([
      ["js_fundamentals", 0.2],
      ["react_state", 0.2],
      ["rest_apis", 0.15],
      ["responsive_css", 0.15],
      ["accessibility", 0.1],
      ["testing", 0.1],
      ["git", 0.1],
    ]);
  });

  it("rejects roles whose weights do not sum to 1", () => {
    const bad = { ...role, skills: role.skills.map((s) => ({ ...s, weight: 0.1 })) };
    expect(() => parseRole(bad)).toThrow(/sum to/);
  });

  it("rejects duplicate skill ids", () => {
    const first = role.skills[0]!;
    const dup = { ...role, skills: [{ ...first, weight: 0.5 }, { ...first, weight: 0.5 }] };
    expect(() => parseRole(dup)).toThrow(/duplicate/);
  });
});
