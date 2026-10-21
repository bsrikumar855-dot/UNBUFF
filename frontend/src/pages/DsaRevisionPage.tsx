import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ListChecks, Sparkles } from "lucide-react";
import { api } from "@/api/endpoints";
import type {
  RevisionActionRequest,
  RevisionItem,
  RevisionQueueResponse,
} from "@/types/contract";
import { Pager } from "@/components/dsa/DsaBits";
import { Button } from "@/components/ui/button";
import { GLASS, GlassCard, TILE } from "@/components/ui/GlassCard";
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
    <Page width="fluid" className="sm:px-5 lg:pl-5 lg:pr-6">
      <PageHeader
        crumbs={[
          { label: "DSA Arena", to: routes.dsa },
          { label: "Analytics", to: routes.dsaAnalytics },
          { label: "Revision" },
        ]}
        eyebrow="Practice"
        title={
          <>
            Revision <em>queue</em>
          </>
        }
        description="Questions to come back to, ordered by priority and due date. Solve one again with a judged submission to move it forward."
      />

      <div
        role="tablist"
        aria-label="Queue view"
        className={cn(GLASS, "mb-5 inline-flex max-w-full flex-wrap gap-1 p-1.5")}
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
              "min-h-10 rounded-full px-4 text-sm font-medium transition-colors",
              view === v.value
                ? "bg-ink-primary font-semibold text-surface-50"
                : "text-ink-secondary hover:bg-white/70 hover:text-ink-primary"
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
        <p className={cn(GLASS, "p-6 text-sm text-ink-secondary")}>
          {view === "due"
            ? "Nothing is due. Failed judged submissions and solved-after-failure questions appear here automatically."
            : "No items in this view."}
        </p>
      )}

      {data && data.items.length > 0 && (
        <GlassCard
          id="queue"
          icon={ListChecks}
          title={VIEWS.find((v) => v.value === view)?.label ?? "Queue"}
          sub="Ordered by priority, then due date."
        >
          <ul className="flex flex-col gap-2.5">
            {data.items.map((i) => (
              <li key={i.question_id} className={cn(TILE, "px-4 py-4")}>
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
                    <p className="font-medium text-ink-secondary">
                      {PRIORITY[i.priority]}
                    </p>
                    <p>
                      {STATUS[i.status]} ·{" "}
                      {i.due
                        ? "due now"
                        : `due ${new Date(i.due_at).toLocaleDateString()}`}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    to={routes.dsaCode(i.question_id)}
                    className={buttonClasses("primary", "sm", "rounded-full")}
                  >
                    Open coding workspace
                  </Link>
                  {(i.status === "pending" ||
                    i.status === "postponed" ||
                    i.status === "scheduled") && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-full bg-white/70"
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
                        className="rounded-full bg-white/70"
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
                        className="rounded-full bg-white/70"
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
                      className="rounded-full"
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
                      className="rounded-full"
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
          {data && (
            <Pager page={data.page} totalPages={data.total_pages} onPage={setPage} />
          )}
        </GlassCard>
      )}
      {data && data.items.length === 0 && (
        <Pager page={data.page} totalPages={data.total_pages} onPage={setPage} />
      )}

      {data && data.suggestions.length > 0 && (
        <GlassCard
          id="suggest"
          icon={Sparkles}
          title="Suggested practice"
          sub="Unsolved questions from topics where your recent judged submissions show a real pattern. Nothing is added unless you choose to."
          className="mt-5"
        >
          <ul className="flex flex-col gap-2.5">
            {data.suggestions.map((s) => (
              <li
                key={s.question_id}
                className={cn(
                  TILE,
                  "flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
                )}
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
                  className="rounded-full bg-white/70"
                  disabled={busy === s.question_id}
                  onClick={() => void add(s.question_id)}
                >
                  Add to revision
                </Button>
              </li>
            ))}
          </ul>
        </GlassCard>
      )}
    </Page>
  );
};

export default DsaRevisionPage;
