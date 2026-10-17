import type { ErrorRequestHandler, RequestHandler } from "express";
import type { ApiErrorBody } from "../types.js";
import { ApiError } from "../errors.js";
import type { Logger } from "../logger.js";

export const notFound: RequestHandler = (req, _res, next) => {
  next(new ApiError("NOT_FOUND", `No route for ${req.method} ${req.path}`));
};

/** Every error becomes the contract shape. No stack traces or internals leave the server. */
export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (err: unknown, req, res, _next) => {
    let apiError: ApiError;
    if (err instanceof ApiError) {
      apiError = err;
    } else if (isBodyParserError(err)) {
      apiError = new ApiError(
        "BAD_REQUEST",
        err.type === "entity.too.large" ? "Request body too large (max 100 kB)" : "Request body is not valid JSON",
      );
    } else {
      logger.error({ err, method: req.method, path: req.path }, "unhandled error");
      apiError = new ApiError("INTERNAL", "Something went wrong. Please try again.");
    }
    const body: ApiErrorBody = { error: { code: apiError.code, message: apiError.message } };
    res.status(apiError.status).json(body);
  };
}

function isBodyParserError(err: unknown): err is { type: string } {
  return typeof err === "object" && err !== null && "type" in err && typeof (err as { type: unknown }).type === "string"
    && ["entity.parse.failed", "entity.too.large", "encoding.unsupported", "charset.unsupported"].includes((err as { type: string }).type);
}
