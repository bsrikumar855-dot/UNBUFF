import React from "react";
import { cn } from "@/lib/cn";

export interface LoadingStateProps {
  /** e.g. "Reading your resume…", "Thinking of a harder question…" */
  message: string;
  className?: string;
}

/**
 * Standard in-flight indicator for the 3–15s LLM calls (extract, interrogate,
 * fix-task). Always pair a request with one of these so the user is never
 * left wondering whether it's still running.
 */
export const LoadingState: React.FC<LoadingStateProps> = ({ message, className }) => (
  <div
    role="status"
    aria-live="polite"
    className={cn("flex items-center gap-3 text-sm text-ink-secondary", className)}
  >
    <span
      className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-line-strong border-t-primary motion-reduce:animate-none"
      aria-hidden="true"
    />
    {message}
  </div>
);
