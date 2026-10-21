import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { DbmsQuizResult, DbmsTopicDetail } from "@/types/contract";
import { api } from "@/api/endpoints";
import { useAuth } from "@/auth/context";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { Page, PageHeader, Section } from "@/components/ui/Page";
import { Tag } from "@/components/ui/Tag";
import { routes } from "@/lib/routes";

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
    <Page width="narrow">
      {error !== null && <ErrorState error={error} onRetry={() => setAttempt((a) => a + 1)} />}
      {!topic && error === null && <LoadingState message="Loading topic…" />}
      {topic && (
        <>
          <PageHeader
            eyebrow={topic.group}
            title={topic.name}
            description={topic.summary}
            crumbs={[{ label: "DBMS", to: routes.learnDbms }, { label: topic.name }]}
          />
          <div className="grid grid-cols-[minmax(0,1fr)] gap-10">
            {topic.sections.map((s) => (
              <Section key={s.heading} title={s.heading}>
                <div className="grid gap-3 leading-relaxed text-ink-secondary">
                  {s.body.map((p, i) => (
                    <p key={i}>{p}</p>
                  ))}
                </div>
              </Section>
            ))}
            <Section title="Remember">
              <ul className="list-disc space-y-1 pl-5 text-ink-secondary">
                {topic.key_points.map((k) => (
                  <li key={k}>{k}</li>
                ))}
              </ul>
            </Section>
            {topic.example && (
              <Section title={topic.example.title} description="The output below was produced by running this SQL.">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">Setup</p>
                <pre className="mb-3 overflow-x-auto rounded-md border border-line bg-surface-100 p-3 font-mono text-sm">
                  <code>{topic.example.setup}</code>
                </pre>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">Query</p>
                <pre className="mb-3 overflow-x-auto rounded-md border border-line bg-surface-100 p-3 font-mono text-sm">
                  <code>{topic.example.query}</code>
                </pre>
                <div className="overflow-x-auto">
                  <table className="min-w-full border border-line text-sm">
                    <thead className="bg-surface-100">
                      <tr>
                        {topic.example.columns.map((c) => (
                          <th key={c} scope="col" className="border-b border-line px-3 py-1.5 text-left font-semibold">{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {topic.example.rows.map((r, i) => (
                        <tr key={i} className="border-b border-line last:border-0">
                          {r.map((v, j) => (
                            <td key={j} className="px-3 py-1.5 font-mono">{v === null ? "NULL" : String(v)}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-3 text-sm text-ink-secondary">{topic.example.explanation}</p>
              </Section>
            )}
            <Section title="Interview questions">
              <div className="grid gap-2">
                {topic.interview.map((qa) => (
                  <details key={qa.q} className="rounded-md border border-line bg-surface p-3">
                    <summary className="cursor-pointer font-medium text-ink-primary">{qa.q}</summary>
                    <p className="mt-2 text-sm leading-relaxed text-ink-secondary">{qa.a}</p>
                  </details>
                ))}
              </div>
            </Section>
            <Section title="Quiz" description="Answers are checked on the server and never sent with the questions. 3 of 4 passes.">
              {!signedIn ? (
                <p className="text-sm text-ink-muted">
                  <Link to={routes.login} className="underline underline-offset-4">Sign in</Link> to take the quiz and keep your result.
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
                      <fieldset key={q.id} className="grid gap-2" disabled={result !== null}>
                        <legend className="mb-1 font-medium text-ink-primary">
                          {qi + 1}. {q.question}
                        </legend>
                        {q.options.map((o, oi) => (
                          <label key={oi} className="flex items-start gap-2 text-sm text-ink-secondary">
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
                            <Tag tone={r.correct ? "verified" : "alert"}>{r.correct ? "Correct" : "Not quite"}</Tag> {r.why}
                          </p>
                        )}
                      </fieldset>
                    );
                  })}
                  {quizError !== null && <ErrorState error={quizError} />}
                  {result ? (
                    <div className="flex flex-wrap items-center gap-3" role="status">
                      <Tag tone={result.passed ? "verified" : "alert"}>{result.passed ? "Passed" : "Not passed yet"}</Tag>
                      <span className="text-sm">
                        {result.score} of {result.total} correct (pass mark {result.pass_mark}). Best so far: {result.progress.best_score}/{result.progress.total}.
                      </span>
                      <Button type="button" variant="outline" size="sm" onClick={retake}>
                        Retake
                      </Button>
                    </div>
                  ) : (
                    <div>
                      <Button type="submit" disabled={!complete || submitting}>
                        {submitting ? "Checking…" : "Check my answers"}
                      </Button>
                    </div>
                  )}
                </form>
              )}
            </Section>
            {topic.related.length > 0 && (
              <Section title="Related topics">
                <ul className="flex flex-wrap gap-3 text-sm">
                  {topic.related.map((r) => (
                    <li key={r.id}>
                      <Link to={routes.learnDbmsTopic(r.id)} className="underline underline-offset-4">{r.name}</Link>
                    </li>
                  ))}
                </ul>
              </Section>
            )}
          </div>
        </>
      )}
    </Page>
  );
};

export default LearnDbmsTopicPage;
