import type { ErrorCode } from "./types.js";

const STATUS: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  NOT_FOUND: 404,
  ROLE_NOT_FOUND: 404,
  SESSION_NOT_FOUND: 404,
  CLAIM_NOT_FOUND: 404,
  RATE_LIMITED: 429,
  LLM_INVALID_OUTPUT: 502,
  LLM_TIMEOUT: 504,
  INTERNAL: 500,
};

/** An error that maps 1:1 onto the contract's `{ error: { code, message } }` shape. */
export class ApiError extends Error {
  readonly status: number;

  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = STATUS[code];
  }
}
