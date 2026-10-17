import { describe, expect, it } from "vitest";
import { buildResumeLines, worstVerdict } from "../../src/core/resumeLines.js";
import { claim } from "../helpers.js";

const RESUME = "Priya Sharma\n\nBuilt a React dashboard with Redux\n  Wrote Jest tests  \r\nUsed Git daily";

describe("resume lines", () => {
  it("severity: bluff > shaky > honest_gap > error > pending > defended", () => {
    expect(worstVerdict(["defended", "pending"])).toBe("pending");
    expect(worstVerdict(["error", "honest_gap"])).toBe("honest_gap");
    expect(worstVerdict(["shaky", "bluff", "defended"])).toBe("bluff");
    expect(worstVerdict([])).toBeNull();
  });

  it("drops empty lines, maps claims by containment, takes the worst verdict", () => {
    const claims = [
      claim("CL-001", "react_state", "defended", 0.85, { source: "resume", resume_line: "Built a React dashboard with Redux" }),
      claim("CL-002", "react_state", "shaky", 0.25, { source: "resume", resume_line: "React dashboard" }),
      claim("CL-003", "testing", "bluff", 0, { source: "resume", resume_line: null, text: "wrote jest tests" }),
      claim("CL-004", "git", "defended", 0.85, { source: "declared", text: "Used Git daily" }),
    ];
    expect(buildResumeLines(RESUME, claims)).toEqual([
      { index: 0, text: "Priya Sharma", verdict: null, claim_ids: [] },
      { index: 1, text: "Built a React dashboard with Redux", verdict: "shaky", claim_ids: ["CL-001", "CL-002"] },
      { index: 2, text: "Wrote Jest tests", verdict: "bluff", claim_ids: ["CL-003"] },
      { index: 3, text: "Used Git daily", verdict: null, claim_ids: [] },
    ]);
  });

  it("returns [] without a resume", () => {
    expect(buildResumeLines(null, [])).toEqual([]);
    expect(buildResumeLines("", [])).toEqual([]);
  });
});
