import { describe, expect, it } from "vitest";
import { textToLatex } from "../../src/resume/fromText.js";
import { parseResume } from "../../src/resume/latexText.js";

const SAMPLE = `Priya Nair
Chennai, India • +91 98765 43210 • priya.nair@example.edu
linkedin.com/in/priya-sample | github.com/priya-sample/portfolio_site

EDUCATION
Sample Institute of Technology, B.Tech Computer Science & Engineering    2022 – 2026
CGPA: 8.7/10

TECHNICAL SKILLS
Languages: Python, Java, SQL
Frameworks & Tools: React, Docker

PROJECTS
Smart Attendance System | Python, Flask          Jan 2025 – Mar 2025
• Built a tool used by 120+ students, cutting roll-call time by 85% and
  saving ~6 hrs/week
• Wrote 40 unit tests; fixed bug #214 in the auth_service module
EXPERIENCE
Software Engineering Intern, Sample Corp ₹20,000/month          Jun 2025 – Aug 2025
- Implemented 3 REST endpoints serving 10,000 users
- Reduced API latency by 30% using Redis ✓
Achievements
Winner, Sample Hackathon 2025
`;

describe("textToLatex", () => {
  const r = textToLatex(SAMPLE);

  it("recognises the headings, in order, with standard names", () => {
    expect(r.sections).toEqual(["Education", "Skills", "Projects", "Experience", "Achievements"]);
    expect(r.latex).toContain("\\section{Skills}");
  });

  it("builds a complete document in the classic template", () => {
    expect(r.latex.startsWith("\\documentclass[11pt,a4paper]{article}")).toBe(true);
    expect(r.latex).toContain("\\begin{document}");
    expect(r.latex.trimEnd().endsWith("\\end{document}")).toBe(true);
  });

  it("makes a name heading and keeps contact details, with links and email as \\href", () => {
    expect(r.latex).toContain("{\\LARGE \\textbf{Priya Nair}}");
    expect(r.latex).toContain("\\href{mailto:priya.nair@example.edu}{priya.nair@example.edu}");
    expect(r.latex).toContain("\\href{https://linkedin.com/in/priya-sample}{linkedin.com/in/priya-sample}");
    expect(r.latex).toContain("portfolio\\_site"); // the visible label is escaped
  });

  it("groups bullets, merges wrapped lines, and escapes TeX's special characters", () => {
    expect(r.latex).toContain("\\item Built a tool used by 120+ students, cutting roll-call time by 85\\% and saving \\textasciitilde{}6 hrs/week");
    expect(r.latex).toContain("fixed bug \\#214 in the auth\\_service module");
    expect(r.latex.match(/\\begin\{itemize\}/g)).toHaveLength(2);
    expect(r.latex).toContain("\\item Implemented 3 REST endpoints serving 10,000 users"); // a "-" bullet
  });

  it("splits a trailing date range to the right and takes the whole range", () => {
    expect(r.latex).toContain("\\textbf{Sample Institute of Technology, B.Tech Computer Science \\& Engineering} \\hfill 2022 – 2026");
    expect(r.latex).toContain("\\hfill Jan 2025 – Mar 2025");
    expect(r.latex).toContain("\\hfill Jun 2025 – Aug 2025");
    expect(r.latex).toContain("Winner, Sample Hackathon 2025\n"); // a bare year is not a date range
  });

  it("labels skill lines, replaces characters it cannot set, and drops decorative marks", () => {
    expect(r.latex).toContain("\\textbf{Languages:} Python, Java, SQL");
    expect(r.latex).toContain("\\textbf{Frameworks \\& Tools:} React, Docker");
    expect(r.latex).toContain("INR 20,000/month");
    expect(r.latex).not.toContain("✓");
  });

  it("produces LaTeX our own parser reads back as the same résumé", () => {
    const p = parseResume(r.latex);
    expect(p.sections.map((s) => s.name)).toEqual(r.sections);
    expect(p.bullets).toHaveLength(4);
    expect(p.emails).toEqual(["priya.nair@example.edu"]);
    expect(p.text).toContain("Sample Institute of Technology");
    expect(p.layout).toEqual({ tables: false, columns: false, graphics: false, icons: false, positioned: false });
  });

  it("always reminds the student to check the conversion", () => {
    expect(r.warnings.at(-1)).toMatch(/Check the converted text/);
  });
});

describe("textToLatex PDF artifacts", () => {
  it("repairs a name set in small capitals, and one set in all capitals", () => {
    expect(textToLatex("S AMPLE P ERSON\nEducation\nCollege 2021 - 2025").latex).toContain("\\textbf{Sample Person}");
    expect(textToLatex("PRIYA NAIR\nEducation\nCollege 2021 - 2025").latex).toContain("\\textbf{Priya Nair}");
    expect(textToLatex("Mary-Jane O'Neil\nEducation\nCollege 2021 - 2025").latex).toContain("\\textbf{Mary-Jane O'Neil}"); // already fine: left alone
    expect(textToLatex("A. P. J. Kumar\nEducation\nCollege 2021 - 2025").latex).toContain("\\textbf{A. P. J. Kumar}");
  });

  it("closes up stray spaces before punctuation without touching numbers", () => {
    const r = textToLatex("Name\nExperience\nSoftware Intern , Sample Systems Pvt. Ltd . 2024 - 2025\nSkills\nLanguages : Java , Python\nCGPA 8.4 / 10 and 3 . 5 gpa");
    expect(r.latex).toContain("Software Intern, Sample Systems Pvt. Ltd.");
    expect(r.latex).toContain("\\textbf{Languages:} Java, Python");
    expect(r.latex).toContain("CGPA 8.4 / 10");
  });
});

describe("textToLatex edge cases", () => {
  it("keeps everything as one block, and says so, when no headings are recognised", () => {
    const r = textToLatex("Some Person\nsome@x.io\nI did many things over the years and learned plenty of useful skills along the way, working with many teams on varied projects that mattered a great deal to many users and customers.");
    expect(r.sections).toEqual([]);
    expect(r.warnings.join(" ")).toMatch(/No section headings/);
    expect(r.latex).toContain("I did many things");
  });

  it("warns when there is almost no text (a scanned PDF) and when characters were replaced", () => {
    expect(textToLatex("Name\nSkills\nPython").warnings.join(" ")).toMatch(/Very little text/);
    const r = textToLatex("Name\nSkills\nPython and 日本語 and Ωmega");
    expect(r.warnings.join(" ")).toMatch(/character.*replaced with “\?”/);
  });

  it("does not take a contact line for a name", () => {
    const r = textToLatex("priya@x.io\n+91 99999 99999\nEducation\nSome College 2022 - 2026");
    expect(r.latex).not.toContain("\\LARGE");
    expect(r.warnings.join(" ")).toMatch(/did not look like a name/);
  });

  it("neutralises LaTeX injected through the text", () => {
    const r = textToLatex("Name\nSkills\n\\input{/etc/passwd} \\write18{rm -rf} {\\def\\x{}} $x$ ~ ^");
    expect(r.latex).not.toMatch(/\\input\{/);
    expect(r.latex).toContain("\\textbackslash{}input\\{/etc/passwd\\}");
    expect(r.latex).toContain("\\$x\\$");
  });

  it("handles empty-looking and huge-but-valid input without throwing", () => {
    for (const t of ["", "\n\n", "Education", "Education\n", "•", "A\n".repeat(5000)]) expect(() => textToLatex(t)).not.toThrow();
  });
});
