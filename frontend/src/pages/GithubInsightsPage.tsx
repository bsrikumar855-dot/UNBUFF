import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/endpoints";
import {
  Checklist,
  Heatmap,
  PeriodBars,
  SourceNote,
} from "@/components/github/GithubBits";
import { GithubConnectionPanel } from "@/components/github/GithubConnectionPanel";
import { Stat } from "@/components/dsa/AnalyticsBits";
import { ErrorState } from "@/components/ui/ErrorState";
import { Page, PageHeader } from "@/components/ui/Page";
import { LoadingState } from "@/components/ui/LoadingState";
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
  return (
    <Page width="wide">
      <PageHeader
        eyebrow="Evidence"
        title="GitHub insights"
        description={
          <>
            What your public GitHub shows about your development work.{" "}
            <strong>It is partial evidence, not a measure of skill</strong>: private work,
            other platforms and learning time do not appear, and it does not count as DSA
            practice.
          </>
        }
      />

      <div>
        <GithubConnectionPanel onSynced={refresh} onDisconnected={refresh} />
      </div>

      {conn && !readable && (
        <p className="mt-6 text-sm text-ink-secondary">
          {conn.status === "not_configured"
            ? "Nothing to show until GitHub is set up on this server."
            : "Connect GitHub above to see your contribution history, repositories and a portfolio checklist."}{" "}
          <Link
            to={routes.settings}
            className="underline underline-offset-4 hover:text-redline"
          >
            Settings
          </Link>
        </p>
      )}

      {readable && (
        <div className="mt-12 flex flex-col gap-12">
          <section
            aria-labelledby="contrib-h"
            className="border-t border-ink-primary pt-4"
          >
            <h2
              id="contrib-h"
              className="mb-4 text-heading font-semibold text-ink-primary"
            >
              Contribution calendar
            </h2>
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
                <div className="mt-4 grid grid-cols-2 border-y border-ink-primary sm:grid-cols-4 sm:divide-x sm:divide-line">
                  <Stat label="Contributions" hint="GitHub's own total for this period">
                    {c.total}
                  </Stat>
                  <Stat label="Active days">{c.active_days ?? "–"}</Stat>
                  <Stat label="Longest streak" hint="consecutive days">
                    {c.longest_streak_days ?? "–"}
                  </Stat>
                  <Stat label="Commits · PRs · reviews · issues">
                    <span className="text-lg">
                      {c.breakdown
                        ? `${c.breakdown.commits} · ${c.breakdown.pull_requests} · ${c.breakdown.reviews} · ${c.breakdown.issues}`
                        : "–"}
                    </span>
                  </Stat>
                </div>
                <div className="mt-4">
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
                <div className="mt-8 grid gap-x-12 gap-y-8 sm:grid-cols-2">
                  <div>
                    <h3 className="eyebrow mb-3 border-b border-ink-primary pb-2">
                      By month
                    </h3>
                    <PeriodBars rows={c.monthly} label="Contributions per month" month />
                  </div>
                  <div>
                    <h3 className="eyebrow mb-3 border-b border-ink-primary pb-2">
                      Last 12 weeks (week starting)
                    </h3>
                    <PeriodBars rows={c.weekly} label="Contributions per week" />
                  </div>
                </div>
                <p className="mt-3 text-xs text-ink-muted">{c.notice}</p>
              </>
            )}
          </section>

          <section aria-labelledby="repos-h" className="border-t border-ink-primary pt-4">
            <h2 id="repos-h" className="mb-4 text-heading font-semibold text-ink-primary">
              Public repositories
            </h2>
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
                <ul className="mt-4 border-t border-line">
                  {repositories.data.repositories.map((r) => (
                    <li key={r.name_with_owner} className="border-b border-line py-4">
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
          </section>

          <section
            aria-labelledby="activity-h"
            className="border-t border-ink-primary pt-4"
          >
            <h2
              id="activity-h"
              className="mb-4 text-heading font-semibold text-ink-primary"
            >
              Recent collaboration
            </h2>
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
                  <ul className="mt-3 border-t border-line text-sm [&>li]:border-b [&>li]:border-line [&>li]:py-2.5">
                    {activity.data.items.map((i) => (
                      <li key={`${i.kind}-${i.url}-${i.occurred_at}`}>
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
          </section>

          <section
            aria-labelledby="checklist-h"
            className="border-t border-ink-primary pt-4"
          >
            <h2
              id="checklist-h"
              className="mb-1 text-heading font-semibold text-ink-primary"
            >
              Portfolio checklist
            </h2>
            <p className="mb-3 text-sm text-ink-secondary">
              Facts GitHub returned about your own, public, non-fork repositories.
              “Couldn't check” means GitHub did not return enough to decide; it is not a
              finding. This does not judge your code.
            </p>
            {repositories.data?.available && repositories.data.checklist.length > 0 && (
              <Checklist items={repositories.data.checklist} />
            )}
            {repositories.data?.available && repositories.data.checklist.length === 0 && (
              <Empty>No repositories to check.</Empty>
            )}
            {!repositories.data?.available && (
              <Empty>Available after the first synchronisation.</Empty>
            )}
          </section>

          <p className="text-sm text-ink-secondary">
            Want feedback? Ask the{" "}
            <Link
              to={routes.mentor()}
              className="underline underline-offset-4 hover:text-redline"
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
