import React from "react";
import { m } from "motion/react";
import { cn } from "@/lib/cn";
import { SPRING_LAND, canObserve } from "./ease";

const TONE = {
  verified: "border-verified text-verified",
  redline: "border-redline text-redline",
  ink: "border-foreground text-foreground",
} as const;

/**
 * A rubber stamp that lands on the page: the product's feedback moment for a verdict. It is purely decorative (the
 * verdict is always written out in text beside it), so the label is drawn with CSS content and is not in the document
 * text, and it is hidden from assistive technology. Under reduced motion it simply appears.
 */
export const Stamp: React.FC<{
  label: string;
  tone?: keyof typeof TONE;
  className?: string;
  /** Degrees; a slight tilt reads as hand-stamped. */
  tilt?: number;
}> = ({ label, tone = "ink", className, tilt = -6 }) => {
  const animated = canObserve();
  return (
    <m.div
      aria-hidden="true"
      data-label={label}
      initial={animated ? { scale: 2.4, rotate: tilt - 10, opacity: 0 } : false}
      animate={{ scale: 1, rotate: tilt, opacity: 1 }}
      transition={SPRING_LAND}
      className={cn(
        "pointer-events-none inline-flex select-none items-center justify-center border-[3px] px-3 py-1.5 font-mono text-sm font-semibold uppercase tracking-[0.18em]",
        "shadow-[inset_0_0_0_2px_var(--stamp-gap,transparent)] outline outline-1 -outline-offset-[7px] outline-current",
        "after:content-[attr(data-label)]",
        TONE[tone],
        className
      )}
    />
  );
};
