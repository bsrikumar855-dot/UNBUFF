import React, { useRef } from "react";
import { cn } from "@/lib/cn";
import { canObserve, prefersReducedMotion } from "./ease";
import { useSeen } from "./useSeen";

/**
 * A bar whose length is a real value in 0..1. It grows from zero the first time it is seen and then follows the value
 * whenever the value changes, with a transform transition (never width or height), so unrelated re-renders replay
 * nothing. The number it stands for is always printed beside it by the caller. Without motion it is just at its value.
 */
export const GrowBar: React.FC<{
  value: number;
  axis?: "x" | "y";
  className?: string;
  /** Classes for the element that scales. */
  barClassName?: string;
  children?: React.ReactNode;
  /** Seconds before the first growth, for staggering a set of bars. */
  delay?: number;
}> = ({ value, axis = "x", className, barClassName, children, delay = 0 }) => {
  const ref = useRef<HTMLDivElement>(null);
  const animated = canObserve() && !prefersReducedMotion();
  const seen = useSeen(ref as React.RefObject<Element>, "0px 0px -4% 0px");
  const v = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const shown = animated && !seen ? 0 : v;
  return (
    <div ref={ref} className={className}>
      <div
        className={cn(axis === "x" ? "h-full origin-left" : "w-full origin-bottom", "transition-transform duration-500 ease-out motion-reduce:transition-none", barClassName)}
        style={{ transform: axis === "x" ? `scaleX(${shown})` : `scaleY(${shown})`, transitionDelay: animated && !seen ? "0s" : `${delay}s`, ...(axis === "y" ? { height: "100%" } : {}) }}
      >
        {children}
      </div>
    </div>
  );
};
