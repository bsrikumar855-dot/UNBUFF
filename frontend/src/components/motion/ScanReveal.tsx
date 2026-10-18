import React, { useRef, useState } from "react";
import { m } from "motion/react";
import { cn } from "@/lib/cn";
import { canObserve, prefersReducedMotion } from "./ease";
import { settle } from "./tokens";
import { useSeen } from "./useSeen";

/**
 * Reveals a block the way a proof is checked: a red scan line sweeps across it once and the content appears behind the
 * line. Used sparingly, for the first appearance of a block of real results. The content is in the document and
 * selectable throughout; once the sweep ends the clip is removed entirely, so focus rings and shadows are never cut off.
 * Without motion (tests, reduced motion, old browsers) the content is simply there.
 */
export const ScanReveal: React.FC<{ children: React.ReactNode; className?: string; duration?: number; delay?: number }> = ({ children, className, duration = 0.9, delay = 0 }) => {
  const ref = useRef<HTMLDivElement>(null);
  const animated = canObserve() && !prefersReducedMotion();
  const seen = useSeen(ref as React.RefObject<Element>, "0px 0px -8% 0px");
  const [done, setDone] = useState(!animated);
  return (
    <div ref={ref} className={cn("relative", className)}>
      <m.div
        initial={animated ? { clipPath: "inset(0 100% 0 0)" } : false}
        animate={animated ? { clipPath: seen ? "inset(0 0% 0 0)" : "inset(0 100% 0 0)" } : undefined}
        transition={settle(duration, delay)}
        onAnimationComplete={() => seen && setDone(true)}
        style={done ? { clipPath: "none" } : undefined}
      >
        {children}
      </m.div>
      {animated && !done && (
        <m.span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 w-0.5 bg-redline"
          initial={{ left: "0%", opacity: 0 }}
          animate={seen ? { left: "100%", opacity: [0, 1, 1, 0] } : { left: "0%", opacity: 0 }}
          transition={{ ...settle(duration, delay), opacity: { duration, delay, times: [0, 0.08, 0.9, 1] } }}
        />
      )}
    </div>
  );
};
