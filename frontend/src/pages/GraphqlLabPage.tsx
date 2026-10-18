import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/endpoints";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/ErrorState";
import { Page, PageHeader } from "@/components/ui/Page";
import { buttonClasses } from "@/lib/buttonClasses";
import { LoadingState } from "@/components/ui/LoadingState";
import { DIFFICULTY_LABEL, STATUS_LABEL, conceptLabel } from "@/lib/graphqlLab";
import { routes } from "@/lib/routes";
import type { LabModulesResponse, LabProgressResponse } from "@/types/contract";

const Stat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="py-4 pr-4 even:pl-4 sm:px-5 sm:even:pl-5 sm:first:pl-0">
    <p className="eyebrow">{label}</p>
    <p className="num mt-2 text-2xl font-medium leading-none tracking-tight text-ink-primary">
      {value}
    </p>
  </div>
);

/** The learning path: ten modules in order, with your progress. Separate from DSA analytics and any readiness score. */
const GraphqlLabPage: React.FC = () => {
  const [modules, setModules] = useState<LabModulesResponse | null>(null);
  const [progress, setProgress] = useState<LabProgressResponse | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [deleteError, setDeleteError] = useState<unknown>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    Promise.all([api.getLabModules(), api.getLabProgress()])
      .then(([m, p]) => {
        if (cancelled) return;
        setModules(m);
        setProgress(p);
      })
      .catch((e: unknown) => !cancelled && setError(e));
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const reload = useCallback(() => setAttempt((a) => a + 1), []);
  const wipe = async () => {
    setDeleteError(null);
    try {
      await api.deleteLabProgress();
      setConfirming(false);
      reload();
    } catch (e) {
      setDeleteError(e);
    }
  };

  const t = progress?.totals;
  const current = modules?.modules.find((m) => m.id === modules.current_module_id);
  const title = (id: string) => modules?.modules.find((m) => m.id === id)?.title ?? id;

  return (
    <Page width="wide">
      <PageHeader
        eyebrow="Learn"
        title="GraphQL Learning Lab"
        description="Learn GraphQL by writing real queries against a small training API (a campus placement hub). Nothing here touches real data or other students: mutations only change your own disposable copy."
        actions={
          <Link
            to={routes.graphqlPlayground}
            className={buttonClasses("secondary", "sm")}
          >
            Open the playground
          </Link>
        }
      />

      {error !== null && <ErrorState className="mt-2" error={error} onRetry={reload} />}
      {error === null && (modules === null || progress === null) && (
        <LoadingState className="mt-2" message="Loading your learning path…" />
      )}

      {modules && progress && t && (
        <>
          <section
            aria-labelledby="lab-progress-h"
            className="border-t border-ink-primary pt-4"
          >
            <h2
              id="lab-progress-h"
              className="mb-4 text-heading font-semibold text-ink-primary"
            >
              Your progress
            </h2>
            {!progress.has_started ? (
              <p className="border border-dashed border-line-strong p-5 text-sm text-ink-secondary">
                You have not started yet. Begin with{" "}
                <Link
                  className="underline underline-offset-4 hover:text-redline"
                  to={routes.graphqlModule(modules.modules[0]!.id)}
                >
                  {modules.modules[0]!.title}
                </Link>
                . Your progress appears here as you pass exercises.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-2 border-y border-ink-primary sm:grid-cols-4 sm:divide-x sm:divide-line">
                  <Stat
                    label="Modules completed"
                    value={`${t.modules_completed} of ${t.modules_total}`}
                  />
                  <Stat
                    label="Lessons completed"
                    value={`${t.lessons_completed} of ${t.lessons_total}`}
                  />
                  <Stat
                    label="Exercises passed"
                    value={`${t.exercises_passed} of ${t.exercises_total}`}
                  />
                  <Stat
                    label="Exercises attempted"
                    value={String(t.exercises_attempted)}
                  />
                </div>
                <div className="mt-8 grid gap-x-12 gap-y-8 sm:grid-cols-2">
                  <div>
                    <h3 className="eyebrow border-b border-ink-primary pb-2 text-ink-primary">
                      Recent activity
                    </h3>
                    <ul className="mt-3 flex flex-col gap-2 text-sm text-ink-secondary">
                      {progress.recent_activity.map((a, i) => (
                        <li key={`${a.at}-${i}`}>
                          {a.kind === "passed"
                            ? "Passed"
                            : a.kind === "hint"
                              ? "Used a hint on"
                              : "Attempted"}{" "}
                          <Link
                            className="underline underline-offset-4 hover:text-redline"
                            to={routes.graphqlModule(a.module_id, a.exercise_id)}
                          >
                            {a.exercise_title}
                          </Link>{" "}
                          <span className="text-xs text-ink-muted">
                            {new Date(a.at).toLocaleString()}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h3 className="eyebrow border-b border-ink-primary pb-2 text-ink-primary">
                      Concepts that need another attempt
                    </h3>
                    {progress.needs_another_attempt.length === 0 ? (
                      <p className="mt-3 text-sm text-ink-secondary">
                        None right now: every exercise you have tried has been passed.
                      </p>
                    ) : (
                      <ul className="mt-3 flex flex-col gap-2 text-sm text-ink-secondary">
                        {progress.needs_another_attempt.map((n) => (
                          <li key={n.concept}>
                            {conceptLabel(n.concept)}{" "}
                            <span className="text-xs text-ink-muted">
                              ({n.exercise_ids.length} exercise
                              {n.exercise_ids.length === 1 ? "" : "s"} not passed yet)
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </>
            )}
            <details className="mt-3 text-xs text-ink-muted">
              <summary className="cursor-pointer">What these numbers mean</summary>
              <dl className="mt-1 flex flex-col gap-1">
                {progress.definitions.map((d) => (
                  <div key={d.metric}>
                    <dt className="inline font-medium text-ink-secondary">
                      {d.metric}:{" "}
                    </dt>
                    <dd className="inline">{d.meaning}</dd>
                  </div>
                ))}
              </dl>
            </details>
          </section>

          <section
            aria-labelledby="lab-path-h"
            className="mt-12 border-t border-ink-primary pt-4"
          >
            <h2
              id="lab-path-h"
              className="mb-1 text-heading font-semibold text-ink-primary"
            >
              Learning path
            </h2>
            {current && (
              <p className="mb-3 text-sm text-ink-secondary">
                Suggested next: {current.title}.
              </p>
            )}
            <ol className="mt-4 border-t border-line">
              {modules.modules.map((m) => (
                <li key={m.id} className="border-b border-line py-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="eyebrow">
                        Module {m.order} · {DIFFICULTY_LABEL[m.difficulty]} ·{" "}
                        {STATUS_LABEL[m.status]}
                      </p>
                      <h3 className="serif mt-1 text-heading font-medium text-ink-primary">
                        <Link
                          to={routes.graphqlModule(m.id)}
                          className="underline underline-offset-4 hover:text-redline"
                        >
                          {m.title}
                        </Link>
                      </h3>
                      <p className="mt-1 text-sm text-ink-secondary">{m.summary}</p>
                    </div>
                    <p className="text-sm text-ink-secondary">
                      {m.exercises_passed} of {m.exercise_count} exercises passed ·{" "}
                      {m.lessons_completed} of {m.lesson_count} lessons
                    </p>
                  </div>
                  <div
                    className="mt-3 h-1.5 overflow-hidden bg-surface-200"
                    aria-hidden="true"
                  >
                    <div
                      className="h-full bg-ink-primary"
                      style={{
                        width: `${(m.exercises_passed / Math.max(1, m.exercise_count)) * 100}%`,
                      }}
                    />
                  </div>
                  {m.recommended_first.length > 0 && m.status === "not_started" && (
                    <p className="mt-2 text-xs text-ink-muted">
                      Recommended first: {m.recommended_first.map(title).join(", ")}. You
                      can still open this module now.
                    </p>
                  )}
                </li>
              ))}
            </ol>
          </section>

          <section className="mt-14 border-t border-line pt-4">
            {!confirming ? (
              <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
                Delete my GraphQL Lab data
              </Button>
            ) : (
              <div
                className="flex flex-wrap items-center gap-2 text-sm"
                role="group"
                aria-label="Confirm deletion"
              >
                <span className="text-ink-secondary">
                  Delete all your progress, attempts and training data? This cannot be
                  undone.
                </span>
                <Button size="sm" onClick={() => void wipe()}>
                  Yes, delete it
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
                  Keep it
                </Button>
              </div>
            )}
            {deleteError !== null && <ErrorState className="mt-2" error={deleteError} />}
          </section>
        </>
      )}
    </Page>
  );
};

export default GraphqlLabPage;
