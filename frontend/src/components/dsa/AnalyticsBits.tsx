import { GrowBar } from "@/components/motion/GrowBar";
import React from "react";
import type { BreakdownRow, RateMetric, WeeklyBucket } from "@/types/contract";
import type { LucideIcon } from "lucide-react";
import { TILE } from "@/components/ui/GlassCard";
import { cn } from "@/lib/cn";

/** A percentage with its sample size, or an honest explanation when there is not enough data. */
export const RateText: React.FC<{ metric: RateMetric; className?: string }> = ({
  metric,
  className,
}) => {
  if (!metric.available || metric.value === null) {
    return (
      <span className={cn("text-sm text-ink-muted", className)}>
        Not enough data yet ({metric.denominator} of {metric.min_sample} needed)
      </span>
    );
  }
  return (
    <span className={className}>
      <span className="font-medium text-ink-primary">
        {Math.round(metric.value * 100)}%
      </span>
      <span className="ml-1 text-sm text-ink-muted">
        ({metric.numerator} of {metric.denominator})
      </span>
    </span>
  );
};

export const Stat: React.FC<{
  label: string;
  children: React.ReactNode;
  hint?: string;
}> = ({ label, children, hint }) => (
  <div className="py-4 pr-4 even:pl-4 sm:px-5 sm:even:pl-5 sm:first:pl-0">
    <p className="eyebrow">{label}</p>
    <div className="num mt-2 text-3xl font-medium leading-none tracking-tight text-ink-primary">
      {children}
    </div>
    {hint && <p className="mt-2 text-xs leading-snug text-ink-muted">{hint}</p>}
  </div>
);

/** A figure on its own glass tile, with a round icon: the card version of {@link Stat}. */
export const StatTile: React.FC<{
  icon: LucideIcon;
  label: string;
  children: React.ReactNode;
  hint?: string;
}> = ({ icon: Icon, label, children, hint }) => (
  <div className={cn(TILE, "flex items-start gap-3.5 p-4")}>
    <span
      aria-hidden="true"
      className="grid size-11 shrink-0 place-items-center rounded-full bg-white text-redline shadow-[inset_0_0_0_1px_rgba(24,24,27,0.08)]"
    >
      <Icon size={20} strokeWidth={1.75} />
    </span>
    <div className="min-w-0">
      <p className="eyebrow">{label}</p>
      <div className="num mt-1.5 text-2xl font-medium leading-none tracking-tight text-ink-primary">
        {children}
      </div>
      {hint && <p className="mt-1.5 text-xs leading-snug text-ink-muted">{hint}</p>}
    </div>
  </div>
);

/**
 * Horizontal bars drawn with plain divs. The numbers are real text next to each bar, so the chart is fully
 * readable without seeing the bars (and the list is exposed as a labelled list for screen readers).
 */
export const BreakdownBars: React.FC<{
  rows: BreakdownRow[];
  label: string;
  labelOf?: (key: string) => string;
}> = ({ rows, label, labelOf }) => {
  const max = Math.max(1, ...rows.map((r) => r.attempts));
  return (
    <ul aria-label={label} className="flex flex-col gap-5">
      {rows.map((r, bi) => (
        <li key={r.key}>
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <span className="font-medium text-ink-primary">
              {labelOf ? labelOf(r.key) : r.key}
            </span>
            <span className="text-ink-secondary">
              {r.accepted} accepted of {r.attempts} submission
              {r.attempts === 1 ? "" : "s"} · {r.questions_solved} of{" "}
              {r.questions_attempted} question{r.questions_attempted === 1 ? "" : "s"}{" "}
              solved
            </span>
          </div>
          <GrowBar
            value={r.attempts / max}
            delay={bi * 0.05}
            className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-surface-200"
            barClassName="flex"
          >
            <div
              className="h-full bg-verified"
              style={{ width: `${r.attempts ? (r.accepted / r.attempts) * 100 : 0}%` }}
            />
            <div className="h-full flex-1 bg-redline/70" />
          </GrowBar>
          <p className="mt-0.5 text-xs text-ink-muted">
            Accuracy: <RateText metric={r.accuracy} />
          </p>
        </li>
      ))}
    </ul>
  );
};

/** Weekly attempts as bars (accepted part highlighted), with the numbers as text and a one-line summary. */
export const WeeklyChart: React.FC<{ weeks: WeeklyBucket[] }> = ({ weeks }) => {
  const max = Math.max(1, ...weeks.map((w) => w.attempts));
  const total = weeks.reduce((s, w) => s + w.attempts, 0);
  const accepted = weeks.reduce((s, w) => s + w.accepted, 0);
  return (
    <figure>
      <figcaption className="mb-2 text-sm text-ink-secondary">
        {total === 0
          ? `No counted submissions in the last ${weeks.length} weeks.`
          : `${total} counted submissions in the last ${weeks.length} weeks, ${accepted} accepted.`}
      </figcaption>
      <ol aria-label="Submissions per week" className="flex items-end gap-2">
        {weeks.map((w, wi) => (
          <li
            key={w.week_start}
            className="flex min-w-0 flex-1 flex-col items-center gap-1 text-xs text-ink-muted"
          >
            <div className="flex h-24 w-full items-end overflow-hidden rounded-xl bg-surface-100" aria-hidden="true">
              <GrowBar axis="y" value={w.attempts / max} delay={wi * 0.04} className="h-full w-full" barClassName="relative bg-redline/70">
                <div
                  className="absolute inset-x-0 bottom-0 bg-verified"
                  style={{
                    height: `${w.attempts ? (w.accepted / w.attempts) * 100 : 0}%`,
                  }}
                />
              </GrowBar>
            </div>
            <span className="text-ink-primary">{w.attempts}</span>
            <span className="truncate">{w.week_start.slice(5)}</span>
            <span className="sr-only">
              week of {w.week_start}: {w.attempts} submissions, {w.accepted} accepted,{" "}
              {w.first_solves} newly solved
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-xs text-ink-muted">
        Green: accepted. Red: not accepted. Weeks start on Monday (UTC).
      </p>
    </figure>
  );
};
