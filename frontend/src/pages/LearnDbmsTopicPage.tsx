import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { BookOpen, CheckSquare, GitBranch, HelpCircle, MessageCircle, MessagesSquare, Pin, Terminal } from "lucide-react";
import type { DbmsQuizResult, DbmsTopicDetail } from "@/types/contract";
import { api } from "@/api/endpoints";
import { useAuth } from "@/auth/context";
import { Pill } from "@/components/learn/LearnBits";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/ErrorState";
import { GlassCard, TILE } from "@/components/ui/GlassCard";
import { LoadingState } from "@/components/ui/LoadingState";
import { Page, PageHeader } from "@/components/ui/Page";
import { cn } from "@/lib/cn";
import { routes } from "@/lib/routes";

const CODE = "overflow-x-auto rounded-2xl bg-white/80 p-3.5 font-mono text-sm shadow-[inset_0_0_0_1px_rgba(24,24,27,0.06)]";

/** /learn/dbms/:topicId: notes, a checked SQL example, interview answers and a server-graded quiz. */
const LearnDbmsTopicPage: React.FC = () => {
  const { topicId = "" } = useParams();
  const { status } = useAuth();
  const signedIn = status === "signedIn";
  const [topic, setTopic] = useState<DbmsTopicDetail | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  const [answers, setAnswers] = useState<(number | null)[]>([]);
  const [result, setResult] = useState<DbmsQuizResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [quizError, setQuizError] = useState<unknown>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setTopic(null);
    setResult(null);
    api
      .getDbmsTopic(topicId)
      .then((r) => {
        if (cancelled) return;
        setTopic(r);
        setAnswers(r.quiz.map(() => null));
      })
      .catch((e: unknown) => !cancelled && setError(e));
    return () => {
      cancelled = true;
    };
  }, [topicId, attempt]);

  const complete = answers.length > 0 && answers.every((a) => a !== null);

  const submit = async () => {
    if (!topic || !complete) return;
    setSubmitting(true);
    setQuizError(null);
    try {
      setResult(await api.submitDbmsQuiz(topic.id, { answers: answers as number[] }));
    } catch (e) {
      setQuizError(e);
    } finally {
      setSubmitting(false);
    }
  };

  const retake = () => {
    setResult(null);
    setAnswers((a) => a.map(() => null));
  };

  return (
    <Page width="fluid" className="sm:px-5 lg:pl-5 lg:pr-6">
      {error !== null && <ErrorState error={error} onRetry={() => setAttempt((a) => a + 1)} />}
      {!topic && error === null && <LoadingState message="Loading topic…" />}
      {topic && (
        <>
          <PageHeader
            eyebrow={topic.group}
            title={topic.name}
            description={topic.summary}
            crumbs={[{ label: "DBMS", to: routes.learnDbms }, { label: topic.name }]}
            actions={
              <Button asChild variant="outline" size="sm" className="rounded-full bg-white/70">
                <Link to={routes.mentorAsk(`Explain ${topic.name} like an interview answer, then quiz me with one question.`)}>
                  <MessageCircle aria-hidden="true" />
                  Ask the mentor
                </Link>
              </Button>
            }
          />
          <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 xl:grid-cols-[minmax(0,1fr)_30rem]">
            <div className="flex min-w-0 flex-col gap-5">
              {topic.sections.map((s) => (
                <GlassCard key={s.heading} id={`sec-${s.heading.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`} icon={BookOpen} title={s.heading}>
                  <div className="grid gap-3 leading-relaxed text-ink-secondary">
                    {s.body.map((p, i) => (
                      <p key={i}>{p}</p>
                    ))}
                  </div>
                </GlassCard>
              ))}
              {topic.example && (
                <GlassCard id="example" icon={Terminal} title={topic.example.title} sub="The output below was produced by running this SQL.">
                  <p className="eyebrow mb-1.5">Setup</p>
                  <pre className={cn(CODE, "mb-4")}>
                    <code>{topic.example.setup}</code>
                  </pre>
                  <p className="eyebrow mb-1.5">Query</p>
                  <pre className={cn(CODE, "mb-4")}>
                    <code>{topic.example.query}</code>
                  </pre>
                  <div className="overflow-x-auto rounded-2xl bg-white/80 shadow-[inset_0_0_0_1px_rgba(24,24,27,0.06)]">
                    <table className="min-w-full text-sm">
                      <thead className="bg-white/60">
                        <tr>
                          {topic.example.columns.map((c) => (
                            <th key={c} scope="col" className="border-b border-line px-3.5 py-2 text-left font-semibold">{c}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {topic.example.rows.map((r, i) => (
                          <tr key={i} className="border-b border-line last:border-0">
                            {r.map((v, j) => (
                              <td key={j} className="px-3.5 py-2 font-mono">{v === null ? "NULL" : String(v)}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-4 text-sm text-ink-secondary">{topic.example.explanation}</p>
                </GlassCard>
              )}
              <GlassCard id="interview" icon={MessagesSquare} title="Interview questions">
                <div className="grid gap-2.5">
                  {topic.interview.map((qa) => (
                    <details key={qa.q} className={cn(TILE, "px-4 py-3")}>
                      <summary className="cursor-pointer font-medium text-ink-primary">{qa.q}</summary>
                      <p className="mt-2 text-sm leading-relaxed text-ink-secondary">{qa.a}</p>
                    </details>
                  ))}
                </div>
              </GlassCard>
            </div>

            <div className="flex min-w-0 flex-col gap-5">
              <GlassCard id="remember" icon={Pin} title="Remember">
                <ul className="list-disc space-y-1.5 pl-5 text-ink-secondary">
                  {topic.key_points.map((k) => (
                    <li key={k}>{k}</li>
                  ))}
                </ul>
              </GlassCard>
              <GlassCard id="quiz" icon={HelpCircle} title="Quiz" sub="Answers are checked on the server and never sent with the questions. 3 of 4 passes.">
                {!signedIn ? (
                  <p className="text-sm text-ink-muted">
                    <Link to={routes.login} className="text-redline underline underline-offset-4">Sign in</Link> to take the quiz and keep your result.
                  </p>
                ) : (
                  <form
                    className="grid gap-5"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void submit();
                    }}
                  >
                    {topic.quiz.map((q, qi) => {
                      const r = result?.results.find((x) => x.question_id === q.id);
                      return (
                        <fieldset key={q.id} className={cn(TILE, "grid gap-2 p-4")} disabled={result !== null}>
                          <legend className="float-left mb-2 w-full font-medium text-ink-primary">
                            {qi + 1}. {q.question}
                          </legend>
                          {q.options.map((o, oi) => (
                            <label key={oi} className="flex items-start gap-2.5 rounded-xl px-2 py-1.5 text-sm text-ink-secondary hover:bg-white/70">
                              <input
                                type="radio"
                                name={q.id}
                                checked={answers[qi] === oi}
                                onChange={() => setAnswers((a) => a.map((v, i) => (i === qi ? oi : v)))}
                                className="mt-1"
                              />
                              <span>
                                {o}
                                {r && r.answer === oi && <span className="ml-2 font-semibold text-verified">(correct answer)</span>}
                              </span>
                            </label>
                          ))}
                          {r && (
                            <p className="text-sm text-ink-secondary">
                              <Pill tone={r.correct ? "verified" : "alert"}>{r.correct ? "Correct" : "Not quite"}</Pill> {r.why}
                            </p>
                          )}
                        </fieldset>
                      );
                    })}
                    {quizError !== null && <ErrorState error={quizError} />}
                    {result ? (
                      <div className="flex flex-wrap items-center gap-3" role="status">
                        <Pill tone={result.passed ? "verified" : "alert"}>{result.passed ? "Passed" : "Not passed yet"}</Pill>
                        <span className="text-sm">
                          {result.score} of {result.total} correct (pass mark {result.pass_mark}). Best so far: {result.progress.best_score}/{result.progress.total}.
                        </span>
                        <Button type="button" variant="outline" size="sm" className="rounded-full bg-white/70" onClick={retake}>
                          Retake
                        </Button>
                      </div>
                    ) : (
                      <div>
                        <Button type="submit" className="rounded-full" disabled={!complete || submitting}>
                          <CheckSquare aria-hidden="true" />
                          {submitting ? "Checking…" : "Check my answers"}
                        </Button>
                      </div>
                    )}
                  </form>
                )}
              </GlassCard>
              {topic.related.length > 0 && (
                <GlassCard id="related" icon={GitBranch} title="Related topics">
                  <ul className="flex flex-wrap gap-2 text-sm">
                    {topic.related.map((r) => (
                      <li key={r.id}>
                        <Link
                          to={routes.learnDbmsTopic(r.id)}
                          className={cn(TILE, "inline-flex rounded-full px-3.5 py-1.5 font-medium text-ink-primary transition-colors hover:bg-white hover:text-redline")}
                        >
                          {r.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </GlassCard>
              )}
            </div>
          </div>
        </>
      )}
    </Page>
  );
};

export default LearnDbmsTopicPage;
