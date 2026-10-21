import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, FileText } from "lucide-react";
import type { PatternLevel, PatternsResponse } from "@/types/contract";
import { api } from "@/api/endpoints";
import { useLearnProgress } from "@/hooks/useLearnProgress";
import { LearnCard, LearnProgress, Pill } from "@/components/learn/LearnBits";
import { patternIcon } from "@/components/learn/learnIcons";
import { ErrorState } from "@/components/ui/ErrorState";
import { TILE } from "@/components/ui/GlassCard";
import { LoadingState } from "@/components/ui/LoadingState";
import { Page, PageHeader } from "@/components/ui/Page";
import { cn } from "@/lib/cn";
import { routes } from "@/lib/routes";

const LEVEL: Record<PatternLevel, string> = {
  core: "Core",
  intermediate: "Intermediate",
  advanced: "Advanced",
};
const LEVEL_TONE = { core: "core", intermediate: "plain", advanced: "ink" } as const;

/** /learn/patterns: the DSA patterns grouped by family, each with the cues that point to it. */
const LearnPatternsPage: React.FC = () => {
  const [data, setData] = useState<PatternsResponse | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  const progress = useLearnProgress();

  useEffect(() => {
    let cancelled = false;
    setError(null);
    api
      .getLearnPatterns()
      .then((r) => !cancelled && setData(r))
      .catch((e: unknown) => !cancelled && setError(e));
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const done = progress.data?.progress.patterns ?? {};

  return (
    <Page width="fluid" className="sm:px-5 lg:pl-5 lg:pr-6">
      <PageHeader
        eyebrow="Learn"
        title={
          <>
            DSA <em>patterns</em>
          </>
        }
        description="Learn to recognise the pattern from the wording of a problem, then reuse its template. Each pattern has the cues to look for, a tested Python template, the usual mistakes and practice problems."
      />
      {error !== null && !data && (
        <ErrorState error={error} onRetry={() => setAttempt((a) => a + 1)} />
      )}
      {!data && error === null && <LoadingState message="Loading patterns…" />}
      {data && (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-8">
          {progress.signedIn && progress.data && (
            <LearnProgress
              value={progress.data.patterns_done}
              max={progress.data.patterns_total}
              label="Patterns you marked as learned"
            />
          )}
          {!progress.signedIn && (
            <p className={cn(TILE, "px-4 py-3 text-sm text-ink-secondary")}>
              <Link to={routes.login} className="text-redline underline underline-offset-4">
                Sign in
              </Link>{" "}
              to mark patterns and problems as done. These marks are self-reported.
            </p>
          )}
          {data.topics.map((topic) => {
            const items = data.patterns.filter((p) => p.topic === topic);
            if (items.length === 0) return null;
            const id = `topic-${topic.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
            return (
              <section key={topic} aria-labelledby={`${id}-title`} id={id}>
                <h2
                  id={`${id}-title`}
                  className="serif mb-4 text-title font-medium text-ink-primary"
                >
                  {topic}
                </h2>
                <ul className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-2">
                  {items.map((p) => (
                    <LearnCard
                      key={p.id}
                      icon={patternIcon(p.id, p.name)}
                      title={p.name}
                      to={routes.learnPattern(p.id)}
                      badge={<Pill tone={LEVEL_TONE[p.level]}>{LEVEL[p.level]}</Pill>}
                      status={done[p.id]?.done ? <Pill tone="verified">Marked learned</Pill> : null}
                      summary={p.summary}
                      chips={p.cues.slice(0, 4).map((c) => `“${c}”`)}
                      chipsLabel="Cues"
                      meta={
                        <>
                          <span className="inline-flex items-center gap-1.5">
                            <FileText size={14} aria-hidden="true" />
                            {p.problem_count} problems
                          </span>
                          {progress.data && (
                            <span className="inline-flex items-center gap-1.5">
                              <CheckCircle2 size={14} aria-hidden="true" className="text-redline" />
                              {done[p.id]?.problems_done.length ?? 0} marked solved
                            </span>
                          )}
                        </>
                      }
                    />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </Page>
  );
};

export default LearnPatternsPage;
