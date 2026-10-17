import { Router } from "express";
import { z } from "zod";
import type { AnalyticsService } from "../analytics/service.js";
import { ApiError } from "../errors.js";
import { uidOf } from "../middleware/auth.js";
import { formatIssues } from "../middleware/validate.js";
import type { RevisionActionRequest } from "../types.js";

const idParam = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/, "invalid id");
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "dates must look like YYYY-MM-DD")
  .refine((d) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().startsWith(d), "not a real date");

const OverviewQuery = z.strictObject({ weeks: z.coerce.number().int().min(1).max(26).optional() });
const HistoryQuery = z
  .strictObject({ from: day, to: day })
  .refine((q) => q.from <= q.to, { message: "from must not be after to" })
  .refine((q) => Date.parse(q.to) - Date.parse(q.from) <= 365 * 86_400_000, { message: "the range can be at most 365 days" });
const QueueQuery = z.strictObject({
  view: z.enum(["due", "upcoming", "all"]).optional(),
  page: z.coerce.number().int().min(1).max(1000).optional(),
  page_size: z.coerce.number().int().min(1).max(50).optional(),
});
const AddBody = z.strictObject({ question_id: idParam });
const ActionBody = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("start") }),
  z.strictObject({ action: z.literal("complete"), outcome: z.enum(["remembered", "struggled"], { error: 'outcome must be "remembered" or "struggled"' }) }),
  z.strictObject({ action: z.literal("postpone"), days: z.number().int().min(1).max(14).optional() }),
  z.strictObject({ action: z.literal("revisit") }),
]);

function parse<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
  const r = schema.safeParse(value);
  if (!r.success) throw new ApiError("BAD_REQUEST", formatIssues(r.error));
  return r.data;
}

/** Authenticated analytics and revision. The owner is always the verified uid. */
export function analyticsRouter(service: AnalyticsService): Router {
  const router = Router();
  const noStore = { "Cache-Control": "no-store" };

  router.get("/me/dsa-analytics", async (req, res) => {
    const q = parse(OverviewQuery, req.query);
    res.set(noStore).json(await service.overview(uidOf(res), q.weeks));
  });

  router.get("/me/dsa-analytics/history", async (req, res) => {
    const q = parse(HistoryQuery, req.query);
    res.set(noStore).json(await service.history(uidOf(res), new Date(`${q.from}T00:00:00Z`), new Date(`${q.to}T00:00:00Z`)));
  });

  router.post("/me/dsa-analytics/refresh", async (_req, res) => {
    res.set(noStore).json(await service.refresh(uidOf(res)));
  });

  router.get("/me/dsa-revision", async (req, res) => {
    const q = parse(QueueQuery, req.query);
    res.set(noStore).json(await service.queue(uidOf(res), q.view ?? "due", q.page ?? 1, q.page_size ?? 20));
  });

  router.post("/me/dsa-revision", async (req, res) => {
    const body = parse(AddBody, req.body);
    res.set(noStore).json(await service.add(uidOf(res), body.question_id));
  });

  router.get("/me/dsa-revision/:questionId", async (req, res) => {
    res.set(noStore).json(await service.item(uidOf(res), parse(idParam, req.params.questionId)));
  });

  router.post("/me/dsa-revision/:questionId/actions", async (req, res) => {
    const body = parse(ActionBody, req.body) as RevisionActionRequest;
    res.set(noStore).json(await service.act(uidOf(res), parse(idParam, req.params.questionId), body));
  });

  return router;
}
