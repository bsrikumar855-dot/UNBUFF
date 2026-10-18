import { canObserve } from "@/components/motion/ease";
import { useSeen } from "@/components/motion/useSeen";
import React, { useRef } from "react";
import {
  CHECK_STATUS_LABEL,
  FRESHNESS_LABEL,
  formatWhen,
  heatLevel,
  monthLabel,
} from "@/lib/github";
import { cn } from "@/lib/cn";
import type {
  GithubCalendarWeek,
  GithubChecklistItem,
  GithubPeriodTotal,
  GithubSourceInfo,
} from "@/types/contract";

/** Where the data came from and how old it is. Always a saved copy, never live. */
export const SourceNote: React.FC<{ source: GithubSourceInfo }> = ({ source }) => (
  <p className="text-xs text-ink-muted">
    From GitHub @{source.login} · saved copy synchronised {formatWhen(source.synced_at)}
    {source.from && source.to ? ` · covers ${source.from} to ${source.to}` : ""} ·{" "}
    {FRESHNESS_LABEL[source.freshness]}
  </p>
);

// A neutral ink scale, deliberately not red (reads as an error) or green (reads as verified): GitHub activity is context.
const LEVEL = [
  "bg-surface-200",
  "bg-[#CFC8B6]",
  "bg-[#9D9582]",
  "bg-[#5C564B]",
  "bg-ink-primary",
];

/** Heatmap drawn with plain divs; the numbers are repeated as text in the monthly table below it. */
export const Heatmap: React.FC<{
  weeks: GithubCalendarWeek[];
  total: number | null;
  from: string | null;
  to: string | null;
}> = ({ weeks, total, from, to }) => {
  const max = Math.max(0, ...weeks.flatMap((w) => w.days.map((d) => d.count)));
  // The grid sweeps in once, a column at a time, the first time it is seen. The numbers are in the document throughout.
  const ref = useRef<HTMLDivElement>(null);
  const armed = canObserve();
  const seen = useSeen(ref as React.RefObject<Element>, "0px 0px -8% 0px");
  return (
    <div
      ref={ref}
      className="heat"
      data-armed={armed ? "true" : "false"}
      data-seen={seen ? "true" : "false"}
    >
      {/* The grid shares the available width instead of scrolling sideways: every cell is a square that shrinks with the screen. */}
      <div
        role="img"
        aria-label={`Contribution heatmap from ${from ?? "?"} to ${to ?? "?"}: ${total ?? 0} contributions in total. Monthly totals are listed below.`}
        className="grid w-full max-w-4xl gap-[2px]"
        style={{
          gridTemplateColumns: `repeat(${Math.max(1, weeks.length)}, minmax(0, 1fr))`,
        }}
      >
        {weeks.map((w, wi) => (
          <div
            key={w.starts_on}
            className="heat-col grid gap-[2px]"
            style={{ "--i": wi } as React.CSSProperties}
          >
            {w.days.map((d) => (
              <div
                key={d.date}
                title={`${d.date}: ${d.count} contribution${d.count === 1 ? "" : "s"}`}
                className={cn(
                  "aspect-square w-full rounded-[1px]",
                  LEVEL[heatLevel(d.count, max)]
                )}
              />
            ))}
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-ink-muted">
        Darker squares mean more contributions that day, relative to your busiest day.
      </p>
    </div>
  );
};

export const PeriodBars: React.FC<{
  rows: GithubPeriodTotal[];
  label: string;
  month?: boolean;
}> = ({ rows, label, month }) => {
  const max = Math.max(1, ...rows.map((r) => r.total));
  return (
    <ul aria-label={label} className="flex flex-col gap-2">
      {rows.map((r) => (
        <li key={r.period} className="flex items-center gap-3 text-sm">
          <span className="w-24 shrink-0 text-ink-secondary">
            {month ? monthLabel(r.period) : r.period.slice(5)}
          </span>
          <div className="h-1.5 flex-1 overflow-hidden bg-surface-200" aria-hidden="true">
            <div
              className="h-full bg-ink-primary"
              style={{ width: `${(r.total / max) * 100}%` }}
            />
          </div>
          <span className="num w-10 text-right text-ink-primary">{r.total}</span>
        </li>
      ))}
    </ul>
  );
};

const MARK = { pass: "✓", fail: "✗", unknown: "?" } as const;

/** Observed facts per repository. The status is words plus a symbol, never colour alone. */
export const Checklist: React.FC<{ items: GithubChecklistItem[] }> = ({ items }) => {
  const byRepo = new Map<string, GithubChecklistItem[]>();
  for (const i of items)
    byRepo.set(i.repository, [...(byRepo.get(i.repository) ?? []), i]);
  return (
    <div className="flex flex-col gap-6">
      {[...byRepo.entries()].map(([repo, list]) => (
        <section
          key={repo}
          aria-label={`Checklist for ${repo}`}
          className="border-t border-line pt-3"
        >
          <h3 className="text-[15px] font-semibold text-ink-primary">{repo}</h3>
          <ul className="mt-2 flex flex-col gap-1.5">
            {list.map((i) => (
              <li key={i.check} className="text-sm">
                <span className="font-medium text-ink-primary">
                  <span aria-hidden="true">{MARK[i.status]} </span>
                  {i.label}: {CHECK_STATUS_LABEL[i.status]}
                </span>
                <span className="block text-xs text-ink-muted">{i.evidence}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
};
