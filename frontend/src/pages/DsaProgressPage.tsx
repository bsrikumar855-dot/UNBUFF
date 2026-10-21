import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/endpoints";
import type { QuestionSummary } from "@/types/contract";
import { DifficultyBadge, ProgressBadge } from "@/components/dsa/DsaBits";
import { ListChecks } from "lucide-react";
import { ErrorState } from "@/components/ui/ErrorState";
import { GlassCard, TILE } from "@/components/ui/GlassCard";
import { Page, PageHeader } from "@/components/ui/Page";
import { LoadingState } from "@/components/ui/LoadingState";
import { useDsaProgress } from "@/hooks/useDsaProgress";
import { cn } from "@/lib/cn";
import { routes } from "@/lib/routes";

const MAX_LOOKUPS = 100;

/** The student's own records (status, bookmarks, notes), joined with catalogue titles. Removed questions are flagged, not hidden. */
const DsaProgressPage: React.FC = () => {
  const progress = useDsaProgress();
  const [titles, setTitles] = useState<Map<string, QuestionSummary | null>>(new Map());

  useEffect(() => {
    if (!progress.records) return;
    let cancelled = false;
    const ids = progress.records.slice(0, MAX_LOOKUPS).map((r) => r.question_id);
    void Promise.allSettled(ids.map((id) => api.getQuestion(id))).then((results) => {
      if (cancelled) return;
      setTitles(
        new Map(
          ids.map((id, i) => [
            id,
            results[i]!.status === "fulfilled"
              ? (results[i] as PromiseFulfilledResult<{ question: QuestionSummary }>)
                  .value.question
              : null,
          ])
        )
      );
    });
    return () => {
      cancelled = true;
    };
  }, [progress.records]);

  return (
    <Page width="fluid" className="sm:px-5 lg:pl-5 lg:pr-6">
      <PageHeader
        crumbs={[{ label: "DSA Arena", to: routes.dsa }, { label: "My progress" }]}
        eyebrow="Practice"
        title={
          <>
            My <em>progress</em>
          </>
        }
        description="Your own marks, bookmarks and notes. These are self-reported and are never counted as judged results."
      />

      <GlassCard
        id="tracked"
        icon={ListChecks}
        title="Tracked questions"
        sub={
          progress.records
            ? `${progress.records.length} question${progress.records.length === 1 ? "" : "s"} you have marked, bookmarked or noted.`
            : undefined
        }
      >
        {progress.error !== null && (
          <ErrorState error={progress.error} onRetry={() => void progress.reload()} />
        )}
        {progress.error === null && progress.records === null && (
          <LoadingState message="Loading your progress…" />
        )}

        {progress.records && progress.records.length === 0 && (
          <p className="text-sm text-ink-secondary">
            Nothing tracked yet.{" "}
            <Link
              to={routes.dsaQuestions}
              className="text-redline underline underline-offset-4"
            >
              Browse questions
            </Link>{" "}
            and mark your status, bookmark or add notes.
          </p>
        )}

        {progress.records && progress.records.length > 0 && (
          <ul className="flex flex-col gap-2.5">
            {progress.records.map((r) => {
              const q = titles.get(r.question_id);
              return (
                <li key={r.question_id} className={cn(TILE, "px-4 py-3.5")}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    {q ? (
                      <Link
                        to={routes.dsaQuestion(q.id)}
                        className="font-semibold text-ink-primary underline-offset-4 hover:text-redline hover:underline"
                      >
                        {q.title}
                      </Link>
                    ) : q === null ? (
                      <span className="font-semibold text-ink-primary">
                        {r.question_id}{" "}
                        <span className="text-sm font-normal text-ink-muted">
                          (no longer in the catalogue)
                        </span>
                      </span>
                    ) : (
                      <span className="text-ink-muted">Loading…</span>
                    )}
                    <div className="flex items-center gap-3">
                      {q && <DifficultyBadge difficulty={q.difficulty} />}
                      <ProgressBadge status={r.status} bookmarked={r.bookmarked} />
                    </div>
                  </div>
                  {r.notes && (
                    <p className="mt-2 whitespace-pre-wrap text-sm text-ink-secondary">
                      {r.notes.length > 200 ? `${r.notes.slice(0, 200)}…` : r.notes}
                    </p>
                  )}
                  <p className="mt-2 text-xs text-ink-muted">
                    Updated {new Date(r.updated_at).toLocaleString()}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </GlassCard>
    </Page>
  );
};

export default DsaProgressPage;
