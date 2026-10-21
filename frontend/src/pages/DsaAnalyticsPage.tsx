import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Code2,
  Gauge,
  Layers,
  Lightbulb,
  PieChart,
  RefreshCw,
  Repeat,
  SquareCode,
  Target,
  Zap,
} from "lucide-react";
import { api } from "@/api/endpoints";
import type {
  DsaAnalyticsResponse,
  RevisionQueueResponse,
  SubmissionVerdict,
  WeaknessStatus,
} from "@/types/contract";
import {
  BreakdownBars,
  RateText,
  StatTile,
  WeeklyChart,
} from "@/components/dsa/AnalyticsBits";
import { ExternalProgressNote } from "@/components/leetcode/ExternalProgressNote";
import { Button } from "@/components/ui/button";
import { GlassCard, TILE } from "@/components/ui/GlassCard";
import { Page, PageHeader } from "@/components/ui/Page";
import { buttonClasses } from "@/lib/buttonClasses";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { DIFFICULTY_LABEL } from "@/lib/dsa";
import { cn } from "@/lib/cn";
import { routes } from "@/lib/routes";

const VERDICT: Record<SubmissionVerdict, string> = {
  accepted: "Accepted",
  wrong_answer: "Wrong answer",
  compile_error: "Compilation error",
  runtime_error: "Runtime error",
  time_limit_exceeded: "Time limit exceeded",
  judge_error: "Judge error",
};

const STATUS_LABEL: Record<WeaknessStatus, string> = {
  weak: "Needs work",
  technical_issues: "Technical errors",
  watch: "Keep an eye on it",
  insufficient_data: "Not enough data",
  strong: "Going well",
};

const TREND_LABEL = {
  improving: "Improving lately",
  declining: "Declining lately",
  stable: "Steady",
  insufficient_data: "",
} as const;

/** DSA analytics: every number comes from the API, which counts only judged submissions that qualify. */
const DsaAnalyticsPage: React.FC = () => {
  const [data, setData] = useState<DsaAnalyticsResponse | null>(null);
  const [queue, setQueue] = useState<RevisionQueueResponse | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    Promise.all([
      api.getDsaAnalytics(8),
      api.getRevisionQueue({ view: "due", page_size: 5 }),
    ])
      .then(([a, q]) => {
        if (cancelled) return;
        setData(a);
        setQueue(q);
      })
      .catch((e: unknown) => !cancelled && setError(e));
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      setData(await api.refreshDsaAnalytics());
      setQueue(await api.getRevisionQueue({ view: "due", page_size: 5 }));
    } catch (e) {
      setError(e);
    } finally {
      setRefreshing(false);
    }
  }, []);

  const ex = data?.exclusions;
  const excluded = ex
    ? ex.demonstration +
      ex.ineligible_suite +
      ex.unverified_provider +
      ex.mock_execution +
      ex.judge_error +
      ex.unknown_provenance
    : 0;

  const pill = "rounded-full";
  const row = cn(TILE, "flex flex-wrap items-center justify-between gap-2 px-4 py-3");

  return (
    <Page width="fluid" className="sm:px-5 lg:pl-5 lg:pr-6">
      <PageHeader
        crumbs={[{ label: "DSA Arena", to: routes.dsa }, { label: "Analytics" }]}
        eyebrow="Practice"
        title={
          <>
            DSA <em>analytics</em>
          </>
        }
        description="Based on your judged submissions only. Runs, sample runs and demonstration exercises are never counted."
        actions={
          <>
            <Link
              to={routes.dsaRevision}
              className={buttonClasses("secondary", "md", `${pill} bg-white/70`)}
            >
              <Repeat aria-hidden="true" />
              Revision queue
            </Link>
            <Button
              variant="outline"
              size="default"
              className={cn(pill, "bg-white/70")}
              disabled={refreshing || data === null}
              onClick={() => void refresh()}
            >
              <RefreshCw aria-hidden="true" />
              {refreshing ? "Rebuilding…" : "Rebuild from submissions"}
            </Button>
          </>
        }
      />

      {error !== null && (
        <ErrorState error={error} onRetry={() => setAttempt((a) => a + 1)} />
      )}
      {error === null && data === null && (
        <LoadingState message="Loading your analytics…" />
      )}

      {data && (
        <>
          {excluded > 0 && ex && (
            <p
              role="note"
              className={cn(TILE, "mb-5 px-4 py-3 text-sm text-ink-secondary")}
            >
              {excluded} of your latest {ex.sampled_submissions} submissions are not
              counted:
              {ex.demonstration > 0 &&
                ` ${ex.demonstration} on demonstration exercises (not real interview data),`}
              {ex.ineligible_suite > 0 &&
                ` ${ex.ineligible_suite} on exercises not declared eligible for analytics,`}
              {ex.mock_execution > 0 &&
                ` ${ex.mock_execution} judged by a mock or test execution service,`}
              {ex.unverified_provider > 0 &&
                ` ${ex.unverified_provider} judged by a service not confirmed as a real deployment,`}
              {ex.judge_error > 0 && ` ${ex.judge_error} where the judge itself failed,`}
              {ex.unknown_provenance > 0 &&
                ` ${ex.unknown_provenance} saved without provenance information,`}{" "}
              so they cannot inflate your results.
            </p>
          )}
          {ex && !ex.available && (
            <p className="mb-5 text-sm text-ink-muted">
              Counts of excluded submissions are temporarily unavailable.
            </p>
          )}

          {!data.has_eligible_activity ? (
            <GlassCard
              id="empty"
              icon={PieChart}
              title="No counted activity yet"
              sub="Analytics appear once a real test suite has judged your solutions."
            >
              <p className="max-w-xl text-sm leading-relaxed text-ink-secondary">
                Analytics appear after you submit solutions that are judged against a real
                test suite. Your self-reported marks ({data.self_reported.solved} solved,{" "}
                {data.self_reported.attempted} attempted) are not judged results, so they
                are not used here.
              </p>
              <Link
                to={routes.dsaQuestions}
                className={buttonClasses("primary", "md", `${pill} mt-5`)}
              >
                <SquareCode aria-hidden="true" />
                Browse questions
              </Link>
            </GlassCard>
          ) : (
            <div className="flex flex-col gap-5">
              <section
                aria-label="Summary"
                className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2 lg:grid-cols-4"
              >
                <StatTile
                  icon={CheckCircle2}
                  label="Solved"
                  hint="distinct questions with an accepted submission"
                >
                  {data.totals.solved_unique}
                </StatTile>
                <StatTile
                  icon={Target}
                  label="Attempted"
                  hint="distinct questions you have submitted for"
                >
                  {data.totals.attempted_unique}
                </StatTile>
                <StatTile
                  icon={Gauge}
                  label="Submission success"
                  hint="accepted / judged submissions"
                >
                  <RateText metric={data.submission_success} />
                </StatTile>
                <StatTile
                  icon={Zap}
                  label="First-attempt success"
                  hint="questions solved by the first recorded submission"
                >
                  <RateText metric={data.first_attempt_success} />
                </StatTile>
              </section>

              <GlassCard
                id="trend"
                icon={BarChart3}
                title="Recent activity and trend"
                sub="Counted submissions per week."
              >
                <WeeklyChart weeks={data.weekly} />
                <p className="mt-3 text-sm text-ink-secondary">
                  {data.comparison.available
                    ? `Last 28 days: ${data.comparison.current.accepted} of ${data.comparison.current.attempts} accepted. The 28 days before: ${data.comparison.previous.accepted} of ${data.comparison.previous.attempts}.`
                    : data.comparison.note}
                </p>
                {data.recent.length > 0 && (
                  <ul aria-label="Latest submissions" className="mt-4 flex flex-col gap-2 text-sm">
                    {data.recent.map((r) => (
                      <li key={r.submission_id} className={row}>
                        <Link
                          to={routes.dsaCode(r.question_id)}
                          className="font-medium text-ink-primary underline-offset-4 hover:text-redline hover:underline"
                        >
                          {r.title ?? r.question_id}
                        </Link>
                        <span className="text-ink-secondary">
                          {VERDICT[r.verdict]} · {new Date(r.at).toLocaleDateString()}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </GlassCard>

              <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-2">
                <GlassCard
                  id="topics"
                  icon={Code2}
                  title="By topic"
                  sub="Judged submissions grouped by topic."
                >
                  <BreakdownBars rows={data.topics} label="Performance by topic" />
                  {data.untouched_topics.length > 0 && (
                    <p className="mt-4 text-xs text-ink-muted">
                      Not practised yet: {data.untouched_topics.join(", ")}.
                    </p>
                  )}
                </GlassCard>
                <GlassCard
                  id="difficulty"
                  icon={Layers}
                  title="By difficulty"
                  sub="Judged submissions grouped by difficulty."
                >
                  <BreakdownBars
                    rows={data.difficulties}
                    label="Performance by difficulty"
                    labelOf={(k) =>
                      DIFFICULTY_LABEL[k as keyof typeof DIFFICULTY_LABEL] ?? k
                    }
                  />
                </GlassCard>
              </div>

              <GlassCard
                id="weak"
                icon={Lightbulb}
                title="Topics and what the evidence says"
                sub="A topic is only judged once it has enough questions and submissions. Compile and runtime errors are tracked separately from wrong answers."
              >
                <ul className="flex flex-col gap-2.5">
                  {data.weaknesses.map((w) => (
                    <li key={w.topic} className={cn(TILE, "px-4 py-3.5")}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="font-semibold text-ink-primary">{w.topic}</h3>
                        <span className="text-sm font-medium text-ink-secondary">
                          {STATUS_LABEL[w.status]}
                          {TREND_LABEL[w.trend] && ` · ${TREND_LABEL[w.trend]}`}
                        </span>
                      </div>
                      <ul className="mt-2 list-disc pl-5 text-sm text-ink-secondary">
                        {w.explanation.map((line, i) => (
                          <li key={i}>{line}</li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              </GlassCard>

              {data.repeated_failures.length > 0 && (
                <GlassCard
                  id="repeat"
                  icon={AlertTriangle}
                  title="Questions failing repeatedly"
                  sub="Worth another look, ideally after reviewing the approach."
                >
                  <ul className="flex flex-col gap-2 text-sm">
                    {data.repeated_failures.map((r) => (
                      <li key={r.question_id} className={row}>
                        <Link
                          to={routes.dsaCode(r.question_id)}
                          className="font-medium text-ink-primary underline-offset-4 hover:text-redline hover:underline"
                        >
                          {r.title ?? r.question_id}
                        </Link>
                        <span className="text-ink-secondary">
                          {r.consecutive_failures} failures in a row ({r.attempts}{" "}
                          submissions in total)
                        </span>
                      </li>
                    ))}
                  </ul>
                </GlassCard>
              )}
            </div>
          )}

          <GlassCard
            id="revision"
            icon={Repeat}
            title={`Revision due (${queue?.counts.due ?? data.revision_due})`}
            sub="The next questions to come back to."
            className="mt-5"
            actions={
              <Link
                to={routes.dsaRevision}
                className={buttonClasses("secondary", "sm", `${pill} bg-white/70`)}
              >
                Open the full queue
              </Link>
            }
          >
            {queue && queue.items.length === 0 && (
              <p className="text-sm text-ink-secondary">Nothing is due for revision.</p>
            )}
            {queue && queue.items.length > 0 && (
              <ul className="flex flex-col gap-2 text-sm">
                {queue.items.map((i) => (
                  <li key={i.question_id} className={cn(TILE, "px-4 py-3")}>
                    <Link
                      to={routes.dsaQuestion(i.question_id)}
                      className="font-medium text-ink-primary underline-offset-4 hover:text-redline hover:underline"
                    >
                      {i.title ?? i.question_id}
                    </Link>
                    <p className="text-ink-secondary">{i.explanation}</p>
                  </li>
                ))}
              </ul>
            )}
          </GlassCard>
        </>
      )}
      <ExternalProgressNote />
    </Page>
  );
};

export default DsaAnalyticsPage;
