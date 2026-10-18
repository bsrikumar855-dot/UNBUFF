import { describe, expect, it } from "vitest";
import { htmlToText, normalizeJob, safeHttpsUrl } from "../../src/careers/normalize.js";
import { rawJob } from "../careers/fakes.js";

describe("turning external text into safe plain text", () => {
  it("strips markup, scripts and styles, and decodes entities", () => {
    const t = htmlToText('<p>Hello &amp; welcome</p><script>alert(1)</script><style>p{x:y}</style><ul><li>One</li><li>Two &lt;3</li></ul>', 500)!;
    expect(t).toContain("Hello & welcome");
    expect(t).toContain("- One");
    expect(t).not.toMatch(/alert|p\{x:y\}/);
    expect(t).not.toMatch(/[<>]/);
  });

  it("leaves no angle brackets even when entities decode into markup", () => {
    const t = htmlToText("&lt;img src=x onerror=alert(1)&gt; &#60;script&#62;bad&#60;/script&#62;", 500)!;
    expect(t).not.toMatch(/[<>]/);
  });

  it("drops control characters, bounds the length and returns null for nothing", () => {
    expect(htmlToText("a\u0000b\u0007c", 50)).toBe("a b c");
    const long = htmlToText("x".repeat(1000), 100)!;
    expect(long.length).toBe(100);
    expect(long.endsWith("…")).toBe(true);
    expect(htmlToText("   <br>  ", 50)).toBeNull();
    expect(htmlToText(undefined, 50)).toBeNull();
  });
});

describe("links to the original posting", () => {
  it("accepts only plain https links", () => {
    expect(safeHttpsUrl("https://boards.example.com/jobs/1?utm_source=freehire.me")).toBe("https://boards.example.com/jobs/1?utm_source=freehire.me");
    for (const bad of ["http://example.com/x", "javascript:alert(1)", "data:text/html,x", "ftp://example.com", "https://user:pw@example.com/x", "https://localhost/x", "//example.com", "not a url", "", null, undefined]) {
      expect(safeHttpsUrl(bad as string | null | undefined), String(bad)).toBeNull();
    }
    expect(safeHttpsUrl(`https://example.com/${"a".repeat(2000)}`)).toBeNull();
  });
});

describe("normalizing a posting", () => {
  it("keeps what upstream stated and builds stable ids and links", () => {
    const j = normalizeJob(rawJob());
    expect(j).toMatchObject({
      id: "freehire:react-intern-acme-abc123",
      slug: "react-intern-acme-abc123",
      source: "freehire",
      title: "React Intern",
      company: "Acme Labs",
      work_mode: "hybrid",
      seniority: "intern",
      employment_type: "internship",
      category: "frontend",
      experience_years_min: 0,
      skills: ["react", "javascript", "css"],
      countries: ["in"],
      freehire_url: "https://freehire.me/jobs/react-intern-acme-abc123",
      apply_url: "https://boards.example.com/acme/jobs/1?utm_source=freehire.me",
      summary: "A frontend internship.",
    });
    expect(j.preview).toBe("Build UI with React.");
    expect(j.requirements).toEqual([{ text: "Knows React basics", priority: "required" }]);
    expect(j.reality).toEqual({ class: "fresh", age_days: 1, repost_count: 1, fake_freshness: false });
    expect(j.posted_at).toBe("2026-10-17T08:00:00Z");
    expect(j.closed_at).toBeNull();
  });

  it("is null or empty, never made up, for everything a posting does not state", () => {
    const j = normalizeJob({ public_slug: "bare", title: "Developer" } as never);
    expect(j).toMatchObject({ company: null, location: null, work_mode: null, seniority: null, employment_type: null, category: null, experience_years_min: null, salary: null, summary: null, preview: null, apply_url: null, reality: null, ghost_level: null, posted_at: null });
    expect(j.skills).toEqual([]);
    expect(j.requirements).toEqual([]);
    expect(j.freehire_url).toBe("https://freehire.me/jobs/bare");
  });

  it("does not call a role entry-level because its title says developer: seniority comes only from the enrichment", () => {
    expect(normalizeJob(rawJob({ title: "Junior Developer", enrichment: {} })).seniority).toBeNull();
    expect(normalizeJob(rawJob({ title: "Developer", enrichment: { seniority: "senior" } })).seniority).toBe("senior");
  });

  it("ignores values outside the documented enumerations", () => {
    const j = normalizeJob(rawJob({ work_mode: "anywhere", enrichment: { seniority: "entry", employment_type: "volunteer", category: "" } }));
    expect(j.work_mode).toBeNull();
    expect(j.seniority).toBeNull();
    expect(j.employment_type).toBeNull();
    expect(j.category).toBeNull();
  });

  it("does not show an applicant-system id as if it were a company", () => {
    expect(normalizeJob(rawJob({ company: "8a7883d07acff70f017ad01dafc00000" })).company).toBeNull();
    expect(normalizeJob(rawJob({ company: "123e4567-e89b-12d3-a456-426614174000" })).company).toBeNull();
    expect(normalizeJob(rawJob({ company: "Acme" })).company).toBe("Acme");
  });

  it("reads salary only when it is stated, and passes a hedged ghost-job signal through as a level only", () => {
    expect(normalizeJob(rawJob()).salary).toBeNull();
    const j = normalizeJob(rawJob({ enrichment: { salary_min: 20000, salary_currency: "usd", salary_period: "month" }, ghost: { level: "possible", criteria: ["evergreen_posting"] } }));
    expect(j.salary).toEqual({ min: 20000, max: null, currency: "usd", period: "month" });
    expect(j.ghost_level).toBe("possible");
  });

  it("flags freshness exactly as reported and ignores unusable dates", () => {
    const j = normalizeJob(rawJob({ posted_at: "not a date", reality: { class: "stale", age_days: 200, fake_freshness: true }, closed_at: "2026-10-01T00:00:00Z" }));
    expect(j.posted_at).toBeNull();
    expect(j.reality).toMatchObject({ class: "stale", age_days: 200, fake_freshness: true });
    expect(j.closed_at).toBe("2026-10-01T00:00:00Z");
  });

  it("turns hostile text in a title or requirement into harmless plain text", () => {
    const j = normalizeJob(rawJob({ title: "<img src=x onerror=alert(1)>Dev", enrichment: { requirements: [{ text: "<script>x()</script>Know Git", priority: "required" }, { text: "", priority: "required" }, "junk"] } }));
    expect(j.title).not.toMatch(/[<>]/);
    expect(j.requirements).toEqual([{ text: "Know Git", priority: "required" }]);
  });
});
