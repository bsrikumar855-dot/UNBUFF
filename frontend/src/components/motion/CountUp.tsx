import React, { useEffect, useRef } from "react";
import { animate, m, useMotionValue, useTransform } from "motion/react";
import { EASE, canObserve, prefersReducedMotion } from "./ease";
import { useSeen } from "./useSeen";

/**
 * A real number that counts up to its value when it scrolls into view. The number is always the true value: it starts
 * at the true value wherever motion cannot run (tests, reduced motion, old browsers) and the animation only changes how
 * it arrives. It never invents or rounds away data: `value` is passed through unchanged at the end.
 */
export const CountUp: React.FC<{
  value: number;
  className?: string;
  /** Formats the in-flight number; the final frame is always `format(value)`. */
  format?: (n: number) => string;
  duration?: number;
}> = ({ value, className, format = (n) => String(Math.round(n)), duration = 1.1 }) => {
  const ref = useRef<HTMLSpanElement>(null);
  const run = canObserve() && !prefersReducedMotion();
  const mv = useMotionValue(run ? 0 : value);
  const text = useTransform(mv, (n) => format(n));
  const seen = useSeen(ref);

  useEffect(() => {
    if (!run) {
      mv.set(value);
      return;
    }
    if (!seen) return;
    const controls = animate(mv, value, { duration, ease: EASE });
    return () => controls.stop();
  }, [mv, value, run, seen, duration]);

  return (
    <m.span ref={ref} className={className}>
      {text}
    </m.span>
  );
};
