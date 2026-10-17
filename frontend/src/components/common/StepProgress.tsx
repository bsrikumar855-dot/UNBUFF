import React from "react";
import { cn } from "@/lib/cn";

const STEPS = ["Setup", "Claims", "Interrogate", "Report"] as const;

interface StepProgressProps {
  current: number; // 1-based
}

/**
 * Restrained 01/02/03/04 progress indicator — not a checkout wizard.
 * Future steps render as plain, non-interactive labels.
 */
export const StepProgress: React.FC<StepProgressProps> = ({ current }) => {
  return (
    <ol className="flex items-center gap-4 font-mono text-xs">
      {STEPS.map((step, i) => {
        const stepNumber = i + 1;
        const isCurrent = stepNumber === current;
        const isDone = stepNumber < current;
        return (
          <li
            key={step}
            aria-current={isCurrent ? "step" : undefined}
            className={cn(
              "flex items-center gap-1.5",
              isCurrent ? "text-primary" : isDone ? "text-ink-secondary" : "text-ink-subtle"
            )}
          >
            <span>{String(stepNumber).padStart(2, "0")}</span>
            <span className={cn(isCurrent && "font-semibold")}>{step}</span>
          </li>
        );
      })}
    </ol>
  );
};
