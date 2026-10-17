import { describe, expect, it } from "vitest";
import { clampText, MAX_CLAIM_TEXT, normalizeResume } from "../../src/core/claims.js";

describe("resume normalisation and claim clamping", () => {
  it("splits one-line PDF text on bullets, collapses spaces, drops blanks", () => {
    const raw = "Priya  Sharma\r\n\r\nProjects • Built a React dashboard ●  Wrote Jest tests ▪ Used Git ◦ Led a team";
    expect(normalizeResume(raw).split("\n")).toEqual([
      "Priya Sharma",
      "Projects",
      "Built a React dashboard",
      "Wrote Jest tests",
      "Used Git",
      "Led a team",
    ]);
  });

  it("clamps on a word boundary with an ellipsis, and leaves short text alone", () => {
    const long = "word ".repeat(200);
    const out = clampText(long, MAX_CLAIM_TEXT);
    expect(out.length).toBeLessThanOrEqual(MAX_CLAIM_TEXT);
    expect(out.endsWith("word…")).toBe(true);
    expect(clampText("  short  ", 10)).toBe("short");
    expect(clampText("x".repeat(20), 10)).toBe(`${"x".repeat(9)}…`); // no space to break on
  });
});
