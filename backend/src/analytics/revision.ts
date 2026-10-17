import type { DsaDifficulty, RevisionActionRequest, RevisionEvent, RevisionEventKind, RevisionItem, RevisionReason, RevisionStatus, SubmissionVerdict } from "../types.js";
import type { RevisionConfig } from "./config.js";
import type { CountedVerdict, StatsEvent, StatsRecord } from "./stats.js";

/**
 * Revision scheduling. One RevisionRecord per student and question (the store key), so there are never
 * duplicates. All transitions are pure functions of (record, event/action, now, config).
 *
 * Priority tiers: 1 repeated failure, 2 unsolved with previous attempts, 3 spaced review that is overdue,
 * 4 spaced review that is upcoming, 5 weak-topic suggestion the student chose to add.
 * Review schedule: after a review the next one is due in intervalsDays[stage] days. "remembered" moves one
 * stage up (the last interval repeats); "struggled" returns to stage 0.
 */

export interface RevisionContext {
  attempts: number;
  failures: number;
  consecutive_failures: number;
  last_verdict: SubmissionVerdict | null;
  topics: string[];
  difficulty: DsaDifficulty | null;
  solved: boolean;
}

export interface RevisionRecord {
  owner_uid: string;
  question_id: string;
  reason: RevisionReason;
  status: RevisionStatus;
  stage: number;
  due_at: string;
  last_reviewed_at: string | null;
  postponed_count: number;
  created_at: string;
  updated_at: string;
  context: RevisionContext;
  history: RevisionEvent[];
}

export class RevisionActionError extends Error {}

const DAY_MS = 86_400_000;
export const addDaysIso = (iso: string, days: number): string => new Date(Date.parse(iso) + days * DAY_MS).toISOString();
const interval = (cfg: RevisionConfig, stage: number) => cfg.intervalsDays[Math.min(stage, cfg.intervalsDays.length - 1)]!;

export const isDue = (r: RevisionRecord, now: Date): boolean => Date.parse(r.due_at) <= now.getTime();

export function priorityOf(r: RevisionRecord, now: Date): 1 | 2 | 3 | 4 | 5 {
  if (r.reason === "repeated_failure") return 1;
  if (r.reason === "unsolved_attempted") return 2;
  if (r.reason === "spaced_review") return isDue(r, now) ? 3 : 4;
  return 5;
}

function push(history: RevisionEvent[], at: string, event: RevisionEventKind, detail: string | null, max: number): RevisionEvent[] {
  return [...history, { at, event, detail }].slice(-max);
}

export function contextFrom(stats: StatsRecord): RevisionContext {
  const failures = stats.failures.wrong_answer + stats.failures.time_limit_exceeded + stats.failures.compile_error + stats.failures.runtime_error;
  return {
    attempts: stats.attempts,
    failures,
    consecutive_failures: stats.consecutive_failures,
    last_verdict: stats.last_verdict,
    topics: stats.topics,
    difficulty: stats.difficulty,
    solved: stats.accepted > 0,
  };
}

/**
 * Reacts to one ELIGIBLE judged submission. Idempotent per submission id (the id is stored in the history
 * detail), so replaying an event cannot add history or move due dates again.
 *  - failure: create or reprioritize the single item (repeated_failure after `repeatedThreshold` failures in a row)
 *  - accepted with an existing item: it becomes spaced review, stage 0
 *  - accepted without one: nothing (a clean first-try solve needs no revision)
 */
export function onSubmission(
  rec: RevisionRecord | null,
  stats: StatsRecord,
  event: StatsEvent,
  verdict: CountedVerdict,
  now: Date,
  cfg: RevisionConfig,
  repeatedThreshold: number,
  itemCount: number,
): RevisionRecord | null {
  const at = now.toISOString();
  if (rec?.history.some((h) => h.detail === event.id)) return rec;
  const context = contextFrom(stats);

  if (verdict === "accepted") {
    if (!rec) return null;
    return {
      ...rec,
      reason: "spaced_review",
      status: "scheduled",
      stage: 0,
      due_at: addDaysIso(at, interval(cfg, 0)),
      last_reviewed_at: at,
      updated_at: at,
      context,
      history: push(rec.history, at, "solved", event.id, cfg.maxHistoryEvents),
    };
  }

  const reason: RevisionReason = stats.consecutive_failures >= repeatedThreshold ? "repeated_failure" : "unsolved_attempted";
  if (!rec) {
    if (itemCount >= cfg.maxItemsPerStudent) return null; // never an unbounded queue
    return {
      owner_uid: stats.owner_uid,
      question_id: stats.question_id,
      reason,
      status: "pending",
      stage: 0,
      due_at: at,
      last_reviewed_at: null,
      postponed_count: 0,
      created_at: at,
      updated_at: at,
      context,
      history: push([], at, "created", event.id, cfg.maxHistoryEvents),
    };
  }
  return {
    ...rec,
    reason,
    status: rec.status === "in_progress" ? "in_progress" : "pending",
    stage: 0,
    due_at: at,
    updated_at: at,
    context,
    history: push(rec.history, at, "failed", event.id, cfg.maxHistoryEvents),
  };
}

/** A weak-topic suggestion the student chose to add: lowest tier, due now. */
export function createSuggested(uid: string, questionId: string, context: RevisionContext, now: Date, cfg: RevisionConfig): RevisionRecord {
  const at = now.toISOString();
  return {
    owner_uid: uid,
    question_id: questionId,
    reason: "topic_weakness",
    status: "pending",
    stage: 0,
    due_at: at,
    last_reviewed_at: null,
    postponed_count: 0,
    created_at: at,
    updated_at: at,
    context,
    history: push([], at, "added", "weak topic suggestion", cfg.maxHistoryEvents),
  };
}

/** Student actions. Invalid transitions throw RevisionActionError (a 400 for the caller). */
export function applyAction(rec: RevisionRecord, req: RevisionActionRequest, now: Date, cfg: RevisionConfig): RevisionRecord {
  const at = now.toISOString();
  const keep = cfg.maxHistoryEvents;

  switch (req.action) {
    case "start": {
      if (rec.status === "in_progress") throw new RevisionActionError("This review is already in progress.");
      return { ...rec, status: "in_progress", updated_at: at, history: push(rec.history, at, "started", null, keep) };
    }
    case "complete": {
      if (rec.status !== "pending" && rec.status !== "in_progress") throw new RevisionActionError("Only a review that is due or in progress can be completed. Use revisit to review it early.");
      if (req.outcome !== "remembered" && req.outcome !== "struggled") throw new RevisionActionError('Say how it went: outcome must be "remembered" or "struggled".');
      const stage = req.outcome === "remembered" ? Math.min(rec.stage + 1, cfg.intervalsDays.length - 1) : 0;
      const settled = rec.context.solved && rec.context.consecutive_failures === 0;
      return {
        ...rec,
        reason: settled ? "spaced_review" : rec.reason,
        status: "scheduled",
        stage,
        due_at: addDaysIso(at, interval(cfg, stage)),
        last_reviewed_at: at,
        updated_at: at,
        history: push(rec.history, at, "completed", req.outcome, keep),
      };
    }
    case "postpone": {
      const days = req.days ?? cfg.postponeDays;
      if (!Number.isInteger(days) || days < 1 || days > cfg.maxPostponeDays) throw new RevisionActionError(`Postpone by 1 to ${cfg.maxPostponeDays} days.`);
      const from = Math.max(now.getTime(), Date.parse(rec.due_at));
      return {
        ...rec,
        status: "postponed",
        due_at: new Date(from + days * DAY_MS).toISOString(),
        postponed_count: rec.postponed_count + 1,
        updated_at: at,
        history: push(rec.history, at, "postponed", `${days} day${days === 1 ? "" : "s"}`, keep),
      };
    }
    case "revisit": {
      if (rec.status !== "scheduled" && rec.status !== "postponed") throw new RevisionActionError("This item is already due.");
      return { ...rec, status: "pending", due_at: at, updated_at: at, history: push(rec.history, at, "revisited", null, keep) };
    }
  }
}

const REASON_TEXT: Record<RevisionReason, (c: RevisionContext) => string> = {
  repeated_failure: (c) => `Failed ${c.consecutive_failures} times in a row (last result: ${verdictText(c.last_verdict)}).`,
  unsolved_attempted: (c) => `Attempted ${c.attempts} time${c.attempts === 1 ? "" : "s"} and not solved yet (last result: ${verdictText(c.last_verdict)}).`,
  spaced_review: (c) => `Solved after ${c.failures} failed attempt${c.failures === 1 ? "" : "s"}; scheduled for spaced review so it sticks.`,
  topic_weakness: (c) => `Added to practise a weak topic (${c.topics.slice(0, 2).join(", ") || "unknown"}).`,
};

const verdictText = (v: SubmissionVerdict | null) => (v ? v.replace(/_/g, " ") : "none");

export function toItem(r: RevisionRecord, title: string | null, now: Date): RevisionItem {
  return {
    question_id: r.question_id,
    title,
    reason: r.reason,
    priority: priorityOf(r, now),
    due_at: r.due_at,
    due: isDue(r, now),
    status: r.status,
    stage: r.stage,
    last_reviewed_at: r.last_reviewed_at,
    postponed_count: r.postponed_count,
    created_at: r.created_at,
    updated_at: r.updated_at,
    context: r.context,
    explanation: REASON_TEXT[r.reason](r.context),
    history: r.history,
  };
}

/** Queue order: priority tier, then earlier due date, then question id (stable). */
export const byPriority = (now: Date) => (a: RevisionRecord, b: RevisionRecord) =>
  priorityOf(a, now) - priorityOf(b, now) || a.due_at.localeCompare(b.due_at) || a.question_id.localeCompare(b.question_id);
