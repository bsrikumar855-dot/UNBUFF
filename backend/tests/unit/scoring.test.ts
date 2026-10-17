import { describe, expect, it } from "vitest";
import {
  blindSpots,
  coverage,
  progress,
  readiness,
  skillProficiency,
  skillState,
} from "../../src/core/scoring.js";
import { claim, role } from "../helpers.js";
import { example } from "../fixtures/claims.js";


describe("7. readiness and coverage (hand-computed)", () => {
  it("readiness = 29", () => expect(readiness(role, example)).toBe(29));
  it("coverage = 65 (error claims are not assessed)", () => expect(coverage(role, example)).toBe(65));

  it("6. an error verdict is excluded from coverage", () => {
    const onlyError = [claim("CL-001", "rest_apis", "error", 0)];
    expect(coverage(role, onlyError)).toBe(0);
    const assessed = [claim("CL-001", "rest_apis", "bluff", 0)];
    expect(coverage(role, assessed)).toBe(15);
  });

  it("everything defended through retest → 100 / 100", () => {
    const all = role.skills.map((s, i) => claim(`CL-00${i + 1}`, s.id, "defended", 1));
    expect(readiness(role, all)).toBe(100);
    expect(coverage(role, all)).toBe(100);
  });
});

describe("skill proficiency and state", () => {
  it("proficiency is the max over claims", () => {
    expect(skillProficiency("react_state", example)).toBe(0.6);
    expect(skillProficiency("git", example)).toBe(0);
  });

  it("states follow the rules table", () => {
    const state = (id: string) => {
      const cs = example.filter((c) => c.skill_id === id);
      return skillState(cs, skillProficiency(id, example));
    };
    expect(state("js_fundamentals")).toBe("ready");
    expect(state("react_state")).toBe("ready");
    expect(state("rest_apis")).toBe("unverified");
    expect(state("responsive_css")).toBe("needs_work");
    expect(state("accessibility")).toBe("blind_spot");
    expect(skillState([claim("CL-001", "git", "pending", 0)], 0)).toBe("unverified");
  });

  it("blind spots are role skills with no claims", () => {
    expect(blindSpots(role, example).map((b) => b.skill_id)).toEqual(["accessibility", "git"]);
  });
});

describe("progress", () => {
  it("counts non-pending claims and finds the next pending one", () => {
    const cs = [claim("CL-001", "git", "defended", 0.85), claim("CL-002", "git", "pending", 0), claim("CL-003", "git", "error", 0)];
    expect(progress(cs)).toEqual({ claims_total: 3, claims_done: 2, next_claim_id: "CL-002", next_mode: "assess" });
    expect(progress([]).next_claim_id).toBeNull();
  });
});
