import { describe, expect, it } from "vitest";
import { MATCH_WEIGHTS, compareMatches, evidenceCoverage, matchJob, rankValue, type CareerSignals } from "../../src/careers/match.js";
import { normalizeJob } from "../../src/careers/normalize.js";
import { deriveSignals, verifiedSkillSlugs } from "../../src/careers/signals.js";
import type { CareerPreferences } from "../../src/types.js";
import { demoOnly, profile, rawJob, verifiedDbms, verifiedReact, weakVerified } from "../careers/fakes.js";

const prefs = (over: Partial<CareerPreferences> = {}): CareerPreferences => ({ categories: [], skills: [], countries: [], cities: [], work_modes: [], employment_types: [], must_match_location: false, must_match_work_mode: false, must_match_employment: false, ...over });
const signals = (over: Partial<CareerSignals> = {}): CareerSignals => ({ experience: "beginner", categories: { primary: ["frontend"], related: ["fullstack"] }, skills: { verified: new Set(["react"]), resume: new Set<string>(), self: new Set(["javascript"]) }, prefs: prefs(), target_companies: [], ...over });
const job = (over: Record<string, unknown> = {}) => normalizeJob(rawJob(over));
const comp = (m: ReturnType<typeof matchJob>, key: string) => m.components.find((c) => c.key === key)!;

describe("the scoring model", () => {
  it("has weights that add up to one", () => {
    expect(Object.values(MATCH_WEIGHTS).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
  });

  it("is deterministic: the same profile and posting always give the same result", () => {
    const a = matchJob(job(), signals());
    for (let i = 0; i < 5; i++) expect(matchJob(job(), signals())).toEqual(a);
  });

  it("scores a clear match high and explains why", () => {
    const m = matchJob(job(), signals());
    expect(m.score).toBeGreaterThanOrEqual(75);
    expect(m.confidence).not.toBe("insufficient");
    expect(m.matched_skills).toEqual([{ skill: "react", provenance: "verified" }, { skill: "javascript", provenance: "self_reported" }]);
    expect(m.missing_skills).toEqual(["css"]);
    expect(m.reasons.join(" ")).toMatch(/react \(verified\)/);
    expect(comp(m, "category").state).toBe("match");
  });

  it("gives a verified skill more credit than one the student only stated", () => {
    const verified = matchJob(job({ skills: ["react"] }), signals({ skills: { verified: new Set(["react"]), resume: new Set<string>(), self: new Set() } }));
    const stated = matchJob(job({ skills: ["react"] }), signals({ skills: { verified: new Set(), resume: new Set<string>(), self: new Set(["react"]) } }));
    expect(comp(verified, "skills").value).toBe(1);
    expect(comp(stated, "skills").value).toBeCloseTo(0.7, 10);
    expect(verified.score!).toBeGreaterThan(stated.score!);
  });

  it("does not make a long skill list an impossible bar", () => {
    const many = ["react", "javascript", "a1", "b2", "c3", "d4", "e5", "f6", "g7", "h8"];
    const m = matchJob(job({ skills: many }), signals({ skills: { verified: new Set(["react"]), resume: new Set<string>(), self: new Set(["javascript"]) } }));
    expect(comp(m, "skills").value).toBeCloseTo(1.7 / 6, 5);
  });
});

describe("missing data is not a mismatch", () => {
  it("leaves an unknown component out of the score and lowers confidence instead of penalising", () => {
    const full = matchJob(job(), signals());
    const noCategory = matchJob(job({ enrichment: { employment_type: "internship", seniority: "intern" } }), signals());
    expect(comp(noCategory, "category").state).toBe("unknown");
    expect(comp(noCategory, "category").value).toBeNull();
    expect(noCategory.score).not.toBeNull();
    expect(noCategory.score!).toBeGreaterThanOrEqual(full.score! - 15); // not dragged down as if category were 0
    expect(["high", "medium", "low"]).toContain(noCategory.confidence);
  });

  it("returns no score, rather than a made-up one, when there is not enough to compare", () => {
    const bare = job({ skills: [], enrichment: {}, countries: [], cities: [], work_mode: null });
    const m = matchJob(bare, signals());
    expect(m.score).toBeNull();
    expect(m.confidence).toBe("insufficient");
    expect(m.reasons.join(" ")).toMatch(/not enough information/i);
  });

  it("returns no score for a student with nothing to compare, and says what is missing", () => {
    const m = matchJob(job(), signals({ categories: { primary: [], related: [] }, skills: { verified: new Set(), resume: new Set(), self: new Set() } }));
    expect(m.score).toBeNull();
    expect(comp(m, "skills").state).toBe("not_set");
    expect(comp(m, "skills").note).toMatch(/No skills/);
  });
});

describe("experience level", () => {
  it("suits a beginner to interns and juniors and not to senior roles", () => {
    const s = signals();
    expect(comp(matchJob(job(), s), "seniority").value).toBe(1);
    expect(comp(matchJob(job({ enrichment: { employment_type: "full_time", seniority: "junior", category: "frontend" } }), s), "seniority").value).toBe(1);
    expect(comp(matchJob(job({ enrichment: { employment_type: "full_time", seniority: "senior", category: "frontend" } }), s), "seniority").value).toBe(0);
    expect(comp(matchJob(job({ enrichment: { employment_type: "full_time", seniority: "lead", category: "frontend" } }), s), "seniority").value).toBe(0);
  });

  it("treats a stated internship as suitable even when its seniority label is not intern", () => {
    const m = matchJob(job({ enrichment: { employment_type: "internship", seniority: "senior", category: "frontend" } }), signals());
    expect(comp(m, "seniority").value).toBe(1);
  });

  it("does not assume every role labelled intern is an internship, nor the reverse", () => {
    const internLabelFullTime = matchJob(job({ enrichment: { employment_type: "full_time", seniority: "intern", category: "frontend" } }), signals({ prefs: prefs({ employment_types: ["internship"] }) }));
    expect(comp(internLabelFullTime, "employment").state).toBe("mismatch");
    const internshipWithoutLabel = matchJob(job({ enrichment: { employment_type: "internship", category: "frontend" } }), signals({ prefs: prefs({ employment_types: ["internship"] }) }));
    expect(comp(internshipWithoutLabel, "employment").state).toBe("match");
    expect(comp(internshipWithoutLabel, "seniority").value).toBe(1);
  });

  it("lowers fit when a posting asks for more experience than the student has", () => {
    const asks3 = matchJob(job({ enrichment: { employment_type: "full_time", seniority: "junior", experience_years_min: 3, category: "frontend" } }), signals());
    expect(comp(asks3, "seniority").value).toBe(0.3);
    const asks6 = matchJob(job({ enrichment: { employment_type: "full_time", seniority: "junior", experience_years_min: 6, category: "frontend" } }), signals());
    expect(comp(asks6, "seniority").value).toBe(0);
  });

  it("says when it had to assume early career, and uses the student's own level otherwise", () => {
    const assumed = matchJob(job(), signals({ experience: null }));
    expect(comp(assumed, "seniority").note).toMatch(/assuming early career/);
    const advanced = matchJob(job({ enrichment: { employment_type: "full_time", seniority: "senior", category: "frontend" } }), signals({ experience: "advanced" }));
    expect(comp(advanced, "seniority").value).toBe(0.8);
  });
});

describe("categories, location, work mode and employment type", () => {
  it("credits a related category partly and an unrelated one not at all", () => {
    expect(comp(matchJob(job({ enrichment: { employment_type: "internship", seniority: "intern", category: "fullstack" } }), signals()), "category").value).toBe(0.6);
    expect(comp(matchJob(job({ enrichment: { employment_type: "internship", seniority: "intern", category: "sales" } }), signals()), "category").value).toBe(0);
  });

  it("compares country and city, treats remote carefully, and leaves unknown places out", () => {
    const s = signals({ prefs: prefs({ countries: ["in"], work_modes: ["remote"] }) });
    expect(comp(matchJob(job(), s), "location").value).toBe(1);
    expect(comp(matchJob(job({ countries: ["us"], cities: [], work_mode: "onsite" }), s), "location").value).toBe(0);
    const remoteElsewhere = comp(matchJob(job({ countries: ["us"], cities: [], work_mode: "remote" }), s), "location");
    expect(remoteElsewhere.value).toBe(0.5);
    expect(remoteElsewhere.note).toMatch(/not confirmed/);
    expect(comp(matchJob(job({ countries: [], cities: [], work_mode: "remote" }), s), "location").value).toBe(1);
    expect(comp(matchJob(job({ countries: [], cities: [], work_mode: null }), s), "location").state).toBe("unknown");
    const city = signals({ prefs: prefs({ cities: ["bengaluru"] }) });
    expect(comp(matchJob(job({ countries: [] }), city), "location").value).toBe(1);
  });

  it("compares work mode and employment type only when the student chose, and when the posting says", () => {
    const s = signals({ prefs: prefs({ work_modes: ["remote"], employment_types: ["internship"] }) });
    const m = matchJob(job(), s);
    expect(comp(m, "work_mode").state).toBe("mismatch");
    expect(comp(m, "employment").state).toBe("match");
    expect(comp(matchJob(job({ work_mode: null }), s), "work_mode").state).toBe("unknown");
    expect(comp(matchJob(job(), signals()), "work_mode").state).toBe("not_set");
  });
});

describe("mandatory preferences", () => {
  it("flags a posting known to break one, flags one that cannot be confirmed, and passes the rest", () => {
    const s = signals({ prefs: prefs({ work_modes: ["remote"], must_match_work_mode: true, countries: ["in"], must_match_location: true }) });
    const broken = matchJob(job(), s); // hybrid in India
    expect(broken.hard_mismatches.join(" ")).toMatch(/Work mode/);
    const unknown = matchJob(job({ work_mode: null }), s);
    expect(unknown.hard_mismatches).toHaveLength(0);
    expect(unknown.unverified_constraints.join(" ")).toMatch(/Work mode: the posting does not say/);
    const fine = matchJob(job({ work_mode: "remote" }), s);
    expect(fine.hard_mismatches).toHaveLength(0);
    expect(fine.unverified_constraints).toHaveLength(0);
  });

  it("only treats a preference as mandatory when the student switched it on", () => {
    const s = signals({ prefs: prefs({ work_modes: ["remote"] }) });
    expect(matchJob(job(), s).hard_mismatches).toHaveLength(0);
  });

  it("notes a remote posting whose eligibility is unconfirmed for a mandatory location", () => {
    const s = signals({ prefs: prefs({ countries: ["in"], work_modes: ["remote"], must_match_location: true }) });
    const m = matchJob(job({ countries: ["us"], cities: [], work_mode: "remote" }), s);
    expect(m.hard_mismatches).toHaveLength(0);
    expect(m.unverified_constraints.join(" ")).toMatch(/not confirmed/);
  });
});

describe("ordering", () => {
  it("puts the best match first, unscored postings last, then newer before older", () => {
    const strong = { job: job({ public_slug: "a" }), match: matchJob(job(), signals()) };
    const weak = { job: job({ public_slug: "b", skills: ["rust"] }), match: matchJob(job({ skills: ["rust"] }), signals()) };
    const none = { job: job({ public_slug: "c", skills: [], enrichment: {}, countries: [], cities: [], work_mode: null }), match: matchJob(job({ skills: [], enrichment: {}, countries: [], cities: [], work_mode: null }), signals()) };
    const newer = { job: job({ public_slug: "d", posted_at: "2026-10-18T00:00:00Z" }), match: strong.match };
    const sorted = [none, weak, strong, newer].sort(compareMatches).map((x) => x.job.slug);
    expect(sorted).toEqual(["d", "a", "b", "c"]);
  });

  it("does not let a posting that states little outrank one that states more at a similar score", () => {
    const s = signals({ prefs: prefs({ countries: ["in"], work_modes: ["remote", "hybrid"], employment_types: ["internship"] }) });
    const sparse = job({ public_slug: "sparse", skills: [], countries: [], cities: [], work_mode: null, enrichment: { employment_type: "internship", seniority: "intern", category: "frontend" } });
    const rich = job({ public_slug: "rich", skills: ["react", "javascript", "typescript", "css"] });
    const ms = matchJob(sparse, s);
    const mr = matchJob(rich, s);
    expect(ms.score!).toBeGreaterThanOrEqual(mr.score!); // the raw comparison of the few stated fields is perfect...
    expect(evidenceCoverage(ms)).toBeLessThan(evidenceCoverage(mr));
    expect([{ job: sparse, match: ms }, { job: rich, match: mr }].sort(compareMatches).map((x) => x.job.slug)).toEqual(["rich", "sparse"]); // ...but it is ranked below
    expect(rankValue(ms)!).toBeLessThan(ms.score!); // only the order key is discounted: the displayed score is the raw one
  });

  it("measures evidence coverage from the components the student gave something to compare", () => {
    const m = matchJob(job(), signals());
    expect(evidenceCoverage(m)).toBe(1);
    expect(evidenceCoverage({ ...m, components: m.components.map((c) => ({ ...c, state: "not_set" as const, value: null })) })).toBe(0);
  });

  it("is stable for equal postings", () => {
    const m = matchJob(job(), signals());
    const x = { job: job({ public_slug: "x", title: "Alpha" }), match: m };
    const y = { job: job({ public_slug: "y", title: "Beta" }), match: m };
    expect([y, x].sort(compareMatches).map((i) => i.job.slug)).toEqual(["x", "y"]);
  });
});

describe("building signals from the student's own record", () => {
  it("counts only verified results with a real status as verified skills, mapped to job skill slugs", () => {
    expect(verifiedSkillSlugs([verifiedReact, verifiedDbms, weakVerified, demoOnly])).toEqual(["react", "sql"]);
  });

  it("derives categories from the student's roles and choices, and a skill is counted once", () => {
    const d = deriveSignals({ profile: profile(), skills: [verifiedReact], prefs: prefs({ skills: ["react", "python"], categories: ["backend"] }) });
    expect(d.derived_categories.sort()).toEqual(["backend", "frontend", "fullstack", "software_engineering"]);
    expect(d.verified_skills).toEqual(["react"]);
    expect(d.self_reported_skills).toEqual(["javascript", "python"]); // react is only counted as verified; the profile's language adds javascript
  });

  it("invents nothing for an unknown role or missing data, and says what limits personalization", () => {
    const d = deriveSignals({ profile: null, skills: null, prefs: null });
    expect(d.signals.categories.primary).toEqual([]);
    expect(d.signals.skills.verified.size + d.signals.skills.self.size).toBe(0);
    expect(d.notes.join(" ")).toMatch(/not set placement goals/);
    expect(d.notes.join(" ")).toMatch(/could not be read/);
    const other = deriveSignals({ profile: profile({ role_ids: ["unknown_role"], preferred_language: null }), skills: [], prefs: null });
    expect(other.derived_categories).toEqual([]);
    expect(other.signals.experience).toBe("beginner");
  });
});

describe("confidence reflects how much the posting states", () => {
  it("is low when only a few of the compared fields are stated, even if they all match", () => {
    const s = signals({ prefs: prefs({ countries: ["in"], work_modes: ["remote", "hybrid"], employment_types: ["internship"] }) });
    const sparse = matchJob(job({ skills: [], countries: [], cities: [], work_mode: null, enrichment: { employment_type: "internship", seniority: "intern", category: "frontend" } }), s);
    expect(sparse.score).toBe(100);
    expect(sparse.confidence).toBe("low");
    const rich = matchJob(job(), s);
    expect(["high", "medium"]).toContain(rich.confidence);
  });
});
