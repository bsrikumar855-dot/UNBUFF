import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  BarChart3,
  Code2,
  FileStack,
  Gauge,
  GitCompare,
  History,
  Layers,
  ListChecks,
  MessageCircle,
  ShieldCheck,
  TrendingUp,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import { api } from "@/api/endpoints";
import { StatTile } from "@/components/dsa/AnalyticsBits";
import {
  DifficultyBars,
  HistoryBars,
  SeparationPanel,
  SnapshotList,
  SourceBanner,
  TopicList,
  Unavailable,
} from "@/components/leetcode/InsightsBits";
import { ImportPanel } from "@/components/leetcode/ImportPanel";
import { LeetCodeConnectionPanel } from "@/components/leetcode/LeetCodeConnectionPanel";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { GLASS, GlassCard, TILE } from "@/components/ui/GlassCard";
import { Page, PageHeader } from "@/components/ui/Page";
import { cn } from "@/lib/cn";
import { formatDay, LEETCODE_STARTERS } from "@/lib/leetcode";
import { routes } from "@/lib/routes";
import type {
  LeetCodeConnection,
  LeetCodeHistoryResponse,
  LeetCodeInsightsResponse,
} from "@/types/contract";

const BLOCK_ICON: Record<string, LucideIcon> = {
  "lc-empty": BarChart3,
  "lc-totals": ListChecks,
  "lc-sep": GitCompare,
  "lc-diff": Layers,
  "lc-topics": Code2,
  "lc-contest": Trophy,
  "lc-activity": Gauge,
  "lc-trend": TrendingUp,
  "lc-ask": MessageCircle,
  "lc-history": History,
};

const Block: React.FC<{
  id: string;
  title: string;
  intro?: string;
  children: React.ReactNode;
}> = ({ id, title, intro, children }) => (
  <GlassCard id={id} icon={BLOCK_ICON[id] ?? FileStack} title={title} sub={intro}>
    {children}
  </GlassCard>
);

/**
 * LeetCode progress as the student supplied it. Only fields present in the imported data are shown; a missing part says
 * so. It is kept apart from UNBLUFF's judged results and is never presented as live or verified.
 */
const LeetCodeInsightsPage: React.FC = () => {
  const [data, setData] = useState<LeetCodeInsightsResponse | null>(null);
  const [history, setHistory] = useState<LeetCodeHistoryResponse | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  const [lookupAvailable, setLookupAvailable] = useState(false);
  // Optional: if the operator enabled the lookup, the header must not claim UNBLUFF never contacts LeetCode.
  useEffect(() => {
    let cancelled = false;
    Promise.resolve()
      .then(() => api.getLeetCodeLookup())
      .then((r) => !cancelled && setLookupAvailable(r.available === true))
      .catch(() => !cancelled && setLookupAvailable(false));
    return () => {
      cancelled = true;
    };
  }, []);
  const [deleteError, setDeleteError] = useState<unknown>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    Promise.all([api.getLeetCodeInsights(), api.getLeetCodeHistory()])
      .then(([i, h]) => {
        if (cancelled) return;
        setData(i);
        setHistory(h);
      })
      .catch((e: unknown) => !cancelled && setError(e));
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const refresh = useCallback(() => setAttempt((a) => a + 1), []);
  const removeSnapshot = useCallback(
    async (id: string) => {
      setDeleteError(null);
      try {
        await api.deleteLeetCodeSnapshot(id);
        refresh();
      } catch (e) {
        setDeleteError(e);
      }
    },
    [refresh]
  );
  const onConnectionChanged = useCallback(
    (_c: LeetCodeConnection) => refresh(),
    [refresh]
  );

  return (
    <Page width="fluid" className="sm:px-5 lg:pl-5 lg:pr-6">
      <PageHeader
        eyebrow="Evidence"
        title={
          <>
            LeetCode <em>insights</em>
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
              <p className="text-sm font-semibold text-ink-primary">Self-reported data only</p>
              <p className="mt-0.5 text-xs leading-snug text-ink-secondary">
                {lookupAvailable
                  ? "Numbers are not kept in sync with LeetCode and are not verified as yours."
                  : "UNBLUFF never connects to LeetCode. No live sync, no verification, and no contact with LeetCode."}
              </p>
            </div>
          </div>
        }
        description={
          <>
            {lookupAvailable
              ? "Numbers from your own LeetCode progress, typed in, imported, or looked up from your public profile when you ask, kept separate from your UNBLUFF results. "
              : "Numbers you supply from your own LeetCode progress, kept separate from your UNBLUFF results. "}
            <strong>
              {lookupAvailable
                ? "They are not kept in sync and are not verified as yours."
                : "They are your own reported data: not live, not synchronised, not verified."}
            </strong>{" "}
            {lookupAvailable
              ? "UNBLUFF contacts LeetCode only when you ask it to look your numbers up."
              : "UNBLUFF never contacts LeetCode."}
          </>
        }
      />

      {error !== null && <ErrorState error={error} onRetry={refresh} />}
      {error === null && data === null && (
        <LoadingState message="Loading your LeetCode data…" />
      )}

      {data && (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-2">
            <LeetCodeConnectionPanel
              initial={data.connection}
              onChanged={onConnectionChanged}
            />
            <ImportPanel connection={data.connection} onImported={refresh} />
          </div>

          {!data.available && (
            <Block id="lc-empty" title="Your LeetCode insights">
              <p className="text-sm text-ink-secondary">
                Nothing to show yet.{" "}
                {data.connection.linked
                  ? "Your profile link is saved, but a link alone provides no statistics. "
                  : ""}
                Import a file or type your numbers above, and they will appear here with
                their source and date. Until then no figure is shown and none is
                estimated.
              </p>
            </Block>
          )}

          {data.available && data.source && data.totals && (
            <>
              <Block id="lc-totals" title="Problems solved, as you reported them">
                <SourceBanner source={data.source} />
                <div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <StatTile icon={ListChecks} label="Total solved" hint="the total you supplied">
                    {data.totals.solved}
                  </StatTile>
                  <StatTile icon={Gauge} label="Easy">{data.totals.easy ?? "–"}</StatTile>
                  <StatTile icon={Gauge} label="Medium">{data.totals.medium ?? "–"}</StatTile>
                  <StatTile icon={Gauge} label="Hard">{data.totals.hard ?? "–"}</StatTile>
                </div>
                {data.connection.profile_url && (
                  <p className="mt-3 text-sm text-ink-secondary">
                    <a
                      href={data.connection.profile_url}
                      target="_blank"
                      rel="noreferrer"
                      className="underline underline-offset-4 hover:text-redline"
                    >
                      Open your LeetCode profile
                    </a>{" "}
                    <span className="text-xs text-ink-muted">
                      (opens leetcode.com; the link is not verified as yours)
                    </span>
                  </p>
                )}
              </Block>

              <Block id="lc-sep" title="Compared with UNBLUFF, kept separate">
                <SeparationPanel data={data} />
              </Block>

              <Block id="lc-diff" title="By difficulty">
                {data.difficulty ? (
                  <DifficultyBars rows={data.difficulty} />
                ) : (
                  <Unavailable
                    what="Difficulty breakdown"
                    how="Your data did not include easy, medium and hard counts."
                  />
                )}
              </Block>

              <Block
                id="lc-topics"
                title="By topic"
                intro="Only topics present in your data are listed. A topic that is not listed is unknown, not zero."
              >
                {data.topics ? (
                  <TopicList topics={data.topics} />
                ) : (
                  <Unavailable
                    what="Topic counts"
                    how="Your data did not include them."
                  />
                )}
              </Block>

              <Block id="lc-contest" title="Contests">
                {data.contest ? (
                  <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-3">
                    <StatTile icon={Trophy} label="Rating">{data.contest.rating ?? "–"}</StatTile>
                    <StatTile icon={TrendingUp} label="Global rank">{data.contest.global_rank ?? "–"}</StatTile>
                    <StatTile icon={ListChecks} label="Attended">{data.contest.attended ?? "–"}</StatTile>
                  </div>
                ) : (
                  <Unavailable
                    what="Contest rating and rank"
                    how="Your data did not include contest information."
                  />
                )}
              </Block>

              <Block id="lc-activity" title="Recent activity">
                {data.activity ? (
                  <>
                    <p className="text-sm text-ink-secondary">
                      {data.activity.total} problems first solved across{" "}
                      {data.activity.items.length} day
                      {data.activity.items.length === 1 ? "" : "s"} you listed; the latest
                      on {formatDay(data.activity.last_active_date)}. Days you did not
                      list are unknown.
                    </p>
                    <ul
                      aria-label="Activity you supplied"
                      className="mt-3 grid gap-2 text-sm sm:grid-cols-2 [&>li]:flex [&>li]:justify-between [&>li]:rounded-xl [&>li]:bg-white/60 [&>li]:px-3.5 [&>li]:py-2 [&>li]:shadow-[inset_0_0_0_1px_rgba(24,24,27,0.06)]"
                    >
                      {[...data.activity.items]
                        .reverse()
                        .slice(0, 14)
                        .map((a) => (
                          <li key={a.date}>
                            <span className="text-ink-secondary">
                              {formatDay(a.date)}
                            </span>
                            <span className="num text-ink-primary">
                              {a.problems_solved}
                            </span>
                          </li>
                        ))}
                    </ul>
                  </>
                ) : (
                  <Unavailable
                    what="Recent activity"
                    how="Your data did not include per-day records."
                  />
                )}
              </Block>

              <Block
                id="lc-trend"
                title="Progress over time"
                intro="Built only from the snapshots you imported, each at the date you gave. Nothing between them is estimated."
              >
                {data.trend.available ? (
                  <>
                    <p className="mb-4 text-sm text-ink-primary">
                      {data.trend.solved_change! >= 0 ? "+" : ""}
                      {data.trend.solved_change} solved between{" "}
                      {formatDay(data.trend.from)} and {formatDay(data.trend.to)} (
                      {data.trend.days} days), across your imported snapshots.
                    </p>
                    <HistoryBars rows={data.history} />
                  </>
                ) : (
                  <Unavailable
                    what="Trend"
                    how={
                      data.trend.reason ??
                      "Import at least two snapshots on different dates."
                    }
                  />
                )}
              </Block>

              <Block id="lc-ask" title="Ask the AI mentor">
                <p className="mb-3 text-sm text-ink-secondary">
                  The mentor sees a short summary of these imported numbers, labelled as
                  yours and as of their capture date. It cannot see your LeetCode account.
                </p>
                <ul className="flex flex-col gap-1.5 text-sm">
                  {LEETCODE_STARTERS.map((q) => (
                    <li key={q}>
                      <Link
                        to={`${routes.mentor()}?leetcode=1&prompt=${encodeURIComponent(q)}`}
                        className="underline underline-offset-4 hover:text-redline"
                      >
                        {q}
                      </Link>
                    </li>
                  ))}
                </ul>
              </Block>
            </>
          )}

          {history && history.total > 0 && (
            <Block
              id="lc-history"
              title="Imported snapshots"
              intro="Newest capture first. Importing never overwrites an earlier snapshot; you can remove a mistaken one."
            >
              {deleteError !== null && (
                <ErrorState className="mb-3" error={deleteError} />
              )}
              <SnapshotList snapshots={history.snapshots} onDelete={removeSnapshot} />
            </Block>
          )}

          <ul className={cn(TILE, "list-disc px-9 py-3 text-xs text-ink-muted")}>
            {data.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      )}
    </Page>
  );
};

export default LeetCodeInsightsPage;
