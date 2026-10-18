import { z } from "zod";
import type { CareerEmployment, CareerReality, CareerSeniority, CareerWorkMode } from "../types.js";

/**
 * A typed client for Freehire's public, unauthenticated, read-only jobs API (https://freehire.me/docs/api, base
 * https://freehire.me/api/v1). It only ever calls three documented endpoints (`/jobs/search`, `/jobs/facets`,
 * `/jobs/{slug}`) on that fixed base URL: no caller-supplied URL ever reaches `fetch`. Every outgoing parameter comes
 * from the typed `FreehireQuery`, which is validated against the documented enumerations, so a typo cannot silently
 * widen a search. Upstream's own `meta.ignored_params` is surfaced, because a dropped filter looks exactly like a
 * search that legitimately matched everything.
 */

export const FREEHIRE_API = "https://freehire.me/api/v1";
export const FREEHIRE_SITE = "https://freehire.me";
export const MAX_PAGE_SIZE = 100;
/** Upstream refuses offset + limit above this with a 400 "pagination too deep". */
export const MAX_DEPTH = 10_000;

export const SENIORITIES = ["intern", "junior", "middle", "senior", "lead", "staff", "principal", "c_level"] as const satisfies readonly CareerSeniority[];
export const WORK_MODES = ["remote", "hybrid", "onsite"] as const satisfies readonly CareerWorkMode[];
export const EMPLOYMENT_TYPES = ["full_time", "part_time", "contract", "internship", "fellowship"] as const satisfies readonly CareerEmployment[];
export const REALITIES = ["fresh", "stale", "likely-evergreen"] as const satisfies readonly CareerReality[];
export const SORTS = ["created_at", "posted_at", "view_count", "salary_min", "salary_max"] as const;
export const Q_FIELDS = ["title", "company", "description", "location"] as const;
export const FACET_NAMES = ["category", "seniority", "employment_type", "work_mode", "reality", "skills", "countries", "regions", "is_tech"] as const;

/** Values drawn from open vocabularies (skills, categories, countries): lowercase slugs. */
const SLUG = /^[a-z0-9][a-z0-9_.+#-]{0,63}$/;
/** City names are free text from the geography vocabulary. */
const CITY = /^[\p{L}0-9][\p{L}0-9 .,'()-]{0,63}$/u;

export interface FreehireQuery {
  q?: string;
  q_fields?: (typeof Q_FIELDS)[number][];
  limit?: number;
  offset?: number;
  sort?: (typeof SORTS)[number];
  order?: "asc" | "desc";
  work_mode?: CareerWorkMode[];
  seniority?: CareerSeniority[];
  employment_type?: CareerEmployment[];
  reality?: CareerReality[];
  category?: string[];
  skills?: string[];
  skills_mode?: "and";
  countries?: string[];
  cities?: string[];
  regions?: string[];
  is_tech?: "tech" | "non_tech";
  experience_years_max?: number;
  salary_min?: number;
  salary_currency?: string;
  posted_within_days?: number;
}

export type FreehireErrorKind = "unavailable" | "timeout" | "rate_limited" | "invalid_response" | "rejected" | "not_found";

/** Upstream could not give a trustworthy answer. Never carries infrastructure details. */
export class FreehireError extends Error {
  constructor(
    readonly kind: FreehireErrorKind,
    message: string,
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = "FreehireError";
  }
}

const oneOf = <T extends string>(allowed: readonly T[], values: readonly T[] | undefined, name: string): T[] => {
  const out: T[] = [];
  for (const v of values ?? []) {
    if (!allowed.includes(v)) throw new FreehireError("rejected", `${name}: "${String(v)}" is not a documented value`);
    if (!out.includes(v)) out.push(v);
  }
  return out;
};
const slugs = (values: readonly string[] | undefined, name: string, pattern: RegExp, max: number): string[] => {
  const out: string[] = [];
  for (const raw of values ?? []) {
    const v = String(raw).trim();
    if (!pattern.test(v)) throw new FreehireError("rejected", `${name}: "${v.slice(0, 40)}" is not a valid value`);
    if (!out.includes(v)) out.push(v);
  }
  if (out.length > max) throw new FreehireError("rejected", `${name}: at most ${max} values`);
  return out;
};
const intIn = (v: number | undefined, name: string, lo: number, hi: number): number | undefined => {
  if (v === undefined) return undefined;
  if (!Number.isInteger(v) || v < lo || v > hi) throw new FreehireError("rejected", `${name} must be a whole number from ${lo} to ${hi}`);
  return v;
};

/**
 * Turns a typed query into the documented parameters, repeated for multi-valued facets (values of one facet are ORed
 * upstream, different facets are ANDed). Throws FreehireError("rejected") for anything outside the documented grammar,
 * including a page that would pass the 10,000-row depth limit.
 */
export function serializeQuery(query: FreehireQuery): URLSearchParams {
  const p = new URLSearchParams();
  const limit = intIn(query.limit, "limit", 1, MAX_PAGE_SIZE) ?? 10;
  const offset = intIn(query.offset, "offset", 0, MAX_DEPTH) ?? 0;
  if (offset + limit > MAX_DEPTH) throw new FreehireError("rejected", "offset + limit may not exceed 10000: narrow the search with filters instead of paging that far");
  p.set("limit", String(limit));
  if (offset > 0) p.set("offset", String(offset));
  const q = query.q?.trim();
  if (q) {
    if (q.length > 200) throw new FreehireError("rejected", "q: at most 200 characters");
    p.set("q", q);
    const fields = oneOf(Q_FIELDS, query.q_fields, "q_fields");
    if (fields.length > 0) p.set("q_fields", fields.join(","));
  }
  if (query.sort) {
    if (!SORTS.includes(query.sort)) throw new FreehireError("rejected", `sort: "${query.sort}" is not a documented value`);
    p.set("sort", query.sort);
    if (query.order) p.set("order", query.order === "asc" ? "asc" : "desc");
  }
  const multi: [string, string[]][] = [
    ["work_mode", oneOf(WORK_MODES, query.work_mode, "work_mode")],
    ["seniority", oneOf(SENIORITIES, query.seniority, "seniority")],
    ["employment_type", oneOf(EMPLOYMENT_TYPES, query.employment_type, "employment_type")],
    ["reality", oneOf(REALITIES, query.reality, "reality")],
    ["category", slugs(query.category, "category", SLUG, 10)],
    ["skills", slugs(query.skills, "skills", SLUG, 20)],
    ["countries", slugs(query.countries, "countries", SLUG, 10)],
    ["regions", slugs(query.regions, "regions", SLUG, 10)],
    ["cities", slugs(query.cities, "cities", CITY, 10)],
  ];
  for (const [name, values] of multi) for (const v of values) p.append(name, v);
  if (query.skills_mode === "and" && (query.skills?.length ?? 0) > 0) p.set("skills_mode", "and");
  if (query.is_tech) p.set("is_tech", query.is_tech === "non_tech" ? "non_tech" : "tech");
  const years = intIn(query.experience_years_max, "experience_years_max", 0, 40);
  if (years !== undefined) p.set("experience_years_max", String(years));
  const salary = intIn(query.salary_min, "salary_min", 0, 100_000_000);
  if (salary !== undefined) {
    p.set("salary_min", String(salary));
    const cur = (query.salary_currency ?? "").trim().toUpperCase();
    if (/^[A-Z]{3}$/.test(cur)) p.set("salary_currency", cur);
  }
  const days = intIn(query.posted_within_days, "posted_within_days", 1, 365);
  if (days !== undefined) p.set("posted_within_days", String(days));
  return p;
}

/** The filters (everything except paging) as a plain record, for showing the student exactly what was asked of upstream. */
export function describeFilters(query: FreehireQuery): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [k, v] of serializeQuery({ ...query, limit: 1, offset: 0 }).entries()) {
    if (k === "limit" || k === "offset") continue;
    (out[k] ??= []).push(v);
  }
  return out;
}

// ---------- response validation ----------

const nullish = <T extends z.ZodType>(t: T) => z.preprocess((v) => (v === null ? undefined : v), t.optional());
const strList = z.preprocess((v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string") : undefined), z.array(z.string()).optional());

export const RawJobSchema = z
  .object({
    public_slug: z.string().min(1).max(300),
    title: z.string().min(1).max(500),
    company: nullish(z.string().max(300)),
    company_slug: nullish(z.string().max(300)),
    url: nullish(z.string().max(4000)),
    location: nullish(z.string().max(500)),
    source: nullish(z.string().max(100)),
    description: nullish(z.string().max(200_000)),
    countries: strList,
    regions: strList,
    cities: strList,
    work_mode: nullish(z.string()),
    skills: strList,
    posted_at: nullish(z.string()),
    updated_at: nullish(z.string()),
    last_seen_at: nullish(z.string()),
    closed_at: nullish(z.string()),
    enrichment: nullish(z.record(z.string(), z.unknown())),
    reality: nullish(z.record(z.string(), z.unknown())),
    ghost: nullish(z.record(z.string(), z.unknown())),
  })
  .passthrough();
export type RawJob = z.infer<typeof RawJobSchema>;

const MetaSchema = z
  .object({
    total: z.number().int().nonnegative().optional(),
    limit: z.number().int().optional(),
    offset: z.number().int().optional(),
    ignored_params: z
      .array(z.object({ param: z.string(), did_you_mean: z.string().optional() }).passthrough())
      .optional(),
  })
  .passthrough();

export interface FreehireMeta {
  total: number | null; // exactly what upstream reported; null when it did not
  limit: number | null;
  offset: number | null;
  ignored_params: { param: string; did_you_mean: string | null }[];
}
export interface FreehireRateInfo {
  limit: number | null;
  remaining: number | null;
  reset_seconds: number | null;
}
export interface FreehireSearchResult {
  jobs: RawJob[];
  /** Rows upstream returned that failed validation and were dropped (never shown as jobs). */
  dropped: number;
  meta: FreehireMeta;
  rate: FreehireRateInfo;
}
export interface FreehireFacetsResult {
  total: number | null;
  facets: Record<string, { value: string; count: number }[]>;
  ignored_params: { param: string; did_you_mean: string | null }[];
}

export interface FreehireOptions {
  baseUrl?: string;
  userAgent?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

const toMeta = (raw: unknown): FreehireMeta => {
  const r = MetaSchema.safeParse(raw ?? {});
  const m = r.success ? r.data : {};
  return {
    total: typeof m.total === "number" ? m.total : null,
    limit: typeof m.limit === "number" ? m.limit : null,
    offset: typeof m.offset === "number" ? m.offset : null,
    ignored_params: (m.ignored_params ?? []).map((i) => ({ param: i.param, did_you_mean: i.did_you_mean ?? null })),
  };
};

const toInt = (v: string | null): number | null => {
  if (v === null || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export class FreehireClient {
  private readonly base: string;
  private readonly userAgent: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: FreehireOptions = {}) {
    this.base = (opts.baseUrl ?? FREEHIRE_API).replace(/\/+$/, "");
    this.userAgent = opts.userAgent ?? "unbluff/placement-os (+https://github.com/bsrikumar855-dot/UNBUFF)";
    this.timeoutMs = opts.timeoutMs ?? 8000;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  private async get(path: string, params?: URLSearchParams): Promise<{ body: unknown; rate: FreehireRateInfo }> {
    const url = `${this.base}${path}${params && [...params.keys()].length > 0 ? `?${params.toString()}` : ""}`;
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method: "GET",
        headers: { Accept: "application/json", "User-Agent": this.userAgent },
        signal: AbortSignal.timeout(this.timeoutMs),
        redirect: "error", // the API does not redirect; never follow a redirect to another host
      });
    } catch (e) {
      const name = (e as Error).name;
      if (name === "TimeoutError" || name === "AbortError") throw new FreehireError("timeout", "The job source took too long to answer.");
      throw new FreehireError("unavailable", "The job source could not be reached.");
    }
    const rate: FreehireRateInfo = {
      limit: toInt(res.headers.get("x-ratelimit-limit")),
      remaining: toInt(res.headers.get("x-ratelimit-remaining")),
      reset_seconds: toInt(res.headers.get("x-ratelimit-reset")),
    };
    if (res.status === 429) {
      const retry = toInt(res.headers.get("retry-after"));
      throw new FreehireError("rate_limited", "The job source is limiting requests right now.", retry === null ? null : Math.max(1, Math.min(retry, 3600)));
    }
    if (res.status === 404) throw new FreehireError("not_found", "That listing was not found.");
    if (res.status >= 400 && res.status < 500) {
      let detail = "The job source rejected the request.";
      try {
        const j = (await res.json()) as { error?: unknown };
        if (typeof j.error === "string" && j.error.length <= 200) detail = j.error;
      } catch {
        /* keep the generic message */
      }
      throw new FreehireError("rejected", detail);
    }
    if (res.status >= 500) throw new FreehireError("unavailable", "The job source had an internal error.");
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new FreehireError("invalid_response", "The job source returned something that is not JSON.");
    }
    return { body, rate };
  }

  /** GET /jobs/search: open postings only. */
  async search(query: FreehireQuery): Promise<FreehireSearchResult> {
    const { body, rate } = await this.get("/jobs/search", serializeQuery(query));
    const env = z.object({ data: z.array(z.unknown()), meta: z.unknown().optional() }).safeParse(body);
    if (!env.success) throw new FreehireError("invalid_response", "The job source answered in an unexpected shape.");
    const jobs: RawJob[] = [];
    let dropped = 0;
    for (const row of env.data.data) {
      const parsed = RawJobSchema.safeParse(row);
      if (parsed.success) jobs.push(parsed.data);
      else dropped += 1;
    }
    return { jobs, dropped, meta: toMeta(env.data.meta), rate };
  }

  /** GET /jobs/{slug}: serves closed postings too, with `closed_at` set. */
  async getJob(slug: string): Promise<{ job: RawJob; rate: FreehireRateInfo }> {
    if (!/^[A-Za-z0-9._-]{1,300}$/.test(slug)) throw new FreehireError("rejected", "That is not a valid listing id.");
    const { body, rate } = await this.get(`/jobs/${encodeURIComponent(slug)}`);
    const env = z.object({ data: z.unknown() }).safeParse(body);
    const job = env.success ? RawJobSchema.safeParse(env.data.data) : null;
    if (!job || !job.success) throw new FreehireError("invalid_response", "The job source answered in an unexpected shape.");
    return { job: job.data, rate };
  }

  /** GET /jobs/facets: the live vocabulary with counts, for the filters that match `query`. */
  async facets(query: FreehireQuery, facets: readonly (typeof FACET_NAMES)[number][]): Promise<FreehireFacetsResult> {
    const p = serializeQuery({ ...query, limit: 1, offset: 0 });
    p.delete("limit");
    for (const f of facets) if (!FACET_NAMES.includes(f)) throw new FreehireError("rejected", "That facet is not available.");
    p.set("facets", facets.join(","));
    const { body } = await this.get("/jobs/facets", p);
    const env = z
      .object({
        data: z.object({ total: z.number().int().optional(), facets: z.record(z.string(), z.record(z.string(), z.number())) }).passthrough(),
        meta: z.unknown().optional(),
      })
      .safeParse(body);
    if (!env.success) throw new FreehireError("invalid_response", "The job source answered in an unexpected shape.");
    const out: Record<string, { value: string; count: number }[]> = {};
    for (const [name, counts] of Object.entries(env.data.data.facets)) {
      out[name] = Object.entries(counts)
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
    }
    return { total: env.data.data.total ?? null, facets: out, ignored_params: toMeta(env.data.meta).ignored_params };
  }
}
