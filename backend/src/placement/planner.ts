import { createHash } from "node:crypto";
import type { RoleRegistry } from "../services/roles.js";
import type { PlacementFeasibility, PlacementProfile, PlacementSkillsResponse, PlacementTask, PlacementTaskType, RevisionItem } from "../types.js";
import { addDays, diffDays, weekdayOf, weekStart } from "./dates.js";
import type { EvidenceBundle } from "./evidence.js";
import type { TaskRecord } from "./store.js";

/**
 * The deterministic planning rules. Pure functions: the same profile, evidence and existing tasks always give the same
 * candidates and schedule. The AI model takes no part in choosing, ordering, scheduling or completing tasks.
 */

export const PLAN_RULES = {
  /** New work is scheduled at most this many days ahead; later work is added by later refreshes. */
  horizonDays: 14,
  /** The longest the planner will look for room before a placement date. */
  maxLookaheadDays: 90,
  /** Incomplete tasks the planner will keep at once. */
  maxActiveTasks: 14,
  /** A weekly task (interview, communication, review) is created once per Monday-to-Sunday week. */
  /** Priority 1 and 2 tasks are the ones that decide whether a deadline is feasible. */
  mustDoPriority: 2,
  /** Questions and lessons already planned or finished in the last N days are not suggested again if alternatives exist. */
  repeatSuppressionDays: 30,
  /** Estimated minutes by difficulty. */
  minutes: { easy: 25, medium: 40, hard: 60, revision: 20, interview: 45, communication: 30, project: 30, review: 15, graphql: { beginner: 20, intermediate: 30, advanced: 40 } },
  /** feasibility: required work up to this share of available time is "ok"; up to 100% is "tight". */
  okShare: 0.8,
} as const;

const DIFFICULTY_RANK = { easy: 0, medium: 1, hard: 2 } as const;

export interface Candidate {
  key: string;
  type: PlacementTaskType;
  title: string;
  description: string;
  skill_area: string;
  priority: 1 | 2 | 3 | 4 | 5;
  minutes: number;
  link: string;
  ref: { kind: string; id: string };
  completion_criteria: string;
  completion_check: "verified_event" | "student";
  evidence_source: string;
  reason: string;
  reason_codes: string[];
  /** Keys of candidates (or existing tasks) that must be done first. */
  depends_on_keys: string[];
}

export const taskIdFor = (uid: string, key: string): string => `t_${createHash("sha1").update(`${uid}|${key}`).digest("hex").slice(0, 24)}`;

export interface PlannerInput {
  uid: string;
  today: string;
  profile: PlacementProfile;
  evidence: EvidenceBundle;
  skills: PlacementSkillsResponse;
  roles: RoleRegistry;
  existing: readonly TaskRecord[];
  mode: "default" | "reduced";
}

const isDueRevision = (r: RevisionItem) => r.due || r.status === "in_progress";

/** All tasks the rules currently recommend, in priority order. Existing tasks are not considered here except for repeat suppression. */
export function buildCandidates(input: PlannerInput): Candidate[] {
  const { profile, evidence: ev, skills, today, existing } = input;
  const out: Candidate[] = [];
  const reduced = input.mode === "reduced";
  const exec = ev.dsa.execution;
  const recentCutoff = addDays(today, -PLAN_RULES.repeatSuppressionDays);
  // Questions already finished, skipped or removed recently are not suggested again. Open tasks are NOT excluded: the same
  // question is chosen again (and found to exist), so refreshing never keeps adding different tasks for the same need.
  const seenQuestionIds = new Set(existing.filter((t) => t.ref.kind === "question" && (t.status === "completed" || t.status === "skipped" || t.status === "removed") && t.updated_at.slice(0, 10) >= recentCutoff).map((t) => t.ref.id));
  const solved = new Set(ev.dsa.outcomes.filter((o) => o.solved).map((o) => o.question_id));
  const outcomeOf = new Map(ev.dsa.outcomes.map((o) => [o.question_id, o]));
  const verifiedCheck = (eligible: boolean): "verified_event" | "student" => (exec.verified && eligible ? "verified_event" : "student");

  // ---- R1: revision items that are due (the existing spaced-review queue)
  if (exec.configured) {
    for (const r of ev.dsa.revision.filter(isDueRevision)) {
      const fails = r.context.consecutive_failures;
      out.push({
        key: `dsa_revision|revision:${r.question_id}@${r.stage}@${r.last_reviewed_at ?? "new"}`,
        type: "dsa_revision",
        title: `Revise: ${r.title ?? r.question_id}`,
        description: `Review this question and record whether you remembered it or struggled. ${r.explanation}`,
        skill_area: `dsa:${r.context.topics[0] ?? "general"}`,
        priority: r.priority <= 1 ? 1 : r.priority <= 3 ? 2 : 3,
        minutes: PLAN_RULES.minutes.revision,
        link: "/dsa/revision",
        ref: { kind: "revision", id: r.question_id },
        completion_criteria: "Open it in the revision queue and mark it complete (remembered or struggled).",
        completion_check: "verified_event",
        evidence_source: `revision:${r.question_id}`,
        reason:
          r.reason === "repeated_failure"
            ? `You failed this question ${fails > 1 ? `${fails} times in a row` : "repeatedly"} in judged submissions, so the revision queue scheduled it.`
            : r.reason === "unsolved_attempted"
              ? "You attempted this question in judged submissions but have not solved it, so the revision queue scheduled it."
              : r.reason === "spaced_review"
                ? "A spaced review of a question you solved is due according to the revision schedule."
                : "It was added to your revision queue because of a weak topic.",
        reason_codes: [`revision_${r.reason}`],
        depends_on_keys: [],
      });
    }
  }

  // ---- R2: practice for weak DSA topics; R3: first measurements for unassessed topics
  const canPractise = exec.configured && ev.dsa.gradable.length > 0;
  const pickQuestions = (topic: string, n: number, easyFirst: boolean) =>
    ev.dsa.gradable
      .filter((g) => g.summary.topics.includes(topic) && !solved.has(g.summary.id) && !seenQuestionIds.has(g.summary.id))
      .filter((g) => !((outcomeOf.get(g.summary.id)?.attempts ?? 0) > 0)) // a question already attempted belongs to the revision queue, not to new practice
      .sort((a, b) => (easyFirst ? DIFFICULTY_RANK[a.summary.difficulty] - DIFFICULTY_RANK[b.summary.difficulty] : 0) || Number(b.eligible) - Number(a.eligible) || a.summary.id.localeCompare(b.summary.id))
      .slice(0, n);
  const taken = new Set<string>();
  if (canPractise) {
    const weakTopics = skills.skills.filter((s) => s.category === "dsa" && s.status === "weak" && s.estimate !== null).map((s) => s.area.slice(4));
    const maxTopics = reduced ? 1 : 2;
    for (const topic of weakTopics.slice(0, maxTopics)) {
      const weak = ev.dsa.overview?.weaknesses.find((w) => w.topic === topic);
      for (const g of pickQuestions(topic, reduced ? 1 : 2, true)) {
        if (taken.has(g.summary.id)) continue;
        taken.add(g.summary.id);
        out.push({
          key: `dsa_practice|question:${g.summary.id}`,
          type: "dsa_practice",
          title: `Practise ${topic}: ${g.summary.title}`,
          description: `Solve "${g.summary.title}" (${g.summary.difficulty}) in the coding workspace.`,
          skill_area: `dsa:${topic}`,
          priority: 2,
          minutes: PLAN_RULES.minutes[g.summary.difficulty],
          link: `/dsa/questions/${encodeURIComponent(g.summary.id)}/code`,
          ref: { kind: "question", id: g.summary.id },
          completion_criteria: exec.verified && g.eligible ? "Submit a solution that the judge accepts." : "Solve it in the coding workspace and mark it done (the result will not be counted as verified).",
          completion_check: verifiedCheck(g.eligible),
          evidence_source: `analytics:weakness:${topic}`,
          reason: `${topic} is a weak area in your verified judged submissions${weak?.explanation[0] ? `: ${weak.explanation[0]}` : "."}`,
          reason_codes: ["dsa_weak_topic"],
          depends_on_keys: [],
        });
      }
    }
    // first measurements: the student's own weak areas first, then alphabetical
    const priorityTopics = new Set(profile.weak_areas.map((x) => x.toLowerCase()));
    const unassessed = skills.skills
      .filter((s) => s.category === "dsa" && (s.confidence === "none" || s.estimate === null) && s.status === "unassessed")
      .map((s) => s.area.slice(4))
      .sort((a, b) => Number(priorityTopics.has(b.toLowerCase())) - Number(priorityTopics.has(a.toLowerCase())) || a.localeCompare(b));
    const covered = new Set<string>();
    let diagnostics = 0;
    for (const topic of unassessed) {
      if (diagnostics >= (reduced ? 2 : 3)) break;
      if (covered.has(topic)) continue;
      const q = pickQuestions(topic, 3, true).find((g) => !taken.has(g.summary.id));
      if (!q) continue;
      taken.add(q.summary.id);
      for (const t of q.summary.topics) covered.add(t);
      diagnostics += 1;
      out.push({
        key: `diagnostic|question:${q.summary.id}`,
        type: "diagnostic",
        title: `First measurement, ${topic}: ${q.summary.title}`,
        description: `Solve "${q.summary.title}" (${q.summary.difficulty}) so that ${topic} has a first judged result.`,
        skill_area: `dsa:${topic}`,
        priority: diagnostics === 1 ? 2 : 3,
        minutes: PLAN_RULES.minutes[q.summary.difficulty],
        link: `/dsa/questions/${encodeURIComponent(q.summary.id)}/code`,
        ref: { kind: "question", id: q.summary.id },
        completion_criteria: exec.verified && q.eligible ? "Submit a solution that the judge accepts or rejects: any counted judged attempt gives a first measurement." : "Attempt it in the coding workspace and mark it done (not counted as verified).",
        completion_check: verifiedCheck(q.eligible),
        evidence_source: "rule:diagnostic_unassessed_topic",
        reason: `There is no verified result for ${topic} yet, so one question gives a first measurement${priorityTopics.has(topic.toLowerCase()) ? " (you listed it as a weak area)" : ""}.`,
        reason_codes: ["diagnostic_insufficient_evidence"],
        depends_on_keys: [],
      });
    }
  }

  // ---- R4: technical interview practice for each target role, at most once a week
  const wk = weekStart(today);
  for (const roleId of profile.role_ids) {
    const role = input.roles.get(roleId);
    if (!role) continue;
    const already = ev.interview.sessions.some((s) => s.role_id === roleId && s.created_at.slice(0, 10) >= wk);
    if (already) continue;
    const mine = skills.skills.filter((s) => s.category === "interview" && s.area.startsWith(`interview:${roleId}:`));
    const weak = mine.filter((s) => s.status === "weak" || s.status === "developing");
    const unassessed = mine.filter((s) => s.status === "unassessed");
    if (weak.length === 0 && unassessed.length === 0 && mine.length > 0) continue; // every skill is strong: nothing to schedule
    const focus = (weak.length > 0 ? weak : unassessed).slice(0, 3).map((s) => s.label.replace(/^Interview: /, "").replace(/ \(.*\)$/, ""));
    out.push({
      key: `technical_interview|role:${roleId}@week:${wk}`,
      type: "technical_interview",
      title: `Technical interview practice: ${role.name}`,
      description: `Run an interview session for ${role.name}. Suggested focus: ${focus.join(", ") || "any skill"}.`,
      skill_area: `interview:${roleId}`,
      priority: weak.length > 0 ? 2 : 3,
      minutes: PLAN_RULES.minutes.interview,
      link: "/setup",
      ref: { kind: "role", id: roleId },
      completion_criteria: `Complete an interview session for ${role.name} in which at least one claim is assessed.`,
      completion_check: "verified_event",
      evidence_source: weak.length > 0 ? `interview:${weak[0]!.area}` : "rule:interview_first_assessment",
      reason:
        weak.length > 0
          ? `Your latest assessment of ${focus[0]} for ${role.name} found an unresolved gap, so focused interview practice is scheduled.`
          : `No interview skill for ${role.name} has been assessed yet, so a first interview gives the evidence this plan needs.`,
      reason_codes: [weak.length > 0 ? "interview_gap" : "interview_unassessed"],
      depends_on_keys: [],
    });
  }

  // ---- R5: communication practice in the AI mentor, when the student chose it
  if (profile.priorities.includes("communication") && !reduced) {
    out.push({
      key: `communication|mentor:interview_practice@week:${wk}`,
      type: "communication",
      title: "HR and communication practice with the AI mentor",
      description: "Open the AI mentor in Interview Practice mode and answer a few HR or behavioural questions out loud or in writing.",
      skill_area: "communication",
      priority: 3,
      minutes: PLAN_RULES.minutes.communication,
      link: "/mentor",
      ref: { kind: "mentor_mode", id: "interview_practice" },
      completion_criteria: "Have a conversation of at least two exchanges in the AI mentor's Interview Practice mode.",
      completion_check: "verified_event",
      evidence_source: "profile:priorities",
      reason: "You chose communication as a priority. The AI mentor's Interview Practice mode asks HR and behavioural questions.",
      reason_codes: ["profile_priority_communication"],
      depends_on_keys: [],
    });
  }

  // ---- R6: the next GraphQL Lab exercises, when GraphQL is in scope
  if (skills.skills.some((s) => s.area === "graphql")) {
    const next = ev.lab.exercises.filter((e) => !e.passed).slice(0, 2);
    const done = ev.lab.exercises.filter((e) => e.passed).length;
    next.forEach((e, i) => {
      const prev = next[i - 1];
      out.push({
        key: `graphql|lab:${e.id}`,
        type: "graphql",
        title: `GraphQL: ${e.title}`,
        description: `Exercise ${e.order} of the module "${e.module_title}" in the GraphQL Lab.`,
        skill_area: "graphql",
        priority: profile.priorities.includes("graphql") ? 2 : 3,
        minutes: PLAN_RULES.minutes.graphql[e.difficulty as "beginner" | "intermediate" | "advanced"] ?? 30,
        link: `/graphql-lab/modules/${encodeURIComponent(e.module_id)}?exercise=${encodeURIComponent(e.id)}`,
        ref: { kind: "lab_exercise", id: e.id },
        completion_criteria: "Pass the exercise's check in the GraphQL Lab.",
        completion_check: "verified_event",
        evidence_source: `lab:${e.id}`,
        reason: prev
          ? `It follows "${prev.title}" in the GraphQL Lab path and unlocks once that one is passed.`
          : done === 0
            ? profile.priorities.includes("graphql")
              ? "You chose GraphQL as a priority and have not passed a Lab exercise yet."
              : "Your target role lists an API skill, and the GraphQL Lab teaches API design; no exercise has been passed yet."
            : `You have passed ${done} Lab exercise(s); this is the next one in the path.`,
        reason_codes: [prev ? "graphql_follow_up" : done === 0 ? "graphql_start" : "graphql_next"],
        depends_on_keys: prev ? [`graphql|lab:${prev.id}`] : [],
      });
    });
  }

  // ---- R7: project improvements actually observed on GitHub
  if (!reduced && ev.github.status === "available" && ev.github.gaps.length > 0) {
    const g = ev.github.gaps[0]!;
    out.push({
      key: `project|repo:${g.repository}:${g.check}`,
      type: "project",
      title: `Improve ${g.repository}: ${g.label}`,
      description: `GitHub's data shows this repository is missing: ${g.label}. Fix it, then sync on the GitHub page.`,
      skill_area: "project:github",
      priority: 4,
      minutes: PLAN_RULES.minutes.project,
      link: "/github",
      ref: { kind: "github_check", id: `${g.repository}:${g.check}` },
      completion_criteria: "Make the change on GitHub and synchronise: the check then passes.",
      completion_check: "verified_event",
      evidence_source: `github:checklist:${g.repository}:${g.check}`,
      reason: `Observed in your last GitHub synchronisation: ${g.repository} fails "${g.label}". Project work is context, not a measure of algorithmic ability.`,
      reason_codes: ["github_checklist_gap"],
      depends_on_keys: [],
    });
  }

  // ---- R8: a short weekly review
  if (!reduced) {
    out.push({
      key: `general|review@week:${wk}`,
      type: "general",
      title: "Weekly review",
      description: "Look at what you completed this week, what changed in your plan and what to adjust.",
      skill_area: "planning",
      priority: 5,
      minutes: PLAN_RULES.minutes.review,
      link: "/placement",
      ref: { kind: "review", id: wk },
      completion_criteria: "Read the progress history on the dashboard and mark this done.",
      completion_check: "student",
      evidence_source: "rule:weekly_review",
      reason: "A short weekly check keeps the plan in line with your real progress.",
      reason_codes: ["weekly_review"],
      depends_on_keys: [],
    });
  }

  return out.sort((a, b) => a.priority - b.priority || a.key.localeCompare(b.key));
}

// ---------------- scheduling ----------------

export interface Slot {
  date: string;
  minutes: number;
}

export function capacityOn(profile: PlacementProfile, date: string): number {
  return profile.available_weekdays.includes(weekdayOf(date)) ? profile.daily_minutes : 0;
}

/** Minutes already committed per day by incomplete tasks. */
export function usedByDate(tasks: readonly Pick<PlacementTask, "status" | "due_date" | "estimated_minutes">[]): Map<string, number> {
  const used = new Map<string, number>();
  for (const t of tasks) if (t.status === "planned" || t.status === "in_progress") used.set(t.due_date, (used.get(t.due_date) ?? 0) + t.estimated_minutes);
  return used;
}

/**
 * Finds the first day from `from` to `last` that is available and has room. A task longer than a whole day is allowed on
 * an empty available day (it cannot be split), and is the only way such a task is ever placed.
 */
export function findSlot(profile: PlacementProfile, used: Map<string, number>, minutes: number, from: string, last: string): string | null {
  for (let d = from; d <= last; d = addDays(d, 1)) {
    const cap = capacityOn(profile, d);
    if (cap === 0) continue;
    const u = used.get(d) ?? 0;
    if (u + minutes <= cap || (u === 0 && minutes > cap)) return d;
  }
  return null;
}

/** The last day work can be scheduled: the day before the placement date, within the planning horizon. */
export function lastPlanDay(profile: PlacementProfile, today: string): string {
  const horizon = addDays(today, PLAN_RULES.horizonDays - 1);
  if (!profile.placement_date) return horizon;
  const dayBefore = addDays(profile.placement_date, -1);
  return dayBefore < horizon ? (dayBefore < today ? today : dayBefore) : horizon;
}

export function availableMinutes(profile: PlacementProfile, today: string): number {
  const end = profile.placement_date ? addDays(profile.placement_date, -1) : addDays(today, PLAN_RULES.horizonDays - 1);
  const stop = addDays(today, PLAN_RULES.maxLookaheadDays);
  let total = 0;
  for (let d = today; d <= end && d <= stop; d = addDays(d, 1)) total += capacityOn(profile, d);
  return total;
}

/**
 * Whether the work that matters most fits before the placement date. "Required" is every incomplete priority 1 and 2
 * task plus the candidates not yet created. With no deadline there is nothing to be infeasible against.
 */
export function assessFeasibility(profile: PlacementProfile, today: string, requiredMinutes: number, deferred: string[], reduced: boolean): PlacementFeasibility {
  const available = availableMinutes(profile, today);
  if (!profile.placement_date) {
    return { status: "no_deadline", required_minutes: requiredMinutes, available_minutes: available, message: "No placement date is set, so the plan covers the next two weeks and the time pressure is unknown. Set a date to check feasibility.", reduced, deferred_task_ids: deferred };
  }
  const days = diffDays(profile.placement_date, today);
  if (days <= 0) return { status: "insufficient", required_minutes: requiredMinutes, available_minutes: 0, message: "The placement date is today, so there is no time to schedule new work.", reduced, deferred_task_ids: deferred };
  const status = requiredMinutes <= available * PLAN_RULES.okShare ? "ok" : requiredMinutes <= available ? "tight" : "insufficient";
  const hours = (m: number) => `${Math.round((m / 60) * 10) / 10} h`;
  const message =
    requiredMinutes === 0
      ? `No high-priority work is waiting right now, and you have about ${hours(available)} before ${profile.placement_date}.`
      : status === "ok"
      ? `The most important work needs about ${hours(requiredMinutes)} and you have about ${hours(available)} before ${profile.placement_date}.`
      : status === "tight"
        ? `The most important work needs about ${hours(requiredMinutes)} of your ${hours(available)} before ${profile.placement_date}: it fits, but with little slack.`
        : `The most important work needs about ${hours(requiredMinutes)} but you have only about ${hours(available)} before ${profile.placement_date}. A reduced plan with the highest-priority work was made${deferred.length > 0 ? ` and ${deferred.length} task(s) were left out` : ""}; adding study days or minutes would help.`;
  return { status, required_minutes: requiredMinutes, available_minutes: available, message, reduced, deferred_task_ids: deferred };
}
