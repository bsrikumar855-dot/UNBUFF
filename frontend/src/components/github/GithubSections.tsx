import React, { useMemo, useState } from "react";
import {
  Archive,
  Check,
  CircleHelp,
  GitCommit,
  GitFork,
  GitPullRequest,
  Scale,
  Star,
  X,
} from "lucide-react";
import { TILE } from "@/components/ui/GlassCard";
import { cn } from "@/lib/cn";
import { CHECK_STATUS_LABEL, checklistScore, monthLabel } from "@/lib/github";
import type {
  GithubActivityItem,
  GithubChecklistItem,
  GithubLanguageShare,
  GithubRepository,
} from "@/types/contract";

/** Jump links to each section of the page, so a long page stays easy to move around. */
export const SectionNav: React.FC<{ items: { id: string; label: string }[] }> = ({
  items,
}) => (
  <nav
    aria-label="On this page"
    className="sticky top-16 z-20 -mx-1 mt-6 flex gap-1.5 overflow-x-auto px-1 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
  >
    {items.map((i) => (
      <a
        key={i.id}
        href={`#${i.id}`}
        onClick={(e) => {
          const el = document.getElementById(i.id);
          if (!el) return;
          e.preventDefault();
          el.scrollIntoView({
            behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
              ? "auto"
              : "smooth",
            block: "start",
          });
        }}
        className="shrink-0 rounded-full bg-white/70 px-4 py-1.5 text-sm font-medium text-ink-secondary shadow-[inset_0_0_0_1px_rgba(24,24,27,0.08),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-md transition-colors hover:bg-white hover:text-redline focus-visible:outline-2 focus-visible:outline-redline"
      >
        {i.label}
      </a>
    ))}
  </nav>
);

/** A thin progress bar with its numbers also written out. */
export const ProgressBar: React.FC<{ value: number; max: number; label: string }> = ({
  value,
  max,
  label,
}) => (
  <div
    role="progressbar"
    aria-label={label}
    aria-valuemin={0}
    aria-valuemax={max}
    aria-valuenow={value}
    className="h-1.5 w-full overflow-hidden rounded-full bg-surface-200"
  >
    <div
      className="h-full rounded-full bg-[linear-gradient(90deg,#f0604e,#c9362a)] transition-[width] duration-700"
      style={{ width: `${max > 0 ? Math.round((value / max) * 100) : 0}%` }}
    />
  </div>
);

const LANG_COLORS = ["#c9362a", "#e8806e", "#5c564b", "#9d9582", "#cfc8b6", "#3b0f0a"];

/** Languages as one stacked bar plus a legend (names and percentages are always in the text). */
export const LanguageBar: React.FC<{
  languages: GithubLanguageShare[];
  fallback: string | null;
}> = ({ languages, fallback }) => {
  if (languages.length === 0)
    return <p className="text-xs text-ink-muted">{fallback ?? "Language unknown"}</p>;
  return (
    <div>
      <div
        className="flex h-1.5 w-full overflow-hidden rounded-full bg-surface-200"
        aria-hidden="true"
      >
        {languages.map((l, i) => (
          <span
            key={l.name}
            style={{
              width: `${l.percent}%`,
              background: LANG_COLORS[i % LANG_COLORS.length],
            }}
          />
        ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-secondary">
        {languages.map((l, i) => (
          <li key={l.name} className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="size-2 rounded-full"
              style={{ background: LANG_COLORS[i % LANG_COLORS.length] }}
            />
            {l.name} {l.percent}%
          </li>
        ))}
      </ul>
    </div>
  );
};

const Chip: React.FC<{ icon?: React.ReactNode; children: React.ReactNode }> = ({
  icon,
  children,
}) => (
  <span className="inline-flex items-center gap-1 rounded-full bg-white/80 px-2.5 py-0.5 text-xs text-ink-secondary shadow-[inset_0_0_0_1px_rgba(24,24,27,0.07)]">
    {icon}
    {children}
  </span>
);

const Metric: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}> = ({ icon, label, value }) => (
  <div>
    <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-ink-muted">
      <span aria-hidden="true">{icon}</span>
      {label}
    </p>
    <p className="num mt-0.5 text-sm font-medium text-ink-primary">{value}</p>
  </div>
);

const RepoCard: React.FC<{ r: GithubRepository }> = ({ r }) => (
  <li className={cn(TILE, "flex flex-col gap-3 p-4")}>
    <div className="flex flex-wrap items-start justify-between gap-2">
      <a
        href={r.url}
        target="_blank"
        rel="noreferrer"
        className="min-w-0 break-words font-semibold text-ink-primary underline-offset-4 hover:text-redline hover:underline"
      >
        {r.name_with_owner}
      </a>
      <div className="flex flex-wrap gap-1.5">
        {r.is_fork && <Chip icon={<GitFork size={11} />}>Fork</Chip>}
        {r.is_archived && <Chip icon={<Archive size={11} />}>Archived</Chip>}
        {r.has_license && <Chip icon={<Scale size={11} />}>Licensed</Chip>}
        {r.stars > 0 && <Chip icon={<Star size={11} />}>{r.stars}</Chip>}
      </div>
    </div>
    <p className="text-sm leading-snug text-ink-secondary">
      {r.description ?? "No description."}
    </p>
    {r.topics.length > 0 && (
      <ul className="flex flex-wrap gap-1.5" aria-label="Topics">
        {r.topics.slice(0, 6).map((t) => (
          <li key={t}>
            <Chip>{t}</Chip>
          </li>
        ))}
      </ul>
    )}
    <LanguageBar languages={r.languages} fallback={r.primary_language} />
    <div className="mt-auto grid grid-cols-2 gap-x-4 gap-y-3 border-t border-black/5 pt-3">
      <Metric
        icon={<GitCommit size={11} />}
        label="Your commits, 90 days"
        value={r.your_commits_90d ?? "unknown"}
      />
      <Metric
        icon={<GitPullRequest size={11} />}
        label="Open PRs"
        value={r.open_pull_requests}
      />
      <Metric icon={<CircleHelp size={11} />} label="Open issues" value={r.open_issues} />
      <Metric
        icon={<GitCommit size={11} />}
        label="Last push"
        value={r.pushed_at ? new Date(r.pushed_at).toLocaleDateString() : "unknown"}
      />
    </div>
  </li>
);

type RepoSort = "recent" | "active";

/** Repositories as cards, with two simple controls so a long list stays manageable. */
export const RepoList: React.FC<{ repos: GithubRepository[] }> = ({ repos }) => {
  const [hideNoise, setHideNoise] = useState(false);
  const [sort, setSort] = useState<RepoSort>("recent");
  const shown = useMemo(() => {
    const list = hideNoise
      ? repos.filter((r) => !r.is_fork && !r.is_archived)
      : repos.slice();
    if (sort === "active")
      list.sort((a, b) => (b.your_commits_90d ?? -1) - (a.your_commits_90d ?? -1));
    return list;
  }, [repos, hideNoise, sort]);
  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-ink-secondary">
          <input
            type="checkbox"
            checked={hideNoise}
            onChange={(e) => setHideNoise(e.target.checked)}
            className="size-4 accent-[#c9362a]"
          />
          Hide forks and archived
        </label>
        <label className="inline-flex items-center gap-2 text-sm text-ink-secondary">
          Sort by
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as RepoSort)}
            className="rounded-full border border-line-strong bg-white/80 px-3 py-1 text-sm text-ink-primary"
          >
            <option value="recent">Recently updated</option>
            <option value="active">Your recent commits</option>
          </select>
        </label>
      </div>
      <p className="mt-2 text-xs text-ink-muted" aria-live="polite">
        Showing {shown.length} of {repos.length}
      </p>
      <ul className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-2">
        {shown.map((r) => (
          <RepoCard key={r.name_with_owner} r={r} />
        ))}
      </ul>
    </div>
  );
};

const KIND = {
  pull_request: { label: "Pull request", cls: "bg-redline-soft text-redline-dark" },
  issue: { label: "Issue", cls: "bg-white text-ink-secondary" },
  review: { label: "Review", cls: "bg-surface-200 text-ink-primary" },
} as const;

/** Collaboration as a timeline grouped by month, newest first. */
export const ActivityTimeline: React.FC<{ items: GithubActivityItem[] }> = ({
  items,
}) => {
  const groups = useMemo(() => {
    const m = new Map<string, GithubActivityItem[]>();
    for (const i of [...items].sort((a, b) =>
      b.occurred_at.localeCompare(a.occurred_at)
    )) {
      const key = i.occurred_at.slice(0, 7);
      m.set(key, [...(m.get(key) ?? []), i]);
    }
    return [...m.entries()];
  }, [items]);
  return (
    <div className="mt-4 flex flex-col gap-5">
      {groups.map(([period, list]) => (
        <section key={period} aria-label={monthLabel(period)}>
          <h3 className="eyebrow mb-2">{monthLabel(period)}</h3>
          <ul className="relative flex flex-col gap-2 border-l border-black/10 pl-4">
            {list.map((i) => (
              <li
                key={`${i.kind}-${i.url}-${i.occurred_at}`}
                className={cn(TILE, "relative px-4 py-3 text-sm")}
              >
                <span
                  aria-hidden="true"
                  className="absolute -left-[1.38rem] top-5 size-2 rounded-full bg-redline"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-xs font-medium",
                      KIND[i.kind].cls
                    )}
                  >
                    {KIND[i.kind].label}
                  </span>
                  <span className="text-xs capitalize text-ink-muted">
                    {i.state.toLowerCase()}
                  </span>
                  <span className="text-xs text-ink-muted">
                    · {new Date(i.occurred_at).toLocaleDateString()}
                  </span>
                </div>
                <a
                  href={i.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 block font-medium text-ink-primary underline-offset-4 hover:text-redline hover:underline"
                >
                  {i.title}
                </a>
                <p className="text-xs text-ink-muted">{i.repository}</p>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
};

const MARK = {
  pass: { Icon: Check, cls: "bg-verdict-defended-bg text-verdict-defended-fg" },
  fail: { Icon: X, cls: "bg-verdict-bluff-bg text-verdict-bluff-fg" },
  unknown: { Icon: CircleHelp, cls: "bg-surface-200 text-ink-muted" },
} as const;

/** Per-repository checklist with its own progress, and failing checks first so the next step is on top. */
export const ChecklistCards: React.FC<{ items: GithubChecklistItem[] }> = ({ items }) => {
  const byRepo = new Map<string, GithubChecklistItem[]>();
  for (const i of items)
    byRepo.set(i.repository, [...(byRepo.get(i.repository) ?? []), i]);
  const order = { fail: 0, unknown: 1, pass: 2 } as const;
  const total = checklistScore(items);
  return (
    <div>
      <div className={cn(TILE, "mb-4 flex flex-col gap-2 p-4")}>
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm font-semibold text-ink-primary">Overall</p>
          <p className="num text-sm text-ink-secondary">
            {total.pass} of {total.checked} checks done
            {total.unknown > 0 ? ` · ${total.unknown} couldn't be checked` : ""}
          </p>
        </div>
        <ProgressBar
          value={total.pass}
          max={Math.max(1, total.checked)}
          label="Portfolio checks done"
        />
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-2">
        {[...byRepo.entries()].map(([repo, list]) => {
          const s = checklistScore(list);
          return (
            <section
              key={repo}
              aria-label={`Checklist for ${repo}`}
              className={cn(TILE, "p-4")}
            >
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="min-w-0 break-words text-[15px] font-semibold text-ink-primary">
                  {repo}
                </h3>
                <span className="num shrink-0 text-xs text-ink-secondary">
                  {s.pass}/{s.checked}
                </span>
              </div>
              <div className="mt-2">
                <ProgressBar
                  value={s.pass}
                  max={Math.max(1, s.checked)}
                  label={`Checks done for ${repo}`}
                />
              </div>
              <ul className="mt-3 flex flex-col gap-2">
                {[...list]
                  .sort((a, b) => order[a.status] - order[b.status])
                  .map((i) => {
                    const { Icon, cls } = MARK[i.status];
                    return (
                      <li key={i.check} className="flex gap-2.5 text-sm">
                        <span
                          aria-hidden="true"
                          className={cn(
                            "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full",
                            cls
                          )}
                        >
                          <Icon size={12} strokeWidth={2.5} />
                        </span>
                        <span>
                          <span className="font-medium text-ink-primary">
                            {i.label}: {CHECK_STATUS_LABEL[i.status]}
                          </span>
                          <span className="block text-xs text-ink-muted">
                            {i.evidence}
                          </span>
                        </span>
                      </li>
                    );
                  })}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
};
