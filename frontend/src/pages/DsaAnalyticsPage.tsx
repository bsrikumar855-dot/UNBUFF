import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
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
  Stat,
  WeeklyChart,
} from "@/components/dsa/AnalyticsBits";
import { Button } from "@/components/ui/button";
import { Page, PageHeader } from "@/components/ui/Page";
import { buttonClasses } from "@/lib/buttonClasses";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { DIFFICULTY_LABEL } from "@/lib/dsa";
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

  return (
    <Page width="wide">
      <PageHeader
        crumbs={[{ label: "DSA Arena", to: routes.dsa }, { label: "Analytics" }]}
        eyebrow="Practice"
        title="DSA analytics"
        description="Based on your judged submissions only. Runs, sample runs and demonstration exercises are never counted."
        actions={
          <>
            <Link to={routes.dsaRevision} className={buttonClasses("secondary", "sm")}>
              Revision queue
            </Link>
            <Button
              variant="outline"
              size="sm"
              disabled={refreshing || data === null}
              onClick={() => void refresh()}
            >
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
              className="mb-8 border-l-2 border-line-strong bg-surface-100/60 py-2 pl-4 pr-3 text-sm text-ink-secondary"
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
            <p className="mb-6 text-sm text-ink-muted">
              Counts of excluded submissions are temporarily unavailable.
            </p>
          )}

          {!data.has_eligible_activity ? (
            <section
              aria-labelledby="empty-heading"
              className="border border-dashed border-line-strong p-6 sm:p-8"
            >
              <h2
                id="empty-heading"
                className="text-heading font-semibold text-ink-primary"
              >
                No counted activity yet
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-secondary">
                Analytics appear after you submit solutions that are judged against a real
                test suite. Your self-reported marks ({data.self_reported.solved} solved,{" "}
                {data.self_reported.attempted} attempted) are not judged results, so they
                are not used here.
              </p>
              <Link
                to={routes.dsaQuestions}
                className={buttonClasses("primary", "md", "mt-5")}
              >
                Browse questions
              </Link>
            </section>
          ) : (
            <div className="flex flex-col gap-10">
              <section
                aria-label="Summary"
                className="grid border-y border-ink-primary sm:grid-cols-2 sm:divide-x sm:divide-line lg:grid-cols-4"
              >
                <Stat
                  label="Solved"
                  hint="distinct questions with an accepted submission"
                >
                  {data.totals.solved_unique}
                </Stat>
                <Stat label="Attempted" hint="distinct questions you have submitted for">
                  {data.totals.attempted_unique}
                </Stat>
                <Stat label="Submission success" hint="accepted / judged submissions">
                  <RateText metric={data.submission_success} />
                </Stat>
                <Stat
                  label="First-attempt success"
                  hint="questions solved by the first recorded submission"
                >
                  <RateText metric={data.first_attempt_success} />
                </Stat>
              </section>

              <section
                aria-labelledby="trend-heading"
                className="border-t border-ink-primary pt-4 [&>h2]:mb-4"
              >
                <h2
                  id="trend-heading"
                  className="text-heading font-semibold text-ink-primary"
                >
                  Recent activity and trend
                </h2>
                <WeeklyChart weeks={data.weekly} />
                <p className="mt-3 text-sm text-ink-secondary">
                  {data.comparison.available
                    ? `Last 28 days: ${data.comparison.current.accepted} of ${data.comparison.current.attempts} accepted. The 28 days before: ${data.comparison.previous.accepted} of ${data.comparison.previous.attempts}.`
                    : data.comparison.note}
                </p>
                {data.recent.length > 0 && (
                  <ul
                    aria-label="Latest submissions"
                    className="mt-4 border-t border-line text-sm [&>li]:border-b [&>li]:border-line"
                  >
                    {data.recent.map((r) => (
                      <li
                        key={r.submission_id}
                        className="flex flex-wrap items-center justify-between gap-2 px-1 py-3"
                      >
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
              </section>

              <div className="grid gap-x-12 gap-y-10 lg:grid-cols-2">
                <section
                  aria-labelledby="topics-heading"
                  className="border-t border-ink-primary pt-4 [&>h2]:mb-4"
                >
                  <h2
                    id="topics-heading"
                    className="text-heading font-semibold text-ink-primary"
                  >
                    By topic
                  </h2>
                  <BreakdownBars rows={data.topics} label="Performance by topic" />
                  {data.untouched_topics.length > 0 && (
                    <p className="mt-3 text-xs text-ink-muted">
                      Not practised yet: {data.untouched_topics.join(", ")}.
                    </p>
                  )}
                </section>
                <section
                  aria-labelledby="difficulty-heading"
                  className="border-t border-ink-primary pt-4 [&>h2]:mb-4"
                >
                  <h2
                    id="difficulty-heading"
                    className="text-heading font-semibold text-ink-primary"
                  >
                    By difficulty
                  </h2>
                  <BreakdownBars
                    rows={data.difficulties}
                    label="Performance by difficulty"
                    labelOf={(k) =>
                      DIFFICULTY_LABEL[k as keyof typeof DIFFICULTY_LABEL] ?? k
                    }
                  />
                </section>
              </div>

              <section
                aria-labelledby="weak-heading"
                className="border-t border-ink-primary pt-4 [&>h2]:mb-4"
              >
                <h2
                  id="weak-heading"
                  className="text-heading font-semibold text-ink-primary"
                >
                  Topics and what the evidence says
                </h2>
                <p className="mb-3 text-sm text-ink-secondary">
                  A topic is only judged once it has enough questions and submissions.
                  Compile and runtime errors are tracked separately from wrong answers.
                </p>
                <ul className="border-t border-line">
                  {data.weaknesses.map((w) => (
                    <li key={w.topic} className="border-b border-line py-4">
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
              </section>

              {data.repeated_failures.length > 0 && (
                <section
                  aria-labelledby="repeat-heading"
                  className="border-t border-ink-primary pt-4 [&>h2]:mb-4"
                >
                  <h2
                    id="repeat-heading"
                    className="text-heading font-semibold text-ink-primary"
                  >
                    Questions failing repeatedly
                  </h2>
                  <ul className="border-t border-line text-sm [&>li]:border-b [&>li]:border-line">
                    {data.repeated_failures.map((r) => (
                      <li
                        key={r.question_id}
                        className="flex flex-wrap items-center justify-between gap-2 px-1 py-3"
                      >
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
                </section>
              )}
            </div>
          )}

          <section
            aria-labelledby="revision-heading"
            className="mt-10 border-t border-ink-primary pt-4"
          >
            <div className="mb-4 flex items-center justify-between gap-2">
              <h2
                id="revision-heading"
                className="text-heading font-semibold text-ink-primary"
              >
                Revision due ({queue?.counts.due ?? data.revision_due})
              </h2>
              <Link
                to={routes.dsaRevision}
                className="text-sm text-redline underline underline-offset-4"
              >
                Open the full queue
              </Link>
            </div>
            {queue && queue.items.length === 0 && (
              <p className="text-sm text-ink-secondary">Nothing is due for revision.</p>
            )}
            {queue && queue.items.length > 0 && (
              <ul className="border-t border-line text-sm [&>li]:border-b [&>li]:border-line">
                {queue.items.map((i) => (
                  <li key={i.question_id} className="px-1 py-3">
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
          </section>
        </>
      )}
    </Page>
  );
};

export default DsaAnalyticsPage;
