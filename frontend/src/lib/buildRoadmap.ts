import type { Report, SkillState, Verdict } from "@/types/contract";

export interface RoadmapItem {
  title: string;
  detail: string;
  verdict: Verdict | null;
  state: SkillState | null;
  rootCause: string | null;
  comingSoon: boolean;
}

export interface RoadmapWeek {
  week: number;
  title: string;
  items: RoadmapItem[];
}

const WEAK: readonly Verdict[] = ["shaky", "bluff", "honest_gap"];

const item = (partial: Partial<RoadmapItem> & Pick<RoadmapItem, "title" | "detail">): RoadmapItem => ({
  verdict: null,
  state: null,
  rootCause: null,
  comingSoon: false,
  ...partial,
});

/** Pure: turns a Report into a 4-week roadmap. No fetching, no scoring, no LLM. */
export function buildRoadmap(report: Report): RoadmapWeek[] {
  const skillName = (id: string | null) => report.skills.find((s) => s.skill_id === id)?.name ?? "Other";
  const claimById = new Map(report.claims.map((c) => [c.id, c]));
  const prioritised = new Set(report.priorities.map((p) => p.claim_id).filter((id): id is string => id !== null));

  const week1 = report.priorities.map((p) => {
    const claim = p.claim_id ? claimById.get(p.claim_id) : undefined;
    return item({
      title: skillName(p.skill_id),
      detail: p.reason,
      verdict: claim?.verdict ?? null,
      state: claim ? null : (report.skills.find((s) => s.skill_id === p.skill_id)?.state ?? null),
      rootCause: claim?.root_cause ?? null,
    });
  });

  const week2 = report.claims
    .filter((c) => WEAK.includes(c.verdict) && !prioritised.has(c.id))
    .map((c) =>
      item({
        title: c.text,
        detail: c.missing_concepts.length > 0 ? c.missing_concepts.join("; ") : "Review and re-explain this claim",
        verdict: c.verdict,
        rootCause: c.root_cause,
      }),
    );

  const week3 = report.blind_spots.map((b) =>
    item({ title: b.name, detail: "Required by the role, never claimed", state: "blind_spot" }),
  );

  const week4 = [
    item({ title: "Company-specific practice", detail: "Questions tuned to a target company's stack", comingSoon: true }),
    item({ title: "Full mock interview", detail: "An end-to-end timed interview across all claims", comingSoon: true }),
  ];

  return [
    { week: 1, title: "Top priorities", items: week1 },
    { week: 2, title: "Remaining weak claims", items: week2 },
    { week: 3, title: "Blind spots", items: week3 },
    { week: 4, title: "Interview simulation", items: week4 },
  ];
}
