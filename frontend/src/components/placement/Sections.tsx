import { Enter } from "@/components/motion/Enter";
import { Strike } from "@/components/motion/Marks";
import { RISE } from "@/components/motion/tokens";
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
import { EmptyState } from "@/components/ui/EmptyState";
import { Meter } from "@/components/ui/Meter";
import { Section } from "@/components/ui/Page";
import { Tag, type TagTone } from "@/components/ui/Tag";
import { TaskCard } from "./TaskCard";

type Act = (task: PlacementTask, body: PlacementTaskActionRequest) => void;

export const TodaySection: React.FC<{
  d: PlacementDashboard;
  busy: boolean;
  onAction: Act;
}> = ({ d, busy, onAction }) => (
  <Section
    id="today"
    title="Today's plan"
    description={
      <>
        {d.today_tasks.length} task(s), {minutesLabel(d.today_minutes)} planned of{" "}
        {minutesLabel(d.today_capacity_minutes)} available today ({d.today}).
        {d.today_capacity_minutes === 0 ? " Today is not one of your study days." : ""}
      </>
    }
  >
    {d.today_capacity_minutes > 0 && (
      <Meter
        className="mb-4"
        value={d.today_minutes}
        max={d.today_capacity_minutes}
        label="Today's planned time against your available time"
      />
    )}
    {d.today_tasks.length === 0 ? (
      <EmptyState title="Nothing is due today.">
        Check the weekly roadmap, or refresh the plan after new results.
      </EmptyState>
    ) : (
      <ul className="border-t border-line">
        {d.today_tasks.map((t, i) => (
          <TaskCard
            key={t.id}
            index={i}
            task={t}
            today={d.today}
            busy={busy}
            onAction={onAction}
          />
        ))}
      </ul>
    )}
  </Section>
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
    <Section
      id="week"
      title="Weekly roadmap"
      description={
        <>
          {d.counts.planned + d.counts.in_progress} open, {d.counts.completed} completed,{" "}
          {d.counts.skipped} skipped. Outstanding high-priority tasks:{" "}
          {d.outstanding_priorities.length}.
        </>
      }
    >
      <ol className="border-t border-line" aria-label="Next seven days">
        {d.week.map((day, di) => (
          <Enter
            as="li"
            index={di}
            y={RISE.sm}
            key={day.date}
            className={cn(
              "grid gap-x-6 gap-y-1 border-b border-line py-3 md:grid-cols-[11.5rem_minmax(0,1fr)]",
              !day.available && "text-ink-muted"
            )}
          >
            <div>
              <p
                className={cn(
                  "text-sm font-semibold",
                  day.available ? "text-ink-primary" : "text-ink-muted"
                )}
              >
                {day.weekday} {day.date}
              </p>
              <p className="text-xs text-ink-muted">
                {day.available
                  ? `${minutesLabel(day.planned_minutes)} planned, ${minutesLabel(day.completed_minutes)} done, of ${minutesLabel(day.capacity_minutes)}`
                  : "Not a study day"}
              </p>
            </div>
            {day.tasks.length > 0 && (
              <ul className="flex flex-col gap-1 text-sm">
                {day.tasks.map((t) => (
                  <li key={t.id} className="text-ink-secondary">
                    <Strike on={t.status === "completed"}>{t.title}</Strike>{" "}
                    <span className="text-xs text-ink-muted">
                      ({t.estimated_minutes} min{t.status === "completed" ? ", done" : ""}
                      )
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Enter>
        ))}
      </ol>
      {later.length > 0 && (
        <details className="group mt-4">
          <summary className="cursor-pointer text-sm font-medium text-ink-primary underline-offset-4 hover:underline">
            Later high-priority tasks and rescheduling ({later.length})
          </summary>
          <ul className="mt-2 border-t border-line">
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
    </Section>
  );
};

const PROVENANCE_TONE: Record<SkillAssessment["evidence"]["provenance"], TagTone> = {
  verified: "verified",
  self_reported: "self",
  demonstration: "unavailable",
  unavailable: "none",
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
  const assessed = d.skills.skills.filter(
    (s) => s.evidence.provenance === "verified" && s.evidence.count > 0
  ).length;
  return (
    <Section
      id="skills"
      title="Skills overview"
      description={
        <>
          {d.skills.coverage.sufficient_evidence} of {d.skills.coverage.in_scope} skill
          areas have enough evidence for a confident reading (
          {d.skills.coverage.provisional} provisional, {d.skills.coverage.unassessed} not
          assessed). {d.skills.coverage.definition}
        </>
      }
    >
      <p className="mb-4 flex flex-wrap items-center gap-2 text-sm text-ink-secondary">
        <Tag tone="verified">{assessed} with verified results</Tag>
        <Tag tone="none">{d.skills.skills.length - assessed} without</Tag>
      </p>
      {groups.map((g) => (
        <div key={g.title} className="mt-6 first:mt-0">
          <h3 className="eyebrow border-b border-ink-primary pb-2">{g.title}</h3>
          <ul>
            {g.items.map((s) => (
              <li
                key={s.area}
                className="grid gap-x-6 gap-y-1 border-b border-line py-3 text-sm md:grid-cols-[13rem_10rem_minmax(0,1fr)]"
              >
                <span className="font-medium text-ink-primary">{s.label}</span>
                <span className="text-ink-secondary">
                  {SKILL_STATUS_LABEL[s.status]}
                  {s.estimate !== null ? `: ${percent(s.estimate)}` : ""}
                </span>
                <div className="space-y-1">
                  <div className="flex items-start gap-2">
                    {s.evidence.provenance !== "unavailable" && (
                      <Tag
                        tone={PROVENANCE_TONE[s.evidence.provenance]}
                        className="shrink-0"
                      >
                        {s.evidence.provenance === "verified"
                          ? "Verified"
                          : s.evidence.provenance === "self_reported"
                            ? "Self-reported"
                            : "Demo only"}
                      </Tag>
                    )}
                    <EvidenceLine s={s} />
                  </div>
                  {s.note && <p className="text-xs text-ink-muted">{s.note}</p>}
                  {s.self_reported && (
                    <p className="text-xs text-ink-muted">
                      {s.self_reported} (self-reported, not part of the reading)
                    </p>
                  )}
                  {s.gaps.length > 0 && (
                    <p className="text-xs text-ink-secondary">
                      Gaps: {s.gaps.join("; ")}
                    </p>
                  )}
                  {s.next_assessment && (
                    <p className="text-xs text-ink-secondary">
                      Next: {s.next_assessment.description}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <details className="mt-4 text-xs text-ink-muted">
        <summary className="cursor-pointer">How these readings are calculated</summary>
        <ul className="mt-1 list-disc pl-5">
          {d.skills.method.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      </details>
    </Section>
  );
};

const Block: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <div>
    <h3 className="eyebrow border-b border-ink-primary pb-2">{title}</h3>
    <div className="pt-3 text-sm text-ink-secondary">{children}</div>
  </div>
);

export const HistorySection: React.FC<{ d: PlacementDashboard }> = ({ d }) => {
  const h = d.history;
  return (
    <Section id="history" title="Progress history">
      <div className="grid gap-x-10 gap-y-8 md:grid-cols-2">
        <Block title="Completed tasks">
          {h.recent_completed.length === 0 ? (
            <p>Nothing completed yet.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
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
        </Block>
        <Block title="Validated improvements">
          {h.improvements.length === 0 ? (
            <p>
              None recorded yet. These appear only when your own verified results show a
              change.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {h.improvements.map((i, idx) => (
                <li key={idx}>{i.message}</li>
              ))}
            </ul>
          )}
        </Block>
        <Block title="Repeated difficulties">
          {h.repeated_difficulties.length === 0 ? (
            <p>None found in your verified results.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {h.repeated_difficulties.map((r, idx) => (
                <li key={idx}>
                  {r.area}: {r.detail}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2">
            Revision queue: {h.revision.due} due of {h.revision.items} item(s).
          </p>
        </Block>
        <Block title="Changes to your plan">
          {h.changes.length === 0 ? (
            <p>No changes yet.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {h.changes.map((c, idx) => (
                <li key={idx}>
                  <span className="num text-xs text-ink-muted">
                    {c.at.slice(0, 10)} ·{" "}
                  </span>
                  {c.summary}. <span className="text-xs text-ink-muted">{c.reason}</span>
                </li>
              ))}
            </ul>
          )}
        </Block>
      </div>
    </Section>
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
      <h3 className="eyebrow border-b border-ink-primary pb-2">{title}</h3>
      {items.length === 0 ? (
        <p className="pt-3 text-sm text-ink-secondary">{empty}</p>
      ) : (
        <ul className="list-disc pl-5 pt-3 text-sm text-ink-secondary">
          {items.slice(0, 8).map((i) => (
            <li key={i}>{i}</li>
          ))}
          {items.length > 8 ? <li>and {items.length - 8} more</li> : null}
        </ul>
      )}
    </div>
  );
  return (
    <Section id="readiness" title="Readiness and next steps" description={r.note}>
      <div className="grid gap-x-8 gap-y-6 lg:grid-cols-3">
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
        <div className="mt-6">
          <h3 className="eyebrow border-b border-ink-primary pb-2">
            Recommended next assessments
          </h3>
          <ul className="list-disc pl-5 pt-3 text-sm text-ink-secondary">
            {r.next_diagnostics.map((n) => (
              <li key={n.area}>
                {n.area}: {n.description}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Section>
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
      className="border border-line bg-surface-100/60 p-4"
    >
      <h2 id="limits-h" className="eyebrow text-ink-primary">
        What limits these results
      </h2>
      <ul className="mt-3 flex flex-col gap-2 text-sm text-ink-secondary">
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
