import React from "react";
import { cn } from "@/lib/cn";

/**
 * Print-proof furniture: crop marks at the corners and a ruler along an edge. They are the visual language of
 * "a proof being checked", they carry no information, and they are hidden from assistive technology.
 */
export const CropMarks: React.FC<{ className?: string }> = ({ className }) => (
  <div
    aria-hidden="true"
    className={cn("pointer-events-none absolute inset-0 text-foreground/55", className)}
  >
    {(
      [
        "left-0 top-0",
        "right-0 top-0 rotate-90",
        "bottom-0 right-0 rotate-180",
        "bottom-0 left-0 -rotate-90",
      ] as const
    ).map((pos) => (
      <svg
        key={pos}
        width="28"
        height="28"
        viewBox="0 0 28 28"
        className={cn("absolute", pos)}
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
      >
        <path d="M0 14h14M14 0v14" />
        <path d="M0 1h6M1 0v6" />
      </svg>
    ))}
  </div>
);

export const Ruler: React.FC<{ className?: string }> = ({ className }) => (
  <div
    aria-hidden="true"
    className={cn(
      "pointer-events-none absolute inset-y-0 w-3 opacity-60",
      "bg-[repeating-linear-gradient(to_bottom,currentColor_0,currentColor_1px,transparent_1px,transparent_8px)]",
      "mask-[linear-gradient(to_bottom,transparent,black_12%,black_88%,transparent)]",
      className
    )}
  />
);
