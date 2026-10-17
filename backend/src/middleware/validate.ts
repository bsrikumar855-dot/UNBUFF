import type { RequestHandler } from "express";
import type { z } from "zod";
import { ApiError } from "../errors.js";

/** Formats zod issues as one readable sentence, e.g. `claims.0.text: claim text is required`. */
export function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((i) => (i.path.length > 0 ? `${i.path.join(".")}: ${i.message}` : i.message))
    .join("; ");
}

/** Validates `req.body` and replaces it with the parsed (trimmed, typed) value. */
export function validateBody(schema: z.ZodType): RequestHandler {
  return (req, _res, next) => {
    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) return next(new ApiError("BAD_REQUEST", formatIssues(parsed.error)));
    req.body = parsed.data;
    next();
  };
}
