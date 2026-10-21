import React, { useCallback, useEffect, useState } from "react";
import { api } from "@/api/endpoints";
import { AssistantPanel } from "@/components/placement/AssistantPanel";
import { ProfileForm } from "@/components/placement/ProfileForm";
import {
  HistorySection,
  LimitationsSection,
  ReadinessSection,
  SkillsSection,
  TodaySection,
  WeekSection,
} from "@/components/placement/Sections";
import { Button } from "@/components/ui/button";
import { CountUp } from "@/components/motion/CountUp";
import { ScanReveal } from "@/components/motion/ScanReveal";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import {
  CalendarCheck,
  CheckCircle2,
  Lightbulb,
  ListChecks,
  Timer,
  type LucideIcon,
} from "lucide-react";
import { TILE } from "@/components/ui/GlassCard";
import { cn } from "@/lib/cn";
import { Page, PageHeader } from "@/components/ui/Page";
import type {
  PlacementDashboard,
  PlacementProfile,
  PlacementProfileResponse,
  PlacementTask,
  PlacementTaskActionRequest,
} from "@/types/contract";

const STATUS_TEXT = {
  ok: "Fits your time",
  tight: "Fits, with little slack",
  insufficient: "Not enough time for everything",
  no_deadline: "No placement date set",
} as const;

/** The unified placement plan: goals, today, the week, skills, history and readiness, all from stored records. */
const PlacementPage: React.FC = () => {
  const [dash, setDash] = useState<PlacementDashboard | null>(null);
  const [profile, setProfile] = useState<PlacementProfileResponse | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const [saveError, setSaveError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState<"delete" | "regenerate" | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    Promise.all([
      api.getPlacementProfile(),
      api.refreshPlacement().catch(() => api.getPlacementDashboard()),
    ])
      .then(([p, d]) => {
        if (cancelled) return;
        setProfile(p);
        setDash(d);
      })
      .catch((e: unknown) => !cancelled && setError(e));
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const run = useCallback(async (fn: () => Promise<PlacementDashboard>) => {
    setBusy(true);
    setActionError(null);
    try {
      setDash(await fn());
      setConfirming(null);
    } catch (e) {
      setActionError(e);
    } finally {
      setBusy(false);
    }
  }, []);

  const onAction = (task: PlacementTask, body: PlacementTaskActionRequest) =>
    void run(async () => {
      await api.placementTaskAction(task.id, body);
      return api.refreshPlacement();
    });

  const save = async (p: PlacementProfile) => {
    setSaving(true);
    setSaveError(null);
    try {
      setProfile(await api.putPlacementProfile(p));
      setDash(await api.refreshPlacement());
      setEditing(false);
    } catch (e) {
      setSaveError(e);
    } finally {
      setSaving(false);
    }
  };

  const wipe = () =>
    void run(async () => {
      await api.deletePlacementData();
      const [p, d] = await Promise.all([
        api.getPlacementProfile(),
        api.getPlacementDashboard(),
      ]);
      setProfile(p);
      return d;
    });

  const f = dash?.plan?.feasibility;
  return (
    <Page width="fluid" className="sm:px-5 lg:pl-5 lg:pr-6">
      {dash && profile && (dash.needs_profile || editing) ? (
        <PageHeader
          eyebrow={dash.needs_profile ? "Plan · Your baseline" : "Plan · Edit your goals"}
          title={
            dash.needs_profile ? (
              <>
                Build your <em>placement</em> plan.
              </>
            ) : (
              <>
                Edit your <em>goals</em> and availability.
              </>
            )
          }
          description="Tell us about your goals and availability. The plan is built from them and from what your records really show."
          actions={
            <p
              role="note"
              className="flex max-w-sm items-start gap-3 rounded-[1.25rem] bg-white/55 p-4 text-sm text-ink-secondary shadow-[inset_0_0_0_1px_rgba(24,24,27,0.07),inset_0_1px_0_rgba(255,255,255,0.95)]"
            >
              <Lightbulb
                size={18}
                strokeWidth={1.75}
                aria-hidden="true"
                className="mt-0.5 shrink-0 text-redline"
              />
              <span>
                The plan only schedules work on the days and for the time you choose. You
                can change this anytime; completed tasks are kept.
              </span>
            </p>
          }
        />
      ) : (
        <PageHeader
          eyebrow="Plan"
          title="Your placement plan"
          description="One plan built from your goals, your available time and what your records really show across DSA practice, interviews, DBMS quizzes and, if you connect it, GitHub. It is a study plan, not a prediction: nothing here estimates your chance of an offer."
        />
      )}

      {error !== null && (
        <ErrorState
          className="mt-2"
          error={error}
          onRetry={() => setAttempt((a) => a + 1)}
        />
      )}
      {error === null && (dash === null || profile === null) && (
        <LoadingState className="mt-2" message="Building your plan from your records…" />
      )}

      {dash && profile && (
        <div className="flex flex-col gap-5">
          {dash.needs_profile || editing ? (
            <ProfileForm
              data={profile}
              saving={saving}
              error={saveError}
              onSave={(p) => void save(p)}
              onCancel={editing ? () => setEditing(false) : undefined}
            />
          ) : (
            <>
              <section
                aria-label="Plan status"
                className="rounded-[1.75rem] bg-white/55 p-5 shadow-[inset_0_0_0_1px_rgba(24,24,27,0.07),inset_0_1px_0_rgba(255,255,255,0.95),0_16px_32px_-24px_rgba(24,24,27,0.35)] backdrop-blur-sm sm:p-7"
              >
                <ScanReveal className="mb-6">
                  <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {[
                      dash.plan?.days_until_placement !== null &&
                      dash.plan?.days_until_placement !== undefined
                        ? {
                            label: "Days to placement",
                            value: dash.plan.days_until_placement,
                            accent: true,
                            icon: Timer,
                          }
                        : null,
                      {
                        label: "Due today",
                        value: dash.today_tasks.length,
                        accent: false,
                        icon: CalendarCheck,
                      },
                      {
                        label: "Open tasks",
                        value: dash.counts.planned + dash.counts.in_progress,
                        accent: false,
                        icon: ListChecks,
                      },
                      {
                        label: "Completed",
                        value: dash.counts.completed,
                        accent: false,
                        icon: CheckCircle2,
                      },
                    ]
                      .filter(
                        (
                          s
                        ): s is {
                          label: string;
                          value: number;
                          accent: boolean;
                          icon: LucideIcon;
                        } => s !== null
                      )
                      .map((s) => (
                        <div
                          key={s.label}
                          className={cn(TILE, "flex min-w-0 items-center gap-3 p-4")}
                        >
                          <span
                            aria-hidden="true"
                            className="grid size-11 shrink-0 place-items-center rounded-full bg-white text-redline shadow-[inset_0_0_0_1px_rgba(24,24,27,0.08),0_6px_14px_-8px_rgba(24,24,27,0.35)]"
                          >
                            <s.icon size={19} strokeWidth={1.75} />
                          </span>
                          <div className="min-w-0">
                            <dt className="eyebrow">{s.label}</dt>
                            <dd
                              className={`serif num mt-0.5 text-display font-medium leading-none ${
                                s.accent ? "text-redline" : "text-ink-primary"
                              }`}
                            >
                              <CountUp value={s.value} />
                            </dd>
                          </div>
                        </div>
                      ))}
                  </dl>
                </ScanReveal>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-ink-primary">
                      {dash.plan ? `Plan version ${dash.plan.generation}` : "No plan yet"}
                      {dash.plan?.days_until_placement !== null &&
                      dash.plan?.days_until_placement !== undefined ? (
                        <>
                          {" · "}
                          <CountUp
                            value={dash.plan.days_until_placement}
                            className="num"
                          />
                          {" day(s) to your placement date"}
                        </>
                      ) : null}
                    </p>
                    {f && (
                      <p className="mt-1 text-sm text-ink-secondary">
                        <span className="font-medium text-ink-primary">
                          {STATUS_TEXT[f.status]}.
                        </span>{" "}
                        {f.message}
                        {f.reduced
                          ? " This is a reduced plan with the highest-priority work."
                          : ""}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-full"
                      disabled={busy}
                      onClick={() => void run(() => api.refreshPlacement())}
                    >
                      {busy ? "Working…" : "Refresh from my results"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-full"
                      disabled={busy}
                      onClick={() => setEditing(true)}
                    >
                      Edit goals
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="rounded-full"
                      disabled={busy}
                      onClick={() => setConfirming("regenerate")}
                    >
                      Regenerate future tasks…
                    </Button>
                  </div>
                </div>
                {confirming === "regenerate" && (
                  <div
                    role="group"
                    aria-label="Confirm regenerate"
                    className="mt-3 flex flex-wrap items-center gap-2 text-sm"
                  >
                    <span className="text-ink-secondary">
                      Replace recommendations for the future? Completed, started and
                      rescheduled tasks are kept.
                    </span>
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() => void run(() => api.generatePlacementPlan({}))}
                    >
                      Regenerate
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        void run(() => api.generatePlacementPlan({ mode: "reduced" }))
                      }
                    >
                      Make a reduced plan
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>
                      Cancel
                    </Button>
                  </div>
                )}
                {actionError !== null && (
                  <ErrorState className="mt-3" error={actionError} />
                )}
              </section>

              <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_27rem]">
                <div className="flex min-w-0 flex-col gap-5">
                  <TodaySection d={dash} busy={busy} onAction={onAction} />
                  <WeekSection d={dash} busy={busy} onAction={onAction} />
                </div>
                <div className="flex min-w-0 flex-col gap-5 xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:self-start xl:overflow-y-auto xl:pr-1">
                  <AssistantPanel onDashboard={setDash} />
                  <LimitationsSection items={dash.limitations} />
                </div>
              </div>
              <SkillsSection d={dash} />
              <ReadinessSection d={dash} />
              <HistorySection d={dash} />

              <section className="border-t border-line pt-4">
                {confirming !== "delete" ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirming("delete")}
                  >
                    Delete my goals, plan and tasks
                  </Button>
                ) : (
                  <div
                    role="group"
                    aria-label="Confirm deletion"
                    className="flex flex-wrap items-center gap-2 text-sm"
                  >
                    <span className="text-ink-secondary">
                      Delete your goals, plan and task history? Your DSA, interview, DBMS
                      quiz and mentor records are not touched.
                    </span>
                    <Button size="sm" disabled={busy} onClick={wipe}>
                      Yes, delete them
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setConfirming(null)}>
                      Keep them
                    </Button>
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      )}
    </Page>
  );
};

export default PlacementPage;
