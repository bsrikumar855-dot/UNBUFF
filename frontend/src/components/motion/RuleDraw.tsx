import React, { useRef } from "react";
import { m } from "motion/react";
import { cn } from "@/lib/cn";
import { canObserve } from "./ease";
import { DUR, settle } from "./tokens";
import { useSeen } from "./useSeen";

/**
 * A hairline that draws itself from the left when it comes into view: the product's structural gesture, like an editor
 * ruling a line under a heading. Purely decorative (`aria-hidden`); without motion it is simply a rule.
 */
export const RuleDraw: React.FC<{ className?: string; delay?: number; duration?: number; tone?: "ink" | "line" | "redline" }> = ({ className, delay = 0, duration = DUR.slow, tone = "line" }) => {
  const ref = useRef<HTMLSpanElement>(null);
  const animated = canObserve();
  const seen = useSeen(ref, "0px 0px -4% 0px");
  const colour = tone === "ink" ? "bg-ink-primary" : tone === "redline" ? "bg-redline" : "bg-line";
  return (
    <span ref={ref} aria-hidden="true" className={cn("block h-px w-full", className)}>
      <m.span
        className={cn("block h-full w-full origin-left", colour)}
        initial={animated ? { scaleX: 0 } : false}
        animate={animated ? { scaleX: seen ? 1 : 0 } : undefined}
        transition={settle(duration, delay)}
      />
    </span>
  );
};
