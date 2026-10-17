import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api } from "@/api/endpoints";
import { ExerciseWorkspace } from "@/components/graphqllab/ExerciseWorkspace";
import { LessonBlocks } from "@/components/graphqllab/LabBits";
import { QueryWorkbench } from "@/components/graphqllab/QueryWorkbench";
import { ErrorState } from "@/components/ui/ErrorState";
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
    <div className="mx-auto max-w-6xl px-4 py-10">
      <nav aria-label="Breadcrumb" className="mb-3 text-sm text-ink-muted">
        <Link to={routes.graphqlLab} className="underline">
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
            <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
              Module {detail.module.order} · {DIFFICULTY_LABEL[detail.module.difficulty]}{" "}
              · {STATUS_LABEL[detail.module.status]}
            </p>
            <h1 className="mt-1 text-2xl font-bold text-ink-primary">
              {detail.module.title}
            </h1>
            <p className="mt-1 text-sm text-ink-secondary">{detail.module.summary}</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <h2 className="text-sm font-semibold text-ink-primary">
                  You will be able to
                </h2>
                <ul className="mt-1 list-disc pl-5 text-sm text-ink-secondary">
                  {detail.objectives.map((o) => (
                    <li key={o}>{o}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h2 className="text-sm font-semibold text-ink-primary">Completion</h2>
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

          <section aria-labelledby="lessons-h" className="mt-8">
            <h2 id="lessons-h" className="mb-3 text-lg font-semibold text-ink-primary">
              Lessons
            </h2>
            <div className="flex flex-col gap-3">
              {detail.lessons.map((l, i) => (
                <details
                  key={l.id}
                  id={`lesson-${l.id}`}
                  open={i === 0}
                  className="rounded-lg border border-line bg-white p-4"
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
              className="mt-8 rounded-lg border border-line bg-white p-4"
            >
              <div className="mb-3 flex items-center justify-between">
                <h2 id="sandbox-h" className="text-lg font-semibold text-ink-primary">
                  Try it
                </h2>
                <button
                  type="button"
                  className="text-sm text-primary underline"
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

          <section aria-labelledby="exercises-h" className="mt-8">
            <h2 id="exercises-h" className="mb-3 text-lg font-semibold text-ink-primary">
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
                      "rounded-md border px-3 py-1.5 text-left text-sm",
                      exercise?.id === e.id
                        ? "border-primary bg-primary-soft text-primary-dark"
                        : "border-line-strong bg-white text-ink-secondary hover:bg-surface-100"
                    )}
                  >
                    {e.order}. {e.title}
                    <span className="block text-xs text-ink-muted">
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
        </>
      )}
    </div>
  );
};

export default GraphqlLabModulePage;
