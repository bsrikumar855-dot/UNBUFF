import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { DbmsTopicsResponse } from "@/types/contract";
import { api } from "@/api/endpoints";
import { useLearnProgress } from "@/hooks/useLearnProgress";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { Page, PageHeader, Section } from "@/components/ui/Page";
import { Tag } from "@/components/ui/Tag";
import { Meter } from "@/components/ui/Meter";
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
    api.getDbmsTopics().then((r) => !cancelled && setData(r)).catch((e: unknown) => !cancelled && setError(e));
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const mine = progress.data?.progress.dbms ?? {};

  return (
    <Page>
      <PageHeader
        eyebrow="Learn"
        title="DBMS"
        description="The database topics interviews ask about, from keys and joins to transactions, indexes and recovery. Each has notes, a SQL example whose output was checked, interview questions and a short quiz graded on the server."
      />
      {error !== null && !data && <ErrorState error={error} onRetry={() => setAttempt((a) => a + 1)} />}
      {!data && error === null && <LoadingState message="Loading topics…" />}
      {data && (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-10">
          {progress.data && <Meter value={progress.data.dbms_passed} max={progress.data.dbms_total} label="DBMS quizzes passed" tone="verified" />}
          {!progress.signedIn && (
            <p className="text-sm text-ink-muted">
              <Link to={routes.login} className="underline underline-offset-4">Sign in</Link> to take the quizzes and keep your results.
            </p>
          )}
          {data.groups.map((group) => (
            <Section key={group} title={group}>
              <ul className="grid gap-3 sm:grid-cols-2">
                {data.topics
                  .filter((t) => t.group === group)
                  .map((t) => {
                    const p = mine[t.id];
                    return (
                      <li key={t.id} className="rounded-md border border-line bg-surface p-4">
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <Link to={routes.learnDbmsTopic(t.id)} className="font-semibold text-ink-primary underline-offset-4 hover:underline">
                            {t.name}
                          </Link>
                          {p?.passed_at ? <Tag tone="verified">Quiz passed</Tag> : p ? <Tag tone="alert">Best {p.best_score}/{p.total}</Tag> : null}
                        </div>
                        <p className="text-sm text-ink-secondary">{t.summary}</p>
                        <p className="mt-2 text-xs text-ink-muted">
                          {t.minutes} min · {t.quiz_questions} quiz questions{t.has_example ? " · SQL example" : ""}
                        </p>
                      </li>
                    );
                  })}
              </ul>
            </Section>
          ))}
        </div>
      )}
    </Page>
  );
};

export default LearnDbmsPage;
