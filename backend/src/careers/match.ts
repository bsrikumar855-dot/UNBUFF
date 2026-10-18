import type { CareerComponentKey, CareerComponentState, CareerJob, CareerMatch, CareerMatchComponent, CareerPreferences, CareerSeniority, PlacementExperience } from "../types.js";

/**
 * Deterministic, explainable matching of one posting against one student's own profile. The same profile and posting
 * always give the same result: no model, no randomness, no clock. The result is a comparison of stated facts, never a
 * probability of an interview or an offer.
 *
 * How it works
 *  - Six components, each with a fixed weight (MATCH_WEIGHTS). Each component is "applicable" when the student has given
 *    something to compare (a skill, a target category, a location preference ...) and "known" when the posting states
 *    the matching field.
 *  - A component that is applicable but unknown is NOT a mismatch. It is left out of the score and lowers confidence.
 *  - score = 100 * sum(weight * value) / sum(weight), over applicable and known components only. With less than
 *    MIN_KNOWN_WEIGHT of evidence the score is null ("insufficient"), not a made-up number.
 *  - Mandatory preferences (must_match_*) are hard constraints: a posting known to violate one is flagged in
 *    hard_mismatches (and filtered out of "For You"); a posting whose data cannot confirm one is flagged in
 *    unverified_constraints.
 */

export const MATCH_WEIGHTS: Record<CareerComponentKey, number> = {
  skills: 0.35,
  category: 0.25,
  seniority: 0.2,
  location: 0.1,
  work_mode: 0.05,
  employment: 0.05,
};
export const MIN_KNOWN_WEIGHT = 0.4;
/** A skill the student demonstrated through verified results counts fully; one they only stated counts less. */
export const SKILL_CREDIT = { verified: 1, resume: 0.7, self_reported: 0.7 } as const;
/** A posting that lists many skills is compared against at most this many, so a long list is not an impossible bar. */
export const SKILL_DENOMINATOR_CAP = 6;

export interface CareerSignals {
  experience: PlacementExperience | null;
  /** Categories the student is targeting (from their roles and their own choices), and categories close to those. */
  categories: { primary: string[]; related: string[] };
  /** verified: backed by graded results. resume: confirmed from the student's own resume. self: typed or implied by their profile. */
  skills: { verified: Set<string>; resume: Set<string>; self: Set<string> };
  prefs: CareerPreferences | null;
  target_companies: string[];
}

const LABEL: Record<CareerComponentKey, string> = {
  skills: "Skills",
  category: "Role category",
  seniority: "Experience level",
  location: "Location",
  work_mode: "Work mode",
  employment: "Employment type",
};

/** How suitable each seniority is for a student at each self-reported level, 0..1. */
const SENIORITY_FIT: Record<PlacementExperience, Record<CareerSeniority, number>> = {
  beginner: { intern: 1, junior: 1, middle: 0.3, senior: 0, lead: 0, staff: 0, principal: 0, c_level: 0 },
  intermediate: { intern: 0.8, junior: 1, middle: 0.8, senior: 0.2, lead: 0, staff: 0, principal: 0, c_level: 0 },
  advanced: { intern: 0.2, junior: 0.8, middle: 1, senior: 0.8, lead: 0.3, staff: 0.1, principal: 0, c_level: 0 },
};
/** Years of experience a posting may ask for before it stops being a fair fit for each level. */
const YEARS_BAND: Record<PlacementExperience, number> = { beginner: 1, intermediate: 3, advanced: 8 };

const norm = (s: string) => s.trim().toLowerCase();

interface Part {
  applicable: boolean;
  value: number | null; // null: unknown
  note: string;
  notSetNote?: string;
}

function skillsPart(job: CareerJob, s: CareerSignals): { part: Part; matched: CareerMatch["matched_skills"]; missing: string[] } {
  const all = new Set([...s.skills.verified, ...s.skills.resume, ...s.skills.self]);
  if (all.size === 0) return { part: { applicable: false, value: null, note: "", notSetNote: "No skills to compare yet: add some in your career preferences, or practise to build verified results." }, matched: [], missing: [] };
  if (job.skills.length === 0) return { part: { applicable: true, value: null, note: "The posting lists no skills, so skills cannot be compared." }, matched: [], missing: [] };
  const matched: CareerMatch["matched_skills"] = [];
  const missing: string[] = [];
  let credit = 0;
  for (const skill of job.skills) {
    if (s.skills.verified.has(skill)) {
      matched.push({ skill, provenance: "verified" });
      credit += SKILL_CREDIT.verified;
    } else if (s.skills.resume.has(skill)) {
      matched.push({ skill, provenance: "resume" });
      credit += SKILL_CREDIT.resume;
    } else if (s.skills.self.has(skill)) {
      matched.push({ skill, provenance: "self_reported" });
      credit += SKILL_CREDIT.self_reported;
    } else missing.push(skill);
  }
  const denom = Math.min(Math.max(job.skills.length, 1), SKILL_DENOMINATOR_CAP);
  const value = Math.min(1, credit / denom);
  const note = matched.length === 0 ? `None of the ${job.skills.length} listed skills is in your profile.` : `${matched.length} of ${job.skills.length} listed skills are in your profile.`;
  return { part: { applicable: true, value, note }, matched, missing: missing.slice(0, 6) };
}

function categoryPart(job: CareerJob, s: CareerSignals): Part {
  if (s.categories.primary.length === 0 && s.categories.related.length === 0) return { applicable: false, value: null, note: "", notSetNote: "No target role category yet: choose a target role or categories." };
  if (!job.category) return { applicable: true, value: null, note: "The posting does not state a role category." };
  if (s.categories.primary.includes(job.category)) return { applicable: true, value: 1, note: `The ${label(job.category)} category is one you target.` };
  if (s.categories.related.includes(job.category)) return { applicable: true, value: 0.6, note: `${cap(label(job.category))} is close to a category you target.` };
  return { applicable: true, value: 0, note: `${cap(label(job.category))} is not a category you target.` };
}

function seniorityPart(job: CareerJob, s: CareerSignals): Part {
  const level = s.experience ?? "beginner";
  const assumed = s.experience === null ? " (assuming early career: your experience level is not set)" : "";
  if (!job.seniority && job.employment_type !== "internship") return { applicable: true, value: null, note: "The posting does not state a seniority level." };
  // A posting stated as an internship is suitable for a student whatever its seniority label says.
  let value = job.seniority ? SENIORITY_FIT[level][job.seniority] : 1;
  if (job.employment_type === "internship" && level !== "advanced") value = Math.max(value, 1);
  const years = job.experience_years_min;
  if (years !== null) {
    const band = YEARS_BAND[level];
    if (years > band + 2) value = 0;
    else if (years > band) value = Math.min(value, 0.3);
  }
  const bits = [job.seniority ? `${job.seniority.replace("_", "-")} level` : "internship", years !== null ? `${years}+ years asked` : null].filter(Boolean).join(", ");
  return { applicable: true, value, note: `${cap(bits)}${assumed}.` };
}

const set = (l: string[] | undefined) => new Set((l ?? []).map(norm));

function locationPart(job: CareerJob, s: CareerSignals): Part {
  const p = s.prefs;
  const countries = set(p?.countries);
  const cities = set(p?.cities);
  if (countries.size === 0 && cities.size === 0) return { applicable: false, value: null, note: "", notSetNote: "No preferred country or city set." };
  const jobCountries = set(job.countries);
  const jobCities = set(job.cities);
  const wantsRemote = (p?.work_modes ?? []).includes("remote");
  const known = jobCountries.size > 0 || jobCities.size > 0 || job.work_mode === "remote";
  if (!known) return { applicable: true, value: null, note: "The posting does not state where the job is." };
  if ([...cities].some((c) => jobCities.has(c))) return { applicable: true, value: 1, note: "The listed city matches one you chose." };
  if ([...countries].some((c) => jobCountries.has(c))) return { applicable: true, value: 1, note: "The listed country matches one you chose." };
  if (job.work_mode === "remote" && wantsRemote) {
    if (jobCountries.size === 0) return { applicable: true, value: 1, note: "Remote, with no country restriction listed." };
    return { applicable: true, value: 0.5, note: `Remote, but listed for ${[...jobCountries].join(", ").toUpperCase()}: whether you are eligible is not confirmed.` };
  }
  return { applicable: true, value: 0, note: `Listed for ${[...jobCountries, ...jobCities].join(", ") || "another place"}, not a place you chose.` };
}

function workModePart(job: CareerJob, s: CareerSignals): Part {
  const want = s.prefs?.work_modes ?? [];
  if (want.length === 0) return { applicable: false, value: null, note: "", notSetNote: "No preferred work mode set." };
  if (!job.work_mode) return { applicable: true, value: null, note: "The posting does not state remote, hybrid or onsite." };
  return want.includes(job.work_mode) ? { applicable: true, value: 1, note: `${cap(job.work_mode)}, as you prefer.` } : { applicable: true, value: 0, note: `${cap(job.work_mode)}; you prefer ${want.join(" or ")}.` };
}

function employmentPart(job: CareerJob, s: CareerSignals): Part {
  const want = s.prefs?.employment_types ?? [];
  if (want.length === 0) return { applicable: false, value: null, note: "", notSetNote: "No preferred employment type set." };
  if (!job.employment_type) return { applicable: true, value: null, note: "The posting does not state an employment type." };
  const label = job.employment_type.replace("_", "-");
  return want.includes(job.employment_type) ? { applicable: true, value: 1, note: `${cap(label)}, as you prefer.` } : { applicable: true, value: 0, note: `${cap(label)}; you prefer ${want.map((w) => w.replace("_", "-")).join(" or ")}.` };
}

const label = (slug: string) => slug.replace(/_/g, " ");
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function matchJob(job: CareerJob, signals: CareerSignals): CareerMatch {
  const sk = skillsPart(job, signals);
  const parts: Record<CareerComponentKey, Part> = {
    skills: sk.part,
    category: categoryPart(job, signals),
    seniority: seniorityPart(job, signals),
    location: locationPart(job, signals),
    work_mode: workModePart(job, signals),
    employment: employmentPart(job, signals),
  };

  const components: CareerMatchComponent[] = (Object.keys(parts) as CareerComponentKey[]).map((key) => {
    const p = parts[key];
    const state: CareerComponentState = !p.applicable ? "not_set" : p.value === null ? "unknown" : p.value >= 0.99 ? "match" : p.value > 0 ? "partial" : "mismatch";
    return { key, label: LABEL[key], weight: MATCH_WEIGHTS[key], state, value: p.value, note: p.applicable ? p.note : (p.notSetNote ?? "") };
  });

  const applicable = components.filter((c) => c.state !== "not_set");
  const known = applicable.filter((c) => c.value !== null);
  const knownWeight = known.reduce((a, c) => a + c.weight, 0);
  const applicableWeight = applicable.reduce((a, c) => a + c.weight, 0);
  const enough = known.length >= 2 && knownWeight >= MIN_KNOWN_WEIGHT;
  const score = enough ? Math.round((100 * known.reduce((a, c) => a + c.weight * (c.value ?? 0), 0)) / knownWeight) : null;
  const coverage = applicableWeight > 0 ? knownWeight / applicableWeight : 0;
  const confidence: CareerMatch["confidence"] = !enough ? "insufficient" : coverage >= 0.8 && knownWeight >= 0.7 ? "high" : coverage >= 0.6 && knownWeight >= 0.5 ? "medium" : "low";

  // hard constraints, from the student's own "must match" switches
  const hard: string[] = [];
  const unverified: string[] = [];
  const p = signals.prefs;
  const constraint = (on: boolean | undefined, key: CareerComponentKey, name: string) => {
    if (!on) return;
    const c = components.find((x) => x.key === key)!;
    if (c.state === "not_set") return;
    if (c.value === null) unverified.push(`${name}: the posting does not say, so this cannot be confirmed.`);
    else if (c.value === 0) hard.push(`${name}: ${c.note}`);
    else if (key === "location" && c.value < 1) unverified.push(`${name}: ${c.note}`);
  };
  constraint(p?.must_match_location, "location", "Location");
  constraint(p?.must_match_work_mode, "work_mode", "Work mode");
  constraint(p?.must_match_employment, "employment", "Employment type");

  const reasons: string[] = [];
  for (const c of components) if (c.state === "match" || c.state === "partial") reasons.push(`${c.label}: ${c.note}`);
  if (sk.matched.length > 0) reasons.unshift(`Matches your skills: ${sk.matched.slice(0, 5).map((m) => `${m.skill} (${m.provenance === "verified" ? "verified" : m.provenance === "resume" ? "from your resume" : "self-reported"})`).join(", ")}.`);
  const company = job.company ? norm(job.company) : "";
  if (company && signals.target_companies.some((t) => norm(t) === company)) reasons.push("This is a company you listed as a target.");
  if (!enough) reasons.push("Not enough information to score this posting against your profile.");

  return {
    score,
    confidence,
    matched_skills: sk.matched,
    missing_skills: sk.missing,
    components,
    reasons: dedupe(reasons).slice(0, 8),
    hard_mismatches: hard,
    unverified_constraints: unverified,
  };
}

const dedupe = (l: string[]) => [...new Set(l)];

/**
 * How much of what the student gave us to compare the posting actually states, 0..1: the weight of the known
 * components over the weight of the applicable ones. It is the same evidence the confidence label reflects.
 */
export function evidenceCoverage(match: CareerMatch): number {
  const applicable = match.components.filter((c) => c.state !== "not_set");
  const total = applicable.reduce((a, c) => a + c.weight, 0);
  if (total === 0) return 0;
  return applicable.filter((c) => c.value !== null).reduce((a, c) => a + c.weight, 0) / total;
}

/** The order key: the score, discounted for how little the posting states. The displayed score is never changed. */
export const rankValue = (m: CareerMatch): number | null => (m.score === null ? null : m.score * (0.5 + 0.5 * evidenceCoverage(m)));

/**
 * Best match first. A posting that states more ranks above one with the same score that states little, so a sparse
 * posting is not promoted to the top by a score built from a few fields. Unscored postings go last, newer before older,
 * then by title so the order is stable.
 */
export function compareMatches(a: { job: CareerJob; match: CareerMatch }, b: { job: CareerJob; match: CareerMatch }): number {
  const sa = rankValue(a.match);
  const sb = rankValue(b.match);
  if (sa !== null && sb !== null && sa !== sb) return sb - sa;
  if ((sa === null) !== (sb === null)) return sa === null ? 1 : -1;
  const ta = a.job.posted_at ? Date.parse(a.job.posted_at) : 0;
  const tb = b.job.posted_at ? Date.parse(b.job.posted_at) : 0;
  if (ta !== tb) return tb - ta;
  return a.job.title.localeCompare(b.job.title) || a.job.slug.localeCompare(b.job.slug);
}
