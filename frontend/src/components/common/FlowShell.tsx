import React from "react";
import { StepProgress } from "@/components/common/StepProgress";
import { Enter } from "@/components/motion/Enter";
import { RISE } from "@/components/motion/tokens";
import { cn } from "@/lib/cn";

/**
 * The frame of the session steps: the four-step list on the left, the step itself in the middle and, where a step has
 * one, a column of notes on the right. On narrow screens everything stacks and the steps become a row of pills.
 */
export const FlowShell: React.FC<{
  current: number;
  eyebrow: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}> = ({ current, eyebrow, title, description, aside, children, className }) => (
  <div className={cn("w-full px-4 py-8 sm:px-5 sm:py-10 lg:pl-5 lg:pr-6", className)}>
    <div
      className={cn(
        "grid grid-cols-[minmax(0,1fr)] items-start gap-x-8 gap-y-6",
        aside
          ? "xl:grid-cols-[13rem_minmax(0,1fr)_21rem]"
          : "xl:grid-cols-[13rem_minmax(0,1fr)]"
      )}
    >
      <StepProgress current={current} className="xl:sticky xl:top-8" />
      <div className="min-w-0">
        <Enter y={RISE.sm}>
          <p className="eyebrow mb-2 text-redline">
            {eyebrow} · Step {current} of 4
          </p>
        </Enter>
        <Enter index={1} y={RISE.sm}>
          <h1 className="serif text-title font-medium text-ink-primary">{title}</h1>
        </Enter>
        {description && (
          <p className="mt-3 max-w-2xl leading-relaxed text-ink-secondary">{description}</p>
        )}
        <div className="mt-6">{children}</div>
      </div>
      {aside && <aside className="flex min-w-0 flex-col gap-5 xl:pt-[4.5rem]">{aside}</aside>}
    </div>
  </div>
);
