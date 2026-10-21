import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  ArrowRight,
  BarChart3,
  CalendarDays,
  ClipboardCheck,
  Flame,
  Folder,
  FolderGit2,
  GitCommit,
  GitPullRequest,
  Lock,
  ShieldCheck,
} from "lucide-react";
import { api } from "@/api/endpoints";
import {
  Checklist,
  Heatmap,
  PeriodBars,
  SourceNote,
} from "@/components/github/GithubBits";
import { GithubConnectionPanel } from "@/components/github/GithubConnectionPanel";
import { StatTile } from "@/components/dsa/AnalyticsBits";
import { ErrorState } from "@/components/ui/ErrorState";
import { GLASS, GlassCard, TILE } from "@/components/ui/GlassCard";
import { Page, PageHeader } from "@/components/ui/Page";
import { LoadingState } from "@/components/ui/LoadingState";
import { cn } from "@/lib/cn";
import { routes } from "@/lib/routes";
import type {
  GithubActivityResponse,
  GithubConnection,
  GithubContributionsResponse,
  GithubRepositoriesResponse,
} from "@/types/contract";

const KIND_LABEL = {
  pull_request: "Pull request",
  issue: "Issue",
  review: "Review",
} as const;

const AFTER_CONNECT = [
  {
    icon: BarChart3,
    title: "Contribution activity",
    text: "See your contribution history over time and identify consistent activity and learning habits.",
  },
  {
    icon: Folder,
    title: "Repositories",
    text: "View your public repositories, languages, and key projects relevant to your goals.",
  },
  {
    icon: ClipboardCheck,
    title: "Portfolio checklist",
    text: "Get a checklist of your projects, README, topics, and profile improvements from the AI mentor.",
  },
];

function useSection<T>(load: () => Promise<T>, enabled: boolean, key: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled) {
      setData(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setError(null);
    load()
      .then((r) => !cancelled && setData(r))
      .catch((e: unknown) => !cancelled && setError(e));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key, attempt]);
  return { data, error, retry: () => setAttempt((a) => a + 1) };
}

const Empty: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-sm text-ink-secondary">{children}</p>
);

/** Public GitHub activity from the last synchronisation. Partial evidence of development work, not a score. */
const GithubInsightsPage: React.FC = () => {
  const [conn, setConn] = useState<GithubConnection | null>(null);
  const [key, setKey] = useState(0);
  useEffect(() => {
    let cancelled = false;
    api
      .getGithubConnection()
      .then((c) => !cancelled && setConn(c))
      .catch(() => undefined); // the panel below shows the failure and a retry
    return () => {
      cancelled = true;
    };
  }, [key]);

  const readable =
    conn?.status === "connected" || conn?.status === "reauthorization_required";
  const contributions = useSection<GithubContributionsResponse>(
    api.getGithubContributions,
    readable,
    key
  );
  const repositories = useSection<GithubRepositoriesResponse>(
    api.getGithubRepositories,
    readable,
    key
  );
  const activity = useSection<GithubActivityResponse>(
    api.getGithubActivity,
    readable,
    key
  );
  const refresh = useCallback(() => setKey((k) => k + 1), []);

  const c = contributions.data;
  const locked = conn && !readable && conn.status !== "not_configured";
  return (
    <Page width="fluid" className="sm:px-5 lg:pl-5 lg:pr-6">
      <PageHeader
        eyebrow="Evidence"
        title={
          <>
            GitHub <em>insights</em>
          </>
        }
        description={
          <>
            What your public GitHub shows about your development work.{" "}
            <strong>It is partial evidence, not a measure of skill</strong>: private work,
            other platforms and learning time do not appear, and it does not count as DSA
            practice.
          </>
        }
        actions={
          <div className={cn(GLASS, "flex max-w-sm items-center gap-3.5 px-5 py-4")}>
            <span
              aria-hidden="true"
              className="grid size-12 shrink-0 place-items-center rounded-full bg-white text-redline shadow-[inset_0_0_0_1px_rgba(24,24,27,0.08)]"
            >
              <ShieldCheck size={22} strokeWidth={1.75} />
            </span>
            <div>
              <p className="text-sm font-semibold text-ink-primary">Public data only</p>
              <p className="mt-0.5 text-xs leading-snug text-ink-secondary">
                We only read public information from your GitHub. No private repositories
                are requested or shown.
              </p>
            </div>
          </div>
        }
      />

      <GithubConnectionPanel onSynced={refresh} onDisconnected={refresh} />

      {locked && (
        <section aria-labelledby="after-connect" className="mt-8">
          <h2 id="after-connect" className="serif text-heading font-medium text-ink-primary">
            What you&apos;ll get after connecting
          </h2>
          <p className="mt-1 text-sm text-ink-secondary">
            Your GitHub data will be used to provide evidence and insights across UNBLUFF.
          </p>
          <ul className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-3">
            {AFTER_CONNECT.map((f) => (
              <li key={f.title} className={cn(GLASS, "flex flex-col gap-3 p-5")}>
                <div className="flex items-start gap-3.5">
                  <span
                    aria-hidden="true"
                    className="grid size-12 shrink-0 place-items-center rounded-2xl bg-redline-soft/70 text-redline"
                  >
                    <f.icon size={22} strokeWidth={1.7} />
                  </span>
                  <div>
                    <h3 className="font-semibold text-ink-primary">{f.title}</h3>
                    <p className="mt-1 text-sm leading-snug text-ink-secondary">{f.text}</p>
                  </div>
                </div>
                <span className="inline-flex w-fit items-center gap-2 rounded-full bg-white/70 px-3.5 py-1.5 text-xs text-ink-secondary shadow-[inset_0_0_0_1px_rgba(24,24,27,0.08)]">
                  <Lock size={12} aria-hidden="true" />
                  Available after connection
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {conn && !readable && (
        <p className="mt-6 flex flex-wrap items-center gap-x-2 text-sm text-ink-secondary">
          <span>
            {conn.status === "not_configured"
              ? "Nothing to show until GitHub is set up on this server."
              : "Connect GitHub above to see your contribution history, repositories and a portfolio checklist."}
          </span>
          <Link
            to={routes.settings}
            className="inline-flex items-center gap-1 text-redline underline underline-offset-4"
          >
            Settings
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </p>
      )}

      {readable && (
        <div className="mt-6 flex flex-col gap-5">
          <GlassCard id="contrib" icon={CalendarDays} title="Contribution calendar" sub="Your public contributions from the last synchronisation.">
            {contributions.error !== null && (
              <ErrorState error={contributions.error} onRetry={contributions.retry} />
            )}
            {contributions.error === null && c === null && (
              <LoadingState message="Loading your contributions…" />
            )}
            {c && !c.available && (
              <Empty>
                No contribution data yet. Use “Sync now” to fetch it from GitHub.
              </Empty>
            )}
            {c && c.available && (
              <>
                <SourceNote source={c.source} />
                <div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <StatTile icon={Activity} label="Contributions" hint="GitHub's own total for this period">
                    {c.total}
                  </StatTile>
                  <StatTile icon={CalendarDays} label="Active days">{c.active_days ?? "–"}</StatTile>
                  <StatTile icon={Flame} label="Longest streak" hint="consecutive days">
                    {c.longest_streak_days ?? "–"}
                  </StatTile>
                  <StatTile icon={GitCommit} label="Commits · PRs · reviews · issues">
                    <span className="text-lg">
                      {c.breakdown
                        ? `${c.breakdown.commits} · ${c.breakdown.pull_requests} · ${c.breakdown.reviews} · ${c.breakdown.issues}`
                        : "–"}
                    </span>
                  </StatTile>
                </div>
                <div className={cn(TILE, "mt-4 p-4")}>
                  <Heatmap
                    weeks={c.weeks}
                    total={c.total}
                    from={c.source.from}
                    to={c.source.to}
                  />
                </div>
                {c.restricted_count ? (
                  <p className="mt-2 text-xs text-ink-muted">
                    GitHub also counts {c.restricted_count} contributions to private
                    repositories on your profile. Only the number is shown; nothing about
                    them is read.
                  </p>
                ) : null}
                <div className="mt-6 grid gap-x-10 gap-y-6 sm:grid-cols-2">
                  <div>
                    <h3 className="eyebrow mb-3">By month</h3>
                    <PeriodBars rows={c.monthly} label="Contributions per month" month />
                  </div>
                  <div>
                    <h3 className="eyebrow mb-3">Last 12 weeks (week starting)</h3>
                    <PeriodBars rows={c.weekly} label="Contributions per week" />
                  </div>
                </div>
                <p className="mt-3 text-xs text-ink-muted">{c.notice}</p>
              </>
            )}
          </GlassCard>

          <GlassCard id="repos" icon={FolderGit2} title="Public repositories" sub="Your own public repositories, most recently updated first.">
            {repositories.error !== null && (
              <ErrorState error={repositories.error} onRetry={repositories.retry} />
            )}
            {repositories.error === null && repositories.data === null && (
              <LoadingState message="Loading your repositories…" />
            )}
            {repositories.data && !repositories.data.available && (
              <Empty>No repository data yet. Use “Sync now”.</Empty>
            )}
            {repositories.data?.available && (
              <>
                <SourceNote source={repositories.data.source} />
                {repositories.data.truncated && (
                  <p className="mt-1 text-xs text-ink-muted">
                    You have {repositories.data.total_public_repositories} public
                    repositories; the most recently updated{" "}
                    {repositories.data.repositories.length} are shown.
                  </p>
                )}
                {repositories.data.repositories.length === 0 && (
                  <Empty>No public repositories found.</Empty>
                )}
                <ul className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-2">
                  {repositories.data.repositories.map((r) => (
                    <li key={r.name_with_owner} className={cn(TILE, "p-4")}>
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noreferrer"
                        className="font-semibold text-ink-primary underline underline-offset-4 hover:text-redline"
                      >
                        {r.name_with_owner}
                      </a>
                      {(r.is_fork || r.is_archived) && (
                        <span className="ml-2 text-xs text-ink-muted">
                          {[r.is_fork && "fork", r.is_archived && "archived"]
                            .filter(Boolean)
                            .join(", ")}
                        </span>
                      )}
                      <p className="mt-1 text-sm text-ink-secondary">
                        {r.description ?? "No description."}
                      </p>
                      <p className="mt-2 text-xs text-ink-muted">
                        {r.languages.length > 0
                          ? r.languages.map((l) => `${l.name} ${l.percent}%`).join(", ")
                          : (r.primary_language ?? "Language unknown")}
                      </p>
                      <p className="mt-1 text-xs text-ink-muted">
                        Last push{" "}
                        {r.pushed_at
                          ? new Date(r.pushed_at).toLocaleDateString()
                          : "unknown"}{" "}
                        · your commits in the last 90 days:{" "}
                        {r.your_commits_90d ?? "unknown"} · {r.open_pull_requests} open
                        PRs · {r.open_issues} open issues
                      </p>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </GlassCard>

          <GlassCard id="activity" icon={GitPullRequest} title="Recent collaboration" sub="Pull requests, issues and reviews from your public activity.">
            {activity.error !== null && (
              <ErrorState error={activity.error} onRetry={activity.retry} />
            )}
            {activity.error === null && activity.data === null && (
              <LoadingState message="Loading your activity…" />
            )}
            {activity.data && !activity.data.available && (
              <Empty>No activity data yet. Use “Sync now”.</Empty>
            )}
            {activity.data?.available && (
              <>
                <SourceNote source={activity.data.source} />
                <p className="mt-1 text-sm text-ink-secondary">
                  {activity.data.pull_requests_total} pull requests and{" "}
                  {activity.data.issues_total} issues opened in total.
                </p>
                {activity.data.items.length === 0 ? (
                  <Empty>No recent public activity.</Empty>
                ) : (
                  <ul className="mt-3 flex flex-col gap-2 text-sm">
                    {activity.data.items.map((i) => (
                      <li key={`${i.kind}-${i.url}-${i.occurred_at}`} className={cn(TILE, "px-4 py-2.5")}>
                        <span className="text-ink-muted">
                          {KIND_LABEL[i.kind]} · {i.state} ·{" "}
                          {new Date(i.occurred_at).toLocaleDateString()} ·{" "}
                        </span>
                        <a
                          href={i.url}
                          target="_blank"
                          rel="noreferrer"
                          className="underline underline-offset-4 hover:text-redline"
                        >
                          {i.title}
                        </a>
                        <span className="text-ink-muted"> ({i.repository})</span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </GlassCard>

          <GlassCard
            id="checklist"
            icon={ClipboardCheck}
            title="Portfolio checklist"
            sub="Facts GitHub returned about your own, public, non-fork repositories. “Couldn't check” means GitHub did not return enough to decide; it is not a finding. This does not judge your code."
          >
            {repositories.data?.available && repositories.data.checklist.length > 0 && (
              <Checklist items={repositories.data.checklist} />
            )}
            {repositories.data?.available && repositories.data.checklist.length === 0 && (
              <Empty>No repositories to check.</Empty>
            )}
            {!repositories.data?.available && (
              <Empty>Available after the first synchronisation.</Empty>
            )}
          </GlassCard>

          <p className="text-sm text-ink-secondary">
            Want feedback? Ask the{" "}
            <Link
              to={routes.mentor()}
              className="text-redline underline underline-offset-4"
            >
              AI mentor
            </Link>{" "}
            about your GitHub projects. It sees only a short summary of this saved data.
          </p>
        </div>
      )}
    </Page>
  );
};

export default GithubInsightsPage;
