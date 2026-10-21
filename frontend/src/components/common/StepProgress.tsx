import React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/cn";

const STEPS = [
  { name: "Setup", note: "Prepare your claims" },
  { name: "Claims", note: "Review and edit" },
  { name: "Interrogate", note: "Stress-test your claims" },
  { name: "Report", note: "Get your UNBLUFF report" },
] as const;

interface StepProgressProps {
  current: number; // 1-based
  className?: string;
}

/**
 * The four steps of a session. A row of small pills on narrow screens and a vertical list with a joining line from
 * `xl` up. Later steps are plain, non-interactive labels; the current one is marked in words as well as colour.
 */
export const StepProgress: React.FC<StepProgressProps> = ({ current, className }) => {
  return (
    <ol
      aria-label="Progress"
      className={cn(
        "flex flex-wrap items-center gap-x-5 gap-y-2 xl:flex-col xl:items-stretch xl:gap-0",
        className
      )}
    >
      {STEPS.map((step, i) => {
        const stepNumber = i + 1;
        const isCurrent = stepNumber === current;
        const isDone = stepNumber < current;
        return (
          <li
            key={step.name}
            aria-current={isCurrent ? "step" : undefined}
            className="relative flex items-center gap-3 xl:items-start xl:pb-9 xl:last:pb-0"
          >
            {i < STEPS.length - 1 && (
              <span
                aria-hidden="true"
                className="absolute left-[1.1rem] top-10 hidden h-[calc(100%-2.5rem)] w-px bg-line-strong xl:block"
              />
            )}
            <span
              aria-hidden="true"
              className={cn(
                "relative grid size-9 shrink-0 place-items-center rounded-full text-sm font-semibold",
                isCurrent
                  ? "bg-redline text-surface-50 shadow-[0_8px_16px_-8px_rgba(143,31,19,0.7)]"
                  : isDone
                    ? "bg-white text-redline shadow-[inset_0_0_0_1px_rgba(179,41,26,0.3)]"
                    : "bg-white/70 text-ink-muted shadow-[inset_0_0_0_1px_rgba(24,24,27,0.1)]"
              )}
            >
              {isDone ? <Check size={16} strokeWidth={2.5} /> : stepNumber}
            </span>
            <span className="min-w-0">
              <span
                className={cn(
                  "block text-sm font-semibold",
                  isCurrent ? "text-redline" : isDone ? "text-ink-primary" : "text-ink-secondary"
                )}
              >
                <span className="sr-only">{String(stepNumber).padStart(2, "0")} </span>
                {step.name}
              </span>
              <span className="hidden text-xs text-ink-muted xl:block">{step.note}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
};
