import React, { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import { api } from "@/api/endpoints";
import { useAuth } from "@/auth/context";
import { DifficultyBadge, TopicTags } from "@/components/dsa/DsaBits";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { SplitPane } from "@/components/ui/SplitPane";
import { Enter } from "@/components/motion/Enter";
import { DUR } from "@/components/motion/tokens";
import { Stamp } from "@/components/motion/Stamp";
import { cn } from "@/lib/cn";
import { loadDraft, removeDraft, saveDraft } from "@/lib/drafts";
import { routes } from "@/lib/routes";
import type {
  CodeExerciseResponse,
  CodeLanguage,
  CodeLanguageId,
  CodeRunResponse,
  CodeSubmission,
  CodeSubmissionDetail,
  QuestionDetailResponse,
  RunStatus,
  SubmissionVerdict,
} from "@/types/contract";

const CodeEditor = lazy(() => import("@/components/code/CodeEditor"));

const RUN_LABEL: Record<RunStatus, string> = {
  completed: "Finished",
  compile_error: "Compilation error",
  runtime_error: "Runtime error",
  time_limit_exceeded: "Time limit exceeded",
  judge_error: "Judge error (not your code's fault)",
};

const VERDICT_LABEL: Record<SubmissionVerdict, string> = {
  accepted: "Accepted",
  wrong_answer: "Wrong answer",
  compile_error: "Compilation error",
  runtime_error: "Runtime error",
  time_limit_exceeded: "Time limit exceeded",
  judge_error: "Judge error (not your code's fault)",
};

const field =
  "w-full rounded-md border border-line-strong bg-surface px-3 py-2 font-mono text-sm";

const Output: React.FC<{ title: string; text: string }> = ({ title, text }) =>
  text ? (
    <div className="mt-3">
      <h4 className="eyebrow mb-1">{title}</h4>
      <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words border border-line bg-surface-50 p-3 font-mono text-[13px] leading-relaxed text-ink-primary">
        {text}
      </pre>
    </div>
  ) : null;

const metrics = (time: number | null, mem: number | null) =>
  [
    time !== null ? `${time} ms` : null,
    mem !== null ? `${(mem / 1024).toFixed(1)} MB` : null,
  ]
    .filter(Boolean)
    .join(" · ");

/**
 * Coding workspace for one DSA question. Run and Submit are separate: only an accepted, judged submission marks it solved.
 * Composition: on desktop a full-height tool (problem beside the editor, console under the editor, both dividers
 * draggable); on a phone a stacked page with the Run and Submit bar pinned to the bottom.
 */
const CodeWorkspacePage: React.FC = () => {
  const { questionId = "" } = useParams<{ questionId: string }>();
  const location = useLocation();
  const auth = useAuth();
  const uid = auth.user?.uid ?? null;
  const signedIn = auth.status === "signedIn";

  const [question, setQuestion] = useState<QuestionDetailResponse | null>(null);
  const [exercise, setExercise] = useState<CodeExerciseResponse | null>(null);
  const [languages, setLanguages] = useState<{
    list: CodeLanguage[];
    available: boolean;
  } | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);

  const [languageId, setLanguageId] = useState<CodeLanguageId | "">("");
  const [source, setSource] = useState("");
  const [plain, setPlain] = useState(false);
  const [stdin, setStdin] = useState("");

  const [busy, setBusy] = useState<"run" | "submit" | null>(null);
  const [runResult, setRunResult] = useState<CodeRunResponse | null>(null);
  const [submission, setSubmission] = useState<CodeSubmission | null>(null);
  const [actionError, setActionError] = useState<unknown>(null);

  const [history, setHistory] = useState<CodeSubmission[] | null>(null);
  const [historyError, setHistoryError] = useState<unknown>(null);
  const [viewing, setViewing] = useState<CodeSubmissionDetail | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    Promise.all([
      api.getQuestion(questionId),
      api.getCodeExercise(questionId),
      api.getCodeLanguages(),
    ])
      .then(([q, ex, langs]) => {
        if (cancelled) return;
        setQuestion(q);
        setExercise(ex);
        setLanguages({ list: langs.languages, available: langs.execution_available });
        setLanguageId((cur) => cur || langs.languages[0]?.id || "");
      })
      .catch((e: unknown) => !cancelled && setLoadError(e));
    return () => {
      cancelled = true;
    };
  }, [questionId, attempt]);

  const language = useMemo(
    () => languages?.list.find((l) => l.id === languageId) ?? null,
    [languages, languageId]
  );
  const starter = useMemo(
    () =>
      language ? (exercise?.starter_code[language.id] ?? language.starter_code) : "",
    [exercise, language]
  );

  // Load this account's draft (or the starter) whenever the question, language or account changes.
  useEffect(() => {
    if (!language) return;
    setSource((uid ? loadDraft(uid, questionId, language.id) : null) ?? starter);
    setRunResult(null);
    setSubmission(null);
  }, [language, starter, uid, questionId]);

  // Save the draft shortly after the student stops typing; never for signed-out visitors.
  useEffect(() => {
    if (!uid || !language) return;
    const t = setTimeout(
      () =>
        source === starter
          ? removeDraft(uid, questionId, language.id)
          : saveDraft(uid, questionId, language.id, source),
      600
    );
    return () => clearTimeout(t);
  }, [source, starter, uid, language, questionId]);

  const loadHistory = useCallback(async () => {
    setHistoryError(null);
    try {
      setHistory((await api.getCodeSubmissions(questionId)).submissions);
    } catch (e) {
      setHistoryError(e);
    }
  }, [questionId]);

  useEffect(() => {
    if (signedIn) void loadHistory();
    else setHistory(null);
  }, [signedIn, loadHistory]);

  const run = async (extra: { stdin?: string; sample_index?: number }) => {
    if (!language) return;
    setBusy("run");
    setActionError(null);
    setRunResult(null);
    try {
      setRunResult(
        await api.runCode({
          language: language.id,
          source,
          ...(extra.sample_index !== undefined
            ? { question_id: questionId, sample_index: extra.sample_index }
            : { stdin: extra.stdin ?? "" }),
        })
      );
    } catch (e) {
      setActionError(e);
    } finally {
      setBusy(null);
    }
  };

  const submit = async () => {
    if (!language) return;
    setBusy("submit");
    setActionError(null);
    setSubmission(null);
    try {
      setSubmission(
        await api.submitCode({ question_id: questionId, language: language.id, source })
      );
      void loadHistory();
    } catch (e) {
      setActionError(e);
    } finally {
      setBusy(null);
    }
  };

  const viewSubmission = async (id: string) => {
    try {
      setViewing(await api.getCodeSubmission(id));
    } catch (e) {
      setHistoryError(e);
    }
  };

  const deleteSubmission = async (id: string) => {
    try {
      await api.deleteCodeSubmission(id);
      setHistory((h) => (h ? h.filter((s) => s.id !== id) : h));
      if (viewing?.id === id) setViewing(null);
    } catch (e) {
      setHistoryError(e);
    }
  };

  const canRun = signedIn && language !== null && busy === null && source.trim() !== "";
  const canSubmit = canRun && exercise?.gradable === true;
  const backTo = routes.dsaQuestion(questionId);
  const ready = question && exercise && languages;

  return (
    <div
      className={cn(
        "flex flex-col pb-24 lg:pb-0",
        signedIn ? "lg:h-screen" : "lg:h-[calc(100dvh-4rem)]"
      )}
    >
      <header className="border-b border-line px-4 py-3 sm:px-6">
        <nav aria-label="Breadcrumb" className="mb-1 text-sm text-ink-muted">
          <Link
            to={routes.dsa}
            className="underline underline-offset-4 hover:text-ink-primary"
          >
            DSA Arena
          </Link>{" "}
          /{" "}
          <Link
            to={backTo}
            className="underline underline-offset-4 hover:text-ink-primary"
          >
            Question
          </Link>{" "}
          / Code
        </nav>
        {loadError !== null && (
          <ErrorState
            className="my-2"
            error={loadError}
            onRetry={() => setAttempt((a) => a + 1)}
          />
        )}
        {loadError === null && !ready && (
          <LoadingState className="py-2" message="Loading workspace…" />
        )}
        {question && exercise && languages && (
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <div className="min-w-0">
              <h1 className="serif text-heading font-medium text-ink-primary sm:text-[1.6rem]">
                {question.question.title}
              </h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
                <DifficultyBadge difficulty={question.question.difficulty} />
                <TopicTags topics={question.question.topics} />
                {question.question.url !== null ? (
                  <a
                    href={question.question.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-redline underline underline-offset-4"
                  >
                    Original problem <ExternalLink size={14} aria-hidden="true" />
                    <span className="sr-only">(opens in a new tab)</span>
                  </a>
                ) : (
                  <span className="text-sm text-ink-secondary">
                    First-party practice problem
                  </span>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-xs font-medium text-ink-muted">
                Language
                <select
                  className="min-h-10 rounded-md border border-line-strong bg-surface px-3 py-2 text-sm font-normal text-ink-primary"
                  value={languageId}
                  disabled={languages.list.length === 0}
                  onChange={(e) => setLanguageId(e.target.value as CodeLanguageId)}
                >
                  {languages.list.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex min-h-10 items-center gap-2 text-sm text-ink-secondary">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={plain}
                  onChange={(e) => setPlain(e.target.checked)}
                />
                Plain text editor
              </label>
              <Button
                variant="ghost"
                size="sm"
                disabled={!language}
                onClick={() => {
                  if (!language) return;
                  if (uid) removeDraft(uid, questionId, language.id);
                  setSource(starter);
                }}
              >
                Reset to starter code
              </Button>
            </div>
          </div>
        )}
      </header>

      {question && exercise && languages && (
        <SplitPane
          direction="row"
          initial={0.38}
          min={0.25}
          max={0.6}
          label="Resize problem and editor panes"
          className="lg:min-h-0"
          first={
            /* ---- problem side: statement, samples, then this student's submissions ---- */
            <section
              aria-label="Problem"
              className="flex h-full flex-col gap-6 overflow-y-auto px-4 py-5 sm:px-6"
            >
              {exercise.is_demonstration && (
                <p
                  role="note"
                  className="border-l-2 border-verdict-shaky-fg bg-surface-100/60 py-2 pl-4 pr-3 text-sm text-ink-primary"
                >
                  Demonstration exercise written for UNBLUFF. It is not a real company
                  interview question.
                </p>
              )}
              {exercise.statement ? (
                <p className="text-[15px] leading-relaxed text-ink-secondary">
                  {exercise.statement}
                </p>
              ) : (
                <p className="text-[15px] leading-relaxed text-ink-secondary">
                  No problem statement is stored here. Read the original problem through
                  the link above, then write and run your solution.
                </p>
              )}

              <div>
                <h2 className="eyebrow border-b border-ink-primary pb-2">Sample tests</h2>
                {exercise.samples.length === 0 ? (
                  <p className="pt-3 text-sm text-ink-muted">
                    No visible samples for this question. Use your own input below.
                  </p>
                ) : (
                  <ul>
                    {exercise.samples.map((s, i) => (
                      <li key={i} className="border-b border-line py-4 text-sm">
                        <p className="mb-2 font-semibold text-ink-primary">
                          Sample {i + 1}
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="min-w-0">
                            <p className="eyebrow mb-1">Input</p>
                            <pre className="overflow-x-auto border border-line bg-surface-50 p-2 font-mono text-xs leading-relaxed">
                              {s.input}
                            </pre>
                          </div>
                          <div className="min-w-0">
                            <p className="eyebrow mb-1">Expected output</p>
                            <pre className="overflow-x-auto border border-line bg-surface-50 p-2 font-mono text-xs leading-relaxed">
                              {s.expected_output}
                            </pre>
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setStdin(s.input)}
                          >
                            Use as custom input
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={!canRun}
                            onClick={() => void run({ sample_index: i })}
                          >
                            Run sample {i + 1}
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <p className="border-l-2 border-line-strong pl-4 text-sm leading-relaxed text-ink-secondary">
                {exercise.gradable
                  ? `Submitting is judged on ${exercise.hidden_test_count} hidden tests (suite ${exercise.test_revision}).`
                  : "Full judging is not available for this question: it has no test suite. You can run your code, but it can't be submitted for a verdict."}
              </p>
            </section>
          }
          second={
            <SplitPane
              direction="column"
              initial={0.62}
              min={0.3}
              max={0.85}
              label="Resize editor and console"
              className="h-full lg:border-l lg:border-line max-lg:border-t max-lg:border-line"
              first={
                <section aria-label="Code" className="flex h-full min-w-0 flex-col">
                  {!languages.available && (
                    <p
                      role="alert"
                      className="border-b border-line bg-surface-100/60 px-4 py-2.5 text-sm text-ink-primary"
                    >
                      Code execution isn&apos;t available right now (no execution service
                      is configured or reachable), so there are no languages to choose.
                      You can read the problem, but Run and Submit are disabled.
                    </p>
                  )}
                  <div className="h-[56vh] min-h-[22rem] lg:h-auto lg:min-h-0 lg:flex-1">
                    {language ? (
                      plain ? (
                        <textarea
                          aria-label={`Code editor, ${language.name}`}
                          className="block h-full w-full resize-none border-0 bg-surface p-4 font-mono text-sm leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-redline"
                          spellCheck={false}
                          value={source}
                          onChange={(e) => setSource(e.target.value)}
                        />
                      ) : (
                        <Suspense
                          fallback={
                            <LoadingState className="p-4" message="Loading editor…" />
                          }
                        >
                          <CodeEditor
                            value={source}
                            language={language.id}
                            onChange={setSource}
                            ariaLabel={`Code editor, ${language.name}`}
                            height="100%"
                          />
                        </Suspense>
                      )
                    ) : (
                      <p className="m-4 border border-dashed border-line-strong p-6 text-center text-sm text-ink-muted">
                        Choose a language to start.
                      </p>
                    )}
                  </div>
                </section>
              }
              second={
                /* ---- console: actions, input and results ---- */
                <section
                  aria-label="Console"
                  className="flex h-full min-h-0 flex-col bg-surface"
                >
                  <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-2.5 max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-30 max-lg:border-t max-lg:bg-surface max-lg:p-3">
                    <Button
                      variant="outline"
                      disabled={!canRun}
                      aria-busy={busy === "run"}
                      onClick={() => void run({ stdin })}
                    >
                      {busy === "run" ? "Running…" : "Run"}
                    </Button>
                    <Button
                      disabled={!canSubmit}
                      aria-busy={busy === "submit"}
                      onClick={() => void submit()}
                    >
                      {busy === "submit" ? "Judging…" : "Submit"}
                    </Button>
                    {!signedIn && !auth.status.startsWith("load") && (
                      <span className="text-sm text-ink-secondary">
                        <Link
                          to={routes.login}
                          state={{ from: `${location.pathname}${location.search}` }}
                          className="text-redline underline underline-offset-4"
                        >
                          Sign in
                        </Link>{" "}
                        to run or submit code.
                      </span>
                    )}
                    {signedIn && !exercise.gradable && (
                      <span className="text-sm text-ink-muted">
                        Submit is unavailable: no test suite for this question.
                      </span>
                    )}
                    <span className="eyebrow ml-auto hidden lg:inline">Console</span>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                    <div>
                      <label htmlFor="code-stdin" className="eyebrow mb-1 block">
                        Custom input (stdin)
                      </label>
                      <textarea
                        id="code-stdin"
                        rows={3}
                        className={cn(field, "resize-y")}
                        value={stdin}
                        onChange={(e) => setStdin(e.target.value)}
                      />
                    </div>

                    {actionError !== null && (
                      <ErrorState className="mt-3" error={actionError} />
                    )}

                    {runResult && (
                      <Enter
                        key={`${runResult.status}:${runResult.time_ms}:${runResult.stdout?.length ?? 0}:${runResult.sample_passed}`}
                        role="region"
                        aria-label="Run output"
                        aria-live="polite"
                        y={0}
                        duration={DUR.fast}
                        className={cn(
                          "mt-4 border-l-2 pl-4 transition-colors duration-200",
                          runResult.sample_passed === true
                            ? "border-verified"
                            : runResult.sample_passed === false
                              ? "border-redline"
                              : "border-ink-primary"
                        )}
                      >
                        <p className="text-sm font-semibold text-ink-primary">
                          {RUN_LABEL[runResult.status]}
                          <span className="ml-2 font-normal text-ink-muted">
                            {metrics(runResult.time_ms, runResult.memory_kb)}
                          </span>
                        </p>
                        {runResult.sample_passed !== null && (
                          <p className="mt-1 text-sm text-ink-secondary">
                            {runResult.sample_passed
                              ? "Output matches the sample."
                              : "Output does not match the sample."}
                          </p>
                        )}
                        <Output title="Compiler output" text={runResult.compile_output} />
                        <Output title="Standard error" text={runResult.stderr} />
                        <Output title="Output" text={runResult.stdout} />
                        {runResult.status === "completed" &&
                          !runResult.stdout &&
                          !runResult.stderr && (
                            <p className="mt-2 text-sm text-ink-muted">
                              The program finished without printing anything.
                            </p>
                          )}
                        <p className="mt-3 text-xs text-ink-muted">
                          Running code never changes your progress. Only an accepted
                          submission can mark a question solved.
                        </p>
                      </Enter>
                    )}

                    {submission && (
                      <div
                        role="region"
                        aria-label="Submission result"
                        aria-live="polite"
                        className={cn(
                          "relative mt-4 border-l-2 pl-4",
                          submission.verdict === "accepted"
                            ? "border-verified"
                            : "border-redline"
                        )}
                      >
                        <Stamp
                          key={`${submission.id}-${submission.verdict}`}
                          label={VERDICT_LABEL[submission.verdict]}
                          tone={submission.verdict === "accepted" ? "verified" : "redline"}
                          className="absolute right-0 top-0"
                        />
                        <p className="text-base font-semibold text-ink-primary">
                          {VERDICT_LABEL[submission.verdict]}
                        </p>
                        <p className="mt-1 text-sm text-ink-secondary">
                          {submission.passed} of {submission.total} hidden tests passed
                          {submission.failed_test !== null
                            ? ` (first failure: test ${submission.failed_test})`
                            : ""}
                          {metrics(submission.time_ms, submission.memory_kb)
                            ? ` · ${metrics(submission.time_ms, submission.memory_kb)}`
                            : ""}
                        </p>
                        {submission.progress_updated && (
                          <p className="mt-1 text-sm font-medium text-ink-primary">
                            This question is now marked solved in your progress.
                          </p>
                        )}
                        <Output
                          title="Compiler output"
                          text={submission.compile_output ?? ""}
                        />
                        {submission.verdict !== "accepted" && (
                          <p className="mt-2 text-xs text-ink-muted">
                            Hidden test data is never shown.
                          </p>
                        )}
                      </div>
                    )}
                    {/* ---- history: next to the results it relates to ---- */}
                    <section aria-labelledby="history-heading" className="mt-8">
                      <h2
                        id="history-heading"
                        className="eyebrow border-b border-ink-primary pb-2"
                      >
                        Your submissions
                      </h2>
                      {!signedIn && (
                        <p className="pt-3 text-sm text-ink-secondary">
                          Sign in to see your submission history.
                        </p>
                      )}
                      {signedIn && historyError !== null && (
                        <ErrorState
                          className="mt-3"
                          error={historyError}
                          onRetry={() => void loadHistory()}
                        />
                      )}
                      {signedIn && history === null && historyError === null && (
                        <LoadingState className="pt-3" message="Loading history…" />
                      )}
                      {signedIn && history && history.length === 0 && (
                        <p className="pt-3 text-sm text-ink-secondary">
                          No submissions yet for this question.
                        </p>
                      )}
                      {signedIn && history && history.length > 0 && (
                        <ul>
                          {history.map((s) => (
                            <li
                              key={s.id}
                              className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-3 text-sm"
                            >
                              <div>
                                <span
                                  className={cn(
                                    "font-semibold",
                                    s.verdict === "accepted"
                                      ? "text-verified"
                                      : "text-ink-primary"
                                  )}
                                >
                                  {VERDICT_LABEL[s.verdict]}
                                </span>
                                <span className="ml-2 text-ink-secondary">
                                  {s.language} · {s.passed}/{s.total} ·{" "}
                                  {new Date(s.created_at).toLocaleString()}
                                </span>
                              </div>
                              <div className="flex gap-1">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => void viewSubmission(s.id)}
                                >
                                  View code
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => void deleteSubmission(s.id)}
                                >
                                  Delete
                                </Button>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                      {viewing && (
                        <div className="mt-4 border border-line bg-surface p-4">
                          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-ink-primary">
                              {VERDICT_LABEL[viewing.verdict]} · {viewing.language}
                            </p>
                            <div className="flex gap-1">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  if (
                                    languages.list.some((l) => l.id === viewing.language)
                                  )
                                    setLanguageId(viewing.language);
                                  setSource(viewing.source);
                                }}
                              >
                                Load into editor
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setViewing(null)}
                              >
                                Close
                              </Button>
                            </div>
                          </div>
                          <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words border border-line bg-surface-50 p-3 font-mono text-xs">
                            {viewing.source}
                          </pre>
                        </div>
                      )}
                    </section>
                  </div>
                </section>
              }
            />
          }
        />
      )}
    </div>
  );
};

export default CodeWorkspacePage;
