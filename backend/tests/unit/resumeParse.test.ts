import { describe, expect, it } from "vitest";
import { parseResume, stripComments } from "../../src/resume/latexText.js";
import { RESUME_TEMPLATES } from "../../src/resume/templates.js";

const doc = (body: string, pre = "") => `\\documentclass{article}\n${pre}\\begin{document}\n${body}\n\\end{document}`;

describe("parseResume", () => {
  it("reads sections, bullets, contact details and links from a real template", () => {
    const p = parseResume(RESUME_TEMPLATES[0]!.latex);
    expect(p.sections.map((s) => s.name)).toEqual(["Education", "Skills", "Projects", "Experience"]);
    expect(p.bullets.length).toBe(6);
    expect(p.bullets[1]).toBe("Reduced page load time by 40% by lazy loading routes and memoizing components.");
    expect(p.emails).toEqual(["you@example.com"]);
    expect(p.phones.length).toBe(1);
    expect(p.links).toContain("https://github.com/yourname");
    expect(p.text).toContain("Your University");
    expect(p.text).not.toMatch(/\\|\{|\}/); // no LaTeX left in the text an ATS would read
    expect(p.layout).toEqual({ tables: false, columns: false, graphics: false, icons: false, positioned: false });
  });

  it("ignores comments, but not an escaped percent sign", () => {
    expect(stripComments("keep % drop\nsave 50\\% more")).toBe("keep \nsave 50\\% more");
    const p = parseResume(doc("\\section{Skills}\n% \\item hidden bullet\n\\item Cut cost by 50\\%"));
    expect(p.bullets).toEqual(["Cut cost by 50%"]);
  });

  it("flags layout features that break ATS parsers", () => {
    const body = "\\begin{tabular}{ll}a&b\\end{tabular}\\begin{multicols}{2}x\\end{multicols}\\includegraphics{me.png}\\faGithub \\begin{tikzpicture}\\end{tikzpicture}";
    expect(parseResume(doc(body, "\\usepackage{fontawesome5}\n")).layout).toEqual({ tables: true, columns: true, graphics: true, icons: true, positioned: true });
  });

  it("keeps the label of \\href and remembers the link, and finds a mailto address", () => {
    const p = parseResume(doc("\\href{mailto:a.b@uni.edu}{Email me} and \\href{https://example.com/x}{my site}"));
    expect(p.text).toContain("Email me and my site");
    expect(p.emails).toEqual(["a.b@uni.edu"]);
    expect(p.links).toEqual(["https://example.com/x"]);
  });

  it("works on a fragment with no \\begin{document}, and handles nested styling and escapes", () => {
    const p = parseResume("\\section{Projects}\n\\item \\textbf{\\emph{R\\&D}} tool for 2\\,000 users \\$5 saved");
    expect(p.sections[0]!.name).toBe("Projects");
    expect(p.bullets[0]).toContain("R&D tool");
    expect(p.bullets[0]).toContain("$5 saved");
  });

  it("does not hang or throw on malformed input", () => {
    for (const bad of ["\\href{", "\\section{", "{{{{", "\\item", "\\begin{document}", "\\\\\\\\", ""]) expect(() => parseResume(bad)).not.toThrow();
  });
});
