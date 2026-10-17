import { Router } from "express";
import { z } from "zod";
import { DEFAULT_PAGE_SIZE, DIFFICULTIES, MAX_PAGE_SIZE, type Catalogue, type QuestionQuery } from "../dsa/catalogue.js";
import { ApiError } from "../errors.js";
import { formatIssues } from "../middleware/validate.js";
import type { DsaProgressService } from "../dsa/progressService.js";
import { uidOf } from "../middleware/auth.js";
import type { DsaProgressUpdate } from "../types.js";

const idParam = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/, "invalid id");

const page = z.coerce.number().int().min(1).max(10_000).optional();
const pageSize = z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional();
const text = z.string().trim().max(100).optional();

const CompaniesQuery = z.strictObject({ search: text, page, page_size: pageSize });
const QuestionsQuery = z.strictObject({
  search: text,
  company: idParam.optional(),
  difficulty: z.string().trim().toLowerCase().pipe(z.enum(DIFFICULTIES)).optional(),
  topic: text,
  sort: z.enum(["title", "difficulty"]).optional(),
  order: z.enum(["asc", "desc"]).optional(),
  page,
  page_size: pageSize,
});
const CompanyQuestionsQuery = QuestionsQuery.omit({ company: true });

const ProgressBody = z
  .strictObject({
    status: z.enum(["not_started", "attempted", "solved", "needs_revision"]).optional(),
    bookmarked: z.boolean().optional(),
    notes: z.string().max(5000, "notes must be at most 5000 characters").optional(),
  })
  .refine((b) => b.status !== undefined || b.bookmarked !== undefined || b.notes !== undefined, {
    message: "Provide at least one of status, bookmarked or notes",
  });

function parse<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
  const r = schema.safeParse(value);
  if (!r.success) throw new ApiError("BAD_REQUEST", formatIssues(r.error));
  return r.data;
}

const cleaned = <T extends object>(q: T) => Object.fromEntries(Object.entries(q).filter(([, v]) => v !== undefined && v !== "")) as T;

/** Public, read-only catalogue endpoints. Filtering, sorting and pagination happen here, not in the browser. */
export function dsaCatalogueRouter(catalogue: () => Catalogue): Router {
  const router = Router();

  router.get("/companies", (req, res) => {
    res.json(catalogue().listCompanies(cleaned(parse(CompaniesQuery, req.query))));
  });

  router.get("/companies/:companyId", (req, res) => {
    const id = parse(idParam, req.params.companyId);
    const detail = catalogue().companyDetail(id);
    if (!detail) throw new ApiError("COMPANY_NOT_FOUND", `Company ${id} not found`);
    res.json(detail);
  });

  router.get("/companies/:companyId/questions", (req, res) => {
    const company = parse(idParam, req.params.companyId);
    if (!catalogue().hasCompany(company)) throw new ApiError("COMPANY_NOT_FOUND", `Company ${company} not found`);
    const q: QuestionQuery = { ...cleaned(parse(CompanyQuestionsQuery, req.query)), company };
    res.json(catalogue().queryQuestions(q));
  });

  router.get("/questions", (req, res) => {
    const q: QuestionQuery = cleaned(parse(QuestionsQuery, req.query));
    if (q.company && !catalogue().hasCompany(q.company)) throw new ApiError("COMPANY_NOT_FOUND", `Company ${q.company} not found`);
    res.json(catalogue().queryQuestions(q));
  });

  router.get("/questions/:questionId", (req, res) => {
    const id = parse(idParam, req.params.questionId);
    const detail = catalogue().questionDetail(id);
    if (!detail) throw new ApiError("QUESTION_NOT_FOUND", `Question ${id} not found`);
    res.json(detail);
  });

  return router;
}

/** Authenticated personal progress. The owner is always the verified uid; there is no user id in any request. */
export function dsaProgressRouter(progress: DsaProgressService): Router {
  const router = Router();

  router.get("/me/dsa-progress", async (_req, res) => {
    res.set("Cache-Control", "no-store").json(await progress.list(uidOf(res)));
  });

  router.put("/me/dsa-progress/:questionId", async (req, res) => {
    const questionId = parse(idParam, req.params.questionId);
    const update = parse(ProgressBody, req.body) as DsaProgressUpdate;
    res.set("Cache-Control", "no-store").json(await progress.put(uidOf(res), questionId, update));
  });

  router.delete("/me/dsa-progress/:questionId", async (req, res) => {
    await progress.delete(uidOf(res), parse(idParam, req.params.questionId));
    res.status(204).end();
  });

  return router;
}

export { DEFAULT_PAGE_SIZE };
