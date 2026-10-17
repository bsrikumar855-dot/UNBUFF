import React from "react";
import { useDemoReport } from "@/hooks/useDemoReport";
import { buttonClasses, type ButtonVariant, type ButtonSize } from "@/lib/buttonClasses";
import { getErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/cn";

export interface DemoReportButtonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}

/**
 * "View Demo Report" — calls GET /api/demo/report through the existing API
 * client, then hands the fetched Report to the report route via router
 * state. Shared by the header nav and the hero so the flow (loading,
 * disabled-while-in-flight, error, retry) lives in exactly one place.
 */
export const DemoReportButton: React.FC<DemoReportButtonProps> = ({
  variant = "secondary",
  size = "md",
  className,
}) => {
  const { isLoading, error, viewDemoReport } = useDemoReport();

  return (
    <div className={cn("inline-flex flex-col items-start gap-1.5", className)}>
      <button
        type="button"
        onClick={viewDemoReport}
        disabled={isLoading}
        aria-busy={isLoading}
        className={buttonClasses(variant, size)}
      >
        {isLoading ? "Preparing demo report…" : "View Demo Report"}
      </button>
      {error !== null && (
        <p role="alert" className="text-xs text-ink-muted">
          {getErrorMessage(error)}{" "}
          <button
            type="button"
            onClick={viewDemoReport}
            className="font-medium text-primary underline-offset-2 hover:underline focus-visible:underline"
          >
            Retry
          </button>
        </p>
      )}
    </div>
  );
};
