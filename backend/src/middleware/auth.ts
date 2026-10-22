import type { RequestHandler, Response } from "express";
import { ApiError } from "../errors.js";
import type { Logger } from "../logger.js";
import type { TokenVerifier } from "../auth/verifier.js";
import { audit } from "../security/audit.js";
import { runWithUid } from "../security/context.js";
import type { RevocationGuard } from "../security/revocation.js";

const MAX_TOKEN_LENGTH = 4096;

/**
 * Requires `Authorization: Bearer <Firebase ID token>`. The uid comes only from the verified token. Every failure
 * (missing, malformed, invalid, expired, revoked) gets the same response, and nothing about the token is logged or echoed.
 * The rest of the request runs with the uid in its context (see security/context.ts).
 */
export function requireAuth(verifier: TokenVerifier, opts: { revocation?: RevocationGuard | null; logger?: Logger } = {}): RequestHandler {
  return async (req, res, next) => {
    let uid: string;
    try {
      const header = req.headers.authorization;
      const match = typeof header === "string" ? /^Bearer (\S+)$/.exec(header) : null;
      const token = match?.[1];
      if (!token || token.length > MAX_TOKEN_LENGTH) throw unauthenticated();
      let verified;
      try {
        verified = await verifier.verify(token);
      } catch {
        throw unauthenticated();
      }
      uid = verified.uid;
      if (!uid) throw unauthenticated();
      if (opts.revocation && !(await opts.revocation.isValid(uid, verified.auth_time))) {
        if (opts.logger) audit(opts.logger, "auth.revoked_token_refused", uid);
        throw unauthenticated();
      }
      res.locals.uid = uid;
      res.locals.emailVerified = verified.email_verified !== false;
    } catch (err) {
      next(err);
      return;
    }
    runWithUid(uid, () => next());
  };
}

/** After requireAuth: refuses students whose email address isn't verified yet (a cheap brake on throwaway accounts). */
export function requireVerifiedEmail(logger: Logger): RequestHandler {
  return (_req, res, next) => {
    if (res.locals.emailVerified === false) {
      audit(logger, "auth.unverified_email_refused", typeof res.locals.uid === "string" ? res.locals.uid : null);
      next(new ApiError("EMAIL_NOT_VERIFIED", "Verify your email address to continue. Check your inbox for the link."));
      return;
    }
    next();
  };
}

/** The authenticated uid set by requireAuth. Throws if a route forgot to mount the middleware. */
export function uidOf(res: Response): string {
  const uid = res.locals.uid as unknown;
  if (typeof uid !== "string" || uid === "") throw unauthenticated();
  return uid;
}

function unauthenticated(): ApiError {
  return new ApiError("UNAUTHENTICATED", "Sign in to continue.");
}
