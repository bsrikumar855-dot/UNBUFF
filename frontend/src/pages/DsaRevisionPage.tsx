import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/endpoints";
import type {
  RevisionActionRequest,
  RevisionItem,
  RevisionQueueResponse,
} from "@/types/contract";
import { Pager } from "@/components/dsa/DsaBits";
import { Button } from "@/components/ui/button";
import { Page, PageHeader } from "@/components/ui/Page";
import { buttonClasses } from "@/lib/buttonClasses";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { cn } from "@/lib/cn";
import { routes } from "@/lib/routes";

type View = "due" | "upcoming" | "all";
const VIEWS: { value: View; label: string }[] = [
  { value: "due", label: "Due now" },
  { value: "upcoming", label: "Upcoming" },
  { value: "all", label: "All" },
];
const PRIORITY: Record<number, string> = {
  1: "Repeated failure",
  2: "Unsolved, attempted",
  3: "Review overdue",
  4: "Review scheduled",
  5: "Weak-topic practice",
};
const STATUS: Record<RevisionItem["status"], string> = {
  pending: "Ready",
  in_progress: "In progress",
  scheduled: "Scheduled",
  postponed: "Postponed",
};

/** The student's revision queue. Items are created by their judged submissions (or added from suggestions), never invented. */
const DsaRevisionPage: React.FC = () => {
  const [view, setView] = useState<View>("due");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<RevisionQueueResponse | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    api
      .getRevisionQueue({ view, page, page_size: 10 })
      .then((r) => !cancelled && setData(r))
      .catch((e: unknown) => !cancelled && setError(e));
    return () => {
      cancelled = true;
    };
  }, [view, page, attempt]);

  const reload = useCallback(() => setAttempt((a) => a + 1), []);

  const act = async (questionId: string, body: RevisionActionRequest) => {
    setBusy(questionId);
    setActionError(null);
    try {
      await api.revisionAction(questionId, body);
      reload();
    } catch (e) {
      setActionError(e);
    } finally {
      setBusy(null);
    }
  };

  const add = async (questionId: string) => {
    setBusy(questionId);
    setActionError(null);
    try {
      await api.addRevision(questionId);
      reload();
    } catch (e) {
      setActionError(e);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Page>
      <PageHeader
        crumbs={[
          { label: "DSA Arena", to: routes.dsa },
          { label: "Analytics", to: routes.dsaAnalytics },
          { label: "Revision" },
        ]}
        eyebrow="Practice"
        title="Revision queue"
        description="Questions to come back to, ordered by priority and due date. Solve one again with a judged submission to move it forward."
      />

      <div
        role="tablist"
        aria-label="Queue view"
        className="mb-6 flex gap-6 border-b border-line"
      >
        {VIEWS.map((v) => (
          <button
            key={v.value}
            type="button"
            role="tab"
            aria-selected={view === v.value}
            onClick={() => {
              setView(v.value);
              setPage(1);
            }}
            className={cn(
              "-mb-px min-h-10 border-b-2 px-0.5 pb-2 pt-1 text-sm font-medium transition-colors",
              view === v.value
                ? "border-redline font-semibold text-ink-primary"
                : "border-transparent text-ink-muted hover:text-ink-primary"
            )}
          >
            {v.label}
            {data &&
              v.value !== "all" &&
              ` (${v.value === "due" ? data.counts.due : data.counts.upcoming})`}
            {data && v.value === "all" && ` (${data.counts.total})`}
          </button>
        ))}
      </div>

      {error !== null && <ErrorState error={error} onRetry={reload} />}
      {actionError !== null && <ErrorState error={actionError} className="mb-4" />}
      {error === null && data === null && (
        <LoadingState message="Loading your revision queue…" />
      )}

      {data && data.items.length === 0 && (
        <p className="border border-dashed border-line-strong p-5 text-sm text-ink-secondary">
          {view === "due"
            ? "Nothing is due. Failed judged submissions and solved-after-failure questions appear here automatically."
            : "No items in this view."}
        </p>
      )}

      {data && data.items.length > 0 && (
        <ul className="border-t border-ink-primary">
          {data.items.map((i) => (
            <li key={i.question_id} className="border-b border-line py-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <Link
                    to={routes.dsaQuestion(i.question_id)}
                    className="text-[15px] font-semibold text-ink-primary underline-offset-4 hover:text-redline hover:underline"
                  >
                    {i.title ?? i.question_id}
                  </Link>
                  <p className="text-sm text-ink-secondary">{i.explanation}</p>
                </div>
                <div className="text-right text-xs text-ink-muted">
                  <p className="font-medium text-ink-secondary">{PRIORITY[i.priority]}</p>
                  <p>
                    {STATUS[i.status]} ·{" "}
                    {i.due ? "due now" : `due ${new Date(i.due_at).toLocaleDateString()}`}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  to={routes.dsaCode(i.question_id)}
                  className={buttonClasses("primary", "sm")}
                >
                  Open coding workspace
                </Link>
                {(i.status === "pending" ||
                  i.status === "postponed" ||
                  i.status === "scheduled") && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy === i.question_id}
                    onClick={() => void act(i.question_id, { action: "start" })}
                  >
                    Start review
                  </Button>
                )}
                {(i.status === "pending" || i.status === "in_progress") && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy === i.question_id}
                      onClick={() =>
                        void act(i.question_id, {
                          action: "complete",
                          outcome: "remembered",
                        })
                      }
                    >
                      Done: remembered it
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy === i.question_id}
                      onClick={() =>
                        void act(i.question_id, {
                          action: "complete",
                          outcome: "struggled",
                        })
                      }
                    >
                      Done: struggled
                    </Button>
                  </>
                )}
                {i.status !== "postponed" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy === i.question_id}
                    onClick={() => void act(i.question_id, { action: "postpone" })}
                  >
                    Postpone 2 days
                  </Button>
                )}
                {(i.status === "scheduled" || i.status === "postponed") && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy === i.question_id}
                    onClick={() => void act(i.question_id, { action: "revisit" })}
                  >
                    Revisit now
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {data && <Pager page={data.page} totalPages={data.total_pages} onPage={setPage} />}

      {data && data.suggestions.length > 0 && (
        <section aria-labelledby="suggest-heading" className="mt-8">
          <h2
            id="suggest-heading"
            className="mb-1 text-lg font-semibold text-ink-primary"
          >
            Suggested practice
          </h2>
          <p className="mb-3 text-sm text-ink-secondary">
            Unsolved questions from topics where your recent judged submissions show a
            real pattern. Nothing is added unless you choose to.
          </p>
          <ul className="flex flex-col gap-2">
            {data.suggestions.map((s) => (
              <li
                key={s.question_id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-surface p-3 text-sm"
              >
                <div>
                  <Link
                    to={routes.dsaQuestion(s.question_id)}
                    className="font-medium text-ink-primary hover:underline"
                  >
                    {s.title}
                  </Link>
                  <p className="text-ink-secondary">{s.reason}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy === s.question_id}
                  onClick={() => void add(s.question_id)}
                >
                  Add to revision
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Page>
  );
};

export default DsaRevisionPage;
