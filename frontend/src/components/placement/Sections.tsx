import React from "react";
import { cn } from "@/lib/cn";
import {
  CONFIDENCE_LABEL,
  PROVENANCE_LABEL,
  RECENCY_LABEL,
  SKILL_STATUS_LABEL,
  minutesLabel,
  percent,
} from "@/lib/placement";
import type {
  EvidenceLimitation,
  PlacementDashboard,
  PlacementTask,
  PlacementTaskActionRequest,
  SkillAssessment,
} from "@/types/contract";
import { TaskCard } from "./TaskCard";

type Act = (task: PlacementTask, body: PlacementTaskActionRequest) => void;

export const TodaySection: React.FC<{
  d: PlacementDashboard;
  busy: boolean;
  onAction: Act;
}> = ({ d, busy, onAction }) => (
  <section aria-labelledby="today-h">
    <h2 id="today-h" className="text-lg font-semibold text-ink-primary">
      Today's plan
    </h2>
    <p className="mt-1 text-sm text-ink-secondary">
      {d.today_tasks.length} task(s), {minutesLabel(d.today_minutes)} planned of{" "}
      {minutesLabel(d.today_capacity_minutes)} available today ({d.today}).
      {d.today_capacity_minutes === 0 ? " Today is not one of your study days." : ""}
    </p>
    {d.today_capacity_minutes > 0 && (
      <div className="mt-2 h-2 overflow-hidden rounded bg-surface-100" aria-hidden="true">
        <div
          className="h-full bg-primary"
          style={{
            width: `${Math.min(100, (d.today_minutes / d.today_capacity_minutes) * 100)}%`,
          }}
        />
      </div>
    )}
    {d.today_tasks.length === 0 ? (
      <p className="mt-3 rounded-md border border-dashed border-line-strong p-4 text-sm text-ink-secondary">
        Nothing is due today. Check the weekly roadmap, or refresh the plan after new
        results.
      </p>
    ) : (
      <ul className="mt-3 flex flex-col gap-3">
        {d.today_tasks.map((t) => (
          <TaskCard key={t.id} task={t} today={d.today} busy={busy} onAction={onAction} />
        ))}
      </ul>
    )}
  </section>
);

export const WeekSection: React.FC<{
  d: PlacementDashboard;
  busy: boolean;
  onAction: Act;
}> = ({ d, busy, onAction }) => {
  // High-priority tasks already shown under "Today's plan" are not repeated here.
  const later = d.outstanding_priorities.filter(
    (t) => !d.today_tasks.some((x) => x.id === t.id)
  );
  return (
    <section aria-labelledby="week-h">
      <h2 id="week-h" className="text-lg font-semibold text-ink-primary">
        Weekly roadmap
      </h2>
      <p className="mt-1 text-sm text-ink-secondary">
        {d.counts.planned + d.counts.in_progress} open, {d.counts.completed} completed,{" "}
        {d.counts.skipped} skipped. Outstanding high-priority tasks:{" "}
        {d.outstanding_priorities.length}.
      </p>
      <ol className="mt-3 grid gap-3 md:grid-cols-2" aria-label="Next seven days">
        {d.week.map((day) => (
          <li
            key={day.date}
            className={cn(
              "rounded-lg border p-3",
              day.available
                ? "border-line bg-white"
                : "border-dashed border-line-strong bg-surface-50"
            )}
          >
            <p className="text-sm font-semibold text-ink-primary">
              {day.weekday} {day.date}
            </p>
            <p className="text-xs text-ink-muted">
              {day.available
                ? `${minutesLabel(day.planned_minutes)} planned, ${minutesLabel(day.completed_minutes)} done, of ${minutesLabel(day.capacity_minutes)}`
                : "Not a study day"}
            </p>
            {day.tasks.length > 0 && (
              <ul className="mt-2 flex flex-col gap-1 text-sm">
                {day.tasks.map((t) => (
                  <li key={t.id} className="text-ink-secondary">
                    <span className={t.status === "completed" ? "line-through" : ""}>
                      {t.title}
                    </span>{" "}
                    <span className="text-xs text-ink-muted">
                      ({t.estimated_minutes} min{t.status === "completed" ? ", done" : ""}
                      )
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
      {later.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-medium text-ink-primary">
            Later high-priority tasks and rescheduling ({later.length})
          </summary>
          <ul className="mt-2 flex flex-col gap-3">
            {later.map((t) => (
              <TaskCard
                key={t.id}
                task={t}
                today={d.today}
                busy={busy}
                onAction={onAction}
              />
            ))}
          </ul>
        </details>
      )}
    </section>
  );
};

const EvidenceLine: React.FC<{ s: SkillAssessment }> = ({ s }) => (
  <p className="text-xs text-ink-muted">
    {PROVENANCE_LABEL[s.evidence.provenance]} · {s.evidence.count} {s.evidence.unit} ·{" "}
    {CONFIDENCE_LABEL[s.confidence]} · last evidence{" "}
    {s.evidence.last_at ? s.evidence.last_at.slice(0, 10) : "none"} (
    {RECENCY_LABEL[s.evidence.recency]})
  </p>
);

export const SkillsSection: React.FC<{ d: PlacementDashboard }> = ({ d }) => {
  const groups: { title: string; items: SkillAssessment[] }[] = [
    {
      title: "Data structures and algorithms",
      items: d.skills.skills.filter((s) => s.category === "dsa"),
    },
    {
      title: "Technical interviews",
      items: d.skills.skills.filter((s) => s.category === "interview"),
    },
    { title: "GraphQL", items: d.skills.skills.filter((s) => s.category === "graphql") },
    {
      title: "Projects (context only)",
      items: d.skills.skills.filter((s) => s.category === "project"),
    },
  ].filter((g) => g.items.length > 0);
  return (
    <section aria-labelledby="skills-h">
      <h2 id="skills-h" className="text-lg font-semibold text-ink-primary">
        Skills overview
      </h2>
      <p className="mt-1 text-sm text-ink-secondary">
        {d.skills.coverage.sufficient_evidence} of {d.skills.coverage.in_scope} skill
        areas have enough evidence for a confident reading (
        {d.skills.coverage.provisional} provisional, {d.skills.coverage.unassessed} not
        assessed). {d.skills.coverage.definition}
      </p>
      {groups.map((g) => (
        <div key={g.title} className="mt-4">
          <h3 className="text-sm font-semibold text-ink-primary">{g.title}</h3>
          <ul className="mt-2 flex flex-col gap-2">
            {g.items.map((s) => (
              <li
                key={s.area}
                className="rounded-md border border-line bg-white p-3 text-sm"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium text-ink-primary">{s.label}</span>
                  <span className="text-ink-secondary">
                    {SKILL_STATUS_LABEL[s.status]}
                    {s.estimate !== null ? `: ${percent(s.estimate)}` : ""}
                  </span>
                </div>
                <EvidenceLine s={s} />
                {s.note && <p className="mt-1 text-xs text-ink-muted">{s.note}</p>}
                {s.self_reported && (
                  <p className="mt-1 text-xs text-ink-muted">
                    {s.self_reported} (self-reported, not part of the reading)
                  </p>
                )}
                {s.gaps.length > 0 && (
                  <p className="mt-1 text-xs text-ink-secondary">
                    Gaps: {s.gaps.join("; ")}
                  </p>
                )}
                {s.next_assessment && (
                  <p className="mt-1 text-xs text-ink-secondary">
                    Next: {s.next_assessment.description}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
      <details className="mt-3 text-xs text-ink-muted">
        <summary className="cursor-pointer">How these readings are calculated</summary>
        <ul className="mt-1 list-disc pl-5">
          {d.skills.method.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      </details>
    </section>
  );
};

export const HistorySection: React.FC<{ d: PlacementDashboard }> = ({ d }) => {
  const h = d.history;
  return (
    <section aria-labelledby="history-h">
      <h2 id="history-h" className="text-lg font-semibold text-ink-primary">
        Progress history
      </h2>
      <div className="mt-3 grid gap-4 md:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold text-ink-primary">Completed tasks</h3>
          {h.recent_completed.length === 0 ? (
            <p className="mt-1 text-sm text-ink-secondary">Nothing completed yet.</p>
          ) : (
            <ul className="mt-1 flex flex-col gap-1 text-sm text-ink-secondary">
              {h.recent_completed.map((t) => (
                <li key={t.id}>
                  {t.title}{" "}
                  <span className="text-xs text-ink-muted">
                    ({t.completed_at?.slice(0, 10)},{" "}
                    {t.completed_by === "verified_event"
                      ? "proved by your records"
                      : "marked by you"}
                    )
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3 className="text-sm font-semibold text-ink-primary">
            Validated improvements
          </h3>
          {h.improvements.length === 0 ? (
            <p className="mt-1 text-sm text-ink-secondary">
              None recorded yet. These appear only when your own verified results show a
              change.
            </p>
          ) : (
            <ul className="mt-1 flex flex-col gap-1 text-sm text-ink-secondary">
              {h.improvements.map((i, idx) => (
                <li key={idx}>{i.message}</li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3 className="text-sm font-semibold text-ink-primary">
            Repeated difficulties
          </h3>
          {h.repeated_difficulties.length === 0 ? (
            <p className="mt-1 text-sm text-ink-secondary">
              None found in your verified results.
            </p>
          ) : (
            <ul className="mt-1 flex flex-col gap-1 text-sm text-ink-secondary">
              {h.repeated_difficulties.map((r, idx) => (
                <li key={idx}>
                  {r.area}: {r.detail}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-sm text-ink-secondary">
            Revision queue: {h.revision.due} due of {h.revision.items} item(s).
          </p>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-ink-primary">Changes to your plan</h3>
          {h.changes.length === 0 ? (
            <p className="mt-1 text-sm text-ink-secondary">No changes yet.</p>
          ) : (
            <ul className="mt-1 flex flex-col gap-1 text-sm text-ink-secondary">
              {h.changes.map((c, idx) => (
                <li key={idx}>
                  <span className="text-xs text-ink-muted">{c.at.slice(0, 10)} · </span>
                  {c.summary}. <span className="text-xs text-ink-muted">{c.reason}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
};

export const ReadinessSection: React.FC<{ d: PlacementDashboard }> = ({ d }) => {
  const r = d.readiness;
  const List: React.FC<{ title: string; items: string[]; empty: string }> = ({
    title,
    items,
    empty,
  }) => (
    <div>
      <h3 className="text-sm font-semibold text-ink-primary">{title}</h3>
      {items.length === 0 ? (
        <p className="mt-1 text-sm text-ink-secondary">{empty}</p>
      ) : (
        <ul className="mt-1 list-disc pl-5 text-sm text-ink-secondary">
          {items.slice(0, 8).map((i) => (
            <li key={i}>{i}</li>
          ))}
          {items.length > 8 ? <li>and {items.length - 8} more</li> : null}
        </ul>
      )}
    </div>
  );
  return (
    <section aria-labelledby="readiness-h">
      <h2 id="readiness-h" className="text-lg font-semibold text-ink-primary">
        Readiness and next steps
      </h2>
      <p className="mt-1 text-sm text-ink-secondary">{r.note}</p>
      <div className="mt-3 grid gap-4 md:grid-cols-3">
        <List
          title="Enough evidence"
          items={r.sufficient_evidence}
          empty="No area has enough evidence yet."
        />
        <List
          title="Needs work (from verified results)"
          items={r.weak}
          empty="No area is confirmed weak."
        />
        <List
          title="Not assessed yet"
          items={r.unassessed}
          empty="Every area in scope has some evidence."
        />
      </div>
      {r.next_diagnostics.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-semibold text-ink-primary">
            Recommended next assessments
          </h3>
          <ul className="mt-1 list-disc pl-5 text-sm text-ink-secondary">
            {r.next_diagnostics.map((n) => (
              <li key={n.area}>
                {n.area}: {n.description}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
};

export const LimitationsSection: React.FC<{ items: EvidenceLimitation[] }> = ({
  items,
}) => {
  if (items.length === 0) return null;
  const limiting = items.filter((i) => i.severity === "limits_accuracy");
  return (
    <section
      aria-labelledby="limits-h"
      className="rounded-lg border border-line bg-surface-50 p-4"
    >
      <h2 id="limits-h" className="text-sm font-semibold text-ink-primary">
        What limits these results
      </h2>
      <ul className="mt-2 flex flex-col gap-1 text-sm text-ink-secondary">
        {[...limiting, ...items.filter((i) => i.severity === "info")].map((i, idx) => (
          <li key={idx}>
            <span className="font-medium text-ink-primary">
              {i.severity === "limits_accuracy" ? "Limits accuracy: " : "Note: "}
            </span>
            {i.message}
          </li>
        ))}
      </ul>
    </section>
  );
};
