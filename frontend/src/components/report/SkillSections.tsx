import React from "react";
import type { Priority, PlanItem, SkillReport } from "@/types/contract";
import { SkillStateBadge } from "@/components/ui/StatusBadge";
import { InlineMarkdown } from "@/components/common/InlineMarkdown";
import { percent } from "@/lib/format";

/** Role coverage grid: every role skill with its state (label + icon + color), weight and proficiency. */
export const CoverageGrid: React.FC<{ skills: SkillReport[] }> = ({ skills }) => (
  <section aria-labelledby="coverage-heading" className="rounded-lg border border-line bg-white p-5">
    <h2 id="coverage-heading" className="mb-4 text-lg font-semibold text-ink-primary">
      Role coverage
    </h2>
    <ul className="grid gap-3 sm:grid-cols-2">
      {skills.map((s) => (
        <li key={s.skill_id} className="rounded-md border border-line p-3">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium text-ink-primary">{s.name}</span>
            <SkillStateBadge state={s.state} />
          </div>
          <p className="text-xs text-ink-muted">
            Weight {percent(s.weight)} · proficiency {percent(s.proficiency)}
          </p>
        </li>
      ))}
    </ul>
  </section>
);

export const PriorityList: React.FC<{ priorities: Priority[]; skills: SkillReport[] }> = ({ priorities, skills }) => {
  const name = (id: string) => skills.find((s) => s.skill_id === id)?.name ?? id;
  return (
    <section aria-labelledby="priorities-heading" className="rounded-lg border border-line bg-white p-5">
      <h2 id="priorities-heading" className="mb-4 text-lg font-semibold text-ink-primary">
        Top priorities
      </h2>
      {priorities.length === 0 ? (
        <p className="text-sm text-ink-muted">No gaps left to prioritise.</p>
      ) : (
        <ol className="grid gap-2">
          {priorities.map((p) => (
            <li key={p.rank} className="flex gap-3 text-sm">
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-soft font-semibold text-primary-dark"
                aria-hidden="true"
              >
                {p.rank}
              </span>
              <span>
                <span className="font-semibold text-ink-primary">{name(p.skill_id)}</span>
                <span className="block text-ink-secondary">{p.reason}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
};

export const PlanList: React.FC<{ plan: PlanItem[] }> = ({ plan }) => {
  const days = Array.from(new Set(plan.map((p) => p.day)));
  return (
    <section aria-labelledby="plan-heading" className="rounded-lg border border-line bg-white p-5">
      <h2 id="plan-heading" className="mb-4 text-lg font-semibold text-ink-primary">
        7-day plan
      </h2>
      {plan.length === 0 ? (
        <p className="text-sm text-ink-muted">Nothing to plan.</p>
      ) : (
        <ol className="grid gap-4">
          {days.map((day) => (
            <li key={day}>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-muted">Day {day}</h3>
              <ul className="grid gap-2">
                {plan
                  .filter((p) => p.day === day)
                  .map((p, i) => (
                    <li key={i} className="rounded-md border border-line p-3 text-sm">
                      <p className="mb-1 font-medium text-ink-primary">{p.title}</p>
                      <InlineMarkdown text={p.task} className="text-ink-secondary" />
                    </li>
                  ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
};
