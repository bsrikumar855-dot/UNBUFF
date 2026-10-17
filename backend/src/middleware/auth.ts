import type { RequestHandler, Response } from "express";
import { ApiError } from "../errors.js";
import type { TokenVerifier } from "../auth/verifier.js";

const MAX_TOKEN_LENGTH = 4096;

/**
 * Requires `Authorization: Bearer <Firebase ID token>`. The uid comes only from the verified token.
 * Every failure (missing, malformed, invalid, expired) gets the same response, and nothing about the
 * token is logged or echoed.
 */
export function requireAuth(verifier: TokenVerifier): RequestHandler {
  return async (req, res, next) => {
    try {
      const header = req.headers.authorization;
      const match = typeof header === "string" ? /^Bearer (\S+)$/.exec(header) : null;
      const token = match?.[1];
      if (!token || token.length > MAX_TOKEN_LENGTH) throw unauthenticated();
      let uid: string;
      try {
        uid = (await verifier.verify(token)).uid;
      } catch {
        throw unauthenticated();
      }
      if (!uid) throw unauthenticated();
      res.locals.uid = uid;
      next();
    } catch (err) {
      next(err);
    }
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
