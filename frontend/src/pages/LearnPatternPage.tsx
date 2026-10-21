import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import type { PatternDetail } from "@/types/contract";
import { api } from "@/api/endpoints";
import { useLearnProgress } from "@/hooks/useLearnProgress";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { Page, PageHeader, Section } from "@/components/ui/Page";
import { Tag } from "@/components/ui/Tag";
import { routes } from "@/lib/routes";

/** /learn/patterns/:patternId: one pattern, from the cue to the template to practice. */
const LearnPatternPage: React.FC = () => {
  const { patternId = "" } = useParams();
  const [pattern, setPattern] = useState<PatternDetail | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  const progress = useLearnProgress();

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setPattern(null);
    api.getLearnPattern(patternId).then((r) => !cancelled && setPattern(r)).catch((e: unknown) => !cancelled && setError(e));
    return () => {
      cancelled = true;
    };
  }, [patternId, attempt]);

  const mine = progress.data?.progress.patterns[patternId];

  return (
    <Page width="narrow">
      {error !== null && <ErrorState error={error} onRetry={() => setAttempt((a) => a + 1)} />}
      {!pattern && error === null && <LoadingState message="Loading pattern…" />}
      {pattern && (
        <>
          <PageHeader
            eyebrow={pattern.topic}
            title={pattern.name}
            description={pattern.summary}
            crumbs={[{ label: "DSA patterns", to: routes.learnPatterns }, { label: pattern.name }]}
            actions={
              <>
                <Button asChild variant="outline" size="sm">
                  <Link to={routes.mentorAsk(`Explain the "${pattern.name}" pattern: how do I spot it and when does it fail?`)}>Ask the mentor</Link>
                </Button>
                {progress.signedIn && (
                  <Button variant="outline" size="sm" onClick={() => void progress.markPattern(pattern.id, { done: !mine?.done })}>
                    {mine?.done ? "Unmark as learned" : "Mark as learned"}
                  </Button>
                )}
              </>
            }
          />
          {progress.error !== null && <ErrorState error={progress.error} />}
          <div className="grid grid-cols-[minmax(0,1fr)] gap-10">
            <Section title="Spot it" description="Phrases in a problem statement that point to this pattern.">
              <ul className="flex flex-wrap gap-2">
                {pattern.cues.map((c) => (
                  <li key={c} className="rounded-sm bg-surface-100 px-2 py-1 text-sm text-ink-secondary">“{c}”</li>
                ))}
              </ul>
            </Section>
            <Section title="The idea">
              <div className="grid gap-3 leading-relaxed text-ink-secondary">
                {pattern.idea.map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
            </Section>
            <Section title="Template (Python)" description={`Time ${pattern.complexity.time} · space ${pattern.complexity.space}`}>
              <pre className="overflow-x-auto rounded-md border border-line bg-surface-100 p-4 font-mono text-sm leading-relaxed">
                <code>{pattern.template}</code>
              </pre>
            </Section>
            <Section title="Common mistakes">
              <ul className="list-disc space-y-1 pl-5 text-ink-secondary">
                {pattern.pitfalls.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </Section>
            {pattern.variants.length > 0 && (
              <Section title="Variants">
                <dl className="grid gap-2">
                  {pattern.variants.map((v) => (
                    <div key={v.name}>
                      <dt className="font-medium text-ink-primary">{v.name}</dt>
                      <dd className="text-sm text-ink-secondary">{v.when}</dd>
                    </div>
                  ))}
                </dl>
              </Section>
            )}
            <Section title="Practice" description="Open a public problem in a new tab, or solve one of UNBLUFF's own and have it judged.">
              <ul className="grid gap-3">
                {pattern.problems.map((pr) => {
                  const solved = mine?.problems_done.includes(pr.key) ?? false;
                  return (
                    <li key={pr.key} className="rounded-md border border-line bg-surface p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-ink-primary">{pr.title}</span>
                        <Tag>{pr.difficulty}</Tag>
                        {solved && <Tag tone="self">Marked solved</Tag>}
                      </div>
                      <p className="mt-1 text-sm text-ink-secondary">{pr.note}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                        {pr.url && (
                          <a href={pr.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 underline underline-offset-4">
                            LeetCode <ExternalLink size={12} aria-hidden="true" />
                          </a>
                        )}
                        {pr.practice_id && (
                          <Link to={routes.dsaCode(pr.practice_id)} className="underline underline-offset-4">
                            Solve in UNBLUFF (judged)
                          </Link>
                        )}
                        {progress.signedIn && (
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-pressed={solved}
                            onClick={() => void progress.markPattern(pattern.id, { problems: [{ key: pr.key, done: !solved }] })}
                          >
                            {solved ? "Unmark solved" : "Mark solved"}
                          </Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
              {!progress.signedIn && (
                <p className="mt-3 text-sm text-ink-muted">Sign in to mark problems. Marks are self-reported; only judged UNBLUFF submissions count as verified.</p>
              )}
            </Section>
            {pattern.related.length > 0 && (
              <Section title="Related patterns">
                <ul className="flex flex-wrap gap-3 text-sm">
                  {pattern.related.map((r) => (
                    <li key={r.id}>
                      <Link to={routes.learnPattern(r.id)} className="underline underline-offset-4">{r.name}</Link>
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

export default LearnPatternPage;
