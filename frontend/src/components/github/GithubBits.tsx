import React from "react";
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

const LEVEL = [
  "bg-surface-100",
  "bg-primary-soft",
  "bg-primary/40",
  "bg-primary/70",
  "bg-primary",
];

/** Heatmap drawn with plain divs; the numbers are repeated as text in the monthly table below it. */
export const Heatmap: React.FC<{
  weeks: GithubCalendarWeek[];
  total: number | null;
  from: string | null;
  to: string | null;
}> = ({ weeks, total, from, to }) => {
  const max = Math.max(0, ...weeks.flatMap((w) => w.days.map((d) => d.count)));
  return (
    <div className="overflow-x-auto">
      <div
        role="img"
        aria-label={`Contribution heatmap from ${from ?? "?"} to ${to ?? "?"}: ${total ?? 0} contributions in total. Monthly totals are listed below.`}
        className="flex w-max gap-0.5"
      >
        {weeks.map((w) => (
          <div key={w.starts_on} className="flex flex-col gap-0.5">
            {w.days.map((d) => (
              <div
                key={d.date}
                title={`${d.date}: ${d.count} contribution${d.count === 1 ? "" : "s"}`}
                className={cn("h-3 w-3 rounded-sm", LEVEL[heatLevel(d.count, max)])}
              />
            ))}
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-ink-muted">
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
    <ul aria-label={label} className="flex flex-col gap-1.5">
      {rows.map((r) => (
        <li key={r.period} className="flex items-center gap-3 text-sm">
          <span className="w-24 shrink-0 text-ink-secondary">
            {month ? monthLabel(r.period) : r.period.slice(5)}
          </span>
          <div
            className="h-2.5 flex-1 overflow-hidden rounded bg-surface-100"
            aria-hidden="true"
          >
            <div
              className="h-full bg-primary"
              style={{ width: `${(r.total / max) * 100}%` }}
            />
          </div>
          <span className="w-10 text-right text-ink-primary">{r.total}</span>
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
    <div className="flex flex-col gap-4">
      {[...byRepo.entries()].map(([repo, list]) => (
        <section
          key={repo}
          aria-label={`Checklist for ${repo}`}
          className="rounded-md border border-line p-3"
        >
          <h3 className="text-sm font-semibold text-ink-primary">{repo}</h3>
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
