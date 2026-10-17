import { rateLimit } from "express-rate-limit";
import type { RequestHandler } from "express";
import type { ApiErrorBody } from "../types.js";

export interface RateLimitOptions {
  globalPerMinute: number;
  llmPerMinute: number;
}

export const DEFAULT_RATE_LIMITS: RateLimitOptions = { globalPerMinute: 300, llmPerMinute: 40 };

const body: ApiErrorBody = {
  error: { code: "RATE_LIMITED", message: "Too many requests. Please wait a minute and try again." },
};

function limiter(limit: number): RequestHandler {
  return rateLimit({
    windowMs: 60_000,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_req, res) => void res.status(429).json(body),
  });
}

/** Global limiter for all routes, plus a tighter one for routes that call the LLM (cost control). */
export function createRateLimiters(opts: RateLimitOptions = DEFAULT_RATE_LIMITS) {
  return { global: limiter(opts.globalPerMinute), llm: limiter(opts.llmPerMinute) };
}
