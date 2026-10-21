import type { CareerPreferences, CodeLanguageId, PlacementProfile, SkillAssessment } from "../types.js";
import type { CareerSignals } from "./match.js";

/**
 * Builds the matching engine's inputs from what the student already has in UNBLUFF. Nothing is invented: a role with no
 * entry in ROLE_CATEGORIES contributes no category, a practice result with no corresponding job skill contributes no
 * skill, and a skill only counts as verified when a verified result backs it.
 */

/** Freehire category slugs that each UNBLUFF target role corresponds to. Roles not listed here map to nothing. */
export const ROLE_CATEGORIES: Record<string, string[]> = {
  frontend_developer: ["frontend", "fullstack", "software_engineering"],
};

/** Categories that are close to one another, for partial credit. */
export const RELATED_CATEGORIES: Record<string, string[]> = {
  software_engineering: ["backend", "frontend", "fullstack", "mobile"],
  frontend: ["fullstack", "software_engineering", "mobile"],
  backend: ["fullstack", "software_engineering"],
  fullstack: ["frontend", "backend", "software_engineering"],
  mobile: ["frontend", "software_engineering"],
  ml_ai: ["ai_engineering", "data_science"],
  ai_engineering: ["ml_ai", "data_science", "software_engineering"],
  data_science: ["ml_ai", "ai_engineering", "data_analytics"],
  data_engineering: ["data_analytics", "backend"],
  data_analytics: ["data_science", "data_engineering"],
  devops: ["sre", "backend"],
  sre: ["devops", "backend"],
  security: ["devops", "network_engineering"],
};

/** UNBLUFF interview skill ids (from the role catalogue) to Freehire skill slugs. A skill with no slug there maps to nothing. */
const INTERVIEW_SKILLS: Record<string, string[]> = {
  js_fundamentals: ["javascript"],
  react_state: ["react"],
  rest_apis: ["rest", "api"],
  responsive_css: ["html", "css"],
  accessibility: ["accessibility"],
  git: ["git"],
};

const LANGUAGE_SKILL: Record<CodeLanguageId, string> = { python: "python", javascript: "javascript", cpp: "cpp", java: "java" } as Record<CodeLanguageId, string>;

export interface SignalInputs {
  profile: PlacementProfile | null;
  skills: SkillAssessment[] | null; // null: the student's results could not be read
  prefs: CareerPreferences | null;
  /** Skill slugs the student confirmed from their own resume. */
  resumeSkills?: string[];
}

export interface DerivedProfile {
  signals: CareerSignals;
  derived_categories: string[];
  verified_skills: string[];
  resume_skills: string[];
  self_reported_skills: string[];
  notes: string[]; // what limits personalization, in plain words
}

export function verifiedSkillSlugs(skills: SkillAssessment[]): string[] {
  const out = new Set<string>();
  for (const s of skills) {
    if (s.evidence.provenance !== "verified" || (s.status !== "strong" && s.status !== "developing")) continue;
    if (s.area === "dbms") out.add("sql"); // a passed DBMS quiz is verified knowledge of databases and SQL
    const m = /^interview:[a-z0-9_]+:([a-z0-9_]+)$/.exec(s.area);
    if (m) for (const slug of INTERVIEW_SKILLS[m[1]!] ?? []) out.add(slug);
  }
  return [...out].sort();
}

export function deriveSignals(input: SignalInputs): DerivedProfile {
  const { profile, skills, prefs, resumeSkills = [] } = input;
  const notes: string[] = [];

  const primary = new Set<string>();
  for (const id of profile?.role_ids ?? []) for (const c of ROLE_CATEGORIES[id] ?? []) primary.add(c);
  for (const c of prefs?.categories ?? []) primary.add(c);
  const related = new Set<string>();
  for (const c of primary) for (const r of RELATED_CATEGORIES[c] ?? []) if (!primary.has(r)) related.add(r);

  const verified = new Set(skills ? verifiedSkillSlugs(skills) : []);
  const self = new Set<string>(prefs?.skills ?? []);
  if (profile?.preferred_language && LANGUAGE_SKILL[profile.preferred_language]) self.add(LANGUAGE_SKILL[profile.preferred_language]);
  const resume = new Set<string>(resumeSkills);
  for (const v of verified) {
    self.delete(v); // a skill is counted once, under the strongest evidence behind it
    resume.delete(v);
  }
  for (const r of resume) self.delete(r);

  if (!profile) notes.push("You have not set placement goals, so your target role and experience level are unknown.");
  else if (!profile.experience_level) notes.push("Your experience level is not set, so early-career roles are assumed.");
  if (primary.size === 0) notes.push("No target role category: choose one in your career preferences.");
  if (verified.size === 0 && self.size === 0 && resume.size === 0) notes.push("No skills to compare yet: upload your resume in Memory, add skills in your career preferences, or practise to build verified results.");
  if (skills === null) notes.push("Your practice results could not be read just now, so verified skills are not included.");
  if (!prefs) notes.push("You have not saved career preferences (location, work mode, employment type).");

  return {
    signals: {
      experience: profile?.experience_level ?? null,
      categories: { primary: [...primary], related: [...related] },
      skills: { verified, resume, self },
      prefs,
      target_companies: profile?.target_companies ?? [],
    },
    derived_categories: [...primary],
    verified_skills: [...verified].sort(),
    resume_skills: [...resume].sort(),
    self_reported_skills: [...self].sort(),
    notes,
  };
}
