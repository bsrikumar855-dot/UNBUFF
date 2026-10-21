import { ApiError } from "@/api/types";
import type { ErrorCode } from "@/types/contract";

/**
 * User-safe copy per backend error code (CONTRACT.md §2).
 * Never surface raw messages/stack traces from unknown failures.
 */
const ERROR_COPY: Record<ErrorCode, string> = {
  UNAUTHENTICATED: "Please sign in to continue.",
  BAD_REQUEST: "That request wasn't valid. Check the form and try again.",
  NOT_FOUND: "That page or resource doesn't exist.",
  CONVERSATION_NOT_FOUND: "That conversation no longer exists.",
  MEMORY_NOT_FOUND: "That memory no longer exists.",
  GITHUB_NOT_CONFIGURED: "GitHub connection isn't set up on this server yet.",
  GITHUB_NOT_CONNECTED: "Connect your GitHub account first.",
  GITHUB_REAUTH_REQUIRED: "GitHub no longer accepts the saved connection. Connect your account again.",
  GITHUB_RATE_LIMITED: "GitHub's rate limit is used up for now. Your saved data is unchanged; try again later.",
  PLACEMENT_PROFILE_REQUIRED: "Set your goals and availability first, then generate your plan.",
  PLACEMENT_TASK_NOT_FOUND: "That task no longer exists.",
  GITHUB_UNAVAILABLE: "GitHub couldn't be reached or answered unexpectedly. Your saved data is unchanged; try again later.",
  REVISION_NOT_FOUND: "That revision item no longer exists.",
  SUBMISSION_NOT_FOUND: "We couldn't find that submission.",
  EXECUTION_UNAVAILABLE: "Code execution is not available right now. Try again in a moment.",
  GRADING_UNAVAILABLE: "This question has no test suite yet, so it can't be judged. You can still run your code.",
  COMPANY_NOT_FOUND: "We couldn't find that company.",
  QUESTION_NOT_FOUND: "We couldn't find that question. It may have been removed from the catalogue.",
  ROLE_NOT_FOUND: "We couldn't find that role. Pick another one.",
  SESSION_NOT_FOUND: "This session has expired. Start over from Setup.",
  CLAIM_NOT_FOUND: "That claim is no longer in this session.",
  CAREER_UNAVAILABLE: "The job source could not be reached or answered unexpectedly. Nothing was changed; try again in a moment.",
  CAREER_RATE_LIMITED: "The job source is receiving too many requests right now. Wait a little, then try again.",
  CAREER_JOB_NOT_FOUND: "That listing could not be found. It may have been removed.",
  LEETCODE_IMPORT_INVALID: "That data could not be imported. Check the points listed and try again.",
  LEETCODE_IMPORT_CONFLICT: "That import clashes with a snapshot you already have, so nothing was changed.",
  LEETCODE_UNAVAILABLE: "LeetCode could not be reached right now. Try again in a few minutes, or type your numbers in.",
  LATEX_UNAVAILABLE: "The LaTeX compiler is not available on this server, so the PDF could not be built. You can still edit and check your ATS score.",
  LEARN_NOT_FOUND: "That topic could not be found. It may have been renamed.",
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
    if ((error.code === "BAD_REQUEST" || error.code === "LEETCODE_IMPORT_INVALID" || error.code === "LEETCODE_IMPORT_CONFLICT") && error.message) return error.message;
    return ERROR_COPY[error.code as ErrorCode] ?? error.message;
  }
  if (error instanceof Error) {
    return "Something went wrong. Try again.";
  }
  return "An unexpected error occurred.";
}
