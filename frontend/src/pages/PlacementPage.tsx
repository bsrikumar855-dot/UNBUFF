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
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
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
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-bold text-ink-primary">Your placement plan</h1>
      <p className="mt-1 max-w-3xl text-sm text-ink-secondary">
        One plan built from your goals, your available time and what your records really
        show across DSA practice, interviews, the GraphQL Lab and, if you connect it,
        GitHub. It is a study plan, not a prediction: nothing here estimates your chance
        of an offer.
      </p>

      {error !== null && (
        <ErrorState
          className="mt-6"
          error={error}
          onRetry={() => setAttempt((a) => a + 1)}
        />
      )}
      {error === null && (dash === null || profile === null) && (
        <LoadingState className="mt-6" message="Building your plan from your records…" />
      )}

      {dash && profile && (
        <div className="mt-8 flex flex-col gap-10">
          {dash.needs_profile || editing ? (
            <section
              aria-labelledby="goals-h"
              className="rounded-lg border border-line bg-white p-4 sm:p-6"
            >
              <h2 id="goals-h" className="text-lg font-semibold text-ink-primary">
                {dash.needs_profile
                  ? "Start with your goals and availability"
                  : "Edit your goals and availability"}
              </h2>
              <p className="mb-4 mt-1 text-sm text-ink-secondary">
                The plan only schedules work on the days and for the time you choose. You
                can change this at any time; completed tasks are kept.
              </p>
              <ProfileForm
                data={profile}
                saving={saving}
                error={saveError}
                onSave={(p) => void save(p)}
              />
              {editing && (
                <Button
                  className="mt-3"
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditing(false)}
                >
                  Cancel
                </Button>
              )}
            </section>
          ) : (
            <>
              <section
                aria-label="Plan status"
                className="rounded-lg border border-line bg-white p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-ink-primary">
                      {dash.plan ? `Plan version ${dash.plan.generation}` : "No plan yet"}
                      {dash.plan?.days_until_placement !== null &&
                      dash.plan?.days_until_placement !== undefined
                        ? ` · ${dash.plan.days_until_placement} day(s) to your placement date`
                        : ""}
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
                      variant="secondary"
                      size="sm"
                      disabled={busy}
                      onClick={() => void run(() => api.refreshPlacement())}
                    >
                      {busy ? "Working…" : "Refresh from my results"}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={busy}
                      onClick={() => setEditing(true)}
                    >
                      Edit goals
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
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
                      variant="secondary"
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

              <TodaySection d={dash} busy={busy} onAction={onAction} />
              <WeekSection d={dash} busy={busy} onAction={onAction} />
              <AssistantPanel onDashboard={setDash} />
              <SkillsSection d={dash} />
              <ReadinessSection d={dash} />
              <HistorySection d={dash} />
              <LimitationsSection items={dash.limitations} />

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
                      Delete your goals, plan and task history? Your DSA, interview,
                      GraphQL and mentor records are not touched.
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
    </div>
  );
};

export default PlacementPage;
