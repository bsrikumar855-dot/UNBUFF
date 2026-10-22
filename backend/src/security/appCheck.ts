import type { RequestHandler } from "express";
import { ApiError } from "../errors.js";
import type { Logger } from "../logger.js";
import { audit } from "./audit.js";

export type AppCheckMode = "off" | "monitor" | "enforce";

export interface AppCheckVerifier {
  /** Resolves for a valid App Check token from this Firebase project's registered web app; rejects otherwise. */
  verify(token: string): Promise<void>;
}

/** Requests that legitimately carry no App Check token: the platform health check and GitHub's browser redirect. */
const EXEMPT = new Set(["/health", "/github/oauth/callback"]);
const MAX_TOKEN_LENGTH = 4096;
const LOG_EVERY_MS = 10_000;

/**
 * Firebase App Check: only requests from the real UNBLUFF web app (attested by reCAPTCHA Enterprise in the browser) may
 * use the API. `monitor` verifies and logs failures without refusing anything, so it can be watched in production before
 * switching to `enforce`. Mount on the /api router before every other router.
 */
export function appCheckGuard(mode: AppCheckMode, verifier: AppCheckVerifier | null, logger: Logger): RequestHandler {
  let lastLog = -Infinity;
  const report = (reason: string) => {
    const now = Date.now();
    if (now - lastLog < LOG_EVERY_MS) return; // a flood of bad requests must not flood the logs
    lastLog = now;
    audit(logger, "appcheck.failed", null, { reason, mode });
  };
  return async (req, _res, next) => {
    if (mode === "off" || EXEMPT.has(req.path) || req.method === "OPTIONS") return next();
    const token = req.header("x-firebase-appcheck");
    let reason: string | null = null;
    if (!verifier) reason = "not_configured";
    else if (!token || token.length > MAX_TOKEN_LENGTH) reason = "missing";
    else {
      try {
        await verifier.verify(token);
      } catch {
        reason = "invalid";
      }
    }
    if (reason === null) return next();
    report(reason);
    if (mode === "monitor") return next();
    next(new ApiError("APP_CHECK_FAILED", "This request didn't come from the UNBLUFF app. Reload the page and try again."));
  };
}
