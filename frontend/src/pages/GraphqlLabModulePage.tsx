import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api } from "@/api/endpoints";
import { ExerciseWorkspace } from "@/components/graphqllab/ExerciseWorkspace";
import { LessonBlocks } from "@/components/graphqllab/LabBits";
import { QueryWorkbench } from "@/components/graphqllab/QueryWorkbench";
import { ErrorState } from "@/components/ui/ErrorState";
import { Page } from "@/components/ui/Page";
import { LoadingState } from "@/components/ui/LoadingState";
import { useLabSchema } from "@/hooks/useLabSchema";
import {
  DIFFICULTY_LABEL,
  STATUS_LABEL,
  TYPE_LABEL,
  formatVariables,
} from "@/lib/graphqlLab";
import { cn } from "@/lib/cn";
import { routes } from "@/lib/routes";
import type { LabModuleDetail } from "@/types/contract";

/** One module: its lessons (with runnable examples), then its exercises one at a time. */
const GraphqlLabModulePage: React.FC = () => {
  const { moduleId = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const { schema, error: schemaError, retry: retrySchema } = useLabSchema();
  const [detail, setDetail] = useState<LabModuleDetail | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  const [sandbox, setSandbox] = useState<{ query: string; variables: string } | null>(
    null
  );
  const [sandboxQuery, setSandboxQuery] = useState("");
  const [sandboxVars, setSandboxVars] = useState("");

  const load = useCallback(
    (silent: boolean) => {
      if (!silent) {
        setDetail(null);
        setError(null);
      }
      return api
        .getLabModule(moduleId)
        .then((d) => setDetail(d))
        .catch((e: unknown) => setError(e));
    },
    [moduleId]
  );
  useEffect(() => {
    void load(false);
  }, [load, attempt]);

  const selectedId = params.get("exercise");
  const exercise = useMemo(() => {
    if (!detail) return null;
    return (
      detail.exercises.find((e) => e.id === selectedId) ??
      detail.exercises.find((e) => !e.student.passed) ??
      detail.exercises[0] ??
      null
    );
  }, [detail, selectedId]);

  const tryExample = (b: { query: string; variables?: Record<string, unknown> }) => {
    const v = formatVariables(b.variables);
    setSandbox({ query: b.query, variables: v });
    setSandboxQuery(b.query);
    setSandboxVars(v);
    document
      .getElementById("lab-sandbox")
      ?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  };

  const goToLesson = (lessonId: string) => {
    document
      .getElementById(`lesson-${lessonId}`)
      ?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  };

  return (
    <Page width="wide">
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-ink-muted">
        <Link
          to={routes.graphqlLab}
          className="underline underline-offset-4 hover:text-ink-primary"
        >
          GraphQL Lab
        </Link>{" "}
        / {detail?.module.title ?? "Module"}
      </nav>

      {error !== null && (
        <ErrorState error={error} onRetry={() => setAttempt((a) => a + 1)} />
      )}
      {error === null && detail === null && (
        <LoadingState message="Loading the module…" />
      )}

      {detail && (
        <>
          <header>
            <p className="eyebrow text-redline">
              Module {detail.module.order} · {DIFFICULTY_LABEL[detail.module.difficulty]}{" "}
              · {STATUS_LABEL[detail.module.status]}
            </p>
            <h1 className="serif mt-2 text-title font-medium text-ink-primary">
              {detail.module.title}
            </h1>
            <p className="mt-3 max-w-2xl leading-relaxed text-ink-secondary">
              {detail.module.summary}
            </p>
            <div className="mt-6 grid gap-x-12 gap-y-6 border-y border-line py-5 sm:grid-cols-2">
              <div>
                <h2 className="eyebrow text-ink-primary">You will be able to</h2>
                <ul className="mt-1 list-disc pl-5 text-sm text-ink-secondary">
                  {detail.objectives.map((o) => (
                    <li key={o}>{o}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h2 className="eyebrow text-ink-primary">Completion</h2>
                <p className="mt-1 text-sm text-ink-secondary">
                  {detail.completion_criteria} A module is completed only when every
                  exercise has actually passed its check.
                </p>
                <p className="mt-1 text-sm text-ink-secondary">
                  {detail.module.exercises_passed} of {detail.module.exercise_count}{" "}
                  exercises passed.
                </p>
              </div>
            </div>
          </header>

          <div className="mt-10 grid gap-x-12 gap-y-12 xl:grid-cols-[minmax(0,30rem)_minmax(0,1fr)] xl:items-start">
            <div className="min-w-0 xl:sticky xl:top-6 xl:max-h-[calc(100vh-3rem)] xl:overflow-y-auto xl:pr-4">
              <section aria-labelledby="lessons-h">
                <h2
                  id="lessons-h"
                  className="mb-3 border-t border-ink-primary pt-4 text-heading font-semibold text-ink-primary"
                >
                  Lessons
                </h2>
                <div className="flex flex-col">
                  {detail.lessons.map((l, i) => (
                    <details
                      key={l.id}
                      id={`lesson-${l.id}`}
                      open={i === 0}
                      className="border-b border-line py-4"
                    >
                      <summary className="cursor-pointer font-semibold text-ink-primary">
                        {l.title}
                        {l.completed ? (
                          <span className="ml-2 text-xs font-normal text-ink-muted">
                            (completed)
                          </span>
                        ) : null}
                      </summary>
                      <ul className="mt-2 list-disc pl-5 text-xs text-ink-muted">
                        {l.objectives.map((o) => (
                          <li key={o}>{o}</li>
                        ))}
                      </ul>
                      <div className="mt-3">
                        <LessonBlocks blocks={l.blocks} onTry={tryExample} />
                      </div>
                    </details>
                  ))}
                </div>
              </section>

              {sandbox && (
                <section
                  id="lab-sandbox"
                  aria-labelledby="sandbox-h"
                  className="mt-8 border-t border-ink-primary pt-4"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <h2
                      id="sandbox-h"
                      className="text-heading font-semibold text-ink-primary"
                    >
                      Try it
                    </h2>
                    <button
                      type="button"
                      className="text-sm text-redline underline underline-offset-4"
                      onClick={() => setSandbox(null)}
                    >
                      Close
                    </button>
                  </div>
                  <QueryWorkbench
                    query={sandboxQuery}
                    onQueryChange={setSandboxQuery}
                    variablesText={sandboxVars}
                    onVariablesChange={setSandboxVars}
                    starter={sandbox}
                    schema={schema}
                    schemaError={schemaError}
                    onRetrySchema={retrySchema}
                  />
                </section>
              )}
            </div>

            <section aria-labelledby="exercises-h" className="min-w-0">
              <h2
                id="exercises-h"
                className="mb-3 border-t border-ink-primary pt-4 text-heading font-semibold text-ink-primary"
              >
                Exercises
              </h2>
              <ol className="mb-4 flex flex-wrap gap-2" aria-label="Exercises">
                {detail.exercises.map((e) => (
                  <li key={e.id}>
                    <button
                      type="button"
                      aria-current={exercise?.id === e.id ? "true" : undefined}
                      onClick={() => setParams({ exercise: e.id }, { replace: true })}
                      className={cn(
                        "min-h-12 rounded-md border px-3 py-1.5 text-left text-sm transition-colors",
                        exercise?.id === e.id
                          ? "border-ink-primary bg-ink-primary text-surface-50"
                          : "border-line-strong bg-surface text-ink-secondary hover:border-ink-primary"
                      )}
                    >
                      {e.order}. {e.title}
                      <span
                        className={cn(
                          "block text-xs",
                          exercise?.id === e.id ? "text-surface-50/80" : "text-ink-muted"
                        )}
                      >
                        {TYPE_LABEL[e.type]} ·{" "}
                        {e.student.passed
                          ? "Passed"
                          : e.student.attempts > 0
                            ? "Attempted"
                            : "Not started"}
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
              {exercise && (
                <ExerciseWorkspace
                  key={exercise.id}
                  exercise={exercise}
                  schema={schema}
                  schemaError={schemaError}
                  onRetrySchema={retrySchema}
                  onSubmitted={() => void load(true)}
                  onGoToLesson={goToLesson}
                />
              )}
            </section>
          </div>
        </>
      )}
    </Page>
  );
};

export default GraphqlLabModulePage;
