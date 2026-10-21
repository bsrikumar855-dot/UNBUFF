import { Router, type RequestHandler } from "express";
import { z } from "zod";
import type { LearnService } from "../learn/service.js";
import { ApiError } from "../errors.js";
import { uidOf } from "../middleware/auth.js";
import { formatIssues } from "../middleware/validate.js";

const noStore = { "Cache-Control": "no-store" };
const Id = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "invalid id").max(60);
const QuizBody = z.strictObject({ answers: z.array(z.number().int().min(0).max(3)).min(1).max(20) });
const Key = z.string().regex(/^[a-z0-9_-]{1,80}$/i, "invalid problem key");
const ProgressBody = z.strictObject({
  done: z.boolean().optional(),
  problems: z.array(z.strictObject({ key: Key, done: z.boolean() })).max(64).optional(),
});

function parse<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
  const r = schema.safeParse(value);
  if (!r.success) throw new ApiError("BAD_REQUEST", formatIssues(r.error));
  return r.data;
}

/** The learning content: static and public, like the DSA catalogue. Nothing here reads a student's data. */
export function learnPublicRouter(learn: LearnService): Router {
  const router = Router();
  router.get("/learn/patterns", (_req, res) => {
    res.set("Cache-Control", "public, max-age=300").json(learn.patterns());
  });
  router.get("/learn/patterns/:id", (req, res) => {
    res.set("Cache-Control", "public, max-age=300").json(learn.pattern(parse(Id, req.params.id)));
  });
  router.get("/learn/dbms", (_req, res) => {
    res.set("Cache-Control", "public, max-age=300").json(learn.dbmsTopics());
  });
  router.get("/learn/dbms/:id", (req, res) => {
    res.set("Cache-Control", "public, max-age=300").json(learn.dbmsTopic(parse(Id, req.params.id)));
  });
  return router;
}

/** Progress and quiz grading. Every route needs a verified student, and the owner is always the token's uid. */
export function learnPrivateRouter(learn: LearnService, limiters: { read: RequestHandler; write: RequestHandler }): Router {
  const router = Router();
  router.get("/learn/progress", limiters.read, async (_req, res) => {
    res.set(noStore).json(await learn.progress(uidOf(res)));
  });
  router.put("/learn/patterns/:id/progress", limiters.write, async (req, res) => {
    res.set(noStore).json(await learn.setPatternProgress(uidOf(res), parse(Id, req.params.id), parse(ProgressBody, req.body ?? {})));
  });
  router.post("/learn/dbms/:id/quiz", limiters.write, async (req, res) => {
    res.set(noStore).json(await learn.gradeQuiz(uidOf(res), parse(Id, req.params.id), parse(QuizBody, req.body ?? {}).answers));
  });
  return router;
}
