import { z } from "zod";
import { ApiError } from "../errors.js";
import type { Logger } from "../logger.js";
import { addDays, diffDays, isValidYmd, ymd } from "../placement/dates.js";
import type {
  CareerApplicationStatus,
  CareerEmployment,
  CareerFacetsResponse,
  CareerFeedResponse,
  CareerJob,
  CareerJobCard,
  CareerJobDetailResponse,
  CareerPreferences,
  CareerPreferencesResponse,
  CareerSeniority,
  CareerSourceInfo,
  CareerTab,
  CareerTracker,
  CareerTrackedItem,
  CareerTrackedResponse,
  CareerTrackerUpdate,
  CareerWorkMode,
  PlacementDashboard,
  PlacementProfileResponse,
  ResumeSkillsExtractResponse,
  ResumeSkillsResponse,
} from "../types.js";
import {
  EMPLOYMENT_TYPES,
  FACET_NAMES,
  FREEHIRE_API,
  FREEHIRE_SITE,
  FreehireError,
  MAX_DEPTH,
  WORK_MODES,
  describeFilters,
  serializeQuery,
  type FreehireClient,
  type FreehireQuery,
  type FreehireSearchResult,
} from "./freehire.js";
import { compareMatches, matchJob, type CareerSignals } from "./match.js";
import { descriptionText, normalizeJob } from "./normalize.js";
import { MAX_RESUME_CHARS, MAX_RESUME_SKILLS, SKILL_VOCABULARY, extractResumeSkills, isKnownSkill, skillLabel } from "./resumeSkills.js";
import { deriveSignals, type DerivedProfile } from "./signals.js";
import { SAFE_SLUG, type CareerStore, type TrackedRecord } from "./store.js";

/**
 * The Career service: discovery through Freehire's public API, deterministic matching against the student's own
 * profile, and a private bookmark and application tracker. Job data is read live and never copied wholesale into
 * UNBLUFF's storage. If Freehire cannot answer, callers get an error, never invented listings.
 */

export const SOURCE: CareerSourceInfo = { name: "Freehire", url: FREEHIRE_SITE, api: FREEHIRE_API };

/** Statuses a student can move to from each state. `null` is "no status yet". Backward moves exist to correct mistakes. */
export const STATUS_TRANSITIONS: Record<CareerApplicationStatus | "none", CareerApplicationStatus[]> = {
  none: ["saved", "interested", "applied"],
  saved: ["interested", "applied", "withdrawn"],
  interested: ["saved", "applied", "withdrawn"],
  applied: ["interested", "interviewing", "offer", "rejected", "withdrawn"],
  interviewing: ["applied", "offer", "rejected", "withdrawn"],
  offer: ["withdrawn", "rejected"],
  rejected: ["interested"],
  withdrawn: ["interested"],
};

export const FEED_DEFAULT_LIMIT = 20;
export const FEED_MAX_LIMIT = 50;
/** For You scores the best candidates from this many upstream rows per group, not the whole catalogue. */
export const FOR_YOU_WINDOW = 60;
/** Best-match ordering of a tab scores this many of Freehire's most recent results (its maximum page size). */
export const RANK_WINDOW = 100;
const TRACKED_LIMIT = 500;
const SEARCH_TTL_MS = 60_000;
const FACET_TTL_MS = 10 * 60_000;
const CACHE_MAX = 300;

export interface FeedParams {
  q?: string;
  search_in?: "all" | "title" | "company";
  category?: string[];
  skills?: string[];
  skills_mode?: "and";
  countries?: string[];
  cities?: string[];
  work_mode?: CareerWorkMode[];
  seniority?: CareerSeniority[];
  employment_type?: CareerEmployment[];
  include_stale?: boolean;
  tech_only?: boolean;
  posted_within_days?: number;
  salary_min?: number;
  broaden?: boolean;
  /** "best_match" ranks the most recent candidates locally; "newest" passes Freehire's own order through. */
  sort?: "best_match" | "newest";
  offset?: number;
  limit?: number;
}

export interface CareerPlacementPort {
  getProfile(uid: string): Promise<PlacementProfileResponse>;
  dashboard(uid: string): Promise<PlacementDashboard>;
}

export interface CareerDeps {
  freehire: Pick<FreehireClient, "search" | "getJob" | "facets">;
  store: CareerStore;
  placement: CareerPlacementPort;
  logger: Logger;
  now?: () => Date;
}

export const PreferencesSchema = z.strictObject({
  categories: z.array(z.string().trim().toLowerCase().regex(/^[a-z0-9_]{1,40}$/, "invalid category")).max(6),
  skills: z.array(z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9_.+#-]{0,63}$/, "invalid skill")).max(20),
  countries: z.array(z.string().trim().toLowerCase().regex(/^[a-z]{2}$/, "use two-letter country codes like in or us")).max(8),
  cities: z.array(z.string().trim().min(1).max(60)).max(8),
  work_modes: z.array(z.enum(WORK_MODES)).max(3),
  employment_types: z.array(z.enum(EMPLOYMENT_TYPES)).max(5),
  must_match_location: z.boolean(),
  must_match_work_mode: z.boolean(),
  must_match_employment: z.boolean(),
});

const dedupe = <T,>(l: T[]): T[] => [...new Set(l)];
// eslint-disable-next-line no-control-regex -- strips control characters from student-typed notes
const stripControl = (s: string) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");

export class CareerService {
  private readonly cache = new Map<string, { at: number; value: unknown }>();

  constructor(private readonly deps: CareerDeps) {}

  private now(): Date {
    return this.deps.now ? this.deps.now() : new Date();
  }

  // ---------------- upstream access (cached, errors mapped) ----------------

  private async cached<T>(key: string, ttl: number, load: () => Promise<T>): Promise<T> {
    const hit = this.cache.get(key);
    const t = this.now().getTime();
    if (hit && t - hit.at < ttl) return hit.value as T;
    const value = await load();
    this.cache.set(key, { at: t, value });
    if (this.cache.size > CACHE_MAX) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    return value;
  }

  private upstream(err: unknown): never {
    if (err instanceof FreehireError) {
      this.deps.logger.warn({ kind: err.kind }, "career: upstream request failed");
      if (err.kind === "rate_limited") throw new ApiError("CAREER_RATE_LIMITED", err.retryAfterSeconds ? `The job source is limiting requests. Try again in about ${err.retryAfterSeconds} seconds.` : "The job source is limiting requests. Try again shortly.");
      if (err.kind === "not_found") throw new ApiError("CAREER_JOB_NOT_FOUND", "That listing could not be found. It may have been removed.");
      if (err.kind === "rejected") throw new ApiError("BAD_REQUEST", err.message);
      throw new ApiError("CAREER_UNAVAILABLE", "The job source could not be reached or answered unexpectedly. Nothing was changed; try again in a moment.");
    }
    throw err;
  }

  private async search(query: FreehireQuery): Promise<FreehireSearchResult> {
    try {
      serializeQuery(query); // validates against the documented grammar (and the paging depth) before anything is sent
      const key = `s:${JSON.stringify(query)}`;
      return await this.cached(key, SEARCH_TTL_MS, () => this.deps.freehire.search(query));
    } catch (e) {
      return this.upstream(e);
    }
  }

  // ---------------- the student's profile ----------------

  private async derive(uid: string): Promise<{ derived: DerivedProfile; prefs: CareerPreferences | null; roleNames: string[]; placementDate: string | null; resumeSavedAt: string | null }> {
    const [prefsRec, profileRes, resumeRec] = await Promise.all([this.deps.store.getPrefs(uid), this.deps.placement.getProfile(uid).catch(() => null), this.deps.store.getResume(uid)]);
    const skills = await this.deps.placement.dashboard(uid).then((d) => d.skills.skills).catch(() => null);
    const prefs = prefsRec?.preferences ?? null;
    const derived = deriveSignals({ profile: profileRes?.profile ?? null, skills, prefs, resumeSkills: (resumeRec?.skills ?? []).map((s) => s.slug) });
    const roleNames = (profileRes?.profile?.role_ids ?? []).map((id) => profileRes?.roles.find((r) => r.id === id)?.name ?? id);
    return { derived, prefs, roleNames, placementDate: profileRes?.profile?.placement_date ?? null, resumeSavedAt: resumeRec?.saved_at ?? null };
  }

  async preferences(uid: string): Promise<CareerPreferencesResponse> {
    const rec = await this.deps.store.getPrefs(uid);
    const { derived, roleNames, placementDate, resumeSavedAt } = await this.derive(uid);
    const profileRes = await this.deps.placement.getProfile(uid).catch(() => null);
    return {
      preferences: rec?.preferences ?? null,
      updated_at: rec?.updated_at ?? null,
      profile: {
        role_names: roleNames,
        experience_level: profileRes?.profile?.experience_level ?? null,
        derived_categories: derived.derived_categories,
        verified_skills: derived.verified_skills,
        resume_skills: derived.resume_skills,
        resume_skills_saved_at: resumeSavedAt,
        self_reported_skills: derived.self_reported_skills,
        target_companies: profileRes?.profile?.target_companies ?? [],
        placement_date: placementDate,
      },
    };
  }

  async putPreferences(uid: string, raw: unknown): Promise<CareerPreferencesResponse> {
    const r = PreferencesSchema.safeParse(raw);
    if (!r.success) throw new ApiError("BAD_REQUEST", r.error.issues.map((i) => `${i.path.join(".") || "preferences"}: ${i.message}`).join("; "));
    const p = r.data;
    const preferences: CareerPreferences = {
      ...p,
      categories: dedupe(p.categories),
      skills: dedupe(p.skills),
      countries: dedupe(p.countries),
      cities: dedupe(p.cities),
      work_modes: dedupe(p.work_modes),
      employment_types: dedupe(p.employment_types),
    };
    const now = this.now().toISOString();
    const prev = await this.deps.store.getPrefs(uid);
    await this.deps.store.savePrefs({ owner_uid: uid, preferences, created_at: prev?.created_at ?? now, updated_at: now });
    return this.preferences(uid);
  }

  // ---------------- skills from the student's own resume ----------------

  /**
   * Finds known skills in resume text and returns them for the student to review. Nothing is stored and the text is
   * not logged: only skills the student confirms afterwards are kept, and never the resume itself.
   */
  extractFromResume(text: string): ResumeSkillsExtractResponse {
    const t = text.trim();
    if (t.length === 0) throw new ApiError("BAD_REQUEST", "There is no resume text to read. Upload a PDF or paste your resume.");
    if (t.length > MAX_RESUME_CHARS) throw new ApiError("BAD_REQUEST", `The resume text is too long (at most ${MAX_RESUME_CHARS.toLocaleString("en-US")} characters).`);
    return { skills: extractResumeSkills(t), text_chars: t.length, vocabulary_size: SKILL_VOCABULARY.length };
  }

  async resumeSkills(uid: string): Promise<ResumeSkillsResponse> {
    const rec = await this.deps.store.getResume(uid);
    return { skills: rec?.skills ?? [], saved_at: rec?.saved_at ?? null };
  }

  /** Replaces the student's confirmed resume skills. Only skills this app can recognise are accepted, so nothing arbitrary is stored. */
  async saveResumeSkills(uid: string, slugs: string[]): Promise<ResumeSkillsResponse> {
    const unique = [...new Set(slugs)];
    const unknown = unique.filter((s) => !isKnownSkill(s));
    if (unknown.length > 0) throw new ApiError("BAD_REQUEST", `Unknown skill: ${unknown.slice(0, 3).join(", ")}.`);
    if (unique.length > MAX_RESUME_SKILLS) throw new ApiError("BAD_REQUEST", `At most ${MAX_RESUME_SKILLS} skills can be saved.`);
    if (unique.length === 0) {
      await this.deps.store.deleteResume(uid);
      return { skills: [], saved_at: null };
    }
    const savedAt = this.now().toISOString();
    const skills = unique.map((slug) => ({ slug, label: skillLabel(slug) }));
    await this.deps.store.saveResume({ owner_uid: uid, skills, saved_at: savedAt });
    return { skills, saved_at: savedAt };
  }

  async deleteResumeSkills(uid: string): Promise<void> {
    await this.deps.store.deleteResume(uid);
  }

  // ---------------- feeds ----------------

  /** The documented upstream query for a tab, from the student's own filters. */
  private queryFor(tab: CareerTab, p: FeedParams, base: Partial<FreehireQuery> = {}): FreehireQuery {
    const q: FreehireQuery = { ...base };
    const text = p.q?.trim();
    if (text) {
      q.q = text;
      if (p.search_in === "title") q.q_fields = ["title"];
      else if (p.search_in === "company") q.q_fields = ["company"];
    }
    if (p.category?.length) q.category = p.category;
    if (p.skills?.length) {
      q.skills = p.skills;
      if (p.skills_mode === "and") q.skills_mode = "and";
    }
    if (p.countries?.length) q.countries = p.countries;
    if (p.cities?.length) q.cities = p.cities;
    if (p.work_mode?.length) q.work_mode = p.work_mode;
    if (p.tech_only !== false) q.is_tech = "tech";
    if (!p.include_stale) q.reality = ["fresh"];
    if (p.posted_within_days) q.posted_within_days = p.posted_within_days;
    if (p.salary_min) q.salary_min = p.salary_min;
    if (tab === "internships") {
      q.employment_type = ["internship"]; // employment type is the semantic; seniority is NOT required to be "intern"
      if (p.seniority?.length) q.seniority = p.seniority;
    } else if (tab === "jobs") {
      q.employment_type = p.employment_type?.length ? p.employment_type.filter((e) => e !== "internship") : ["full_time"];
      if (q.employment_type.length === 0) q.employment_type = ["full_time"];
      q.seniority = p.seniority?.length ? p.seniority : p.broaden ? ["intern", "junior", "middle"] : ["intern", "junior"];
    } else {
      if (p.employment_type?.length) q.employment_type = p.employment_type;
      if (p.seniority?.length) q.seniority = p.seniority;
    }
    return q;
  }

  private card(job: CareerJob, signals: CareerSignals, tracked: Map<string, TrackedRecord>): CareerJobCard {
    const rec = tracked.get(job.slug);
    return { job, match: matchJob(job, signals), tracker: rec ? this.toTracker(rec) : null };
  }

  private async trackedMap(uid: string): Promise<Map<string, TrackedRecord>> {
    const list = await this.deps.store.listTracked(uid, TRACKED_LIMIT);
    return new Map(list.map((r) => [r.slug, r]));
  }

  async feed(uid: string, tab: CareerTab, params: FeedParams): Promise<CareerFeedResponse> {
    const limit = Math.min(Math.max(params.limit ?? FEED_DEFAULT_LIMIT, 1), FEED_MAX_LIMIT);
    const offset = Math.max(params.offset ?? 0, 0);
    const [{ derived, prefs }, tracked] = await Promise.all([this.derive(uid), this.trackedMap(uid)]);
    const signals = derived.signals;
    const personalization = this.personalization(derived, prefs);

    if (tab === "for_you") return this.forYou(params, limit, offset, signals, personalization, tracked, prefs);

    // Internships and Jobs rank by default; Explore passes Freehire's own order through unless the student asks to rank.
    const ranked = tab === "explore" ? params.sort === "best_match" : params.sort !== "newest";
    if (ranked) return this.rankedFeed(tab, params, limit, offset, signals, personalization, tracked);

    const query = this.queryFor(tab, params, { limit, offset });
    const res = await this.search(query);
    const jobs = res.jobs.map((raw) => this.card(normalizeJob(raw), signals, tracked));
    return {
      tab,
      jobs,
      total: res.meta.total,
      limit,
      offset,
      has_more: res.meta.total !== null ? offset + res.jobs.length < Math.min(res.meta.total, MAX_DEPTH) : res.jobs.length === limit && offset + limit < MAX_DEPTH,
      ranked_window: null,
      filters: describeFilters(query),
      relaxed: [],
      ignored_params: res.meta.ignored_params,
      personalization,
      source: SOURCE,
      fetched_at: this.now().toISOString(),
    };
  }

  /** One Freehire request for the most recent candidates, scored and ordered here, then paged over locally. */
  private async rankedFeed(tab: CareerTab, p: FeedParams, limit: number, offset: number, signals: CareerSignals, personalization: CareerFeedResponse["personalization"], tracked: Map<string, TrackedRecord>): Promise<CareerFeedResponse> {
    const query = this.queryFor(tab, p, { limit: RANK_WINDOW, offset: 0 });
    const res = await this.search(query);
    const cards = res.jobs.map((raw) => this.card(normalizeJob(raw), signals, tracked));
    // A posting known to break a must-have goes after everything else rather than disappearing: this is a browsing tab.
    cards.sort((a, b) => (a.match.hard_mismatches.length > 0 ? 1 : 0) - (b.match.hard_mismatches.length > 0 ? 1 : 0) || compareMatches(a, b));
    return {
      tab,
      jobs: cards.slice(offset, offset + limit),
      total: res.meta.total,
      limit,
      offset,
      has_more: offset + limit < cards.length,
      ranked_window: cards.length,
      filters: describeFilters(query),
      relaxed: [],
      ignored_params: res.meta.ignored_params,
      personalization,
      source: SOURCE,
      fetched_at: this.now().toISOString(),
    };
  }

  private personalization(d: DerivedProfile, prefs: CareerPreferences | null): CareerFeedResponse["personalization"] {
    const s = d.signals;
    const hasCategory = s.categories.primary.length > 0;
    const hasSkills = s.skills.verified.size + s.skills.self.size > 0;
    const level = hasCategory && hasSkills && s.experience ? "full" : !hasCategory && !hasSkills && !prefs ? "none" : "limited";
    return { level, notes: d.notes };
  }

  private async forYou(p: FeedParams, limit: number, offset: number, signals: CareerSignals, personalization: CareerFeedResponse["personalization"], tracked: Map<string, TrackedRecord>, prefs: CareerPreferences | null): Promise<CareerFeedResponse> {
    const wanted = prefs?.employment_types.length ? prefs.employment_types : (["internship", "full_time"] as CareerEmployment[]);
    const level = signals.experience ?? "beginner";
    const band: CareerSeniority[] = level === "beginner" ? ["intern", "junior"] : level === "intermediate" ? ["intern", "junior", "middle"] : ["junior", "middle", "senior"];
    const categories = dedupe([...signals.categories.primary, ...signals.categories.related]);

    const base: Partial<FreehireQuery> = { limit: FOR_YOU_WINDOW, offset: 0 };
    if (prefs?.must_match_location) {
      if (prefs.countries.length) base.countries = prefs.countries;
      if (prefs.cities.length) base.cities = prefs.cities;
    }
    if (prefs?.must_match_work_mode && prefs.work_modes.length) base.work_mode = prefs.work_modes;

    const groups: Partial<FreehireQuery>[] = [];
    // Internships are selected by employment type alone: upstream's seniority label is not reliable for them.
    if (wanted.includes("internship")) groups.push({ employment_type: ["internship"] });
    const others = wanted.filter((e) => e !== "internship");
    if (others.length) groups.push({ employment_type: others, seniority: p.seniority?.length ? p.seniority : band });

    const relaxed: string[] = [];
    const run = async (useCategories: boolean) => {
      const results: { query: FreehireQuery; res: FreehireSearchResult }[] = [];
      for (const g of groups) {
        const query = this.queryFor("for_you", { ...p, category: useCategories && categories.length ? categories : undefined, employment_type: undefined, seniority: undefined }, { ...base, ...g });
        results.push({ query, res: await this.search(query) });
      }
      return results;
    };
    let results = await run(true);
    if (results.every((r) => r.res.jobs.length === 0) && categories.length > 0) {
      results = await run(false);
      relaxed.push("category");
    }

    const seen = new Set<string>();
    const cards: CareerJobCard[] = [];
    for (const { res } of results) {
      for (const raw of res.jobs) {
        if (seen.has(raw.public_slug)) continue;
        seen.add(raw.public_slug);
        cards.push(this.card(normalizeJob(raw), signals, tracked));
      }
    }
    // A job known to break a mandatory preference is left out of recommendations (the student can still find it in Explore).
    const eligible = cards.filter((c) => c.match.hard_mismatches.length === 0);
    eligible.sort((a, b) => compareMatches(a, b));
    const page = eligible.slice(offset, offset + limit);
    const totals = results.map((r) => r.res.meta.total);
    const total = totals.every((t) => t !== null) ? (totals as number[]).reduce((a, b) => a + b, 0) : null;
    const ignored = results.flatMap((r) => r.res.meta.ignored_params);
    return {
      tab: "for_you",
      jobs: page,
      total,
      limit,
      offset,
      has_more: offset + limit < eligible.length,
      ranked_window: eligible.length,
      filters: results[0] ? describeFilters(results[0].query) : {},
      relaxed,
      ignored_params: ignored,
      personalization,
      source: SOURCE,
      fetched_at: this.now().toISOString(),
    };
  }

  async facets(params: FeedParams): Promise<CareerFacetsResponse> {
    const query = this.queryFor("explore", { ...params, include_stale: params.include_stale ?? true }, {});
    delete query.limit;
    delete query.offset;
    try {
      const names = ["category", "seniority", "employment_type", "work_mode", "reality", "skills", "countries"] as const satisfies readonly (typeof FACET_NAMES)[number][];
      const res = await this.cached(`f:${JSON.stringify(query)}`, FACET_TTL_MS, () => this.deps.freehire.facets(query, names));
      const facets: CareerFacetsResponse["facets"] = {};
      for (const [k, v] of Object.entries(res.facets)) facets[k] = k === "skills" || k === "countries" ? v.slice(0, 60) : v.slice(0, 60);
      return { total: res.total, facets, source: SOURCE, fetched_at: this.now().toISOString() };
    } catch (e) {
      return this.upstream(e);
    }
  }

  // ---------------- one job ----------------

  async job(uid: string, slug: string): Promise<CareerJobDetailResponse> {
    if (!SAFE_SLUG.test(slug)) throw new ApiError("BAD_REQUEST", "That is not a valid listing id.");
    const existing = await this.deps.store.getTracked(uid, slug);
    let raw;
    try {
      raw = (await this.deps.freehire.getJob(slug)).job;
    } catch (e) {
      if (e instanceof FreehireError && e.kind === "not_found" && existing) {
        await this.deps.store.saveTracked({ ...existing, posting_state: "possibly_unavailable", updated_at: this.now().toISOString() });
      }
      return this.upstream(e);
    }
    const job = normalizeJob(raw);
    let tracker: CareerTracker | null = null;
    if (existing) {
      const state = job.closed_at ? "possibly_unavailable" : "unknown";
      const next = state !== existing.posting_state ? { ...existing, posting_state: state as TrackedRecord["posting_state"], updated_at: this.now().toISOString() } : existing;
      if (next !== existing) await this.deps.store.saveTracked(next);
      tracker = this.toTracker(next);
    }
    const { derived } = await this.derive(uid);
    return { job, description: descriptionText(raw), match: matchJob(job, derived.signals), tracker, source: SOURCE };
  }

  // ---------------- tracker ----------------

  private toTracker(r: TrackedRecord): CareerTracker {
    return { saved: r.saved, status: r.status, applied_on: r.applied_on, follow_up_on: r.follow_up_on, notes: r.notes, posting_state: r.posting_state, updated_at: r.updated_at };
  }
  private toItem(r: TrackedRecord): CareerTrackedItem {
    return { slug: r.slug, title: r.title, company: r.company, apply_url: r.apply_url, freehire_url: `${FREEHIRE_SITE}/jobs/${encodeURIComponent(r.slug)}`, tracker: this.toTracker(r) };
  }

  async tracked(uid: string, filter: "saved" | "applications" | "all"): Promise<CareerTrackedResponse> {
    const all = await this.deps.store.listTracked(uid, TRACKED_LIMIT);
    const rows = all.filter((r) => (filter === "saved" ? r.saved : filter === "applications" ? r.status !== null && r.status !== "saved" : true));
    rows.sort((a, b) => {
      if (filter === "applications") {
        const fa = a.follow_up_on ?? "9999-12-31";
        const fb = b.follow_up_on ?? "9999-12-31";
        if (fa !== fb) return fa.localeCompare(fb);
      }
      return b.updated_at.localeCompare(a.updated_at) || a.slug.localeCompare(b.slug);
    });
    return { items: rows.map((r) => this.toItem(r)), total: rows.length };
  }

  /**
   * Creates or updates the one record for this student and job. Title, company and apply link always come from
   * Freehire (never from the browser), so a student cannot store an arbitrary link under a job. Returns null when the
   * update leaves nothing worth keeping (an un-bookmarked job with no history).
   */
  async updateTracker(uid: string, slug: string, update: CareerTrackerUpdate): Promise<CareerTrackedItem | null> {
    if (!SAFE_SLUG.test(slug)) throw new ApiError("BAD_REQUEST", "That is not a valid listing id.");
    const nowIso = this.now().toISOString();
    let rec = await this.deps.store.getTracked(uid, slug);
    if (!rec) {
      let raw;
      try {
        raw = (await this.deps.freehire.getJob(slug)).job;
      } catch (e) {
        return this.upstream(e);
      }
      const job = normalizeJob(raw);
      rec = { owner_uid: uid, source: "freehire", slug, title: job.title, company: job.company, apply_url: job.apply_url, saved: false, status: null, applied_on: null, follow_up_on: null, notes: "", posting_state: job.closed_at ? "possibly_unavailable" : "unknown", created_at: nowIso, updated_at: nowIso };
    }
    const next: TrackedRecord = { ...rec };

    if (update.status !== undefined && update.status !== null) {
      const from = rec.status ?? "none";
      if (update.status !== rec.status && !STATUS_TRANSITIONS[from].includes(update.status)) {
        throw new ApiError("BAD_REQUEST", `You can't move an application from "${from === "none" ? "no status" : from}" to "${update.status}". Allowed next steps: ${STATUS_TRANSITIONS[from].join(", ")}.`);
      }
      next.status = update.status;
    } else if (update.status === null) next.status = null;

    if (update.saved !== undefined) {
      next.saved = update.saved;
      if (update.saved && next.status === null) next.status = "saved";
    }
    if (update.applied_on !== undefined) next.applied_on = this.date(update.applied_on, "applied_on", true);
    if (update.follow_up_on !== undefined) next.follow_up_on = this.date(update.follow_up_on, "follow_up_on", false);
    if (next.applied_on && next.follow_up_on && next.follow_up_on < next.applied_on) throw new ApiError("BAD_REQUEST", "The follow-up date can't be before the date you applied.");
    if (update.notes !== undefined) {
      const notes = stripControl(update.notes).trim();
      if (notes.length > 2000) throw new ApiError("BAD_REQUEST", "Notes can be at most 2000 characters.");
      next.notes = notes;
    }
    next.updated_at = nowIso;

    const hasHistory = (next.status !== null && next.status !== "saved") || next.notes !== "" || next.applied_on !== null || next.follow_up_on !== null;
    if (!next.saved && !hasHistory) {
      await this.deps.store.deleteTracked(uid, slug);
      return null;
    }
    await this.deps.store.saveTracked(next);
    return this.toItem(next);
  }

  private date(v: string | null, name: string, notFuture: boolean): string | null {
    if (v === null) return null;
    if (!isValidYmd(v)) throw new ApiError("BAD_REQUEST", `${name} must be a real date like 2026-12-01.`);
    if (notFuture && diffDays(v, ymd(this.now())) > 1) throw new ApiError("BAD_REQUEST", "The date you applied can't be in the future.");
    if (!notFuture && diffDays(v, addDays(ymd(this.now()), 3650)) > 0) throw new ApiError("BAD_REQUEST", "That follow-up date is too far away.");
    return v;
  }

  /** Removes the bookmark; keeps the record when it holds application history. */
  async unsave(uid: string, slug: string): Promise<CareerTrackedItem | null> {
    const rec = await this.deps.store.getTracked(uid, slug);
    if (!rec) return null;
    return this.updateTracker(uid, slug, { saved: false, ...(rec.status === "saved" ? { status: null } : {}) });
  }

  /** Removes the whole record (bookmark, status, dates and notes). */
  async remove(uid: string, slug: string): Promise<void> {
    if (!SAFE_SLUG.test(slug)) throw new ApiError("BAD_REQUEST", "That is not a valid listing id.");
    await this.deps.store.deleteTracked(uid, slug);
  }

  async deleteAll(uid: string): Promise<void> {
    await this.deps.store.deleteAll(uid);
  }

  // ---------------- AI mentor context ----------------

  /**
   * A bounded, plain-text summary of the student's own best matches and tracker for the AI mentor. Scores come from the
   * deterministic engine; the model is told to explain them, not to change them. Titles and company names are external
   * text, so they are cleaned and length-limited, and descriptions and links are never included.
   */
  async mentorContext(uid: string): Promise<{ text: string; available: boolean }> {
    let feed: CareerFeedResponse;
    try {
      feed = await this.feed(uid, "for_you", { limit: 8 });
    } catch (e) {
      this.deps.logger.warn({ err: (e as Error).message }, "career: mentor context unavailable");
      return { text: "The job listings could not be loaded right now, so there are no matches to discuss. Do not invent any.", available: false };
    }
    const tracked = await this.tracked(uid, "all").catch(() => ({ items: [], total: 0 }));
    const clean = (s: string | null, n: number) => (s ? stripControl(s).replace(/\s+/g, " ").slice(0, n) : "an unnamed employer");
    const lines = feed.jobs.map((c, i) => {
      const m = c.match;
      const kind = [c.job.employment_type?.replace("_", "-"), c.job.seniority, c.job.work_mode].filter(Boolean).join(", ") || "type not stated";
      const score = m.score === null ? "not scored (not enough information)" : `${m.score}/100 (${m.confidence} confidence)`;
      return `${i + 1}. "${clean(c.job.title, 80)}" at ${clean(c.job.company, 60)} | ${kind} | match ${score} | matches: ${m.matched_skills.map((s) => s.skill).join(", ") || "none"} | not in profile: ${m.missing_skills.slice(0, 5).join(", ") || "none listed"}`;
    });
    const missingCount = new Map<string, number>();
    for (const c of feed.jobs) for (const s of c.match.missing_skills) missingCount.set(s, (missingCount.get(s) ?? 0) + 1);
    const topMissing = [...missingCount.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 6).map(([s, n]) => `${s} (${n} of ${feed.jobs.length})`);
    const open = tracked.items.filter((t) => t.tracker.status && !["rejected", "withdrawn", "offer"].includes(t.tracker.status));
    const follow = open.filter((t) => t.tracker.follow_up_on).sort((a, b) => (a.tracker.follow_up_on ?? "").localeCompare(b.tracker.follow_up_on ?? "")).slice(0, 5);
    const text = [
      `Source: Freehire public job listings, read just now. Match scores are computed by the application from the student's own profile; they are not chances of being hired. ${feed.total ?? "an unknown number of"} postings matched the search; the ${feed.jobs.length} best-ranked are:`,
      ...(lines.length ? lines : ["(no postings matched)"]),
      `Skills the best matches list that are not in the student's profile: ${topMissing.join(", ") || "none"}.`,
      `Personalization: ${feed.personalization.level}${feed.personalization.notes.length ? ` (${feed.personalization.notes.join(" ")})` : ""}`,
      `The student has ${tracked.items.filter((t) => t.tracker.saved).length} saved job(s) and ${tracked.items.filter((t) => t.tracker.status && t.tracker.status !== "saved").length} tracked application(s).`,
      ...(follow.length ? [`Upcoming follow-ups: ${follow.map((t) => `"${clean(t.title, 60)}" on ${t.tracker.follow_up_on}`).join("; ")}.`] : []),
    ].join("\n");
    return { text: text.slice(0, 4500), available: true };
  }
}

