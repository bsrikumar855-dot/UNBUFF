import type { CareerEmployment, CareerJob, CareerReality, CareerRequirement, CareerSalary, CareerSeniority, CareerWorkMode } from "../types.js";
import { EMPLOYMENT_TYPES, FREEHIRE_SITE, REALITIES, SENIORITIES, WORK_MODES, type RawJob } from "./freehire.js";

/**
 * Turns one validated Freehire posting into the shape the app uses. Nothing is invented: a field upstream did not state
 * is null (or empty). External text is never passed on as HTML: descriptions become plain text, links must be https
 * and credential-free, and an opaque company identifier is not shown as if it were a company name.
 */

const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "-", mdash: "-", hellip: "...", rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"' };

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]{1,6});/gi, (_m, h: string) => safeCodePoint(parseInt(h, 16)))
    .replace(/&#(\d{1,7});/g, (_m, d: string) => safeCodePoint(parseInt(d, 10)))
    .replace(/&([a-z]{2,8});/gi, (m, n: string) => NAMED[n.toLowerCase()] ?? m);
}
const safeCodePoint = (n: number): string => {
  if (!Number.isInteger(n) || n < 32 || n > 0x10ffff || (n >= 0xd800 && n <= 0xdfff)) return " ";
  return String.fromCodePoint(n);
};

/** HTML (or text) to bounded plain text. The output contains no markup the browser could interpret. */
export function htmlToText(html: string | null | undefined, max: number): string | null {
  if (!html) return null;
  let t = html
    .replace(/<(script|style|iframe|object|embed)[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\s*(br|\/p|\/div|\/li|\/h[1-6]|\/tr)\b[^>]*>/gi, "\n")
    .replace(/<\s*li\b[^>]*>/gi, "\n- ")
    .replace(/<[^>]*>/g, " ");
  t = decodeEntities(t)
    // eslint-disable-next-line no-control-regex -- strips control characters from untrusted text
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .replace(/[<>]/g, " ") // anything that still looks like markup after decoding is flattened
    .replace(/[ \t\f\v\u00a0]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!t) return null;
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

/** https only, no credentials, no oversized URL. Anything else is dropped rather than rendered as a link. */
export function safeHttpsUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "https:" || u.username || u.password || !u.hostname.includes(".") || raw.length > 2000) return null;
    return u.toString();
  } catch {
    return null;
  }
}

const OPAQUE_ID = /^[0-9a-f]{16,}$/i;
const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** An applicant-tracking identifier standing in for a company name is not a name: show nothing instead. */
const companyName = (name: string | undefined): string | null => {
  const n = name?.trim();
  if (!n || OPAQUE_ID.test(n) || UUID_LIKE.test(n)) return null;
  return n.slice(0, 200);
};

const pick = <T extends string>(allowed: readonly T[], v: unknown): T | null => (typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : null);
const str = (v: unknown, max = 200): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const nonNegInt = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : null);
const iso = (v: string | undefined): string | null => (v && !Number.isNaN(Date.parse(v)) ? v : null);
const clean = (l: string[] | undefined, max: number): string[] => [...new Set((l ?? []).map((x) => x.trim()).filter(Boolean))].slice(0, max);

function salaryOf(e: Record<string, unknown>): CareerSalary | null {
  const min = nonNegInt(e.salary_min);
  const max = nonNegInt(e.salary_max);
  if (min === null && max === null) return null;
  return { min, max, currency: str(e.salary_currency, 8), period: str(e.salary_period, 20) };
}

function requirementsOf(e: Record<string, unknown>): CareerRequirement[] {
  const raw = e.requirements;
  if (!Array.isArray(raw)) return [];
  const out: CareerRequirement[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const text = htmlToText(str((r as { text?: unknown }).text, 600), 240);
    if (!text) continue;
    const p = (r as { priority?: unknown }).priority;
    out.push({ text, priority: p === "required" || p === "preferred" ? p : "unknown" });
    if (out.length >= 10) break;
  }
  return out;
}

export function normalizeJob(raw: RawJob): CareerJob {
  const e = (raw.enrichment ?? {}) as Record<string, unknown>;
  const reality = raw.reality as Record<string, unknown> | undefined;
  const ghost = raw.ghost as Record<string, unknown> | undefined;
  const slug = raw.public_slug;
  const rClass = pick(REALITIES, reality?.class) as CareerReality | null;
  return {
    id: `freehire:${slug}`,
    slug,
    source: "freehire",
    source_board: str(raw.source, 60),
    title: htmlToText(raw.title, 200) ?? "Untitled role",
    company: companyName(raw.company),
    location: str(raw.location, 200),
    countries: clean(raw.countries, 12),
    regions: clean(raw.regions, 12),
    cities: clean(raw.cities, 12),
    work_mode: pick(WORK_MODES, raw.work_mode) as CareerWorkMode | null,
    skills: clean(raw.skills, 40),
    seniority: pick(SENIORITIES, e.seniority) as CareerSeniority | null,
    employment_type: pick(EMPLOYMENT_TYPES, e.employment_type) as CareerEmployment | null,
    category: str(e.category, 60),
    experience_years_min: nonNegInt(e.experience_years_min),
    salary: salaryOf(e),
    summary: htmlToText(str(e.summary, 1200), 400),
    preview: htmlToText(raw.description, 400),
    requirements: requirementsOf(e),
    apply_url: safeHttpsUrl(raw.url),
    freehire_url: `${FREEHIRE_SITE}/jobs/${encodeURIComponent(slug)}`,
    posted_at: iso(raw.posted_at),
    updated_at: iso(raw.updated_at),
    last_seen_at: iso(raw.last_seen_at),
    closed_at: iso(raw.closed_at),
    reality: reality
      ? {
          class: rClass,
          age_days: nonNegInt(reality.age_days),
          repost_count: nonNegInt(reality.repost_count),
          fake_freshness: typeof reality.fake_freshness === "boolean" ? reality.fake_freshness : null,
        }
      : null,
    ghost_level: str(ghost?.level, 40),
  };
}

/** The full description as bounded plain text (detail view only). */
export const descriptionText = (raw: RawJob): string | null => htmlToText(raw.description, 8000);
