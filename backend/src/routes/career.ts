import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { EMPLOYMENT_TYPES, SENIORITIES, WORK_MODES } from "../careers/freehire.js";
import type { CareerService, FeedParams } from "../careers/service.js";
import { ApiError } from "../errors.js";
import { uidOf } from "../middleware/auth.js";
import { formatIssues } from "../middleware/validate.js";
import type { CareerTab, CareerTrackerUpdate } from "../types.js";

const noStore = { "Cache-Control": "no-store" };

/** A comma-separated list in a query string, bounded and trimmed. */
const list = (max: number, item: z.ZodType<string>) =>
  z
    .string()
    .max(600)
    .transform((s) => s.split(",").map((x) => x.trim()).filter(Boolean))
    .pipe(z.array(item).max(max) as unknown as z.ZodType<string[], string[]>);
const slug = z.string().regex(/^[a-z0-9][a-z0-9_.+#-]{0,63}$/, "invalid value");
const bool = z.enum(["true", "false", "1", "0"]).transform((v) => v === "true" || v === "1");
const int = (lo: number, hi: number) => z.coerce.number().int().min(lo).max(hi);

const FeedQuery = z.strictObject({
  tab: z.enum(["for_you", "internships", "jobs", "explore"]).default("explore"),
  q: z.string().trim().max(200).optional(),
  search_in: z.enum(["all", "title", "company"]).optional(),
  category: list(10, slug).optional(),
  skills: list(20, slug).optional(),
  skills_mode: z.enum(["and"]).optional(),
  countries: list(10, slug).optional(),
  cities: list(10, z.string().min(1).max(64)).optional(),
  work_mode: list(3, z.enum(WORK_MODES)).optional(),
  seniority: list(8, z.enum(SENIORITIES)).optional(),
  employment_type: list(5, z.enum(EMPLOYMENT_TYPES)).optional(),
  include_stale: bool.optional(),
  tech_only: bool.optional(),
  broaden: bool.optional(),
  sort: z.enum(["best_match", "newest"]).optional(),
  posted_within_days: int(1, 365).optional(),
  salary_min: int(0, 100_000_000).optional(),
  offset: int(0, 9_999).optional(),
  limit: int(1, 50).optional(),
});

const TrackerBody = z.strictObject({
  saved: z.boolean().optional(),
  status: z.enum(["saved", "interested", "applied", "interviewing", "offer", "rejected", "withdrawn"]).nullable().optional(),
  applied_on: z.string().max(10).nullable().optional(),
  follow_up_on: z.string().max(10).nullable().optional(),
  notes: z.string().max(2500).optional(),
});
const TrackedQuery = z.strictObject({ filter: z.enum(["saved", "applications", "all"]).default("all") });
const DeleteQuery = z.strictObject({ mode: z.enum(["bookmark", "all"]).default("bookmark") });
const ResumeText = z.strictObject({ text: z.string().max(60_000, "The resume text is too long.") });
const ResumeSkillsBody = z.strictObject({ skills: z.array(z.string().regex(/^[a-z0-9][a-z0-9_.+#-]{0,63}$/, "invalid skill")).max(60) });
const Slug = z.string().regex(/^[A-Za-z0-9._-]{1,300}$/, "invalid listing id");

function parse<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
  const r = schema.safeParse(value);
  if (!r.success) throw new ApiError("BAD_REQUEST", formatIssues(r.error));
  return r.data;
}

/** Career discovery, matching and the private tracker. Every route needs a verified student; the owner is always the token's uid. */
export function careerRouter(career: CareerService, limiters: { read: RequestHandler; write: RequestHandler }): Router {
  const router = Router();

  router.get("/career/preferences", limiters.read, async (_req, res) => {
    res.set(noStore).json(await career.preferences(uidOf(res)));
  });
  router.put("/career/preferences", limiters.write, async (req, res) => {
    res.set(noStore).json(await career.putPreferences(uidOf(res), req.body ?? {}));
  });
  router.get("/career/resume-skills", limiters.read, async (_req, res) => {
    res.set(noStore).json(await career.resumeSkills(uidOf(res)));
  });
  // Reads resume text and answers with suggestions. Nothing is stored and the text is not logged.
  router.post("/career/resume-skills/extract", limiters.write, (req, res) => {
    res.set(noStore).json(career.extractFromResume(parse(ResumeText, req.body ?? {}).text));
  });
  router.put("/career/resume-skills", limiters.write, async (req, res) => {
    res.set(noStore).json(await career.saveResumeSkills(uidOf(res), parse(ResumeSkillsBody, req.body ?? {}).skills));
  });
  router.delete("/career/resume-skills", limiters.write, async (_req, res) => {
    await career.deleteResumeSkills(uidOf(res));
    res.set(noStore).status(204).end();
  });
  router.delete("/career/data", limiters.write, async (_req, res) => {
    await career.deleteAll(uidOf(res));
    res.set(noStore).status(204).end();
  });

  router.get("/career/jobs", limiters.read, async (req, res) => {
    const { tab, ...rest } = parse(FeedQuery, req.query);
    res.set(noStore).json(await career.feed(uidOf(res), tab as CareerTab, rest as FeedParams));
  });
  router.get("/career/facets", limiters.read, async (req, res) => {
    const { tab: _tab, offset: _o, limit: _l, ...rest } = parse(FeedQuery, req.query);
    res.set({ "Cache-Control": "private, max-age=60" }).json(await career.facets(rest as FeedParams));
  });
  router.get("/career/jobs/:slug", limiters.read, async (req, res) => {
    res.set(noStore).json(await career.job(uidOf(res), parse(Slug, req.params.slug)));
  });

  router.get("/career/tracked", limiters.read, async (req, res) => {
    res.set(noStore).json(await career.tracked(uidOf(res), parse(TrackedQuery, req.query).filter));
  });
  router.put("/career/tracked/:slug", limiters.write, async (req, res) => {
    const body = parse(TrackerBody, req.body ?? {});
    const update: CareerTrackerUpdate = {};
    if (body.saved !== undefined) update.saved = body.saved;
    if (body.status !== undefined) update.status = body.status;
    if (body.applied_on !== undefined) update.applied_on = body.applied_on;
    if (body.follow_up_on !== undefined) update.follow_up_on = body.follow_up_on;
    if (body.notes !== undefined) update.notes = body.notes;
    if (Object.keys(update).length === 0) throw new ApiError("BAD_REQUEST", "Nothing to change.");
    const item = await career.updateTracker(uidOf(res), parse(Slug, req.params.slug), update);
    res.set(noStore).json({ item });
  });
  router.delete("/career/tracked/:slug", limiters.write, async (req, res) => {
    const id = parse(Slug, req.params.slug);
    const { mode } = parse(DeleteQuery, req.query);
    if (mode === "all") await career.remove(uidOf(res), id);
    else await career.unsave(uidOf(res), id);
    res.set(noStore).status(204).end();
  });

  return router;
}
