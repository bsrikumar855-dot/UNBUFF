import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { ApiError } from "../errors.js";
import type { LabService } from "../graphqllab/service.js";
import { uidOf } from "../middleware/auth.js";
import { formatIssues } from "../middleware/validate.js";
import type { LabExecuteRequest, LabHelpRequest, LabSubmitRequest } from "../types.js";

const moduleId = z.string().regex(/^m\d{1,2}-[a-z0-9-]{1,40}$/, "invalid module id");
const exerciseId = z.string().regex(/^m\d{1,2}-e\d{1,2}$/, "invalid exercise id");
const clientId = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/, "client_attempt_id must be 8 to 64 letters, digits, - or _");
const vars = z.record(z.string().max(100), z.unknown()).nullable().optional();
const QUERY_MAX = 8000; // generous: the engine reports the real (smaller) limit with a clear message

const ExecuteBody = z.strictObject({
  query: z.string().min(1, "query is required").max(QUERY_MAX),
  variables: vars,
  operation_name: z.string().regex(/^[_A-Za-z][_0-9A-Za-z]{0,63}$/).optional(),
});
const SubmitBody = z.strictObject({
  client_attempt_id: clientId,
  query: z.string().max(QUERY_MAX).optional(),
  variables: vars,
  answer: z.union([z.string().max(4000), z.array(z.string().max(20)).max(10)]).optional(),
});
const HelpBody = z.strictObject({
  action: z.enum(["explain_query", "explain_error", "hint", "explain_schema", "practice_question", "explain_result"]),
  exercise_id: exerciseId.optional(),
  query: z.string().max(QUERY_MAX).optional(),
  variables: vars,
  message: z.string().max(500).optional(),
});
const AttemptsQuery = z.strictObject({ exercise_id: exerciseId.optional() });
const NoBody = z.strictObject({});

function parse<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
  const r = schema.safeParse(value);
  if (!r.success) throw new ApiError("BAD_REQUEST", formatIssues(r.error));
  return r.data;
}

const noStore = { "Cache-Control": "no-store" };

/**
 * The GraphQL Learning Lab. Every route needs a verified student. The only GraphQL endpoint is the Lab's own training
 * API: there is no way to point it at another server, and no route accepts a URL, header, token or user id.
 */
export function graphqlLabRouter(lab: LabService, limiters: { execute: RequestHandler; submit: RequestHandler; help: RequestHandler }): Router {
  const router = Router();

  router.get("/graphql-lab/modules", async (_req, res) => {
    res.set(noStore).json(await lab.modules(uidOf(res)));
  });
  router.get("/graphql-lab/modules/:moduleId", async (req, res) => {
    res.set(noStore).json(await lab.module(uidOf(res), parse(moduleId, req.params.moduleId)));
  });
  router.get("/graphql-lab/exercises", async (_req, res) => {
    res.set(noStore).json({ exercises: await lab.exercises(uidOf(res)) });
  });
  router.get("/graphql-lab/exercises/:exerciseId", async (req, res) => {
    res.set(noStore).json(await lab.exercise(uidOf(res), parse(exerciseId, req.params.exerciseId)));
  });
  router.get("/graphql-lab/training-schema", (_req, res) => {
    res.set({ "Cache-Control": "private, max-age=300" }).json(lab.trainingSchema());
  });
  router.post("/graphql-lab/execute", limiters.execute, async (req, res) => {
    const b = parse(ExecuteBody, req.body ?? {});
    const body: LabExecuteRequest = { query: b.query, ...(b.variables !== undefined ? { variables: b.variables } : {}), ...(b.operation_name ? { operation_name: b.operation_name } : {}) };
    res.set(noStore).json(await lab.execute(uidOf(res), body));
  });
  router.post("/graphql-lab/exercises/:exerciseId/hint", limiters.submit, async (req, res) => {
    parse(NoBody, req.body ?? {});
    res.set(noStore).json(await lab.hint(uidOf(res), parse(exerciseId, req.params.exerciseId)));
  });
  router.post("/graphql-lab/exercises/:exerciseId/submit", limiters.submit, async (req, res) => {
    const b = parse(SubmitBody, req.body ?? {});
    const body: LabSubmitRequest = {
      client_attempt_id: b.client_attempt_id,
      ...(b.query !== undefined ? { query: b.query } : {}),
      ...(b.variables !== undefined ? { variables: b.variables } : {}),
      ...(b.answer !== undefined ? { answer: b.answer } : {}),
    };
    res.set(noStore).json(await lab.submit(uidOf(res), parse(exerciseId, req.params.exerciseId), body));
  });
  router.get("/graphql-lab/progress", async (_req, res) => {
    res.set(noStore).json(await lab.progress(uidOf(res)));
  });
  router.get("/graphql-lab/attempts", async (req, res) => {
    const q = parse(AttemptsQuery, req.query);
    res.set(noStore).json(await lab.attempts(uidOf(res), q.exercise_id ?? null));
  });
  router.post("/graphql-lab/training-data/reset", limiters.submit, async (req, res) => {
    parse(NoBody, req.body ?? {});
    res.set(noStore).json(await lab.resetTrainingData(uidOf(res)));
  });
  router.post("/graphql-lab/help", limiters.help, async (req, res) => {
    const b = parse(HelpBody, req.body ?? {});
    const body: LabHelpRequest = {
      action: b.action,
      ...(b.exercise_id ? { exercise_id: b.exercise_id } : {}),
      ...(b.query !== undefined ? { query: b.query } : {}),
      ...(b.variables !== undefined ? { variables: b.variables } : {}),
      ...(b.message !== undefined ? { message: b.message } : {}),
    };
    res.set(noStore).json(await lab.help(uidOf(res), body));
  });
  router.delete("/graphql-lab/progress", async (_req, res) => {
    await lab.deleteAll(uidOf(res));
    res.status(204).end();
  });
  return router;
}
