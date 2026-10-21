import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  AlertTriangle,
  Code2,
  ExternalLink,
  Eye,
  GitBranch,
  Layers,
  Lightbulb,
  ListChecks,
  MessageCircle,
  SquareCode,
} from "lucide-react";
import type { PatternDetail } from "@/types/contract";
import { api } from "@/api/endpoints";
import { useLearnProgress } from "@/hooks/useLearnProgress";
import { Chip, Pill } from "@/components/learn/LearnBits";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/ErrorState";
import { GlassCard, TILE } from "@/components/ui/GlassCard";
import { LoadingState } from "@/components/ui/LoadingState";
import { Page, PageHeader } from "@/components/ui/Page";
import { buttonClasses } from "@/lib/buttonClasses";
import { cn } from "@/lib/cn";
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
  const pill = "rounded-full bg-white/70";

  return (
    <Page width="fluid" className="sm:px-5 lg:pl-5 lg:pr-6">
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
                <Button asChild variant="outline" size="sm" className={pill}>
                  <Link to={routes.mentorAsk(`Explain the "${pattern.name}" pattern: how do I spot it and when does it fail?`)}>
                    <MessageCircle aria-hidden="true" />
                    Ask the mentor
                  </Link>
                </Button>
                {progress.signedIn && (
                  <Button variant="outline" size="sm" className={pill} onClick={() => void progress.markPattern(pattern.id, { done: !mine?.done })}>
                    {mine?.done ? "Unmark as learned" : "Mark as learned"}
                  </Button>
                )}
              </>
            }
          />
          {progress.error !== null && <ErrorState error={progress.error} />}
          <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 xl:grid-cols-[minmax(0,1fr)_28rem]">
            <div className="flex min-w-0 flex-col gap-5">
              <GlassCard id="spot" icon={Eye} title="Spot it" sub="Phrases in a problem statement that point to this pattern.">
                <ul className="flex flex-wrap gap-2">
                  {pattern.cues.map((c) => (
                    <Chip key={c}>“{c}”</Chip>
                  ))}
                </ul>
              </GlassCard>
              <GlassCard id="idea" icon={Lightbulb} title="The idea">
                <div className="grid gap-3 leading-relaxed text-ink-secondary">
                  {pattern.idea.map((p, i) => (
                    <p key={i}>{p}</p>
                  ))}
                </div>
              </GlassCard>
              <GlassCard id="template" icon={Code2} title="Template (Python)" sub={`Time ${pattern.complexity.time} · space ${pattern.complexity.space}`}>
                <pre className="overflow-x-auto rounded-2xl bg-white/80 p-4 font-mono text-sm leading-relaxed shadow-[inset_0_0_0_1px_rgba(24,24,27,0.06)]">
                  <code>{pattern.template}</code>
                </pre>
              </GlassCard>
              <GlassCard id="mistakes" icon={AlertTriangle} title="Common mistakes">
                <ul className="list-disc space-y-1.5 pl-5 text-ink-secondary">
                  {pattern.pitfalls.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </GlassCard>
              {pattern.variants.length > 0 && (
                <GlassCard id="variants" icon={Layers} title="Variants">
                  <dl className="grid gap-2.5">
                    {pattern.variants.map((v) => (
                      <div key={v.name} className={cn(TILE, "px-4 py-3")}>
                        <dt className="font-medium text-ink-primary">{v.name}</dt>
                        <dd className="text-sm text-ink-secondary">{v.when}</dd>
                      </div>
                    ))}
                  </dl>
                </GlassCard>
              )}
            </div>

            <div className="flex min-w-0 flex-col gap-5">
              <GlassCard id="practice" icon={ListChecks} title="Practice" sub="Open a public problem in a new tab, or solve one of UNBLUFF's own and have it judged.">
                <ul className="grid gap-3">
                  {pattern.problems.map((pr) => {
                    const solved = mine?.problems_done.includes(pr.key) ?? false;
                    return (
                      <li key={pr.key} className={cn(TILE, "p-4")}>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-ink-primary">{pr.title}</span>
                          <Pill>{pr.difficulty}</Pill>
                          {solved && <Pill tone="verified">Marked solved</Pill>}
                        </div>
                        <p className="mt-1.5 text-sm text-ink-secondary">{pr.note}</p>
                        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                          {pr.url && (
                            <a href={pr.url} target="_blank" rel="noreferrer noopener" className={buttonClasses("secondary", "sm", pill)}>
                              LeetCode <ExternalLink size={12} aria-hidden="true" />
                            </a>
                          )}
                          {pr.practice_id && (
                            <Link to={routes.dsaCode(pr.practice_id)} className={buttonClasses("primary", "sm", "rounded-full")}>
                              <SquareCode aria-hidden="true" />
                              Solve in UNBLUFF (judged)
                            </Link>
                          )}
                          {progress.signedIn && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="rounded-full"
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
              </GlassCard>
              {pattern.related.length > 0 && (
                <GlassCard id="related" icon={GitBranch} title="Related patterns">
                  <ul className="flex flex-wrap gap-2 text-sm">
                    {pattern.related.map((r) => (
                      <li key={r.id}>
                        <Link
                          to={routes.learnPattern(r.id)}
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

export default LearnPatternPage;
