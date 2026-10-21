import { describe, expect, it } from "vitest";
import { wantsResume } from "../../src/resume/context.js";

describe("wantsResume", () => {
  it.each(["Check my résumé", "check my resume", "résumé", "Is my CV ok?", "How do I pass the ATS?", "my LaTeX template", "Improve my resumes please", "RESUME"])("matches %s", (m) => expect(wantsResume(m)).toBe(true));
  it.each(["Explain the two-pointer technique", "What are Atlas and cvs?", "stats about my data", "", "atsx"])("does not match %s", (m) => expect(wantsResume(m)).toBe(false));
  it("is a keyword check, so the English verb 'resume' also matches: an accepted false positive that only adds context", () => {
    expect(wantsResume("I will resume studying tomorrow")).toBe(true);
  });
});
