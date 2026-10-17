import { readFileSync } from "node:fs";
import { z } from "zod";
import type {
  CompaniesResponse,
  CompanyDetailResponse,
  CompanySummary,
  DsaDifficulty,
  DsaLicenseStatus,
  DsaSource,
  QuestionDetailResponse,
  QuestionSummary,
  QuestionsResponse,
} from "../types.js";

/**
 * The public catalogue: questions, companies and their associations, plus provenance.
 * It is read-only reference data loaded from a validated file; students' personal progress lives
 * elsewhere and only refers to question ids.
 */

export const LICENSE_STATUSES = ["licensed", "permission_granted", "public_domain", "own_work", "development_fixture"] as const satisfies readonly DsaLicenseStatus[];
export const DIFFICULTIES = ["easy", "medium", "hard"] as const satisfies readonly DsaDifficulty[];
const DIFFICULTY_RANK: Record<DsaDifficulty, number> = { easy: 1, medium: 2, hard: 3 };

const idRe = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const isoDate = z.string().refine((v) => !Number.isNaN(Date.parse(v)), "must be an ISO-8601 date");

export const SourceFileSchema = z.strictObject({
  name: z.string().trim().min(1).max(200),
  license_status: z.enum(LICENSE_STATUSES),
  license_note: z.string().trim().min(1).max(1000),
  url: z.string().url().max(500).nullable(),
  imported_at: isoDate,
  source_updated_at: isoDate.nullable(),
});

export const CatalogueFileSchema = z.strictObject({
  schema_version: z.literal(1),
  source: SourceFileSchema,
  companies: z.array(z.strictObject({ id: z.string().regex(idRe), name: z.string().trim().min(1).max(120) })).max(5000),
  questions: z
    .array(
      z.strictObject({
        id: z.string().regex(idRe),
        title: z.string().trim().min(1).max(300),
        url: z.string().url().max(500).startsWith("https://"),
        difficulty: z.enum(DIFFICULTIES),
        topics: z.array(z.string().trim().min(1).max(60)).max(20),
      }),
    )
    .max(100_000),
  associations: z.array(z.strictObject({ company_id: z.string().regex(idRe), question_id: z.string().regex(idRe) })).max(500_000),
});
export type CatalogueFile = z.infer<typeof CatalogueFileSchema>;

/** Throws with a readable list of problems when a catalogue file is malformed or inconsistent. */
export function parseCatalogueFile(raw: unknown): CatalogueFile {
  const file = CatalogueFileSchema.parse(raw);
  const problems: string[] = [];
  const companyIds = new Set<string>();
  for (const c of file.companies) {
    if (companyIds.has(c.id)) problems.push(`duplicate company id "${c.id}"`);
    companyIds.add(c.id);
  }
  const questionIds = new Set<string>();
  const urls = new Set<string>();
  for (const q of file.questions) {
    if (questionIds.has(q.id)) problems.push(`duplicate question id "${q.id}"`);
    if (urls.has(q.url)) problems.push(`duplicate question url "${q.url}"`);
    questionIds.add(q.id);
    urls.add(q.url);
  }
  const pairs = new Set<string>();
  for (const a of file.associations) {
    if (!companyIds.has(a.company_id)) problems.push(`association references unknown company "${a.company_id}"`);
    if (!questionIds.has(a.question_id)) problems.push(`association references unknown question "${a.question_id}"`);
    const key = `${a.company_id}|${a.question_id}`;
    if (pairs.has(key)) problems.push(`duplicate association ${a.company_id} -> ${a.question_id}`);
    pairs.add(key);
  }
  if (problems.length > 0) throw new Error(`Invalid catalogue: ${problems.slice(0, 10).join("; ")}${problems.length > 10 ? `; and ${problems.length - 10} more` : ""}`);
  return file;
}

export interface QuestionQuery {
  search?: string;
  company?: string;
  difficulty?: DsaDifficulty;
  topic?: string;
  sort?: "title" | "difficulty";
  order?: "asc" | "desc";
  page?: number;
  page_size?: number;
}

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

function paginate<T>(items: T[], page = 1, pageSize = DEFAULT_PAGE_SIZE) {
  const total = items.length;
  const total_pages = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), page, page_size: pageSize, total, total_pages };
}

const norm = (s: string) => s.trim().toLowerCase();

export class Catalogue {
  private readonly questionsById = new Map<string, QuestionSummary>();
  private readonly companyNames = new Map<string, string>();
  private readonly questionIdsByCompany = new Map<string, string[]>();
  readonly source: DsaSource | null;

  /** `file === null` is the honest "no catalogue loaded" state. */
  constructor(file: CatalogueFile | null) {
    if (!file) {
      this.source = null;
      return;
    }
    this.source = {
      name: file.source.name,
      license_status: file.source.license_status,
      license_note: file.source.license_note,
      url: file.source.url,
      imported_at: file.source.imported_at,
      source_updated_at: file.source.source_updated_at,
      is_sample_data: file.source.license_status === "development_fixture",
    };
    for (const c of file.companies) {
      this.companyNames.set(c.id, c.name);
      this.questionIdsByCompany.set(c.id, []);
    }
    for (const q of file.questions) {
      this.questionsById.set(q.id, { id: q.id, title: q.title, url: q.url, difficulty: q.difficulty, topics: [...q.topics].sort(), company_ids: [] });
    }
    for (const a of file.associations) {
      this.questionIdsByCompany.get(a.company_id)?.push(a.question_id);
      this.questionsById.get(a.question_id)?.company_ids.push(a.company_id);
    }
    for (const q of this.questionsById.values()) q.company_ids.sort();
  }

  static empty(): Catalogue {
    return new Catalogue(null);
  }

  static fromPath(path: string): Catalogue {
    return new Catalogue(parseCatalogueFile(JSON.parse(readFileSync(path, "utf8"))));
  }

  hasQuestion(id: string): boolean {
    return this.questionsById.has(id);
  }

  hasCompany(id: string): boolean {
    return this.companyNames.has(id);
  }

  private companySummary(id: string): CompanySummary {
    const count = this.questionIdsByCompany.get(id)?.length ?? 0;
    return { id, name: this.companyNames.get(id) ?? id, question_count: count, catalogue_available: count > 0 };
  }

  listCompanies(query: { search?: string; page?: number; page_size?: number }): CompaniesResponse {
    const needle = norm(query.search ?? "");
    const all = [...this.companyNames.keys()]
      .map((id) => this.companySummary(id))
      .filter((c) => needle === "" || norm(c.name).includes(needle))
      .sort((a, b) => a.name.localeCompare(b.name));
    const p = paginate(all, query.page, query.page_size);
    return { companies: p.items, page: p.page, page_size: p.page_size, total: p.total, total_pages: p.total_pages, source: this.source };
  }

  companyDetail(id: string): CompanyDetailResponse | null {
    if (!this.hasCompany(id)) return null;
    const questions = (this.questionIdsByCompany.get(id) ?? []).map((q) => this.questionsById.get(q)!);
    const difficulties: Record<DsaDifficulty, number> = { easy: 0, medium: 0, hard: 0 };
    const topics = new Set<string>();
    for (const q of questions) {
      difficulties[q.difficulty]++;
      q.topics.forEach((t) => topics.add(t));
    }
    return { company: this.companySummary(id), topics: [...topics].sort((a, b) => a.localeCompare(b)), difficulties, source: this.source };
  }

  /** Server-side search, filters (AND), sort and pagination. `company` must be validated by the caller. */
  queryQuestions(q: QuestionQuery): QuestionsResponse {
    const scope = q.company ? (this.questionIdsByCompany.get(q.company) ?? []).map((id) => this.questionsById.get(id)!) : [...this.questionsById.values()];

    const topicSet = new Set<string>();
    const diffSet = new Set<DsaDifficulty>();
    for (const item of scope) {
      item.topics.forEach((t) => topicSet.add(t));
      diffSet.add(item.difficulty);
    }

    const search = norm(q.search ?? "");
    const topic = q.topic ? norm(q.topic) : null;
    let rows = scope.filter(
      (item) =>
        (search === "" || norm(item.title).includes(search)) &&
        (!q.difficulty || item.difficulty === q.difficulty) &&
        (topic === null || item.topics.some((t) => norm(t) === topic)),
    );

    const dir = q.order === "desc" ? -1 : 1;
    const byTitle = (a: QuestionSummary, b: QuestionSummary) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id);
    rows = [...rows].sort(
      q.sort === "difficulty"
        ? (a, b) => dir * (DIFFICULTY_RANK[a.difficulty] - DIFFICULTY_RANK[b.difficulty]) || byTitle(a, b)
        : (a, b) => dir * byTitle(a, b),
    );

    const p = paginate(rows, q.page, q.page_size);
    return {
      questions: p.items,
      page: p.page,
      page_size: p.page_size,
      total: p.total,
      total_pages: p.total_pages,
      facets: {
        topics: [...topicSet].sort((a, b) => a.localeCompare(b)),
        difficulties: DIFFICULTIES.filter((d) => diffSet.has(d)),
      },
      source: this.source,
    };
  }

  questionDetail(id: string): QuestionDetailResponse | null {
    const question = this.questionsById.get(id);
    if (!question) return null;
    return {
      question,
      companies: question.company_ids.map((cid) => ({ id: cid, name: this.companyNames.get(cid) ?? cid })),
      source: this.source,
    };
  }
}
