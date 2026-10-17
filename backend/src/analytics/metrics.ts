import type { BreakdownRow, PeriodComparison, PeriodStats, RateMetric, RecentActivity, RepeatedFailure, WeeklyBucket } from "../types.js";
import type { AnalyticsConfig, MetricsConfig } from "./config.js";
import type { StatsEvent, StatsRecord } from "./stats.js";

/**
 * Pure metric definitions over StatsRecord[] (eligible judged submissions only).
 *
 *  solved_unique        distinct questions with at least one accepted eligible submission
 *  attempted_unique     distinct questions with at least one eligible submission
 *  eligible_attempts    eligible submissions (judge errors, demonstrations, unverified providers excluded)
 *  submission_success   accepted submissions / eligible submissions
 *  first_attempt_success among attempted questions, those whose FIRST RECORDED eligible submission was accepted
 *  accuracy (row)       accepted / eligible submissions inside the topic or difficulty
 *  solve_rate (row)     questions solved / questions attempted inside the topic or difficulty
 * A ratio is only shown with at least `min*Sample` in its denominator; otherwise value is null.
 */

export function rate(numerator: number, denominator: number, minSample: number, what: string): RateMetric {
  const available = denominator >= minSample;
  return {
    value: available ? numerator / denominator : null,
    numerator,
    denominator,
    available,
    min_sample: minSample,
    note: available ? null : denominator === 0 ? `No ${what} yet.` : `Only ${denominator} ${what} so far; at least ${minSample} are needed before a percentage is meaningful.`,
  };
}

const DAY_MS = 86_400_000;

/** Monday 00:00 UTC of the week containing `iso`, as YYYY-MM-DD. */
export function weekStart(iso: string | Date): string {
  const d = new Date(typeof iso === "string" ? iso : iso.getTime());
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  const monday = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day);
  return new Date(monday).toISOString().slice(0, 10);
}

const addDays = (isoDate: string, n: number) => new Date(Date.parse(`${isoDate}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

/** One bucket per week from the week containing `from` through the week containing `to`, zeros included. */
export function weeklyBuckets(records: StatsRecord[], from: Date, to: Date): WeeklyBucket[] {
  const buckets = new Map<string, WeeklyBucket>();
  for (let w = weekStart(from); w <= weekStart(to); w = addDays(w, 7)) buckets.set(w, { week_start: w, attempts: 0, accepted: 0, first_solves: 0 });
  const lo = from.getTime();
  const hi = to.getTime();
  for (const r of records) {
    for (const e of r.events) {
      const t = Date.parse(e.at);
      if (t < lo || t > hi) continue;
      const b = buckets.get(weekStart(e.at));
      if (!b) continue;
      b.attempts += 1;
      if (e.verdict === "accepted") b.accepted += 1;
    }
    if (r.first_accepted_at) {
      const t = Date.parse(r.first_accepted_at);
      if (t >= lo && t <= hi) {
        const b = buckets.get(weekStart(r.first_accepted_at));
        if (b) b.first_solves += 1;
      }
    }
  }
  return [...buckets.values()];
}

function breakdown(records: StatsRecord[], keyOf: (r: StatsRecord) => string[], cfg: MetricsConfig): BreakdownRow[] {
  const rows = new Map<string, { attempts: number; accepted: number; attempted: number; solved: number }>();
  for (const r of records) {
    if (r.attempts === 0) continue;
    for (const key of new Set(keyOf(r))) {
      const row = rows.get(key) ?? { attempts: 0, accepted: 0, attempted: 0, solved: 0 };
      row.attempts += r.attempts;
      row.accepted += r.accepted;
      row.attempted += 1;
      if (r.accepted > 0) row.solved += 1;
      rows.set(key, row);
    }
  }
  return [...rows.entries()]
    .map(([key, v]) => ({
      key,
      attempts: v.attempts,
      accepted: v.accepted,
      questions_attempted: v.attempted,
      questions_solved: v.solved,
      accuracy: rate(v.accepted, v.attempts, cfg.minRateSample, "submissions"),
      solve_rate: rate(v.solved, v.attempted, cfg.minSolveRateSample, "attempted questions"),
    }))
    .sort((a, b) => b.attempts - a.attempts || a.key.localeCompare(b.key));
}

export const topicBreakdown = (records: StatsRecord[], cfg: MetricsConfig): BreakdownRow[] => breakdown(records, (r) => r.topics, cfg);

const DIFFICULTY_ORDER = ["easy", "medium", "hard"];
export const difficultyBreakdown = (records: StatsRecord[], cfg: MetricsConfig): BreakdownRow[] =>
  breakdown(records, (r) => [r.difficulty ?? "unknown"], cfg).sort((a, b) => DIFFICULTY_ORDER.indexOf(a.key) - DIFFICULTY_ORDER.indexOf(b.key));

function period(records: StatsRecord[], from: Date, to: Date, cfg: MetricsConfig): PeriodStats {
  let attempts = 0;
  let accepted = 0;
  for (const r of records) {
    for (const e of r.events) {
      const t = Date.parse(e.at);
      if (t >= from.getTime() && t < to.getTime()) {
        attempts += 1;
        if (e.verdict === "accepted") accepted += 1;
      }
    }
  }
  return { from: from.toISOString(), to: to.toISOString(), attempts, accepted, accuracy: rate(accepted, attempts, cfg.minRateSample, "submissions in this period") };
}

/** Last N days against the N days before them. Unavailable unless BOTH periods meet the minimum sample. */
export function compare(records: StatsRecord[], now: Date, cfg: MetricsConfig): PeriodComparison {
  const span = cfg.comparisonWindowDays * DAY_MS;
  const current = period(records, new Date(now.getTime() - span), new Date(now.getTime() + 1), cfg);
  const previous = period(records, new Date(now.getTime() - 2 * span), new Date(now.getTime() - span), cfg);
  const available = current.accuracy.available && previous.accuracy.available;
  return {
    available,
    note: available ? null : `A comparison needs at least ${cfg.minRateSample} submissions in each of the last two ${cfg.comparisonWindowDays}-day periods (you have ${current.attempts} and ${previous.attempts}).`,
    current,
    previous,
  };
}

export function recentActivity(records: StatsRecord[], titleOf: (id: string) => string | null, limit: number): RecentActivity[] {
  const all: (StatsEvent & { question_id: string })[] = [];
  for (const r of records) for (const e of r.events) all.push({ ...e, question_id: r.question_id });
  return all
    .sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id))
    .slice(0, limit)
    .map((e) => ({ submission_id: e.id, question_id: e.question_id, title: titleOf(e.question_id), verdict: e.verdict, at: e.at }));
}

export function repeatedFailures(records: StatsRecord[], threshold: number, titleOf: (id: string) => string | null): RepeatedFailure[] {
  return records
    .filter((r) => r.consecutive_failures >= threshold)
    .sort((a, b) => b.consecutive_failures - a.consecutive_failures || (b.last_attempt_at ?? "").localeCompare(a.last_attempt_at ?? ""))
    .map((r) => ({
      question_id: r.question_id,
      title: titleOf(r.question_id),
      consecutive_failures: r.consecutive_failures,
      attempts: r.attempts,
      last_verdict: r.last_verdict,
      last_attempt_at: r.last_attempt_at,
    }));
}

export function totals(records: StatsRecord[]) {
  let solved = 0;
  let attempted = 0;
  let attempts = 0;
  let accepted = 0;
  for (const r of records) {
    if (r.attempts > 0) attempted += 1;
    if (r.accepted > 0) solved += 1;
    attempts += r.attempts;
    accepted += r.accepted;
  }
  return { solved_unique: solved, attempted_unique: attempted, eligible_attempts: attempts, accepted_attempts: accepted };
}

export function firstAttemptSuccess(records: StatsRecord[], cfg: AnalyticsConfig["metrics"]): RateMetric {
  const withFirst = records.filter((r) => r.first_attempt !== null);
  const ok = withFirst.filter((r) => r.first_attempt!.verdict === "accepted").length;
  return rate(ok, withFirst.length, cfg.minRateSample, "questions with a recorded first attempt");
}
