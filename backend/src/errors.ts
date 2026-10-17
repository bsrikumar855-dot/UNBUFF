import type { ErrorCode } from "./types.js";

const STATUS: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  UNAUTHENTICATED: 401,
  NOT_FOUND: 404,
  ROLE_NOT_FOUND: 404,
  COMPANY_NOT_FOUND: 404,
  QUESTION_NOT_FOUND: 404,
  SUBMISSION_NOT_FOUND: 404,
  REVISION_NOT_FOUND: 404,
  CONVERSATION_NOT_FOUND: 404,
  MEMORY_NOT_FOUND: 404,
  GITHUB_NOT_CONFIGURED: 503,
  GITHUB_NOT_CONNECTED: 409,
  GITHUB_REAUTH_REQUIRED: 409,
  GITHUB_RATE_LIMITED: 429,
  GITHUB_UNAVAILABLE: 502,
  MODULE_NOT_FOUND: 404,
  EXERCISE_NOT_FOUND: 404,
  GRAPHQL_LAB_UNAVAILABLE: 503,
  GRADING_UNAVAILABLE: 409,
  EXECUTION_UNAVAILABLE: 503,
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
