import { Router, type RequestHandler } from "express";
import { z } from "zod";
import type { ResumeService } from "../resume/service.js";
import { MAX_JD_CHARS } from "../resume/service.js";
import { ApiError } from "../errors.js";
import { uidOf } from "../middleware/auth.js";
import { formatIssues } from "../middleware/validate.js";

const noStore = { "Cache-Control": "no-store" };

// Sizes are enforced again, in bytes, by the service; these only stop absurd bodies early.
const Latex = z.string().max(100_000, "The résumé is too large.");
const Role = z.string().regex(/^[a-z0-9_-]{1,60}$/i, "invalid role id").nullable().optional();
const Jd = z.string().max(MAX_JD_CHARS, "The job description is too long.").nullable().optional();
const SaveBody = z.strictObject({ latex: Latex, role_id: Role, job_description: Jd });
const ImportBody = z.strictObject({ text: z.string().max(40_000, "The text is too long.") });
const CompileBody = z.strictObject({ latex: Latex });

function parse<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
  const r = schema.safeParse(value);
  if (!r.success) throw new ApiError("BAD_REQUEST", formatIssues(r.error));
  return r.data;
}

/**
 * The résumé builder. Every route needs a verified student and the owner is always the token's uid. The ATS score is a
 * heuristic computed here from the LaTeX text; compiling runs TeX in an isolated container, never in this process.
 */
export function resumeRouter(resume: ResumeService, limiters: { read: RequestHandler; write: RequestHandler; compile: RequestHandler }): Router {
  const router = Router();
  router.get("/resume", limiters.read, async (_req, res) => {
    res.set(noStore).json(await resume.get(uidOf(res)));
  });
  router.put("/resume", limiters.write, async (req, res) => {
    res.set(noStore).json(await resume.save(uidOf(res), parse(SaveBody, req.body ?? {})));
  });
  router.delete("/resume", limiters.write, async (_req, res) => {
    await resume.remove(uidOf(res));
    res.set(noStore).status(204).end();
  });
  router.get("/resume/templates", limiters.read, (_req, res) => {
    res.set(noStore).json(resume.templates());
  });
  router.post("/resume/ats", limiters.write, (req, res) => {
    const b = parse(SaveBody, req.body ?? {});
    res.set(noStore).json(resume.score(b.latex, b.role_id, b.job_description));
  });
  router.post("/resume/import", limiters.write, (req, res) => {
    res.set(noStore).json(resume.importText(parse(ImportBody, req.body ?? {}).text));
  });
  router.post("/resume/compile", limiters.compile, async (req, res) => {
    res.set(noStore).json(await resume.compile(parse(CompileBody, req.body ?? {}).latex));
  });
  return router;
}
