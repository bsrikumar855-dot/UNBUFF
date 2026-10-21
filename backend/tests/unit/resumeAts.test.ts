import { describe, expect, it } from "vitest";
import { ATS_DISCLAIMER, jobDescriptionKeywords, scoreResume } from "../../src/resume/ats.js";
import { RESUME_TEMPLATES } from "../../src/resume/templates.js";
import { roles } from "../helpers.js";

const role = roles.get("frontend_developer")!;
const classic = RESUME_TEMPLATES[0]!.latex;
const NOW = new Date("2026-10-21T10:00:00Z");
const score = (latex: string, extra: { jobDescription?: string | null; role?: typeof role | null } = {}) => scoreResume({ latex, role: extra.role === undefined ? role : extra.role, jobDescription: extra.jobDescription ?? null, now: NOW });
const byId = (r: ReturnType<typeof score>, id: string) => r.checks.find((c) => c.id === id)!;

describe("scoreResume", () => {
  // The starter templates contain placeholders, so a filled-in copy is what a real student's résumé looks like.
  const filled = classic
    .replace("Your Name", "Asha Rao")
    .replace(/you@example\.com/g, "asha.rao@uni.edu")
    .replace("+00 00000 00000", "+91 98765 43210")
    .replace(/github\.com\/yourname[^}]*/g, "github.com/asharao")
    .replace(/linkedin\.com\/in\/yourname/g, "linkedin.com/in/asharao")
    .replace("Your University", "Anna University")
    .replace("Company Name", "Acme Corp")
    .replace("Project Name", "Course Planner");

  it("scores a filled-in starter template well, adds up its checks, and is deterministic", () => {
    const a = score(filled);
    expect(a.checks.map((c) => c.id)).toEqual(["contact", "sections", "keywords", "impact", "verbs", "length", "format"]);
    expect(a.checks.reduce((s, c) => s + c.max, 0)).toBe(100);
    expect(a.score).toBe(Math.round(a.checks.reduce((s, c) => s + c.score, 0)));
    expect(a.score).toBeGreaterThanOrEqual(70);
    expect(score(filled)).toEqual(a);
    expect(a.disclaimer).toBe(ATS_DISCLAIMER);
    expect(a.role_id).toBe("frontend_developer");
  });

  it("does not give credit for the template's placeholder details", () => {
    const untouched = score(classic);
    expect(byId(untouched, "contact")).toMatchObject({ score: 2, status: "fail" });
    expect(byId(untouched, "contact").detail).toMatch(/placeholder/);
    expect(byId(untouched, "contact").fix).toMatch(/Replace every placeholder/);
    expect(untouched.score).toBeLessThan(score(filled).score);
    expect(byId(score(filled), "contact")).toMatchObject({ score: 10, status: "pass" });
  });

  it("gives passing checks no fix and failing checks a specific one", () => {
    const r = score(classic);
    for (const c of r.checks) expect(c.fix === null).toBe(c.status === "pass");
    const empty = score("\\begin{document}Hello\\end{document}");
    expect(byId(empty, "contact")).toMatchObject({ status: "fail", score: 0 });
    expect(byId(empty, "contact").fix).toMatch(/email/);
    expect(byId(empty, "sections").fix).toMatch(/Education.*Skills/);
    expect(byId(empty, "impact").detail).toMatch(/No bullet points/);
    expect(empty.rating).toBe("weak");
  });

  it("penalises tables, columns, images, text boxes and icon fonts", () => {
    const messy = classic.replace("\\begin{document}", "\\usepackage{fontawesome5}\n\\begin{document}\n\\begin{tabular}{ll}a&b\\end{tabular}\\begin{multicols}{2}x\\end{multicols}\\includegraphics{p.png}\\begin{tikzpicture}\\end{tikzpicture}");
    const f = byId(score(messy), "format");
    expect(f.score).toBe(0);
    expect(f.status).toBe("fail");
    expect(f.detail).toMatch(/tables.*multiple columns.*images/);
    expect(byId(score(classic), "format")).toMatchObject({ score: 10, status: "pass" });
  });

  it("measures keyword coverage against the role, and says so when there is no target", () => {
    const withRole = byId(score(classic), "keywords");
    const noTarget = byId(score(classic, { role: null }), "keywords");
    expect(withRole.score).toBeGreaterThan(0);
    expect(withRole.detail).toMatch(/Frontend Developer role/);
    expect(noTarget.score).toBe(0);
    expect(noTarget.detail).toMatch(/No target role or job description/);
    const r = score(classic);
    expect(r.keywords.matched).toContain("REST APIs & Async");
    expect(r.keywords.source).toBe("role");
  });

  it("uses a pasted job description, alone or with the role, matching whole words only", () => {
    const jd = "We need a developer with Kubernetes, Terraform and React. React experience is essential; Python is a plus.";
    const both = score(classic, { jobDescription: jd });
    expect(both.keywords.source).toBe("both");
    expect(both.keywords.matched).toContain("React");
    expect(both.keywords.missing).toEqual(expect.arrayContaining(["Kubernetes", "Terraform"]));
    expect(score(classic, { role: null, jobDescription: jd }).keywords.source).toBe("job_description");
    // "java" must not match inside "javascript"
    const onlyJs = scoreResume({ latex: "\\section{Skills} I know JavaScript.", role: null, jobDescription: "Java Java Java", now: NOW });
    expect(onlyJs.keywords.missing).toEqual(["Java"]);
  });

  it("takes real technical terms from a posting, not places, perks or process words", () => {
    const posting = "Hiring in Pune (onsite). Front end and back end. Strong Python, complex SQL, REST APIs and Docker. Good to have TypeScript, AWS, Kubernetes, LangChain and pgvector. Selection: assessment, then panel rounds. Pune relocation required.";
    const kws = jobDescriptionKeywords(posting);
    expect(kws).toEqual(expect.arrayContaining(["Python", "SQL", "REST APIs", "Docker", "TypeScript", "AWS", "Kubernetes", "LangChain", "pgvector"]));
    for (const junk of ["pune", "Pune", "end", "onsite", "selection", "panel", "rounds"]) expect(kws).not.toContain(junk);
    expect(kws.filter((k) => /^rest/i.test(k))).toEqual(["REST APIs"]); // one idea, one entry
  });

  it("falls back to repeated words when a posting names few technical terms, still skipping generic ones", () => {
    const kws = jobDescriptionKeywords("We value forecasting. Forecasting and budgeting experience, budgeting every month. Salary paid monthly in Mumbai.");
    expect(kws).toEqual(expect.arrayContaining(["forecasting", "budgeting"]));
    expect(kws).not.toContain("salary");
  });

  it("rewards measurable, action-led bullets and penalises weak ones", () => {
    const strong = "\\section{Projects}\\begin{itemize}\\item Built an API serving 5,000 users\\item Reduced latency by 40\\%\\item Led a team of 4\\end{itemize}";
    const weak = "\\section{Projects}\\begin{itemize}\\item Responsible for the website\\item Worked on features\\item Helped with testing\\end{itemize}";
    expect(byId(score(strong), "impact").status).toBe("pass");
    expect(byId(score(strong), "verbs").status).toBe("pass");
    expect(byId(score(weak), "impact").score).toBe(0);
    expect(byId(score(weak), "verbs").score).toBeLessThan(byId(score(strong), "verbs").score);
    expect(byId(score(weak), "verbs").detail).toMatch(/weak phrases/);
  });

  it("flags a résumé that is far too long or too short", () => {
    const long = classic.replace("\\end{document}", `${"word ".repeat(1200)}\n\\end{document}`);
    expect(byId(score(long), "length").status).not.toBe("pass");
    expect(byId(score(long), "length").fix).toMatch(/one page/);
    expect(byId(score("\\section{Skills} A B C"), "length").score).toBeLessThan(5);
  });

  it("maps the total to a rating", () => {
    expect(score(classic).rating).toMatch(/strong|good/);
    expect(score("x").rating).toBe("weak");
  });
});
