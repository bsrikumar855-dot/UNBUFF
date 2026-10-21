import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Clock, HelpCircle, Terminal } from "lucide-react";
import type { DbmsTopicsResponse } from "@/types/contract";
import { api } from "@/api/endpoints";
import { useLearnProgress } from "@/hooks/useLearnProgress";
import { LearnCard, LearnProgress, Pill } from "@/components/learn/LearnBits";
import { dbmsIcon } from "@/components/learn/learnIcons";
import { ErrorState } from "@/components/ui/ErrorState";
import { TILE } from "@/components/ui/GlassCard";
import { LoadingState } from "@/components/ui/LoadingState";
import { Page, PageHeader } from "@/components/ui/Page";
import { cn } from "@/lib/cn";
import { routes } from "@/lib/routes";

/** /learn/dbms: the DBMS topics in teaching order, with the student's quiz results when signed in. */
const LearnDbmsPage: React.FC = () => {
  const [data, setData] = useState<DbmsTopicsResponse | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  const progress = useLearnProgress();

  useEffect(() => {
    let cancelled = false;
    setError(null);
    api
      .getDbmsTopics()
      .then((r) => !cancelled && setData(r))
      .catch((e: unknown) => !cancelled && setError(e));
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const mine = progress.data?.progress.dbms ?? {};

  return (
    <Page width="fluid" className="sm:px-5 lg:pl-5 lg:pr-6">
      <PageHeader
        eyebrow="Learn"
        title="DBMS"
        description="The database topics interviews ask about, from keys and joins to transactions, indexes and recovery. Each has notes, a SQL example whose output was checked, interview questions and a short quiz graded on the server."
      />
      {error !== null && !data && (
        <ErrorState error={error} onRetry={() => setAttempt((a) => a + 1)} />
      )}
      {!data && error === null && <LoadingState message="Loading topics…" />}
      {data && (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-8">
          {progress.data && (
            <LearnProgress
              value={progress.data.dbms_passed}
              max={progress.data.dbms_total}
              label="DBMS quizzes passed"
              tone="verified"
            />
          )}
          {!progress.signedIn && (
            <p className={cn(TILE, "px-4 py-3 text-sm text-ink-secondary")}>
              <Link to={routes.login} className="text-redline underline underline-offset-4">
                Sign in
              </Link>{" "}
              to take the quizzes and keep your results.
            </p>
          )}
          {data.groups.map((group) => {
            const id = `group-${group.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
            return (
              <section key={group} aria-labelledby={`${id}-title`} id={id}>
                <h2
                  id={`${id}-title`}
                  className="serif mb-4 text-title font-medium text-ink-primary"
                >
                  {group}
                </h2>
                <ul className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-2">
                  {data.topics
                    .filter((t) => t.group === group)
                    .map((t) => {
                      const p = mine[t.id];
                      return (
                        <LearnCard
                          key={t.id}
                          icon={dbmsIcon(t.id, t.name)}
                          title={t.name}
                          to={routes.learnDbmsTopic(t.id)}
                          status={
                            p?.passed_at ? (
                              <Pill tone="verified">Quiz passed</Pill>
                            ) : p ? (
                              <Pill tone="alert">
                                Best {p.best_score}/{p.total}
                              </Pill>
                            ) : null
                          }
                          summary={t.summary}
                          meta={
                            <>
                              <span className="inline-flex items-center gap-1.5">
                                <Clock size={14} aria-hidden="true" />
                                {t.minutes} min
                              </span>
                              <span className="inline-flex items-center gap-1.5">
                                <HelpCircle size={14} aria-hidden="true" />
                                {t.quiz_questions} quiz questions
                              </span>
                              {t.has_example && (
                                <span className="inline-flex items-center gap-1.5">
                                  <Terminal size={14} aria-hidden="true" />
                                  SQL example
                                </span>
                              )}
                            </>
                          }
                        />
                      );
                    })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </Page>
  );
};

export default LearnDbmsPage;
