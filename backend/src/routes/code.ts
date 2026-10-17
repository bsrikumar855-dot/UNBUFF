import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { LANGUAGE_IDS } from "../code/languages.js";
import type { CodeService } from "../code/service.js";
import { ApiError } from "../errors.js";
import { uidOf } from "../middleware/auth.js";
import { formatIssues } from "../middleware/validate.js";
import type { CodeRunRequest, CodeSubmitRequest } from "../types.js";

const questionId = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/, "invalid id");
const submissionId = z.string().regex(/^sub_[A-Za-z0-9-]{1,64}$/, "invalid id");
const language = z.enum(LANGUAGE_IDS);
// Byte limits are enforced by the service; these generous character caps just stop absurd payloads early.
const source = z.string().min(1, "source is required").max(60_000);
const stdin = z.string().max(30_000);

const RunBody = z
  .strictObject({
    language,
    source,
    stdin: stdin.optional(),
    question_id: questionId.optional(),
    sample_index: z.number().int().min(0).max(4).optional(),
  })
  .refine((b) => b.sample_index === undefined || b.question_id !== undefined, { message: "sample_index needs a question_id" })
  .refine((b) => b.sample_index === undefined || b.stdin === undefined, { message: "Use either stdin or sample_index, not both" });

const SubmitBody = z.strictObject({ question_id: questionId, language, source });
const ListQuery = z.strictObject({ question_id: questionId.optional() });

function parse<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
  const r = schema.safeParse(value);
  if (!r.success) throw new ApiError("BAD_REQUEST", formatIssues(r.error));
  return r.data;
}

/** Public: languages and the visible part of an exercise. */
export function codePublicRouter(code: CodeService): Router {
  const router = Router();
  router.get("/code/languages", async (_req, res) => {
    res.json(await code.languages());
  });
  router.get("/code/exercises/:questionId", (req, res) => {
    res.json(code.exercise(parse(questionId, req.params.questionId)));
  });
  return router;
}

/** Authenticated: run, submit and the caller's own history. The uid always comes from the verified token. */
export function codePrivateRouter(code: CodeService, limiters: { run: RequestHandler; submit: RequestHandler }): Router {
  const router = Router();

  router.post("/code/run", limiters.run, async (req, res) => {
    const body = parse(RunBody, req.body) as CodeRunRequest;
    res.set("Cache-Control", "no-store").json(await code.run(uidOf(res), body));
  });

  router.post("/code/submit", limiters.submit, async (req, res) => {
    const body = parse(SubmitBody, req.body) as CodeSubmitRequest;
    res.set("Cache-Control", "no-store").json(await code.submit(uidOf(res), body));
  });

  router.get("/code/submissions", async (req, res) => {
    const q = parse(ListQuery, req.query);
    res.set("Cache-Control", "no-store").json(await code.listSubmissions(uidOf(res), q.question_id));
  });

  router.get("/code/submissions/:submissionId", async (req, res) => {
    res.set("Cache-Control", "no-store").json(await code.getSubmission(uidOf(res), parse(submissionId, req.params.submissionId)));
  });

  router.delete("/code/submissions/:submissionId", async (req, res) => {
    await code.deleteSubmission(uidOf(res), parse(submissionId, req.params.submissionId));
    res.status(204).end();
  });

  return router;
}
