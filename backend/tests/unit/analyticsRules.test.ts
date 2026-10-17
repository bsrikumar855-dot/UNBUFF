import { describe, expect, it } from "vitest";
import { DEFAULT_ANALYTICS_CONFIG } from "../../src/analytics/config.js";
import { applyAction, byPriority, createSuggested, onSubmission, priorityOf, RevisionActionError, toItem, type RevisionRecord } from "../../src/analytics/revision.js";
import { applyEvent, type CountedVerdict, type StatsRecord } from "../../src/analytics/stats.js";
import { detectWeaknesses } from "../../src/analytics/weakness.js";
import type { DsaDifficulty } from "../../src/types.js";

const W = DEFAULT_ANALYTICS_CONFIG.weakness;
const R = DEFAULT_ANALYTICS_CONFIG.revision;
const NOW = new Date("2026-06-15T12:00:00.000Z");
const day = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString();

function question(id: string, topics: string[], events: [number, CountedVerdict][], difficulty: DsaDifficulty = "medium"): StatsRecord {
  let rec: StatsRecord | null = null;
  events.forEach(([daysAgo, verdict], i) => {
    const at = day(-daysAgo);
    rec = applyEvent(rec, { id: `${id}-${i}`, at, verdict }, { owner_uid: "u1", question_id: id, topics, difficulty }, 50, at).record;
  });
  return rec!;
}

const status = (records: StatsRecord[], topic = "Arrays") => detectWeaknesses(records, NOW, W).find((w) => w.topic === topic)!;

describe("weakness detection", () => {
  it("never calls a topic weak after a single failed question", () => {
    const w = status([question("a", ["Arrays"], [[1, "wrong_answer"], [1, "wrong_answer"], [1, "wrong_answer"], [1, "wrong_answer"], [1, "wrong_answer"]])]);
    expect(w.status).toBe("insufficient_data"); // 1 question, however many failures
    expect(w.explanation[0]).toMatch(/1 question and 5 submissions/);
    expect(w.explanation[0]).toMatch(/needs at least 3 questions and 5 submissions/);
  });

  it("needs both enough questions and enough submissions", () => {
    const three = ["a", "b", "c"].map((id) => question(id, ["Arrays"], [[1, "wrong_answer"]])); // 3 questions, 3 submissions
    expect(status(three).status).toBe("insufficient_data");
    const withMore = [...three.slice(0, 2), question("c", ["Arrays"], [[1, "wrong_answer"], [1, "wrong_answer"], [1, "wrong_answer"]])]; // 3 q, 5 attempts
    expect(status(withMore).status).toBe("weak");
  });

  it("flags a real knowledge gap with the evidence that triggered it", () => {
    const records = [
      question("a", ["Graphs"], [[5, "wrong_answer"], [4, "wrong_answer"]]),
      question("b", ["Graphs"], [[5, "time_limit_exceeded"], [4, "wrong_answer"]]),
      question("c", ["Graphs"], [[3, "wrong_answer"], [2, "accepted"]]),
      question("d", ["Graphs"], [[2, "wrong_answer"]]),
    ];
    const w = status(records, "Graphs");
    expect(w.status).toBe("weak");
    expect(w.evidence).toMatchObject({ questions_attempted: 4, questions_solved: 1, attempts: 7, accepted: 1, algorithmic_failures: 6, technical_failures: 0 });
    expect(w.explanation.join(" ")).toMatch(/3 of 4 attempted questions are still unsolved \(solve rate 25%\)/);
    expect(w.explanation.join(" ")).toMatch(/6 wrong-answer or time-limit failures across 7 submissions/);
  });

  it("separates technical failures from algorithmic gaps instead of blaming the topic", () => {
    const records = ["a", "b", "c"].map((id, i) => question(id, ["Strings"], [[3 + i, "compile_error"], [2 + i, "runtime_error"]]));
    const w = status(records, "Strings");
    expect(w.status).toBe("technical_issues");
    expect(w.evidence).toMatchObject({ technical_failures: 6, algorithmic_failures: 0 });
    expect(w.explanation[0]).toMatch(/not evidence of a topic gap/);
  });

  it("technical errors alongside real solving do not make a topic weak", () => {
    const records = ["a", "b", "c"].map((id) => question(id, ["Dp"], [[4, "compile_error"], [3, "runtime_error"], [2, "accepted"]]));
    const w = status(records, "Dp");
    expect(w.status).toBe("technical_issues"); // 6 technical failures, no algorithmic ones, every question solved
    expect(w.status).not.toBe("weak");
  });

  it("treats repeated failures on questions that were already solved as forgetting", () => {
    const relapsing = (id: string) => question(id, ["Trees"], [[10, "accepted"], [3, "wrong_answer"], [2, "wrong_answer"]]);
    const records = [relapsing("a"), relapsing("b"), question("c", ["Trees"], [[4, "accepted"]])];
    const w = status(records, "Trees");
    expect(w.status).toBe("weak");
    expect(w.evidence.revision_regressions).toBe(2);
    expect(w.explanation.join(" ")).toMatch(/2 questions you had solved failed again/);
  });

  it("calls solid results strong and mixed ones a watch item", () => {
    const strong = ["a", "b", "c"].map((id) => question(id, ["Arrays"], [[2, "accepted"], [1, "accepted"]]));
    expect(status(strong).status).toBe("strong");
    const mixed = [question("a", ["Arrays"], [[3, "accepted"], [2, "accepted"]]), question("b", ["Arrays"], [[3, "wrong_answer"], [2, "wrong_answer"], [1, "accepted"]]), question("c", ["Arrays"], [[3, "wrong_answer"]])];
    expect(status(mixed).status).toBe("watch");
  });

  it("reports recent improvement or regression only with enough recent and earlier data", () => {
    const improving = [
      question("a", ["Arrays"], [[25, "wrong_answer"], [24, "wrong_answer"], [23, "wrong_answer"], [3, "accepted"], [2, "accepted"], [1, "accepted"]]),
      question("b", ["Arrays"], [[22, "wrong_answer"], [2, "accepted"]]),
      question("c", ["Arrays"], [[4, "accepted"]]),
    ];
    expect(status(improving).trend).toBe("improving");
    const declining = [
      question("a", ["Arrays"], [[25, "accepted"], [24, "accepted"], [23, "accepted"], [3, "wrong_answer"], [2, "wrong_answer"], [1, "wrong_answer"]]),
      question("b", ["Arrays"], [[22, "accepted"], [2, "wrong_answer"]]),
      question("c", ["Arrays"], [[4, "wrong_answer"]]),
    ];
    expect(status(declining).trend).toBe("declining");
    expect(status([question("a", ["Arrays"], [[2, "accepted"]])]).trend).toBe("insufficient_data");
  });

  it("returns nothing for an empty history and ignores topics with no activity", () => {
    expect(detectWeaknesses([], NOW, W)).toEqual([]);
  });

  it("thresholds are configurable", () => {
    const records = [question("a", ["Arrays"], [[1, "wrong_answer"], [1, "wrong_answer"]]), question("b", ["Arrays"], [[1, "wrong_answer"]])];
    expect(detectWeaknesses(records, NOW, W)[0]!.status).toBe("insufficient_data");
    const eager = { ...W, minQuestions: 2, minAttempts: 3, minAlgorithmicFailures: 3, weakSolveRate: 0.5 };
    expect(detectWeaknesses(records, NOW, eager)[0]!.status).toBe("weak");
  });
});

const NOW_FIXED = NOW;
const stats = (verdicts: CountedVerdict[], id = "q1") => question(id, ["Arrays"], verdicts.map((v, i) => [verdicts.length - i, v]));
const fail = (rec: RevisionRecord | null, s: StatsRecord, n = 0, now = NOW_FIXED) => onSubmission(rec, s, s.events.at(-1)!, s.events.at(-1)!.verdict, now, R, W.repeatedFailureThreshold, n);

describe("revision rules", () => {
  it("a first failure creates one due item for an unsolved attempted question (tier 2)", () => {
    const s = stats(["wrong_answer"]);
    const item = fail(null, s)!;
    expect(item).toMatchObject({ reason: "unsolved_attempted", status: "pending", stage: 0, due_at: NOW.toISOString(), question_id: "q1", owner_uid: "u1" });
    expect(priorityOf(item, NOW)).toBe(2);
    expect(item.context).toMatchObject({ attempts: 1, failures: 1, consecutive_failures: 1, solved: false });
    expect(item.history.map((h) => h.event)).toEqual(["created"]);
  });

  it("a new failure updates the same item and escalates to repeated failure (tier 1) instead of duplicating", () => {
    const first = fail(null, stats(["wrong_answer"]))!;
    const second = fail(first, stats(["wrong_answer", "runtime_error"]), 1)!;
    expect(second.reason).toBe("unsolved_attempted");
    const third = fail(second, stats(["wrong_answer", "runtime_error", "wrong_answer"]), 1)!;
    expect(third).toMatchObject({ reason: "repeated_failure", question_id: "q1", created_at: first.created_at });
    expect(priorityOf(third, NOW)).toBe(1);
    expect(third.history.map((h) => h.event)).toEqual(["created", "failed", "failed"]);
  });

  it("is idempotent per submission: replaying an event changes nothing", () => {
    const s = stats(["wrong_answer"]);
    const item = fail(null, s)!;
    expect(fail(item, s, 1)).toBe(item);
  });

  it("an accepted submission turns an existing item into spaced review, due after the first interval", () => {
    const failing = fail(null, stats(["wrong_answer", "wrong_answer"]))!;
    const solved = stats(["wrong_answer", "wrong_answer", "accepted"]);
    const item = fail(failing, solved, 1)!;
    expect(item).toMatchObject({ reason: "spaced_review", status: "scheduled", stage: 0, due_at: day(1), last_reviewed_at: NOW.toISOString() });
    expect(priorityOf(item, NOW)).toBe(4); // upcoming
    expect(priorityOf(item, new Date(day(2)))).toBe(3); // overdue
    expect(item.history.at(-1)!.event).toBe("solved");
  });

  it("an accepted submission without an item creates nothing (a clean solve needs no revision)", () => {
    expect(fail(null, stats(["accepted"]))).toBeNull();
  });

  it("a failure after a spaced review reopens the item as due", () => {
    const failing = fail(null, stats(["wrong_answer"]))!;
    const scheduled = fail(failing, stats(["wrong_answer", "accepted"]), 1)!;
    const later = new Date(day(5));
    const again = fail(scheduled, stats(["wrong_answer", "accepted", "wrong_answer"]), 1, later)!;
    expect(again).toMatchObject({ status: "pending", stage: 0, due_at: later.toISOString(), reason: "unsolved_attempted" });
  });

  it("never creates unlimited items", () => {
    expect(fail(null, stats(["wrong_answer"]), R.maxItemsPerStudent)).toBeNull();
    expect(fail(null, stats(["wrong_answer"]), R.maxItemsPerStudent - 1)).not.toBeNull();
  });

  it("orders the queue by tier, then due date, then id", () => {
    const mk = (id: string, reason: RevisionRecord["reason"], dueDays: number): RevisionRecord => ({ ...fail(null, stats(["wrong_answer"], id))!, reason, due_at: day(dueDays) });
    const items = [mk("e", "topic_weakness", -5), mk("d", "spaced_review", 3), mk("c", "spaced_review", -1), mk("b", "unsolved_attempted", -2), mk("a", "repeated_failure", 0), mk("a2", "repeated_failure", -3)];
    expect(items.sort(byPriority(NOW)).map((i) => [i.question_id, priorityOf(i, NOW)])).toEqual([["a2", 1], ["a", 1], ["b", 2], ["c", 3], ["d", 4], ["e", 5]]);
  });
});

describe("revision actions", () => {
  const base = (): RevisionRecord => fail(fail(null, stats(["wrong_answer"]))!, stats(["wrong_answer", "accepted"]), 1)!; // scheduled spaced review, solved
  const due = (): RevisionRecord => ({ ...base(), status: "pending", due_at: NOW.toISOString() });

  it("start moves a due item to in progress and cannot be repeated", () => {
    const started = applyAction(due(), { action: "start" }, NOW, R);
    expect(started.status).toBe("in_progress");
    expect(() => applyAction(started, { action: "start" }, NOW, R)).toThrow(RevisionActionError);
  });

  it("complete 'remembered' climbs the interval schedule and caps at the last interval", () => {
    let rec = due();
    const gaps: number[] = [];
    for (let i = 0; i < 7; i++) {
      rec = applyAction({ ...rec, status: "pending" }, { action: "complete", outcome: "remembered" }, NOW, R);
      gaps.push(Math.round((Date.parse(rec.due_at) - NOW.getTime()) / 86_400_000));
    }
    expect(gaps).toEqual([3, 7, 14, 30, 30, 30, 30]);
    expect(rec).toMatchObject({ status: "scheduled", reason: "spaced_review", last_reviewed_at: NOW.toISOString() });
  });

  it("complete 'struggled' returns to the first interval", () => {
    const climbed = applyAction({ ...due(), stage: 3 }, { action: "complete", outcome: "struggled" }, NOW, R);
    expect(climbed.stage).toBe(0);
    expect(climbed.due_at).toBe(day(1));
    expect(climbed.history.at(-1)).toMatchObject({ event: "completed", detail: "struggled" });
  });

  it("complete needs an outcome and a due or in-progress item", () => {
    expect(() => applyAction(due(), { action: "complete" }, NOW, R)).toThrow(/outcome/);
    expect(() => applyAction(base(), { action: "complete", outcome: "remembered" }, NOW, R)).toThrow(/revisit/);
  });

  it("completing an unsolved item keeps its reason (it must still be solved by a judged submission)", () => {
    const unsolved = fail(null, stats(["wrong_answer", "wrong_answer"]))!;
    const done = applyAction(unsolved, { action: "complete", outcome: "remembered" }, NOW, R);
    expect(done.reason).toBe("unsolved_attempted");
    expect(done.context.solved).toBe(false);
  });

  it("postpone pushes the due date forward from the later of now and the current due date, within limits", () => {
    const p1 = applyAction(due(), { action: "postpone" }, NOW, R);
    expect(p1).toMatchObject({ status: "postponed", postponed_count: 1, due_at: day(2) });
    const p2 = applyAction(p1, { action: "postpone", days: 3 }, NOW, R);
    expect(p2).toMatchObject({ postponed_count: 2, due_at: day(5) });
    expect(() => applyAction(due(), { action: "postpone", days: 0 }, NOW, R)).toThrow(/1 to 14/);
    expect(() => applyAction(due(), { action: "postpone", days: 15 }, NOW, R)).toThrow(/1 to 14/);
    expect(() => applyAction(due(), { action: "postpone", days: 1.5 }, NOW, R)).toThrow(RevisionActionError);
  });

  it("revisit brings a scheduled or postponed item back to due, and rejects items that are already due", () => {
    const back = applyAction(base(), { action: "revisit" }, NOW, R);
    expect(back).toMatchObject({ status: "pending", due_at: NOW.toISOString() });
    expect(() => applyAction(back, { action: "revisit" }, NOW, R)).toThrow(/already due/);
  });

  it("a later failure after completing or postponing reprioritizes the same item", () => {
    const completed = applyAction(due(), { action: "complete", outcome: "remembered" }, NOW, R);
    const failed = fail(completed, stats(["wrong_answer", "accepted", "wrong_answer"]), 1, new Date(day(2)))!;
    expect(failed).toMatchObject({ status: "pending", stage: 0, question_id: "q1" });
    const postponed = applyAction(failed, { action: "postpone" }, new Date(day(2)), R);
    const failedAgain = fail(postponed, stats(["wrong_answer", "accepted", "wrong_answer", "wrong_answer"]), 1, new Date(day(3)))!;
    expect(failedAgain.status).toBe("pending");
    expect(failedAgain.history.length).toBeLessThanOrEqual(R.maxHistoryEvents);
  });

  it("keeps history bounded", () => {
    let rec = due();
    for (let i = 0; i < 40; i++) rec = applyAction({ ...rec, status: "pending" }, { action: "complete", outcome: "remembered" }, NOW, R);
    expect(rec.history).toHaveLength(R.maxHistoryEvents);
  });

  it("explains each item in plain language", () => {
    const item = toItem(createSuggested("u1", "q9", { attempts: 0, failures: 0, consecutive_failures: 0, last_verdict: null, topics: ["Graphs"], difficulty: "easy", solved: false }, NOW, R), "Nine", NOW);
    expect(item).toMatchObject({ priority: 5, due: true, title: "Nine", reason: "topic_weakness" });
    expect(item.explanation).toMatch(/weak topic \(Graphs\)/);
  });
});
