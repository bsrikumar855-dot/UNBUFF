import { ApiError } from "@/api/types";
import type { ErrorCode } from "@/types/contract";

/**
 * User-safe copy per backend error code (CONTRACT.md §2).
 * Never surface raw messages/stack traces from unknown failures.
 */
const ERROR_COPY: Record<ErrorCode, string> = {
  BAD_REQUEST: "That request wasn't valid. Check the form and try again.",
  NOT_FOUND: "That page or resource doesn't exist.",
  ROLE_NOT_FOUND: "We couldn't find that role. Pick another one.",
  SESSION_NOT_FOUND: "This session has expired. Start over from Setup.",
  CLAIM_NOT_FOUND: "That claim is no longer in this session.",
  RATE_LIMITED: "Too many requests — wait a moment and try again.",
  LLM_INVALID_OUTPUT: "The model returned something we couldn't grade. Try again.",
  LLM_TIMEOUT: "The model took too long to respond. Try again.",
  INTERNAL: "Something went wrong on our side. Try again.",
};

/** True when retrying the same request is a reasonable next step. */
export function isRetryableError(error: unknown): boolean {
  if (!(error instanceof ApiError)) return true;
  return error.code !== "BAD_REQUEST" && error.code !== "CLAIM_NOT_FOUND";
}

/** Maps any thrown value to copy that is safe to render to the user. */
export function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    // 400 messages are written for users by the backend (e.g. "Retest unlocks after 2 more concepts").
    if (error.code === "BAD_REQUEST" && error.message) return error.message;
    return ERROR_COPY[error.code as ErrorCode] ?? error.message;
  }
  if (error instanceof Error) {
    return "Something went wrong. Try again.";
  }
  return "An unexpected error occurred.";
}
