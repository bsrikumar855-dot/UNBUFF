import React from "react";
import type { BreakdownRow, RateMetric, WeeklyBucket } from "@/types/contract";
import { cn } from "@/lib/cn";

/** A percentage with its sample size, or an honest explanation when there is not enough data. */
export const RateText: React.FC<{ metric: RateMetric; className?: string }> = ({ metric, className }) => {
  if (!metric.available || metric.value === null) {
    return (
      <span className={cn("text-sm text-ink-muted", className)}>
        Not enough data yet ({metric.denominator} of {metric.min_sample} needed)
      </span>
    );
  }
  return (
    <span className={className}>
      <span className="font-semibold text-ink-primary">{Math.round(metric.value * 100)}%</span>
      <span className="ml-1 text-sm text-ink-muted">
        ({metric.numerator} of {metric.denominator})
      </span>
    </span>
  );
};

export const Stat: React.FC<{ label: string; children: React.ReactNode; hint?: string }> = ({ label, children, hint }) => (
  <div className="rounded-lg border border-line bg-white p-4">
    <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</p>
    <div className="mt-1 text-2xl text-ink-primary">{children}</div>
    {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
  </div>
);

/**
 * Horizontal bars drawn with plain divs. The numbers are real text next to each bar, so the chart is fully
 * readable without seeing the bars (and the list is exposed as a labelled list for screen readers).
 */
export const BreakdownBars: React.FC<{ rows: BreakdownRow[]; label: string; labelOf?: (key: string) => string }> = ({ rows, label, labelOf }) => {
  const max = Math.max(1, ...rows.map((r) => r.attempts));
  return (
    <ul aria-label={label} className="flex flex-col gap-3">
      {rows.map((r) => (
        <li key={r.key}>
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <span className="font-medium text-ink-primary">{labelOf ? labelOf(r.key) : r.key}</span>
            <span className="text-ink-secondary">
              {r.accepted} accepted of {r.attempts} submission{r.attempts === 1 ? "" : "s"} · {r.questions_solved} of {r.questions_attempted} question{r.questions_attempted === 1 ? "" : "s"} solved
            </span>
          </div>
          <div className="mt-1 h-2.5 w-full overflow-hidden rounded bg-surface-100" aria-hidden="true">
            <div className="flex h-full" style={{ width: `${(r.attempts / max) * 100}%` }}>
              <div className="h-full bg-verdict-defended-fg" style={{ width: `${r.attempts ? (r.accepted / r.attempts) * 100 : 0}%` }} />
              <div className="h-full flex-1 bg-verdict-bluff-fg" />
            </div>
          </div>
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
        {total === 0 ? `No counted submissions in the last ${weeks.length} weeks.` : `${total} counted submissions in the last ${weeks.length} weeks, ${accepted} accepted.`}
      </figcaption>
      <ol aria-label="Submissions per week" className="flex items-end gap-2">
        {weeks.map((w) => (
          <li key={w.week_start} className="flex min-w-0 flex-1 flex-col items-center gap-1 text-xs text-ink-muted">
            <div className="flex h-24 w-full items-end rounded bg-surface-50" aria-hidden="true">
              <div className="w-full rounded-t bg-verdict-bluff-fg/70" style={{ height: `${(w.attempts / max) * 100}%` }}>
                <div className="w-full rounded-t bg-verdict-defended-fg" style={{ height: `${w.attempts ? (w.accepted / w.attempts) * 100 : 0}%` }} />
              </div>
            </div>
            <span className="text-ink-primary">{w.attempts}</span>
            <span className="truncate">{w.week_start.slice(5)}</span>
            <span className="sr-only">
              week of {w.week_start}: {w.attempts} submissions, {w.accepted} accepted, {w.first_solves} newly solved
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-xs text-ink-muted">Green: accepted. Red: not accepted. Weeks start on Monday (UTC).</p>
    </figure>
  );
};
