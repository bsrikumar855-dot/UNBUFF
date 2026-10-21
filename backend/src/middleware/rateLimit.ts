import { rateLimit } from "express-rate-limit";
import type { RequestHandler } from "express";
import type { ApiErrorBody } from "../types.js";

export interface RateLimitOptions {
  globalPerMinute: number;
  llmPerMinute: number;
  /** Per signed-in user (not per IP). Defaults apply when omitted. */
  codeRunPerMinute?: number;
  codeSubmitPerMinute?: number;
  mentorChatPerMinute?: number;
  githubConnectPerMinute?: number;
  githubSyncPerMinute?: number;
  labExecutePerMinute?: number;
  labSubmitPerMinute?: number;
  labHelpPerMinute?: number;
  placementRefreshPerMinute?: number;
  placementAssistantPerMinute?: number;
  placementActionPerMinute?: number;
  careerReadPerMinute?: number;
  careerWritePerMinute?: number;
  leetcodeReadPerMinute?: number;
  leetcodeWritePerMinute?: number;
  resumeReadPerMinute?: number;
  resumeWritePerMinute?: number;
  resumeCompilePerMinute?: number;
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

/** Limits keyed by the verified uid, so one student cannot burn the shared execution service. Mount after requireAuth. */
function userLimiter(limit: number): RequestHandler {
  return rateLimit({
    windowMs: 60_000,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator: (_req, res) => `uid:${String(res.locals.uid)}`,
    validate: { keyGeneratorIpFallback: false },
    handler: (_req, res) => void res.status(429).json(body),
  });
}

export function createCodeLimiters(opts: RateLimitOptions = DEFAULT_RATE_LIMITS) {
  return { run: userLimiter(opts.codeRunPerMinute ?? 20), submit: userLimiter(opts.codeSubmitPerMinute ?? 8) };
}

/** Per-user limit for AI mentor messages (each one is a model call). Mount after requireAuth. */
export function createMentorLimiter(opts: RateLimitOptions = DEFAULT_RATE_LIMITS) {
  return userLimiter(opts.mentorChatPerMinute ?? 12);
}

/** Placement planner: refreshing/generating the plan, assistant questions and task actions, each per student. Mount after requireAuth. */
export function createPlacementLimiters(opts: RateLimitOptions = DEFAULT_RATE_LIMITS) {
  return { refresh: userLimiter(opts.placementRefreshPerMinute ?? 20), assistant: userLimiter(opts.placementAssistantPerMinute ?? 12), action: userLimiter(opts.placementActionPerMinute ?? 60) };
}

/** Career: reads (each can be one or two Freehire requests, cached) and writes (tracker, preferences), per student. Mount after requireAuth. */
export function createCareerLimiters(opts: RateLimitOptions = DEFAULT_RATE_LIMITS) {
  return { read: userLimiter(opts.careerReadPerMinute ?? 90), write: userLimiter(opts.careerWritePerMinute ?? 60) };
}

/** LeetCode link and import: local reads and writes only (no request ever leaves for LeetCode), per student. Mount after requireAuth. */
export function createLeetcodeLimiters(opts: RateLimitOptions = DEFAULT_RATE_LIMITS) {
  return { read: userLimiter(opts.leetcodeReadPerMinute ?? 90), write: userLimiter(opts.leetcodeWritePerMinute ?? 30) };
}

/** Résumé builder: saving and scoring are cheap, compiling runs TeX in a container so it is limited more tightly. Per student. */
export function createResumeLimiters(opts: RateLimitOptions = DEFAULT_RATE_LIMITS) {
  return { read: userLimiter(opts.resumeReadPerMinute ?? 90), write: userLimiter(opts.resumeWritePerMinute ?? 40), compile: userLimiter(opts.resumeCompilePerMinute ?? 8) };
}

/** GraphQL Learning Lab: running queries, grading submissions and mentor help, each per student. Mount after requireAuth. */
export function createLabLimiters(opts: RateLimitOptions = DEFAULT_RATE_LIMITS) {
  return { execute: userLimiter(opts.labExecutePerMinute ?? 60), submit: userLimiter(opts.labSubmitPerMinute ?? 30), help: userLimiter(opts.labHelpPerMinute ?? 12) };
}

/** GitHub: connecting/disconnecting and manual syncs are per user; the OAuth callback (no token) is per IP. */
export function createGithubLimiters(opts: RateLimitOptions = DEFAULT_RATE_LIMITS) {
  return { connect: userLimiter(opts.githubConnectPerMinute ?? 10), sync: userLimiter(opts.githubSyncPerMinute ?? 6), callback: limiter(30) };
}

/** Global limiter for all routes, plus a tighter one for routes that call the LLM (cost control). */
export function createRateLimiters(opts: RateLimitOptions = DEFAULT_RATE_LIMITS) {
  return { global: limiter(opts.globalPerMinute), llm: limiter(opts.llmPerMinute) };
}
