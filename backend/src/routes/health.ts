import { Router } from "express";
import type { HealthResponse } from "../types.js";
import type { LLMProvider } from "../llm/provider.js";

/** Public. The model name is only reported when asked for (development); production does not advertise it. */
export function healthRouter(llm: LLMProvider, opts: { exposeModel?: boolean } = {}): Router {
  return Router().get("/health", (_req, res) => {
    const body: HealthResponse = { status: "ok", llm_mode: llm.mode, model: opts.exposeModel ? llm.model : null };
    res.json(body);
  });
}
