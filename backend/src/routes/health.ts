import { Router } from "express";
import type { HealthResponse } from "../types.js";
import type { LLMProvider } from "../llm/provider.js";

export function healthRouter(llm: LLMProvider): Router {
  return Router().get("/health", (_req, res) => {
    const body: HealthResponse = { status: "ok", llm_mode: llm.mode, model: llm.model };
    res.json(body);
  });
}
