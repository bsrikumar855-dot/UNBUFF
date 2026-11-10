import { Router } from "express";
import type { HealthResponse } from "../types.js";
import type { LLMProvider } from "../llm/provider.js";

const READY_TIMEOUT_MS = 3000;

/**
 * Public. `/health` says the process is up (a platform liveness check). `/ready` also checks that the database answers, so a
 * deployment can be verified before it receives traffic. The model name is only reported when asked for (development).
 */
export function healthRouter(llm: LLMProvider, opts: { exposeModel?: boolean; probe?: () => Promise<void> } = {}): Router {
  const router = Router();
  router.get("/health", (_req, res) => {
    const body: HealthResponse = { status: "ok", llm_mode: llm.mode, model: opts.exposeModel ? llm.model : null };
    res.json(body);
  });
  router.get("/ready", async (_req, res) => {
    res.set("Cache-Control", "no-store");
    if (!opts.probe) return void res.json({ ready: true, checks: { database: "not_checked" } });
    try {
      await Promise.race([opts.probe(), new Promise<never>((_r, reject) => setTimeout(() => reject(new Error("timeout")), READY_TIMEOUT_MS))]);
      res.json({ ready: true, checks: { database: "ok" } });
    } catch {
      res.status(503).json({ ready: false, checks: { database: "unreachable" } });
    }
  });
  return router;
}
