import React from "react";
import { cn } from "@/lib/cn";
import { GrowBar } from "@/components/motion/GrowBar";

/**
 * A thin ruled progress meter. The number is always printed next to it (the bar is a glance, the number is the
 * fact); the fill animates by transform only and snaps under reduced motion.
 */
export const Meter: React.FC<{
  value: number;
  max: number;
  label: string;
  className?: string;
  tone?: "ink" | "verified" | "redline";
}> = ({ value, max, label, className, tone = "ink" }) => {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const fill =
    tone === "verified"
      ? "bg-verified"
      : tone === "redline"
        ? "bg-redline"
        : "bg-ink-primary";
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={`${value} of ${max}`}
      className={cn("h-1.5 w-full overflow-hidden bg-surface-200", className)}
    >
      <GrowBar value={pct} className="h-full w-full" barClassName={fill} />
    </div>
  );
};
