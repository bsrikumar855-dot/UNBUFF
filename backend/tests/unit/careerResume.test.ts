import { describe, expect, it } from "vitest";
import { MAX_RESUME_CHARS, MAX_RESUME_SKILLS, SKILL_VOCABULARY, extractResumeSkills, isKnownSkill, skillLabel } from "../../src/careers/resumeSkills.js";
import { MATCH_WEIGHTS, SKILL_CREDIT, matchJob, type CareerSignals } from "../../src/careers/match.js";
import { normalizeJob } from "../../src/careers/normalize.js";
import { CareerService } from "../../src/careers/service.js";
import { MemoryCareerStore } from "../../src/careers/store.js";
import { deriveSignals } from "../../src/careers/signals.js";
import { ApiError } from "../../src/errors.js";
import { fakeFreehire, fakePlacement, profile, rawJob, verifiedReact } from "../careers/fakes.js";
import { silentLogger } from "../helpers.js";

const slugs = (text: string) => extractResumeSkills(text).map((s) => s.slug);
const code = async (p: Promise<unknown> | (() => unknown)) => (typeof p === "function" ? Promise.resolve().then(p) : p).then(() => "ok", (e: unknown) => (e instanceof ApiError ? e.code : "other"));

describe("finding skills in resume text", () => {
  it("recognises common spellings, including symbols, and maps them to Freehire slugs", () => {
    const found = slugs("Skills: JavaScript, TypeScript, C++, C#, Node.js, Next.js, PostgreSQL, CI/CD, Power BI, .NET, scikit-learn, Google Cloud, Amazon Web Services");
    for (const s of ["javascript", "typescript", "cpp", "csharp", "nodejs", "nextjs", "postgresql", "ci-cd", "powerbi", "dotnet", "scikit-learn", "gcp", "aws"]) expect(found, s).toContain(s);
  });

  it("keeps similar names apart", () => {
    expect(slugs("Java developer")).toEqual(["java"]);
    expect(slugs("JavaScript and TypeScript")).toEqual(expect.not.arrayContaining(["java"]));
    expect(slugs("MySQL, NoSQL, PostgreSQL")).toEqual(expect.not.arrayContaining(["sql"]));
    expect(slugs("SQL queries")).toContain("sql");
    expect(slugs("Used GitHub for version control")).toEqual(["github"]);
    expect(slugs("Used Git and GitHub")).toEqual(expect.arrayContaining(["git", "github"]));
    expect(slugs("Built apps with React Native")).toEqual(["react-native"]);
    expect(slugs("React and React Native")).toEqual(expect.arrayContaining(["react", "react-native"]));
    expect(slugs("Kubernetes (k8s)")).toEqual(["kubernetes"]);
  });

  it("does not mistake ordinary words for languages: they need their exact capitalisation, and bare go, c and r are not matched", () => {
    expect(slugs("I will go to the store and ruby is a gem, rust never sleeps, swift reply, dart board, scala")).toEqual([]);
    expect(slugs("Wrote services in Swift, Rust, Ruby, Dart and Scala")).toEqual(expect.arrayContaining(["swift", "rust", "ruby", "dart", "scala"]));
    expect(slugs("Written in Go and C and R")).toEqual([]);
    expect(slugs("Wrote Golang services")).toEqual(["go"]);
    expect(slugs("Used node and express to manage the graph of nodes, and to express interest")).toEqual([]);
    expect(slugs("Used Node.js and Express.js")).toEqual(expect.arrayContaining(["nodejs", "express"]));
  });

  it("counts mentions, orders by them, and shows where the first one was found", () => {
    const r = extractResumeSkills("Built a Python tool. Later used Python for data work, plus SQL.\nPython again.");
    expect(r.map((s) => s.slug)).toEqual(["python", "sql"]);
    expect(r[0]).toMatchObject({ slug: "python", label: "Python", mentions: 3 });
    expect(r[0]!.evidence).toContain("Python");
    expect(r[0]!.evidence).not.toContain("\n");
  });

  it("keeps contact details out of the evidence snippet", () => {
    const r = extractResumeSkills("Jane Doe jane.doe@example.com +91 98765 43210 https://jane.dev/portfolio Python developer");
    const e = r.find((s) => s.slug === "python")!.evidence;
    expect(e).not.toMatch(/example\.com|98765|jane\.dev/);
    expect(e).toContain("Python");
  });

  it("is bounded and safe on odd, huge or hostile input", () => {
    expect(extractResumeSkills("")).toEqual([]);
    expect(extractResumeSkills("   \n\t ")).toEqual([]);
    expect(extractResumeSkills("<script>alert(1)</script> React")[0]!.evidence).toBeTruthy();
    expect(extractResumeSkills("Python\u0000\u0007 Java".repeat(3)).length).toBeGreaterThan(0);
    const started = Date.now();
    const big = extractResumeSkills(`${"lorem ipsum dolor sit amet ".repeat(5000)} Python`);
    expect(Date.now() - started).toBeLessThan(2000);
    expect(big.length).toBeLessThanOrEqual(MAX_RESUME_SKILLS);
    // text past the limit is ignored rather than scanned
    expect(extractResumeSkills(`${"x ".repeat(MAX_RESUME_CHARS)} Python`)).toEqual([]);
    const all = SKILL_VOCABULARY.map((v) => v.aliases[0]).join(" ");
    expect(extractResumeSkills(all).length).toBeLessThanOrEqual(MAX_RESUME_SKILLS);
  });

  it("has a well-formed vocabulary: unique slugs, valid slug shape, a label and at least one alias each", () => {
    const seen = new Set<string>();
    for (const v of SKILL_VOCABULARY) {
      expect(v.slug, v.slug).toMatch(/^[a-z0-9][a-z0-9_.+#-]{0,63}$/);
      expect(seen.has(v.slug), `duplicate ${v.slug}`).toBe(false);
      seen.add(v.slug);
      expect(v.label.length).toBeGreaterThan(0);
      expect(v.aliases.length).toBeGreaterThan(0);
      expect(isKnownSkill(v.slug)).toBe(true);
      expect(skillLabel(v.slug)).toBe(v.label);
    }
    expect(isKnownSkill("not-a-skill")).toBe(false);
    expect(skillLabel("not-a-skill")).toBe("not-a-skill");
  });

  it("finds each vocabulary skill by its first alias (no alias is dead)", () => {
    for (const v of SKILL_VOCABULARY) expect(slugs(`Experience with ${v.aliases[0]} in projects.`), v.slug).toContain(v.slug);
  });
});

function service() {
  const freehire = fakeFreehire();
  const store = new MemoryCareerStore();
  const career = new CareerService({ freehire, store, placement: fakePlacement({ skills: [verifiedReact] }), logger: silentLogger, now: () => new Date("2026-10-18T10:00:00Z") });
  return { career, store, freehire };
}

describe("reviewing and saving skills from a resume", () => {
  const RESUME = "Frontend intern. Built apps with React, TypeScript and CSS. Used Git, Docker and PostgreSQL. jane@example.com";

  it("extracting stores nothing and makes no request to Freehire", async () => {
    const { career, store, freehire } = service();
    const r = career.extractFromResume(RESUME);
    expect(r.skills.map((s) => s.slug)).toEqual(expect.arrayContaining(["react", "typescript", "css", "git", "docker", "postgresql"]));
    expect(r.text_chars).toBe(RESUME.length);
    expect(r.vocabulary_size).toBe(SKILL_VOCABULARY.length);
    expect(await store.getResume("u1")).toBeNull();
    expect(freehire.searches).toHaveLength(0);
    expect(JSON.stringify(r)).not.toContain("jane@example.com");
  });

  it("rejects empty or oversized text", () => {
    const { career } = service();
    expect(() => career.extractFromResume("   ")).toThrow(/no resume text/);
    expect(() => career.extractFromResume("x".repeat(MAX_RESUME_CHARS + 1))).toThrow(/too long/);
  });

  it("keeps only the skills the student confirms, never the resume, and replaces them on each save", async () => {
    const { career, store } = service();
    const saved = await career.saveResumeSkills("u1", ["react", "css", "react"]);
    expect(saved.skills).toEqual([{ slug: "react", label: "React" }, { slug: "css", label: "CSS" }]);
    expect(saved.saved_at).toBe("2026-10-18T10:00:00.000Z");
    expect(JSON.stringify(await store.getResume("u1"))).not.toMatch(/Frontend intern|jane/);
    expect((await career.saveResumeSkills("u1", ["python"])).skills).toEqual([{ slug: "python", label: "Python" }]);
    expect((await career.resumeSkills("u1")).skills.map((s) => s.slug)).toEqual(["python"]);
    expect(await career.saveResumeSkills("u1", [])).toEqual({ skills: [], saved_at: null });
    expect(await store.getResume("u1")).toBeNull();
  });

  it("refuses a skill this app does not recognise, so nothing arbitrary is stored", async () => {
    const { career, store } = service();
    expect(await code(career.saveResumeSkills("u1", ["react", "<script>"]))).toBe("BAD_REQUEST");
    expect(await code(career.saveResumeSkills("u1", ["made-up-skill"]))).toBe("BAD_REQUEST");
    expect(await store.getResume("u1")).toBeNull();
  });

  it("keeps each student's resume skills private and deletable", async () => {
    const { career } = service();
    await career.saveResumeSkills("alice", ["react"]);
    expect((await career.resumeSkills("bob")).skills).toEqual([]);
    await career.deleteResumeSkills("bob");
    expect((await career.resumeSkills("alice")).skills).toHaveLength(1);
    await career.deleteAll("alice");
    expect((await career.resumeSkills("alice")).skills).toEqual([]);
    await career.saveResumeSkills("alice", ["git"]);
    await career.deleteResumeSkills("alice");
    expect((await career.resumeSkills("alice")).saved_at).toBeNull();
  });

  it("shows confirmed skills in the preferences response, apart from verified and typed ones", async () => {
    const { career } = service();
    await career.saveResumeSkills("u1", ["react", "docker", "css"]);
    await career.putPreferences("u1", { categories: [], skills: ["python", "docker"], countries: [], cities: [], work_modes: [], employment_types: [], must_match_location: false, must_match_work_mode: false, must_match_employment: false });
    const p = (await career.preferences("u1")).profile;
    expect(p.verified_skills).toEqual(["react"]); // strongest evidence wins: react is verified
    expect(p.resume_skills).toEqual(["css", "docker"]);
    expect(p.self_reported_skills).toEqual(["javascript", "python"]); // docker is counted once, under the resume
    expect(p.resume_skills_saved_at).toBe("2026-10-18T10:00:00.000Z");
  });
});

describe("resume skills in matching", () => {
  const signals = (resume: string[], over: Partial<CareerSignals["skills"]> = {}): CareerSignals => ({
    experience: "beginner",
    categories: { primary: ["frontend"], related: [] },
    skills: { verified: new Set(), resume: new Set(resume), self: new Set(), ...over },
    prefs: null,
    target_companies: [],
  });
  const job = normalizeJob(rawJob({ skills: ["react", "css"] }));

  it("counts a resume skill as a stated skill (0.7), labelled as from the resume, below a verified one", () => {
    const m = matchJob(job, signals(["react", "css"]));
    expect(m.matched_skills).toEqual([{ skill: "react", provenance: "resume" }, { skill: "css", provenance: "resume" }]);
    expect(m.components.find((c) => c.key === "skills")!.value).toBeCloseTo((2 * SKILL_CREDIT.resume) / 2, 10);
    const verified = matchJob(job, signals([], { verified: new Set(["react", "css"]) }));
    expect(verified.components.find((c) => c.key === "skills")!.value).toBe(1);
    expect(m.reasons.join(" ")).toMatch(/react \(from your resume\)/);
    expect(SKILL_CREDIT.resume).toBeLessThan(SKILL_CREDIT.verified);
    expect(Object.values(MATCH_WEIGHTS).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
  });

  it("makes a student with only resume skills scoreable, and never treats them as verified", () => {
    const d = deriveSignals({ profile: profile({ preferred_language: null }), skills: [], prefs: null, resumeSkills: ["react"] });
    expect(d.verified_skills).toEqual([]);
    expect(d.resume_skills).toEqual(["react"]);
    expect(d.notes.join(" ")).not.toMatch(/No skills to compare yet/);
    expect(matchJob(job, d.signals).score).not.toBeNull();
  });

  it("prefers the strongest evidence when a skill is in several places", () => {
    const d = deriveSignals({ profile: profile(), skills: [verifiedReact], prefs: null, resumeSkills: ["react", "css"] });
    expect(d.verified_skills).toEqual(["react"]);
    expect(d.resume_skills).toEqual(["css"]);
    const m = matchJob(job, d.signals);
    expect(m.matched_skills).toEqual([{ skill: "react", provenance: "verified" }, { skill: "css", provenance: "resume" }]);
  });

  it("points a student with no skills at the resume upload", () => {
    const d = deriveSignals({ profile: null, skills: null, prefs: null });
    expect(d.notes.join(" ")).toMatch(/upload your resume in Memory/);
  });
});
