import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { Report } from "@/types/contract";
import { api } from "@/api/endpoints";
import { useSessionState } from "@/state/useSession";
import { ErrorState } from "@/components/ui/ErrorState";
import { Page, PageHeader } from "@/components/ui/Page";
import { LoadingState } from "@/components/ui/LoadingState";
import { SkillStateBadge, VerdictBadge } from "@/components/ui/StatusBadge";
import { buildRoadmap } from "@/lib/buildRoadmap";

/** /roadmap: 4-week plan from the session's report, or the demo report when there is no session. */
const RoadmapPage: React.FC = () => {
  const [search] = useSearchParams();
  const { state } = useSessionState();
  const sessionId = search.get("session") ?? state.sessionId;
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    (sessionId ? api.getReport(sessionId) : api.getDemoReport())
      .then((r) => !cancelled && setReport(r))
      .catch((err: unknown) => !cancelled && setError(err));
    return () => {
      cancelled = true;
    };
  }, [sessionId, attempt]);

  const weeks = useMemo(() => (report ? buildRoadmap(report) : []), [report]);

  return (
    <Page width="narrow">
      <PageHeader
        eyebrow="Evidence · Preview"
        title="4-week roadmap"
        description={!sessionId ? "Showing the demo report (synthetic data)." : undefined}
      />

      {error !== null && !report && (
        <ErrorState error={error} onRetry={() => setAttempt((a) => a + 1)} />
      )}
      {!report && error === null && <LoadingState message="Building your roadmap…" />}

      {report && (
        <ol className="relative grid gap-10 border-l border-ink-primary pl-8">
          {weeks.map((w) => (
            <li key={w.week} className="relative">
              <span
                className="absolute left-[-37px] top-1.5 size-3 border-2 border-surface-50 bg-ink-primary"
                aria-hidden="true"
              />
              <h2 className="serif mb-3 text-heading font-medium text-ink-primary">
                Week {w.week}: {w.title}
              </h2>
              {w.items.length === 0 ? (
                <p className="text-sm text-ink-muted">Nothing here. Nice.</p>
              ) : (
                <ul className="grid gap-3">
                  {w.items.map((it, i) => (
                    <li
                      key={i}
                      className="rounded-md border border-line bg-surface p-3 text-sm"
                    >
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <span className="font-medium text-ink-primary">{it.title}</span>
                        {it.verdict && <VerdictBadge verdict={it.verdict} />}
                        {!it.verdict && it.state && <SkillStateBadge state={it.state} />}
                        {it.comingSoon && (
                          <span className="rounded-sm bg-surface-100 px-2 py-0.5 text-xs font-semibold text-ink-secondary">
                            Coming soon
                          </span>
                        )}
                      </div>
                      <p className="text-ink-secondary">{it.detail}</p>
                      {it.rootCause && (
                        <p className="mt-1 text-ink-secondary">
                          <span className="font-semibold">Root cause:</span>{" "}
                          {it.rootCause}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}
    </Page>
  );
};

export default RoadmapPage;
