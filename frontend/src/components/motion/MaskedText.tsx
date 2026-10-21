import React, { useRef } from "react";
import { m } from "motion/react";
import { cn } from "@/lib/cn";
import { EASE, canObserve } from "./ease";
import { useSeen } from "./useSeen";

/**
 * Headline reveal: every word slides up out of its own mask, staggered. The text is real text in normal order (the mask
 * is only an overflow clip), so it reads, selects and searches like any heading. Without a browser that can observe
 * (tests, old browsers) or with reduced motion, the words are simply there.
 */
export const MaskedText: React.FC<{
  text: string;
  className?: string;
  /** Seconds before the first word. */
  delay?: number;
  /** Seconds between words. */
  step?: number;
  /** Runs when scrolled into view instead of on mount. */
  inView?: boolean;
  /** Words (matched literally) rendered in italic and marked with the red pen. */
  mark?: string[];
}> = ({ text, className, delay = 0, step = 0.055, inView = false, mark = [] }) => {
  const words = text.split(" ");
  const animated = canObserve();
  // Observe the unclipped outer span: the words themselves sit inside overflow masks and would never report as visible.
  const ref = useRef<HTMLSpanElement>(null);
  const seen = useSeen(ref, "0px 0px -10% 0px");
  const go = inView ? seen : true;
  return (
    <span ref={ref} className={cn("inline", className)}>
      {words.map((w, i) => {
        const marked = mark.includes(w.replace(/[.,]/g, ""));
        return (
          <React.Fragment key={`${w}-${i}`}>
            <span className="inline-block overflow-hidden pb-[0.14em] align-bottom mb-[-0.14em]">
              <m.span
                className={cn(
                  "inline-block will-change-transform",
                  marked && "redline italic font-normal"
                )}
                initial={animated ? { y: "110%" } : false}
                animate={{ y: go ? "0%" : "110%" }}
                transition={{ duration: 0.8, ease: EASE, delay: delay + i * step }}
              >
                {w}
              </m.span>
            </span>
            {i < words.length - 1 ? " " : null}
          </React.Fragment>
        );
      })}
    </span>
  );
};
