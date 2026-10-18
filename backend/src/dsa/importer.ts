import { createHash } from "node:crypto";
import { CatalogueFileSchema, DIFFICULTIES, parseCatalogueFile, type CatalogueFile } from "./catalogue.js";
import type { DsaDifficulty } from "../types.js";

/**
 * Turns an explicitly approved CSV or JSON file into a validated, normalized catalogue file.
 * Nothing here fetches data: the operator supplies the file and states its licence/permission status.
 */

/**
 * `unlicensed_local_use` is the honest label for a source that declares no licence and that the operator chooses to use
 * on their own machine anyway. It is never "permission". The server refuses to start with such a catalogue in production.
 */
export const IMPORT_LICENSE_STATUSES = ["licensed", "permission_granted", "public_domain", "own_work", "unlicensed_local_use"] as const;
export type ImportLicenseStatus = (typeof IMPORT_LICENSE_STATUSES)[number];

export interface RawRecord {
  company: string;
  title: string;
  url: string;
  difficulty: string;
  topics: string | string[];
}

export interface ImportSource {
  name: string;
  license_status: ImportLicenseStatus;
  license_note: string;
  url: string | null;
  source_updated_at: string | null;
}

export interface ImportOptions {
  source: ImportSource;
  /** Optional allow-list of problem-page hosts, e.g. ["leetcode.com"]. */
  allowedHosts?: string[];
  /** Rebuild the catalogue from this input only instead of merging into the existing file. */
  replace?: boolean;
  now?: () => Date;
}

export interface ImportReport {
  rows: number;
  companies: number;
  questions: number;
  associations: number;
  duplicate_rows_collapsed: number;
  changed: boolean;
}

export class ImportError extends Error {
  constructor(readonly problems: string[]) {
    super(`Import rejected:\n  - ${problems.slice(0, 25).join("\n  - ")}${problems.length > 25 ? `\n  - and ${problems.length - 25} more` : ""}`);
    this.name = "ImportError";
  }
}

// ---------- parsing ----------

/** Minimal RFC 4180 CSV reader (quoted fields, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text; // strip a UTF-8 BOM
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  if (quoted) throw new ImportError(["CSV has an unterminated quoted field"]);
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

const COLUMNS = ["company", "title", "url", "difficulty", "topics"] as const;

export function parseRecords(text: string, format: "csv" | "json"): RawRecord[] {
  if (format === "json") {
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      throw new ImportError(["input is not valid JSON"]);
    }
    const list = Array.isArray(data) ? data : (data as { records?: unknown } | null)?.records;
    if (!Array.isArray(list)) throw new ImportError(["JSON must be an array of records or an object with a `records` array"]);
    return list as RawRecord[];
  }
  const rows = parseCsv(text);
  const header = rows.shift()?.map((h) => h.trim().toLowerCase()) ?? [];
  const missing = COLUMNS.filter((c) => !header.includes(c));
  if (missing.length > 0) throw new ImportError([`CSV header is missing required column(s): ${missing.join(", ")}`]);
  return rows.map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? "").trim()])) as unknown as RawRecord);
}

// ---------- normalization ----------

export function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

/** https only, no credentials, real host; fragment and trailing slash removed, host lowercased. */
export function canonicalUrl(raw: string, allowedHosts?: string[]): string {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    throw new Error(`invalid URL "${raw}"`);
  }
  if (u.protocol !== "https:") throw new Error(`URL must use https: ${raw}`);
  if (u.username || u.password) throw new Error(`URL must not contain credentials: ${raw}`);
  if (!u.hostname.includes(".") || /^\d+(\.\d+){3}$/.test(u.hostname)) throw new Error(`URL host is not a public domain name: ${raw}`);
  const host = u.hostname.toLowerCase();
  if (allowedHosts && allowedHosts.length > 0 && !allowedHosts.some((h) => host === h || host.endsWith(`.${h}`))) {
    throw new Error(`URL host "${host}" is not in the allowed hosts`);
  }
  u.hash = "";
  const path = u.pathname.length > 1 ? u.pathname.replace(/\/+$/, "") : "";
  return `https://${host}${u.port ? `:${u.port}` : ""}${path}${u.search}`;
}

const questionId = (url: string) => `q_${createHash("sha1").update(url).digest("hex").slice(0, 12)}`;

function splitTopics(topics: string | string[] | undefined): string[] {
  const list = Array.isArray(topics) ? topics : String(topics ?? "").split(/[;|,]/);
  const seen = new Map<string, string>();
  for (const t of list.map((x) => String(x).trim()).filter(Boolean)) if (!seen.has(t.toLowerCase())) seen.set(t.toLowerCase(), t);
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

interface Normalized {
  companies: Map<string, string>;
  questions: Map<string, CatalogueFile["questions"][number]>;
  associations: Set<string>;
  rows: number;
  duplicates: number;
}

export function normalizeRecords(records: RawRecord[], allowedHosts?: string[]): Normalized {
  const problems: string[] = [];
  const out: Normalized = { companies: new Map(), questions: new Map(), associations: new Set(), rows: records.length, duplicates: 0 };
  if (records.length === 0) throw new ImportError(["input contains no records"]);

  records.forEach((r, idx) => {
    const where = `row ${idx + 1}`;
    const company = String(r.company ?? "").trim();
    const title = String(r.title ?? "").trim();
    const difficulty = String(r.difficulty ?? "").trim().toLowerCase();
    if (!company) return void problems.push(`${where}: company is required`);
    if (!title) return void problems.push(`${where}: title is required`);
    if (!DIFFICULTIES.includes(difficulty as DsaDifficulty)) return void problems.push(`${where}: difficulty must be easy, medium or hard (got "${r.difficulty}")`);
    const companyId = slugify(company);
    if (!companyId) return void problems.push(`${where}: company "${company}" has no usable letters or digits`);
    let url: string;
    try {
      url = canonicalUrl(String(r.url ?? ""), allowedHosts);
    } catch (e) {
      return void problems.push(`${where}: ${(e as Error).message}`);
    }

    const existingName = out.companies.get(companyId);
    if (existingName !== undefined && existingName !== company) {
      return void problems.push(`${where}: company "${company}" collides with "${existingName}" (same id "${companyId}")`);
    }
    out.companies.set(companyId, company);

    const id = questionId(url);
    const topics = splitTopics(r.topics);
    const prior = out.questions.get(id);
    if (prior) {
      if (prior.title !== title || prior.difficulty !== difficulty) {
        return void problems.push(`${where}: ${url} appears with conflicting title/difficulty ("${prior.title}"/${prior.difficulty} vs "${title}"/${difficulty})`);
      }
      prior.topics = splitTopics([...prior.topics, ...topics]);
    } else {
      out.questions.set(id, { id, title, url, difficulty: difficulty as DsaDifficulty, topics });
    }
    const key = `${companyId}|${id}`;
    if (out.associations.has(key)) out.duplicates++;
    out.associations.add(key);
  });

  if (problems.length > 0) throw new ImportError(problems);
  return out;
}

// ---------- building / merging ----------

const BLOCKED_REPO = /github\.com\/liquidslr\/leetcode-company-wise-problems/i;

export function assertSourceAllowed(source: ImportSource): void {
  if (!IMPORT_LICENSE_STATUSES.includes(source.license_status)) {
    throw new ImportError([`license_status must be one of ${IMPORT_LICENSE_STATUSES.join(", ")}`]);
  }
  if (!source.name.trim() || !source.license_note.trim()) throw new ImportError(["source name and a licence/permission note are required"]);
  if (source.url && BLOCKED_REPO.test(source.url) && !["licensed", "permission_granted", "unlicensed_local_use"].includes(source.license_status)) {
    throw new ImportError(["that repository declares no licence: import it as licensed or permission_granted (with a note recording the permission), or as unlicensed_local_use for local evaluation only"]);
  }
  for (const d of [source.source_updated_at]) if (d && Number.isNaN(Date.parse(d))) throw new ImportError(["source_updated_at must be an ISO-8601 date"]);
}

const sortedFile = (f: CatalogueFile): CatalogueFile => ({
  ...f,
  companies: [...f.companies].sort((a, b) => a.id.localeCompare(b.id)),
  questions: [...f.questions].sort((a, b) => a.id.localeCompare(b.id)),
  associations: [...f.associations].sort((a, b) => `${a.company_id}|${a.question_id}`.localeCompare(`${b.company_id}|${b.question_id}`)),
});

/** Serialization is stable, so importing the same input twice yields byte-identical output. */
export const serializeCatalogue = (f: CatalogueFile): string => `${JSON.stringify(sortedFile(f), null, 2)}\n`;

export function buildCatalogue(
  records: RawRecord[],
  existing: CatalogueFile | null,
  opts: ImportOptions,
): { file: CatalogueFile; report: ImportReport } {
  assertSourceAllowed(opts.source);
  const n = normalizeRecords(records, opts.allowedHosts);
  const merging = existing && !opts.replace;
  if (merging && existing.source.name !== opts.source.name) {
    throw new ImportError([`the existing catalogue comes from "${existing.source.name}"; merging a different source would blur provenance. Use replace to rebuild from "${opts.source.name}" alone`]);
  }

  const companies = new Map<string, string>(merging ? existing.companies.map((c) => [c.id, c.name]) : []);
  const questions = new Map(merging ? existing.questions.map((q) => [q.id, q]) : []);
  const associations = new Set<string>(merging ? existing.associations.map((a) => `${a.company_id}|${a.question_id}`) : []);
  for (const [id, name] of n.companies) companies.set(id, name);
  for (const [id, q] of n.questions) questions.set(id, q); // newest metadata wins; ids (and so progress) stay stable
  for (const a of n.associations) associations.add(a);

  const body = {
    companies: [...companies].map(([id, name]) => ({ id, name })),
    questions: [...questions.values()],
    associations: [...associations].map((k) => {
      const [company_id, question_id] = k.split("|") as [string, string];
      return { company_id, question_id };
    }),
  };

  const sameSource =
    existing &&
    existing.source.name === opts.source.name &&
    existing.source.license_status === opts.source.license_status &&
    existing.source.license_note === opts.source.license_note &&
    existing.source.url === opts.source.url &&
    existing.source.source_updated_at === opts.source.source_updated_at;
  const importedAt = sameSource ? existing.source.imported_at : (opts.now ?? (() => new Date()))().toISOString();

  const file = sortedFile(
    parseCatalogueFile({
      schema_version: 1,
      source: { ...opts.source, imported_at: importedAt },
      ...body,
    }),
  );
  const changed = !existing || serializeCatalogue(file) !== serializeCatalogue(existing);
  return {
    file,
    report: {
      rows: n.rows,
      companies: file.companies.length,
      questions: file.questions.length,
      associations: file.associations.length,
      duplicate_rows_collapsed: n.duplicates,
      changed,
    },
  };
}

export { CatalogueFileSchema };
