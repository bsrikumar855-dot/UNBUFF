import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { PatternLevel, PatternsResponse } from "@/types/contract";
import { api } from "@/api/endpoints";
import { useLearnProgress } from "@/hooks/useLearnProgress";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { Page, PageHeader, Section } from "@/components/ui/Page";
import { Tag } from "@/components/ui/Tag";
import { Meter } from "@/components/ui/Meter";
import SpotlightCard from "@/components/reactbits/SpotlightCard";
import { routes } from "@/lib/routes";

const LEVEL: Record<PatternLevel, string> = {
  core: "Core",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

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
    <Page>
      <PageHeader
        eyebrow="Learn"
        title="DSA patterns"
        description="Learn to recognise the pattern from the wording of a problem, then reuse its template. Each pattern has the cues to look for, a tested Python template, the usual mistakes and practice problems."
      />
      {error !== null && !data && (
        <ErrorState error={error} onRetry={() => setAttempt((a) => a + 1)} />
      )}
      {!data && error === null && <LoadingState message="Loading patterns…" />}
      {data && (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-10">
          {progress.signedIn && progress.data && (
            <Meter
              value={progress.data.patterns_done}
              max={progress.data.patterns_total}
              label="Patterns you marked as learned"
            />
          )}
          {!progress.signedIn && (
            <p className="text-sm text-ink-muted">
              <Link to={routes.login} className="underline underline-offset-4">
                Sign in
              </Link>{" "}
              to mark patterns and problems as done. These marks are self-reported.
            </p>
          )}
          {data.topics.map((topic) => {
            const items = data.patterns.filter((p) => p.topic === topic);
            if (items.length === 0) return null;
            return (
              <Section
                key={topic}
                title={topic}
                id={`topic-${topic.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
              >
                <ul className="grid gap-3 sm:grid-cols-2">
                  {items.map((p) => (
                    <li key={p.id}>
                      <SpotlightCard
                        theme="light"
                        spotlightColor="#b3291a"
                        className="h-full rounded-2xl! p-4!"
                      >
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <Link
                            to={routes.learnPattern(p.id)}
                            className="font-semibold text-ink-primary underline-offset-4 hover:underline"
                          >
                            {p.name}
                          </Link>
                          <Tag>{LEVEL[p.level]}</Tag>
                          {done[p.id]?.done && <Tag tone="self">Marked learned</Tag>}
                        </div>
                        <p className="text-sm text-ink-secondary">{p.summary}</p>
                        <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Cues">
                          {p.cues.slice(0, 3).map((c) => (
                            <li
                              key={c}
                              className="rounded-sm bg-surface-100 px-2 py-0.5 text-xs text-ink-secondary"
                            >
                              “{c}”
                            </li>
                          ))}
                        </ul>
                        <p className="mt-2 text-xs text-ink-muted">
                          {p.problem_count} problems
                          {progress.data &&
                            ` · ${done[p.id]?.problems_done.length ?? 0} marked solved`}
                        </p>
                      </SpotlightCard>
                    </li>
                  ))}
                </ul>
              </Section>
            );
          })}
        </div>
      )}
    </Page>
  );
};

export default LearnPatternsPage;
