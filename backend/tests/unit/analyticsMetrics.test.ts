import { describe, expect, it } from "vitest";
import { DEFAULT_ANALYTICS_CONFIG } from "../../src/analytics/config.js";
import { compare, difficultyBreakdown, firstAttemptSuccess, rate, recentActivity, repeatedFailures, topicBreakdown, totals, weekStart, weeklyBuckets } from "../../src/analytics/metrics.js";
import { applyEvent, type CountedVerdict, type StatsRecord } from "../../src/analytics/stats.js";
import type { DsaDifficulty } from "../../src/types.js";

const M = DEFAULT_ANALYTICS_CONFIG.metrics;
const NOW = new Date("2026-06-15T12:00:00Z"); // a Monday

/** Builds one question's rollup by folding events in order, exactly as production does. */
function question(id: string, topics: string[], difficulty: DsaDifficulty, events: [string, CountedVerdict][], uid = "u1"): StatsRecord {
  let rec: StatsRecord | null = null;
  events.forEach(([at, verdict], i) => {
    rec = applyEvent(rec, { id: `${id}-s${i}`, at, verdict }, { owner_uid: uid, question_id: id, topics, difficulty }, M.maxEventsPerQuestion, at).record;
  });
  return rec!;
}

const d = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();

describe("applyEvent (per-question rollup)", () => {
  it("counts attempts, acceptance, failure kinds and the first attempt", () => {
    const r = question("q1", ["Arrays"], "easy", [
      [d(10), "wrong_answer"],
      [d(9), "compile_error"],
      [d(8), "accepted"],
      [d(7), "time_limit_exceeded"],
    ]);
    expect(r).toMatchObject({ attempts: 4, accepted: 1, consecutive_failures: 1, failures_after_solved: 1, last_verdict: "time_limit_exceeded" });
    expect(r.failures).toEqual({ wrong_answer: 1, compile_error: 1, time_limit_exceeded: 1, runtime_error: 0 });
    expect(r.first_attempt).toEqual({ verdict: "wrong_answer", at: d(10) });
    expect(r.first_accepted_at).toBe(d(8));
  });

  it("is idempotent: the same submission id never counts twice", () => {
    const meta = { owner_uid: "u1", question_id: "q1", topics: ["Arrays"], difficulty: "easy" as const };
    const first = applyEvent(null, { id: "s1", at: d(1), verdict: "accepted" }, meta, 50, d(1));
    const again = applyEvent(first.record, { id: "s1", at: d(1), verdict: "accepted" }, meta, 50, d(0));
    expect(first.applied).toBe(true);
    expect(again.applied).toBe(false);
    expect(again.record.attempts).toBe(1);
    expect(again.record.accepted).toBe(1);
  });

  it("bounds the event list but keeps lifetime counters", () => {
    const events: [string, CountedVerdict][] = Array.from({ length: 60 }, (_v, i) => [new Date(NOW.getTime() - (60 - i) * 60_000).toISOString(), "wrong_answer"]);
    const r = question("q1", [], "easy", events);
    expect(r.events).toHaveLength(50);
    expect(r.attempts).toBe(60);
    expect(r.failures.wrong_answer).toBe(60);
  });
});

describe("overall metrics", () => {
  const records = [
    question("a", ["Arrays"], "easy", [[d(20), "accepted"], [d(19), "accepted"], [d(18), "accepted"]]), // three accepted submissions, one question
    question("b", ["Arrays", "Hash Table"], "medium", [[d(15), "wrong_answer"], [d(14), "accepted"]]),
    question("c", ["Graphs"], "hard", [[d(12), "wrong_answer"], [d(11), "wrong_answer"]]),
  ];

  it("counts unique solved questions, not accepted submissions, and separates attempted from solved", () => {
    expect(totals(records)).toEqual({ solved_unique: 2, attempted_unique: 3, eligible_attempts: 7, accepted_attempts: 4 });
  });

  it("hides first-attempt and success percentages below the minimum sample, with the sample size", () => {
    const first = firstAttemptSuccess(records, M);
    expect(first).toMatchObject({ available: false, value: null, numerator: 1, denominator: 3, min_sample: 5 });
    expect(first.note).toMatch(/Only 3/);
    expect(rate(0, 0, 5, "submissions").note).toBe("No submissions yet.");
  });

  it("computes first-attempt success over questions once the sample is large enough", () => {
    const many = Array.from({ length: 5 }, (_v, i) => question(`x${i}`, ["Arrays"], "easy", [[d(5), i < 2 ? "accepted" : "wrong_answer"]]));
    const first = firstAttemptSuccess(many, M);
    expect(first).toMatchObject({ available: true, numerator: 2, denominator: 5 });
    expect(first.value).toBeCloseTo(0.4);
  });

  it("aggregates topics (a question counts in each of its topics) with explicit denominators", () => {
    const rows = Object.fromEntries(topicBreakdown(records, M).map((r) => [r.key, r]));
    expect(rows["Arrays"]).toMatchObject({ attempts: 5, accepted: 4, questions_attempted: 2, questions_solved: 2 });
    expect(rows["Arrays"]!.accuracy).toMatchObject({ numerator: 4, denominator: 5, available: true });
    expect(rows["Arrays"]!.accuracy.value).toBeCloseTo(0.8);
    expect(rows["Arrays"]!.solve_rate).toMatchObject({ numerator: 2, denominator: 2, available: false }); // 2 questions < 3
    expect(rows["Hash Table"]).toMatchObject({ attempts: 2, accepted: 1, questions_attempted: 1 });
    expect(rows["Graphs"]).toMatchObject({ attempts: 2, accepted: 0, questions_solved: 0 });
    expect(rows["Graphs"]!.accuracy.available).toBe(false);
  });

  it("aggregates difficulties in easy, medium, hard order", () => {
    const rows = difficultyBreakdown(records, M);
    expect(rows.map((r) => [r.key, r.attempts, r.accepted, r.questions_solved])).toEqual([
      ["easy", 3, 3, 1],
      ["medium", 2, 1, 1],
      ["hard", 2, 0, 0],
    ]);
  });

  it("lists repeatedly failed questions and the most recent activity", () => {
    const three = question("r", ["Dp"], "hard", [[d(3), "wrong_answer"], [d(2), "runtime_error"], [d(1), "wrong_answer"]]);
    expect(repeatedFailures([...records, three], 3, (id) => `T-${id}`)).toEqual([
      expect.objectContaining({ question_id: "r", title: "T-r", consecutive_failures: 3, attempts: 3, last_verdict: "wrong_answer" }),
    ]);
    const recent = recentActivity([...records, three], () => null, 3);
    expect(recent.map((r) => r.submission_id)).toEqual(["r-s2", "r-s1", "r-s0"]);
  });

  it("an empty history gives zeros and unavailable metrics, not errors", () => {
    expect(totals([])).toEqual({ solved_unique: 0, attempted_unique: 0, eligible_attempts: 0, accepted_attempts: 0 });
    expect(firstAttemptSuccess([], M).available).toBe(false);
    expect(topicBreakdown([], M)).toEqual([]);
    expect(compare([], NOW, M).available).toBe(false);
  });
});

describe("time-based metrics", () => {
  it("weeks start on Monday (UTC)", () => {
    expect(weekStart("2026-06-15T12:00:00Z")).toBe("2026-06-15");
    expect(weekStart("2026-06-21T23:59:59Z")).toBe("2026-06-15");
    expect(weekStart("2026-06-22T00:00:00Z")).toBe("2026-06-22");
    expect(weekStart("2026-06-14T10:00:00Z")).toBe("2026-06-08");
  });

  it("buckets weekly attempts, accepted submissions and first solves, including empty weeks", () => {
    const a = question("a", [], "easy", [["2026-06-02T10:00:00Z", "wrong_answer"], ["2026-06-03T10:00:00Z", "accepted"]]);
    const b = question("b", [], "easy", [["2026-06-16T10:00:00Z", "accepted"]]);
    const buckets = weeklyBuckets([a, b], new Date("2026-05-25T00:00:00Z"), new Date("2026-06-20T00:00:00Z"));
    expect(buckets.map((x) => x.week_start)).toEqual(["2026-05-25", "2026-06-01", "2026-06-08", "2026-06-15"]);
    expect(buckets.map((x) => [x.attempts, x.accepted, x.first_solves])).toEqual([[0, 0, 0], [2, 1, 1], [0, 0, 0], [1, 1, 1]]);
  });

  it("compares the last 28 days with the 28 before, only when both have enough submissions", () => {
    const few = question("a", [], "easy", [[d(5), "accepted"], [d(40), "wrong_answer"]]);
    const c1 = compare([few], NOW, M);
    expect(c1.available).toBe(false);
    expect(c1.note).toMatch(/you have 1 and 1/);

    const recentOnes: [string, CountedVerdict][] = [[d(2), "accepted"], [d(3), "accepted"], [d(4), "accepted"], [d(5), "wrong_answer"], [d(6), "accepted"]];
    const olderOnes: [string, CountedVerdict][] = [[d(30), "wrong_answer"], [d(31), "wrong_answer"], [d(32), "accepted"], [d(33), "wrong_answer"], [d(34), "wrong_answer"]];
    const full = compare([question("a", [], "easy", [...olderOnes, ...recentOnes])], NOW, M);
    expect(full.available).toBe(true);
    expect(full.current).toMatchObject({ attempts: 5, accepted: 4 });
    expect(full.previous).toMatchObject({ attempts: 5, accepted: 1 });
    expect(full.current.accuracy.value).toBeCloseTo(0.8);
    expect(full.previous.accuracy.value).toBeCloseTo(0.2);
  });
});
