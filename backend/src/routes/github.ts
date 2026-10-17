import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { ApiError } from "../errors.js";
import type { GithubService } from "../github/service.js";
import { uidOf } from "../middleware/auth.js";
import { formatIssues } from "../middleware/validate.js";

const NoBody = z.strictObject({});
const Callback = z.object({
  code: z.string().regex(/^[\w.-]{1,256}$/).optional(),
  state: z.string().regex(/^[A-Za-z0-9_-]{16,128}$/).optional(),
  error: z.string().regex(/^[a-z_]{1,64}$/).optional(),
});

const noStore = { "Cache-Control": "no-store" };

/**
 * GitHub redirects the browser here, so this request has no bearer token. It is deliberately the only unauthenticated
 * GitHub route, it accepts nothing but the three OAuth parameters, and the student is identified solely by the
 * server-side record the one-time `state` points to. Never mount it behind requireAuth.
 */
export function githubCallbackRouter(github: GithubService, limiter: RequestHandler): Router {
  const router = Router();
  router.get("/github/oauth/callback", limiter, async (req, res) => {
    const parsed = Callback.safeParse(req.query);
    const url = await github.completeCallback(parsed.success ? parsed.data : {});
    res.set({ ...noStore, "Referrer-Policy": "no-referrer" }).redirect(302, url);
  });
  return router;
}

function parse<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
  const r = schema.safeParse(value);
  if (!r.success) throw new ApiError("BAD_REQUEST", formatIssues(r.error));
  return r.data;
}

/** Authenticated GitHub routes. The owner is always the verified uid; no endpoint takes a uid, URL or query from the client. */
export function githubRouter(github: GithubService, limiters: { connect: RequestHandler; sync: RequestHandler }): Router {
  const router = Router();

  router.get("/github/connection", async (req, res) => {
    res.set(noStore).json(await github.connection(uidOf(res)));
  });
  router.post("/github/connect", limiters.connect, async (req, res) => {
    parse(NoBody, req.body ?? {});
    res.set(noStore).json(await github.startConnect(uidOf(res)));
  });
  router.delete("/github/connection", limiters.connect, async (_req, res) => {
    res.set(noStore).json(await github.disconnect(uidOf(res)));
  });
  router.post("/github/sync", limiters.sync, async (req, res) => {
    parse(NoBody, req.body ?? {});
    res.set(noStore).json(await github.sync(uidOf(res)));
  });
  router.get("/github/contributions", async (_req, res) => {
    res.set(noStore).json(await github.contributions(uidOf(res)));
  });
  router.get("/github/repositories", async (_req, res) => {
    res.set(noStore).json(await github.repositories(uidOf(res)));
  });
  router.get("/github/activity", async (_req, res) => {
    res.set(noStore).json(await github.activity(uidOf(res)));
  });
  return router;
}
