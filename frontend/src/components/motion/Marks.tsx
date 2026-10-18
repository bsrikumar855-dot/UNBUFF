import React from "react";
import { m } from "motion/react";
import { cn } from "@/lib/cn";
import { canObserve } from "./ease";
import { DUR, settle } from "./tokens";

/** A check that draws its own stroke: the confirmation for something the student just did (a task done, a save). */
export const CheckMark: React.FC<{ size?: number; className?: string }> = ({ size = 16, className }) => {
  const animated = canObserve();
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <m.path
        d="M3 8.6l3.1 3.1L13 4.6"
        stroke="currentColor"
        strokeWidth={1.9}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={animated ? { pathLength: 0 } : false}
        animate={{ pathLength: 1 }}
        transition={settle(DUR.base)}
      />
    </svg>
  );
};

/**
 * Text with a red-pen strike that draws across it when `on` becomes true and retracts when it becomes false. The text
 * stays real text; the line is decoration and the done state is also carried by the surrounding control and label.
 */
export const Strike: React.FC<{ on: boolean; children: React.ReactNode; className?: string }> = ({ on, children, className }) => {
  const animated = canObserve();
  const line = "pointer-events-none absolute left-0 top-[0.62em] h-px w-full origin-left bg-redline";
  return (
    <span className={cn("relative inline", className)}>
      <span className={cn("transition-colors duration-200", on && "text-ink-muted")}>{children}</span>
      {animated ? (
        <m.span aria-hidden="true" className={line} initial={{ scaleX: on ? 1 : 0 }} animate={{ scaleX: on ? 1 : 0 }} transition={settle(DUR.base)} />
      ) : (
        <span aria-hidden="true" className={line} style={{ transform: on ? "scaleX(1)" : "scaleX(0)" }} />
      )}
    </span>
  );
};

/** Swaps between two states of an icon with a short scale-and-fade, so a toggle reads as a change and not a flicker. */
export const Swap: React.FC<{ state: string; children: React.ReactNode }> = ({ state, children }) => {
  const animated = canObserve();
  return (
    <m.span
      key={state}
      className="inline-flex"
      initial={animated ? { scale: 0.6, opacity: 0 } : false}
      animate={{ scale: 1, opacity: 1 }}
      transition={settle(DUR.fast)}
    >
      {children}
    </m.span>
  );
};
