import { Enter } from "@/components/motion/Enter";
import { CheckMark } from "@/components/motion/Marks";
import { DUR, RISE } from "@/components/motion/tokens";
import { cn } from "@/lib/cn";
import React, { useEffect, useRef, useState } from "react";
import { api } from "@/api/endpoints";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import {
  DIFFICULTY_LABEL,
  TYPE_LABEL,
  conceptLabel,
  formatVariables,
  newAttemptId,
  parseVariables,
} from "@/lib/graphqlLab";
import type {
  LabAttempt,
  LabExercise,
  LabSubmitResponse,
  LabTrainingSchemaResponse,
} from "@/types/contract";
import { HelpPanel } from "./HelpPanel";
import { ResultPanel } from "./LabBits";
import { QueryWorkbench } from "./QueryWorkbench";

export interface ExerciseWorkspaceProps {
  exercise: LabExercise;
  schema: LabTrainingSchemaResponse | null;
  schemaError: unknown;
  onRetrySchema: () => void;
  /** Called after every graded submission so the page can refresh progress. */
  onSubmitted: (r: LabSubmitResponse) => void;
  onGoToLesson: (lessonId: string) => void;
}

const field = "w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm";

/** One exercise: the task, an editor or the answer controls, graded hints and the result of the check. */
export const ExerciseWorkspace: React.FC<ExerciseWorkspaceProps> = ({
  exercise,
  schema,
  schemaError,
  onRetrySchema,
  onSubmitted,
  onGoToLesson,
}) => {
  const isQuery = exercise.type === "query" || exercise.type === "mutation";
  const starterQuery = exercise.starter_query ?? "";
  const starterVars = formatVariables(exercise.starter_variables);
  const [query, setQuery] = useState(starterQuery);
  const [variables, setVariables] = useState(starterVars);
  const [choice, setChoice] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<LabSubmitResponse | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [hints, setHints] = useState<string[]>([]);
  const [hintError, setHintError] = useState<unknown>(null);
  const [hintBusy, setHintBusy] = useState(false);
  const [last, setLast] = useState<LabAttempt | null>(null);
  const attemptId = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getLabAttempts(exercise.id)
      .then(
        (r) =>
          !cancelled &&
          setLast(r.attempts.find((a) => a.query !== null || a.answer !== null) ?? null)
      )
      .catch(() => undefined); // restoring an old attempt is a convenience only
    return () => {
      cancelled = true;
    };
  }, [exercise.id]);

  const vars = parseVariables(variables);
  const canSubmit =
    !submitting &&
    (isQuery
      ? query.trim() !== ""
      : exercise.type === "explanation"
        ? text.trim() !== ""
        : choice.length > 0);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    attemptId.current ??= newAttemptId(); // a retry after a failure reuses the id, so it is counted once
    try {
      const r = await api.submitLab(exercise.id, {
        client_attempt_id: attemptId.current,
        ...(isQuery
          ? { query, ...(vars.ok && vars.value ? { variables: vars.value } : {}) }
          : { answer: exercise.type === "explanation" ? text : choice }),
      });
      attemptId.current = null;
      setResult(r);
      onSubmitted(r);
    } catch (e) {
      setError(e);
    } finally {
      setSubmitting(false);
    }
  };

  const nextHint = async () => {
    setHintBusy(true);
    setHintError(null);
    try {
      const h = await api.hintLab(exercise.id);
      setHints((cur) => (cur.includes(h.hint) ? cur : [...cur, h.hint]));
    } catch (e) {
      setHintError(e);
    } finally {
      setHintBusy(false);
    }
  };

  const restore = () => {
    if (!last) return;
    if (last.query !== null) setQuery(last.query);
    if (last.variables) setVariables(formatVariables(last.variables));
    if (typeof last.answer === "string") setText(last.answer);
    if (Array.isArray(last.answer)) setChoice(last.answer);
  };

  const toggle = (id: string) =>
    setChoice((cur) =>
      exercise.multi_select
        ? cur.includes(id)
          ? cur.filter((x) => x !== id)
          : [...cur, id]
        : [id]
    );

  const submitButton = (
    <Button variant="default" onClick={() => void submit()} disabled={!canSubmit}>
      {submitting
        ? "Checking…"
        : error !== null
          ? "Retry check"
          : isQuery
            ? "Check my answer"
            : "Submit answer"}
    </Button>
  );

  return (
    <section
      aria-labelledby="exercise-title"
      className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-4 sm:p-6"
    >
      <header>
        <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
          {TYPE_LABEL[exercise.type]} · {DIFFICULTY_LABEL[exercise.difficulty]}
          {exercise.student.passed
            ? " · Passed"
            : exercise.student.attempts > 0
              ? ` · ${exercise.student.attempts} attempt${exercise.student.attempts === 1 ? "" : "s"}`
              : ""}
        </p>
        <h2 id="exercise-title" className="mt-1 text-lg font-semibold text-ink-primary">
          {exercise.title}
        </h2>
        <p className="mt-2 text-sm text-ink-secondary">{exercise.description}</p>
        <ul
          aria-label="Requirements"
          className="mt-2 list-disc pl-5 text-sm text-ink-secondary"
        >
          {exercise.requirements.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-ink-muted">{exercise.grading}</p>
        <p className="mt-1 text-xs text-ink-muted">
          Concepts: {exercise.concepts.map(conceptLabel).join(", ")}
        </p>
      </header>

      {exercise.schema_excerpt && (
        <pre
          aria-label="Schema excerpt"
          className="overflow-x-auto rounded-md border border-line bg-surface-50 p-3 font-mono text-xs text-ink-primary"
        >
          {exercise.schema_excerpt}
        </pre>
      )}

      {isQuery && (
        <QueryWorkbench
          query={query}
          onQueryChange={setQuery}
          variablesText={variables}
          onVariablesChange={setVariables}
          starter={{ query: starterQuery, variables: starterVars }}
          schema={schema}
          schemaError={schemaError}
          onRetrySchema={onRetrySchema}
          actions={
            <>
              {submitButton}
              {last && last.query !== null && (
                <Button variant="ghost" size="sm" onClick={restore}>
                  Load my last attempt
                </Button>
              )}
            </>
          }
        />
      )}

      {(exercise.type === "multiple_choice" || exercise.type === "schema_reading") &&
        exercise.options && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium text-ink-primary">
              {exercise.multi_select
                ? "Choose every correct answer"
                : "Choose one answer"}
            </legend>
            {exercise.options.map((o) => (
              <label
                key={o.id}
                className="flex items-start gap-2 rounded-md border border-line p-2 text-sm text-ink-primary"
              >
                <input
                  type={exercise.multi_select ? "checkbox" : "radio"}
                  name="choice"
                  checked={choice.includes(o.id)}
                  onChange={() => toggle(o.id)}
                  className="mt-0.5"
                />
                <span className="font-mono text-xs sm:text-sm">{o.text}</span>
              </label>
            ))}
            <div className="flex flex-wrap items-center gap-2">
              {submitButton}
              {last && Array.isArray(last.answer) && (
                <Button variant="ghost" size="sm" onClick={restore}>
                  Load my last answer
                </Button>
              )}
            </div>
          </fieldset>
        )}

      {exercise.type === "explanation" && (
        <div>
          <label
            htmlFor="lab-explanation"
            className="mb-1 block text-sm font-medium text-ink-primary"
          >
            Your explanation
          </label>
          <textarea
            id="lab-explanation"
            rows={6}
            className={field}
            maxLength={exercise.max_answer_chars ?? 1000}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <p className="mt-1 text-xs text-ink-muted">
            {text.length} of {exercise.max_answer_chars} characters
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {submitButton}
            {last && typeof last.answer === "string" && (
              <Button variant="ghost" size="sm" onClick={restore}>
                Load my last answer
              </Button>
            )}
          </div>
        </div>
      )}

      {error !== null && <ErrorState error={error} />}
      {submitting && <LoadingState message="Checking your answer…" />}

      {result && !submitting && (
        <Enter
          key={`${result.outcome}:${result.feedback}:${result.checks.length}`}
          aria-label="Check result"
          y={RISE.sm}
          duration={DUR.base}
          className={cn(
            "flex flex-col gap-3 rounded-md border bg-surface-50 p-4 transition-colors duration-200",
            result.outcome === "passed" ? "border-verified/60" : "border-line"
          )}
        >
          <p role="status" className="text-base font-semibold text-ink-primary">
            {result.outcome === "passed" ? "Passed" : "Not yet"}
            {result.replayed ? " (this attempt had already been checked)" : ""}
          </p>
          <p className="text-sm text-ink-secondary">{result.feedback}</p>
          <ul aria-label="Checks" className="flex flex-col gap-1 text-sm">
            {result.checks.map((c, ci) => (
              <Enter
                as="li"
                index={ci}
                y={RISE.sm}
                duration={DUR.fast}
                key={c.label}
                className="text-ink-primary"
              >
                <span aria-hidden="true" className="mr-1.5 inline-block w-4 align-[-2px]">
                  {c.passed ? <CheckMark size={14} className="text-verified" /> : "✗"}
                </span>
                {c.label}: {c.passed ? "met" : "not met"}
              </Enter>
            ))}
          </ul>
          {result.hint && <p className="text-sm text-ink-primary">Hint: {result.hint}</p>}
          {result.explanation && (
            <p className="text-sm text-ink-primary">{result.explanation}</p>
          )}
          {result.newly_completed.module && (
            <p className="text-sm font-medium text-ink-primary">
              You have completed this module.
            </p>
          )}
          {!result.newly_completed.module && result.newly_completed.lesson && (
            <p className="text-sm font-medium text-ink-primary">
              You have completed the lesson "{result.lesson.title}".
            </p>
          )}
          {result.outcome !== "passed" && (
            <button
              type="button"
              className="self-start text-sm text-redline underline"
              onClick={() => onGoToLesson(result.lesson.lesson_id)}
            >
              Review the lesson: {result.lesson.title}
            </button>
          )}
          {result.execution && (
            <details>
              <summary className="cursor-pointer text-sm font-medium text-ink-primary">
                The response to your query in the checked run
              </summary>
              <div className="mt-2">
                <ResultPanel response={result.execution} />
              </div>
            </details>
          )}
        </Enter>
      )}

      <div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void nextHint()}
            disabled={hintBusy || hints.length >= exercise.hints_total}
          >
            {hintBusy
              ? "Getting a hint…"
              : hints.length >= exercise.hints_total
                ? "No more hints"
                : `Show a hint (${hints.length} of ${exercise.hints_total} shown)`}
          </Button>
          {exercise.example && isQuery && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setQuery(exercise.example!.query);
                setVariables(formatVariables(exercise.example!.variables));
              }}
            >
              Load the example
            </Button>
          )}
        </div>
        {hintError !== null && <ErrorState className="mt-2" error={hintError} />}
        {hints.length > 0 && (
          <ol
            aria-label="Hints"
            className="mt-2 list-decimal pl-5 text-sm text-ink-primary"
          >
            {hints.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ol>
        )}
      </div>

      <HelpPanel
        query={isQuery ? query : ""}
        variablesText={isQuery ? variables : ""}
        exerciseId={exercise.id}
      />
    </section>
  );
};
