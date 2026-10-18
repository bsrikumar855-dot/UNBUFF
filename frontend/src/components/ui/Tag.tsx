import React from "react";
import { cn } from "@/lib/cn";

/**
 * Provenance and state markers. The product's main honesty rule is to separate what was verified from what the
 * student said and from what is not available, so these are first-class: a mono label with a shape marker, never
 * colour alone, and deliberately not pills.
 */
const TONES = {
  verified: { mark: "■", cls: "border-verified/40 text-verified", label: "Verified" },
  self: {
    mark: "◇",
    cls: "border-line-strong text-ink-secondary",
    label: "Self-reported",
  },
  unavailable: {
    mark: "▲",
    cls: "border-verdict-shaky-fg/50 text-ink-secondary",
    label: "Unavailable",
  },
  none: { mark: "○", cls: "border-line-strong text-ink-muted", label: "No evidence yet" },
  alert: { mark: "●", cls: "border-redline/50 text-redline", label: "Needs attention" },
  neutral: { mark: "·", cls: "border-line-strong text-ink-secondary", label: "" },
} as const;

export type TagTone = keyof typeof TONES;

export const Tag: React.FC<{
  tone?: TagTone;
  children?: React.ReactNode;
  className?: string;
}> = ({ tone = "neutral", children, className }) => {
  const t = TONES[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm border px-1.5 py-0.5 font-mono text-[11px] font-medium uppercase leading-4 tracking-wide",
        t.cls,
        className
      )}
    >
      <span aria-hidden="true" className="text-[9px] leading-none">
        {t.mark}
      </span>
      {children ?? t.label}
    </span>
  );
};
