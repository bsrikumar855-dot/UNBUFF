import type { DsaDifficulty, SubmissionVerdict } from "../types.js";

/**
 * Per student and question rollup of ELIGIBLE judged submissions (see AnalyticsStatus). Dashboards read
 * these small records instead of scanning a student's whole submission history.
 */

export type CountedVerdict = Exclude<SubmissionVerdict, "judge_error">;
export type FailureVerdict = Exclude<CountedVerdict, "accepted">;

/** wrong answer and time limit exceeded point at the algorithm; compile and runtime errors are technical. */
export const ALGORITHMIC: readonly FailureVerdict[] = ["wrong_answer", "time_limit_exceeded"];
export const TECHNICAL: readonly FailureVerdict[] = ["compile_error", "runtime_error"];

export interface StatsEvent {
  id: string; // the submission id: the idempotency key
  at: string;
  verdict: CountedVerdict;
}

export interface StatsRecord {
  owner_uid: string;
  question_id: string;
  topics: string[];
  difficulty: DsaDifficulty | null;
  attempts: number;
  accepted: number;
  first_attempt: { verdict: CountedVerdict; at: string } | null;
  first_accepted_at: string | null;
  last_attempt_at: string | null;
  last_verdict: CountedVerdict | null;
  failures: Record<FailureVerdict, number>;
  consecutive_failures: number; // failures since the last acceptance
  failures_after_solved: number; // failures since the first acceptance
  events: StatsEvent[]; // most recent first-in-last, bounded
  updated_at: string;
}

export interface StatsMeta {
  owner_uid: string;
  question_id: string;
  topics: string[];
  difficulty: DsaDifficulty | null;
}

export const emptyFailures = (): Record<FailureVerdict, number> => ({ wrong_answer: 0, time_limit_exceeded: 0, compile_error: 0, runtime_error: 0 });

/**
 * Folds one judged submission into a question's rollup. Pure and idempotent: an event id already in
 * `events` changes nothing (`applied: false`), so retries and duplicate deliveries cannot inflate totals.
 */
export function applyEvent(prev: StatsRecord | null, event: StatsEvent, meta: StatsMeta, maxEvents: number, now: string): { record: StatsRecord; applied: boolean } {
  const base: StatsRecord = prev ?? {
    owner_uid: meta.owner_uid,
    question_id: meta.question_id,
    topics: meta.topics,
    difficulty: meta.difficulty,
    attempts: 0,
    accepted: 0,
    first_attempt: null,
    first_accepted_at: null,
    last_attempt_at: null,
    last_verdict: null,
    failures: emptyFailures(),
    consecutive_failures: 0,
    failures_after_solved: 0,
    events: [],
    updated_at: now,
  };
  if (base.events.some((e) => e.id === event.id)) return { record: base, applied: false };

  const r: StatsRecord = { ...base, failures: { ...base.failures }, events: [...base.events], topics: meta.topics, difficulty: meta.difficulty };
  r.attempts += 1;
  r.first_attempt = r.first_attempt ?? { verdict: event.verdict, at: event.at };
  if (event.verdict === "accepted") {
    r.accepted += 1;
    r.first_accepted_at = r.first_accepted_at ?? event.at;
    r.consecutive_failures = 0;
  } else {
    r.failures[event.verdict] += 1;
    r.consecutive_failures += 1;
    if (r.first_accepted_at !== null) r.failures_after_solved += 1;
  }
  if (r.last_attempt_at === null || event.at >= r.last_attempt_at) {
    r.last_attempt_at = event.at;
    r.last_verdict = event.verdict;
  }
  r.events.push(event);
  if (r.events.length > maxEvents) r.events = r.events.slice(r.events.length - maxEvents);
  r.updated_at = now;
  return { record: r, applied: true };
}

export const totalFailures = (r: StatsRecord): number => ALGORITHMIC.concat(TECHNICAL).reduce((s, v) => s + r.failures[v as FailureVerdict], 0);
export const algorithmicFailures = (r: StatsRecord): number => ALGORITHMIC.reduce((s, v) => s + r.failures[v], 0);
export const technicalFailures = (r: StatsRecord): number => TECHNICAL.reduce((s, v) => s + r.failures[v], 0);
