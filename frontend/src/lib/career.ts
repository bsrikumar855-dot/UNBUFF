import type { CareerApplicationStatus, CareerEmployment, CareerJob, CareerMatch, CareerPreferences, CareerSalary, CareerSeniority, CareerTab, CareerWorkMode } from "@/types/contract";

export const FEED_TABS: { value: CareerTab; label: string; blurb: string }[] = [
  { value: "for_you", label: "For you", blurb: "Ranked against your own goals, skills and preferences." },
  { value: "internships", label: "Internships", blurb: "Postings Freehire classifies as internships." },
  { value: "jobs", label: "Jobs", blurb: "Full-time roles at intern or junior level." },
  { value: "explore", label: "Explore", blurb: "Search the whole catalogue with your own filters." },
];
export type CareerTabValue = CareerTab | "saved" | "applications";
export const ALL_TABS: { value: CareerTabValue; label: string }[] = [...FEED_TABS.map((t) => ({ value: t.value as CareerTabValue, label: t.label })), { value: "saved", label: "Saved" }, { value: "applications", label: "Applications" }];
export const isTab = (v: string | null): v is CareerTabValue => ALL_TABS.some((t) => t.value === v);

export const STATUSES: { value: CareerApplicationStatus; label: string }[] = [
  { value: "saved", label: "Saved" },
  { value: "interested", label: "Interested" },
  { value: "applied", label: "Applied" },
  { value: "interviewing", label: "Interviewing" },
  { value: "offer", label: "Offer" },
  { value: "rejected", label: "Rejected" },
  { value: "withdrawn", label: "Withdrawn" },
];
export const statusLabel = (s: CareerApplicationStatus | null) => STATUSES.find((x) => x.value === s)?.label ?? "No status";

/** The same moves the server allows (see STATUS_TRANSITIONS on the backend); the server is the authority. */
export const NEXT_STATUSES: Record<CareerApplicationStatus | "none", CareerApplicationStatus[]> = {
  none: ["saved", "interested", "applied"],
  saved: ["interested", "applied", "withdrawn"],
  interested: ["saved", "applied", "withdrawn"],
  applied: ["interested", "interviewing", "offer", "rejected", "withdrawn"],
  interviewing: ["applied", "offer", "rejected", "withdrawn"],
  offer: ["withdrawn", "rejected"],
  rejected: ["interested"],
  withdrawn: ["interested"],
};

export const WORK_MODES: CareerWorkMode[] = ["remote", "hybrid", "onsite"];
export const SENIORITIES: CareerSeniority[] = ["intern", "junior", "middle", "senior", "lead"];
export const EMPLOYMENT: CareerEmployment[] = ["internship", "full_time", "part_time", "contract", "fellowship"];

export const words = (slug: string) => slug.replace(/[_-]/g, " ");
export const sentenceCase = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
export const employmentLabel = (e: CareerEmployment | null) => (e ? sentenceCase(e.replace("_", "-")) : null);

export function formatSalary(s: CareerSalary | null): string | null {
  if (!s || (s.min === null && s.max === null)) return null;
  const n = (v: number) => v.toLocaleString("en-US");
  const range = s.min !== null && s.max !== null && s.min !== s.max ? `${n(s.min)} to ${n(s.max)}` : n((s.min ?? s.max) as number);
  return `${range}${s.currency ? ` ${s.currency.toUpperCase()}` : ""}${s.period ? ` per ${s.period}` : ""}`;
}

const DAY = 86_400_000;
export function postedText(job: CareerJob, now: Date = new Date()): string | null {
  if (!job.posted_at) return null;
  const days = Math.floor((now.getTime() - Date.parse(job.posted_at)) / DAY);
  if (days <= 0) return "Posted today";
  if (days === 1) return "Posted yesterday";
  if (days < 60) return `Posted ${days} days ago`;
  return `Posted ${new Date(job.posted_at).toLocaleDateString()}`;
}

/** What Freehire says about whether a posting is current. Never a claim that it is open. */
export function freshnessText(job: CareerJob): string | null {
  const r = job.reality;
  const parts: string[] = [];
  if (r?.class === "fresh") parts.push("Freehire rates this posting fresh");
  else if (r?.class === "stale") parts.push("Freehire rates this posting stale (old)");
  else if (r?.class === "likely-evergreen") parts.push("Freehire thinks this may be an always-open pipeline ad");
  if (r?.fake_freshness) parts.push("its posting date looks refreshed rather than real");
  if (r?.repost_count && r.repost_count > 1) parts.push(`reposted ${r.repost_count} times`);
  if (job.ghost_level) parts.push("flagged as possibly not an active opening");
  if (job.closed_at) parts.push(`Freehire records it as closed on ${new Date(job.closed_at).toLocaleDateString()}`);
  return parts.length ? `${sentenceCase(parts.join("; "))}.` : null;
}

export function matchSummary(m: CareerMatch): string {
  if (m.score === null) return "Not scored";
  return `${m.score} / 100`;
}
export const confidenceText = (m: CareerMatch) => (m.confidence === "insufficient" ? "not enough information" : `${m.confidence} confidence`);

/** Whether a link is safe to open: https only. The server already filters, and this is the last check before an anchor is drawn. */
export function safeHref(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && !u.username && !u.password ? u.toString() : null;
  } catch {
    return null;
  }
}

export interface CareerFilters {
  q: string;
  search_in: "all" | "title" | "company";
  category: string[];
  skills: string[];
  countries: string[];
  cities: string[];
  work_mode: string[];
  seniority: string[];
  employment_type: string[];
  include_stale: boolean;
  tech_only: boolean;
  broaden: boolean;
  posted_within_days: number | null;
  salary_min: number | null;
  /** null: the tab's own default (Internships and Jobs rank by match, Explore keeps Freehire's order). */
  sort: "best_match" | "newest" | null;
}
export const DEFAULT_FILTERS: CareerFilters = { q: "", search_in: "all", category: [], skills: [], countries: [], cities: [], work_mode: [], seniority: [], employment_type: [], include_stale: false, tech_only: true, broaden: false, posted_within_days: null, salary_min: null, sort: null };

export interface ActiveFilter {
  key: string;
  label: string;
  clear: (f: CareerFilters) => CareerFilters;
}
/** The visible chips for everything the student has changed from the default. */
export function activeFilters(f: CareerFilters, tab: CareerTab): ActiveFilter[] {
  const out: ActiveFilter[] = [];
  const add = (key: string, label: string, clear: (x: CareerFilters) => CareerFilters) => out.push({ key, label, clear });
  if (f.q.trim()) add("q", `Search: ${f.q.trim()}${f.search_in !== "all" ? ` (${f.search_in})` : ""}`, (x) => ({ ...x, q: "", search_in: "all" }));
  for (const c of f.category) add(`category:${c}`, `Category: ${words(c)}`, (x) => ({ ...x, category: x.category.filter((v) => v !== c) }));
  for (const s of f.skills) add(`skill:${s}`, `Skill: ${s}`, (x) => ({ ...x, skills: x.skills.filter((v) => v !== s) }));
  for (const c of f.countries) add(`country:${c}`, `Country: ${c.toUpperCase()}`, (x) => ({ ...x, countries: x.countries.filter((v) => v !== c) }));
  for (const c of f.cities) add(`city:${c}`, `City: ${c}`, (x) => ({ ...x, cities: x.cities.filter((v) => v !== c) }));
  for (const w of f.work_mode) add(`work:${w}`, `Work mode: ${w}`, (x) => ({ ...x, work_mode: x.work_mode.filter((v) => v !== w) }));
  if (tab !== "jobs" || f.seniority.length > 0) for (const s of f.seniority) add(`sen:${s}`, `Seniority: ${s}`, (x) => ({ ...x, seniority: x.seniority.filter((v) => v !== s) }));
  if (tab === "explore") for (const e of f.employment_type) add(`emp:${e}`, `Type: ${e.replace("_", "-")}`, (x) => ({ ...x, employment_type: x.employment_type.filter((v) => v !== e) }));
  if (f.include_stale) add("stale", "Including older postings", (x) => ({ ...x, include_stale: false }));
  if (!f.tech_only) add("tech", "All role types", (x) => ({ ...x, tech_only: true }));
  if (f.broaden && tab === "jobs") add("broaden", "Including mid-level roles", (x) => ({ ...x, broaden: false }));
  if (f.posted_within_days) add("posted", `Posted in the last ${f.posted_within_days} days`, (x) => ({ ...x, posted_within_days: null }));
  if (f.sort) add("sort", f.sort === "newest" ? "Order: newest first" : "Order: best match", (x) => ({ ...x, sort: null }));
  if (f.salary_min) add("salary", `Salary stated and at least ${f.salary_min.toLocaleString("en-US")}`, (x) => ({ ...x, salary_min: null }));
  return out;
}

export const splitList = (s: string): string[] => [...new Set(s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean))];

export const EMPTY_PREFERENCES: CareerPreferences = { categories: [], skills: [], countries: [], cities: [], work_modes: [], employment_types: [], must_match_location: false, must_match_work_mode: false, must_match_employment: false };
