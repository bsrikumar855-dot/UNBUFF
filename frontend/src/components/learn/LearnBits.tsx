import React from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import { GLASS } from "@/components/ui/GlassCard";
import { cn } from "@/lib/cn";

/** A small rounded label: the level of a pattern, a quiz state, a difficulty. */
export const Pill: React.FC<{
  tone?: "core" | "plain" | "ink" | "verified" | "alert";
  children: React.ReactNode;
  className?: string;
}> = ({ tone = "plain", children, className }) => (
  <span
    className={cn(
      "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase leading-4 tracking-wide",
      tone === "core" && "bg-redline-soft text-redline",
      tone === "plain" && "bg-white/80 text-ink-secondary shadow-[inset_0_0_0_1px_rgba(24,24,27,0.1)]",
      tone === "ink" && "bg-ink-primary text-surface-50",
      tone === "verified" && "bg-verified/12 text-verified shadow-[inset_0_0_0_1px_rgba(30,110,70,0.25)]",
      tone === "alert" && "bg-redline-soft/70 text-redline shadow-[inset_0_0_0_1px_rgba(179,41,26,0.2)]",
      className
    )}
  >
    {children}
  </span>
);

/** The rounded square that holds a topic's icon. */
export const IconBox: React.FC<{ icon: LucideIcon; className?: string }> = ({
  icon: Icon,
  className,
}) => (
  <span
    aria-hidden="true"
    className={cn(
      "grid size-14 shrink-0 place-items-center rounded-2xl bg-redline-soft/70 text-redline shadow-[inset_0_0_0_1px_rgba(179,41,26,0.12)]",
      className
    )}
  >
    <Icon size={26} strokeWidth={1.6} />
  </span>
);

/** A cue or keyword on a rounded chip. */
export const Chip: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <li className="rounded-full bg-white/70 px-2.5 py-0.5 text-xs text-ink-secondary shadow-[inset_0_0_0_1px_rgba(24,24,27,0.08)]">
    {children}
  </li>
);

/**
 * One topic as a glass card. The title is the link and stretches over the whole card, so the card is one target; the
 * arrow at the end only shows that.
 */
export const LearnCard: React.FC<{
  icon: LucideIcon;
  title: string;
  to: string;
  badge?: React.ReactNode;
  status?: React.ReactNode;
  summary: string;
  chips?: string[];
  chipsLabel?: string;
  meta: React.ReactNode;
}> = ({ icon, title, to, badge, status, summary, chips, chipsLabel, meta }) => (
  <li
    className={cn(
      GLASS,
      "group relative flex gap-4 p-5 transition-colors hover:bg-white/80 focus-within:bg-white/80"
    )}
  >
    <IconBox icon={icon} />
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          to={to}
          className="text-[17px] font-semibold leading-tight text-ink-primary after:absolute after:inset-0 after:rounded-[1.75rem] after:content-[''] focus-visible:outline-hidden focus-visible:after:ring-2 focus-visible:after:ring-redline"
        >
          {title}
        </Link>
        {badge}
        {status}
      </div>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-secondary">{summary}</p>
      {chips && chips.length > 0 && (
        <ul className="mt-2.5 flex flex-wrap gap-1.5" aria-label={chipsLabel}>
          {chips.map((c) => (
            <Chip key={c}>{c}</Chip>
          ))}
        </ul>
      )}
      <div className="mt-3 flex items-center justify-between gap-3 pt-0.5 text-xs text-ink-secondary">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1">{meta}</p>
        <span
          aria-hidden="true"
          className="grid size-8 shrink-0 place-items-center rounded-full bg-white/80 text-ink-muted shadow-[inset_0_0_0_1px_rgba(24,24,27,0.07)] transition-colors group-hover:bg-ink-primary group-hover:text-surface-50"
        >
          <ArrowRight size={15} />
        </span>
      </div>
    </div>
  </li>
);

/** Progress as a visible count and a rounded bar. The bar is only a glance; the count is the fact. */
export const LearnProgress: React.FC<{
  value: number;
  max: number;
  label: string;
  tone?: "redline" | "verified";
}> = ({ value, max, label, tone = "redline" }) => {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium text-ink-primary">{label}</span>
        <span className="num text-ink-secondary">
          {value} of {max}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={`${value} of ${max}`}
        className="h-2.5 w-full overflow-hidden rounded-full bg-surface-200"
      >
        <div
          className={cn("h-full rounded-full", tone === "verified" ? "bg-verified" : "bg-redline")}
          style={{ width: `${pct * 100}%` }}
        />
      </div>
    </div>
  );
};

