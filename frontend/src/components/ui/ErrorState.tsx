import React from "react";
import { AlertCircle } from "lucide-react";
import { getErrorMessage, isRetryableError } from "@/lib/errors";
import { Button } from "./button";
import { cn } from "@/lib/cn";

export interface ErrorStateProps {
  error: unknown;
  /** Overrides the generic copy when the caller knows better (e.g. the mentor's own failure wording). */
  message?: string;
  onRetry?: () => void;
  className?: string;
}

/**
 * Non-destructive failure state for any failed API call. Shows safe copy
 * derived from the backend's { error: { code, message } } shape and a
 * Retry action that repeats the same request — never a raw stack trace.
 */
export const ErrorState: React.FC<ErrorStateProps> = ({ error, message, onRetry, className }) => (
  <div
    role="alert"
    className={cn(
      "flex items-start gap-3 rounded-md border border-line bg-surface p-4",
      className
    )}
  >
    <AlertCircle
      size={18}
      className="mt-0.5 shrink-0 text-verdict-bluff-fg"
      aria-hidden="true"
    />
    <div className="flex-1 text-sm">
      <p className="text-ink-primary">{message ?? getErrorMessage(error)}</p>
      {onRetry && isRetryableError(error) && (
        <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  </div>
);
