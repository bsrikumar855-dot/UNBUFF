import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { BarChart3, Info, Lightbulb } from "lucide-react";
import type { Report } from "@/types/contract";
import { api } from "@/api/endpoints";
import { useSessionState } from "@/state/useSession";
import { ErrorState } from "@/components/ui/ErrorState";
import { GLASS, TILE } from "@/components/ui/GlassCard";
import { Page, PageHeader } from "@/components/ui/Page";
import { LoadingState } from "@/components/ui/LoadingState";
import { SkillStateBadge, VerdictBadge } from "@/components/ui/StatusBadge";
import { buildRoadmap } from "@/lib/buildRoadmap";
import { cn } from "@/lib/cn";

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
    <Page width="fluid" className="sm:px-5 lg:pl-5 lg:pr-6">
      <PageHeader
        eyebrow="Evidence · Preview"
        title={
          <>
            4-week <em>roadmap</em>
          </>
        }
        description={!sessionId ? "Showing the demo report (synthetic data)." : undefined}
        actions={
          !sessionId ? (
            <span className="inline-flex items-center gap-2 rounded-full bg-redline-soft px-4 py-2 text-sm font-medium text-redline shadow-[inset_0_0_0_1px_rgba(179,41,26,0.18)]">
              <Info size={16} aria-hidden="true" />
              Demo data
            </span>
          ) : undefined
        }
      />

      {error !== null && !report && (
        <ErrorState error={error} onRetry={() => setAttempt((a) => a + 1)} />
      )}
      {!report && error === null && <LoadingState message="Building your roadmap…" />}

      {report && (
        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 xl:grid-cols-[minmax(0,1fr)_23rem]">
          <ol className="relative flex flex-col">
            {weeks.map((w) => (
              <li key={w.week} className="relative flex gap-4 pb-8 last:pb-0 sm:gap-5">
                <div className="relative flex w-11 shrink-0 flex-col items-center">
                  <span
                    aria-hidden="true"
                    className="grid size-11 place-items-center rounded-full bg-redline-soft text-sm font-semibold text-redline"
                  >
                    W{w.week}
                  </span>
                  {w.week !== weeks[weeks.length - 1]?.week && (
                    <span aria-hidden="true" className="mt-2 w-px flex-1 bg-redline/30" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="serif text-heading font-medium text-ink-primary">
                    Week {w.week}: {w.title}
                  </h2>
                  {w.items.length === 0 ? (
                    <p className="mt-2 text-sm text-ink-muted">Nothing here. Nice.</p>
                  ) : (
                    <ul className="mt-3 grid gap-2.5">
                      {w.items.map((it, i) => (
                        <li key={i} className={cn(TILE, "p-4 text-sm")}>
                          <div className="mb-1 flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-ink-primary">{it.title}</span>
                            {it.verdict && <VerdictBadge verdict={it.verdict} />}
                            {!it.verdict && it.state && <SkillStateBadge state={it.state} />}
                            {it.comingSoon && (
                              <span className="rounded-full bg-white/80 px-2.5 py-0.5 text-xs font-semibold text-ink-secondary shadow-[inset_0_0_0_1px_rgba(24,24,27,0.1)]">
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
                </div>
              </li>
            ))}
          </ol>

          <aside className={cn(GLASS, "p-5 xl:sticky xl:top-4")} aria-labelledby="glance-title">
            <div className="flex items-start gap-3.5">
              <span
                aria-hidden="true"
                className="grid size-11 shrink-0 place-items-center rounded-full bg-white text-redline shadow-[inset_0_0_0_1px_rgba(24,24,27,0.08)]"
              >
                <BarChart3 size={20} strokeWidth={1.75} />
              </span>
              <div>
                <h2 id="glance-title" className="serif text-heading font-medium text-ink-primary">
                  Roadmap at a glance
                </h2>
                <p className="mt-0.5 text-sm text-ink-secondary">
                  A focused 4-week plan built from this report.
                </p>
              </div>
            </div>
            <ol className="mt-4 flex flex-col gap-1.5">
              {weeks.map((w) => (
                <li key={w.week} className="flex items-center gap-3 rounded-2xl px-2 py-2">
                  <span
                    aria-hidden="true"
                    className="grid size-9 shrink-0 place-items-center rounded-full bg-white/80 text-sm font-semibold text-ink-primary shadow-[inset_0_0_0_1px_rgba(24,24,27,0.08)]"
                  >
                    {w.week}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-ink-primary">
                      {w.title}
                    </span>
                    <span className="block text-xs text-ink-muted">
                      {w.items.length} {w.items.length === 1 ? "item" : "items"}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
            <div className="mt-4 flex items-start gap-3 border-t border-black/5 pt-4">
              <Lightbulb size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-redline" />
              <div>
                <p className="text-sm font-semibold text-ink-primary">How to use this roadmap</p>
                <p className="mt-0.5 text-sm leading-snug text-ink-secondary">
                  Work through each week in order, then run the interrogation again to see
                  whether the weak spots held.
                </p>
              </div>
            </div>
          </aside>
        </div>
      )}
    </Page>
  );
};

export default RoadmapPage;
