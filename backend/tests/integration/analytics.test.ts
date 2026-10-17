import request from "supertest";
import { describe, expect, it } from "vitest";
import { AnalyticsService } from "../../src/analytics/service.js";
import { MemoryRevisionStore, MemoryStatsStore } from "../../src/analytics/stores.js";
import type { StatsRecord } from "../../src/analytics/stats.js";
import { CodeService } from "../../src/code/service.js";
import { MemorySubmissionStore } from "../../src/code/submissionStore.js";
import { parseSuiteFile, SuiteRegistry } from "../../src/code/suites.js";
import { DsaProgressService } from "../../src/dsa/progressService.js";
import { MemoryProgressStore } from "../../src/dsa/progressStore.js";
import { FakeProvider } from "../code/fakeProvider.js";
import { silentLogger } from "../helpers.js";
import { bearer, fixtureCatalogue, fixtureSuites, testApp } from "./app.js";

/**
 * These tests use FakeProvider (marker words decide the outcome), so they prove how stored judged results are
 * counted. They do not prove that any real code was compiled or run.
 */

const QUESTIONS = Array.from({ length: 12 }, (_v, i) => `q_fixture_${String(i + 1).padStart(2, "0")}`);

/** A topic carried by at least `min` of the suite questions, with those questions (derived from the fixture, not hard-coded). */
function topicWith(min: number): { topic: string; ids: string[] } {
  const cat = fixtureCatalogue();
  const counts = new Map<string, string[]>();
  for (const id of QUESTIONS) for (const t of cat.summary(id)!.topics) counts.set(t, [...(counts.get(t) ?? []), id]);
  const [topic, ids] = [...counts.entries()].filter(([, v]) => v.length >= min).sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))[0]!;
  return { topic, ids };
}

function suites(ids: string[], demonstration = false) {
  return new SuiteRegistry(
    parseSuiteFile({
      schema_version: 1,
      suites: ids.map((question_id) => ({
        question_id,
        revision: "t1",
        is_demonstration: demonstration,
        statement: null,
        source: { name: "test suite", license_status: demonstration ? "development_fixture" : "own_work", license_note: "written for tests" },
        samples: [{ input: "s\n", expected_output: "s\n" }],
        tests: ["1", "2", "3", "4", "5"].map((n) => ({ input: `${n}\n`, expected_output: `${n}\n` })),
        limits: { cpu_time_seconds: 2, memory_mb: 128 },
        starter_code: {},
        eligibility: { analytics_eligible: !demonstration, reason: demonstration ? "demonstration suite" : "test suite declared eligible" },
      })),
    }),
  );
}

class FlakyStats extends MemoryStatsStore {
  failing = false;
  override async put(r: StatsRecord): Promise<void> {
    if (this.failing) throw new Error("stats store down");
    return super.put(r);
  }
}

function setup(opts: { verified?: boolean; suites?: SuiteRegistry; provider?: FakeProvider } = {}) {
  const catalogue = fixtureCatalogue();
  const progressStore = new MemoryProgressStore();
  const submissionStore = new MemorySubmissionStore();
  const stats = new FlakyStats();
  const revisions = new MemoryRevisionStore();
  const progress = new DsaProgressService(progressStore, () => catalogue);
  const analytics = new AnalyticsService({ stats, revisions, submissions: submissionStore, progress, catalogue: () => catalogue, logger: silentLogger });
  const provider = opts.provider ?? new FakeProvider();
  const code = new CodeService({
    provider,
    suites: opts.suites ?? suites(QUESTIONS),
    catalogue: () => catalogue,
    progress,
    submissions: submissionStore,
    logger: silentLogger,
    providerVerified: opts.verified ?? true,
    allowMockToCount: true, // TEST ONLY: FakeProvider is a mock; this lets the pipeline be exercised
    onJudged: (r) => analytics.recordSubmission(r),
  });
  const app = testApp({ autoAuth: false, code, analytics, catalogue, progressStore, submissionStore });
  return { app, stats, revisions, submissionStore, provider, progressStore };
}

type Ctx = ReturnType<typeof setup>;
const as = (uid: string) => ({ Authorization: bearer(uid) });
const submit = (c: Ctx, uid: string, q: string, source: string) => request(c.app).post("/api/code/submit").set(as(uid)).send({ question_id: q, language: "python", source });
const overview = async (c: Ctx, uid: string) => (await request(c.app).get("/api/me/dsa-analytics").set(as(uid)).expect(200)).body;
const queue = async (c: Ctx, uid: string, view = "all") => (await request(c.app).get(`/api/me/dsa-revision?view=${view}`).set(as(uid)).expect(200)).body;

describe("what counts as real student activity", () => {
  it("counts an accepted submission on a real suite from a verified service, and shows it as solved exactly once", async () => {
    const c = setup();
    const a = await submit(c, "alice", "q_fixture_01", "ECHO").expect(200);
    expect(a.body).toMatchObject({ verdict: "accepted", analytics_status: "counted" });
    await submit(c, "alice", "q_fixture_01", "ECHO").expect(200); // a second accepted submission for the same question
    const o = await overview(c, "alice");
    expect(o.totals).toEqual({ solved_unique: 1, attempted_unique: 1, eligible_attempts: 2, accepted_attempts: 2 });
    expect(o.has_eligible_activity).toBe(true);
    expect(o.recent).toHaveLength(2);
    expect(o.recent[0].title).toMatch(/Sample Problem 01/);
  });

  it("never counts submissions on demonstration/fixture suites, and reports them as excluded", async () => {
    const c = setup({ suites: fixtureSuites() });
    const res = await submit(c, "alice", "q_fixture_06", "OK").expect(200);
    expect(res.body.analytics_status).toBe("excluded_demonstration");
    const o = await overview(c, "alice");
    expect(o.totals).toEqual({ solved_unique: 0, attempted_unique: 0, eligible_attempts: 0, accepted_attempts: 0 });
    expect(o.has_eligible_activity).toBe(false);
    expect(o.exclusions).toMatchObject({ available: true, sampled_submissions: 1, demonstration: 1 });
    expect((await queue(c, "alice")).items).toEqual([]);
  });

  it("never counts submissions judged by a service the operator has not declared verified", async () => {
    const c = setup({ verified: false });
    const res = await submit(c, "alice", "q_fixture_01", "ECHO").expect(200);
    expect(res.body).toMatchObject({ verdict: "accepted", analytics_status: "excluded_unverified_provider" });
    const o = await overview(c, "alice");
    expect(o.totals.solved_unique).toBe(0);
    expect(o.exclusions.unverified_provider).toBe(1);
  });

  it("never counts judge errors: they say nothing about the student's code", async () => {
    const c = setup();
    const res = await submit(c, "alice", "q_fixture_01", "JUDGE").expect(200);
    expect(res.body).toMatchObject({ verdict: "judge_error", analytics_status: "excluded_judge_error" });
    const o = await overview(c, "alice");
    expect(o.totals.eligible_attempts).toBe(0);
    expect(o.exclusions.judge_error).toBe(1);
    expect((await queue(c, "alice")).items).toEqual([]);
  });

  it("Run and sample runs are never stored or counted", async () => {
    const c = setup();
    await request(c.app).post("/api/code/run").set(as("alice")).send({ language: "python", source: "ECHO", stdin: "x" }).expect(200);
    await request(c.app).post("/api/code/run").set(as("alice")).send({ language: "python", source: "ECHO", question_id: "q_fixture_01", sample_index: 0 }).expect(200);
    const o = await overview(c, "alice");
    expect(o.totals).toEqual({ solved_unique: 0, attempted_unique: 0, eligible_attempts: 0, accepted_attempts: 0 });
    expect(o.exclusions.sampled_submissions).toBe(0);
    expect(await c.submissionStore.listByOwner("alice")).toEqual([]);
  });

  it("a self-reported 'solved' mark is shown separately and never inflates the judged count", async () => {
    const c = setup();
    await request(c.app).put("/api/me/dsa-progress/q_fixture_02").set(as("alice")).send({ status: "solved", bookmarked: true }).expect(200);
    const o = await overview(c, "alice");
    expect(o.totals.solved_unique).toBe(0);
    expect(o.self_reported).toEqual({ solved: 1, attempted: 0, needs_revision: 0, bookmarked: 1 });
  });

  it("treats records without provenance (stored before this feature) as unknown and never counts them", async () => {
    const c = setup();
    await c.submissionStore.save({
      id: "sub_legacy-1",
      owner_uid: "alice",
      question_id: "q_fixture_01",
      language: "python",
      source: "print(1)",
      verdict: "accepted",
      passed: 2,
      total: 2,
      failed_test: null,
      compile_output: null,
      time_ms: 1,
      memory_kb: 1,
      test_revision: "t1",
      progress_updated: true,
      created_at: new Date().toISOString(),
    });
    const list = await request(c.app).get("/api/code/submissions").set(as("alice")).expect(200);
    expect(list.body.submissions[0].analytics_status).toBe("excluded_unknown_provenance");
    const o = await overview(c, "alice");
    expect(o.totals.solved_unique).toBe(0);
    expect(o.exclusions.unknown_provenance).toBe(1);
    const refreshed = (await request(c.app).post("/api/me/dsa-analytics/refresh").set(as("alice")).expect(200)).body;
    expect(refreshed.totals.solved_unique).toBe(0); // a rebuild does not promote legacy records either
  });

  it("shows an honest empty state for a student with no history", async () => {
    const c = setup();
    const o = await overview(c, "newbie");
    expect(o).toMatchObject({ has_eligible_activity: false, topics: [], weaknesses: [], recent: [], repeated_failures: [], revision_due: 0 });
    expect(o.first_attempt_success).toMatchObject({ available: false, value: null, denominator: 0 });
    expect(o.comparison.available).toBe(false);
    expect(o.untouched_topics.length).toBeGreaterThan(0);
    expect(o.weekly).toHaveLength(8);
  });
});

describe("analytics from judged history", () => {
  it("aggregates topics, difficulties and rates from eligible submissions only", async () => {
    const c = setup();
    for (const q of QUESTIONS.slice(0, 5)) await submit(c, "alice", q, "WRONG").expect(200);
    for (const q of QUESTIONS.slice(0, 2)) await submit(c, "alice", q, "ECHO").expect(200);
    const o = await overview(c, "alice");
    expect(o.totals).toEqual({ solved_unique: 2, attempted_unique: 5, eligible_attempts: 7, accepted_attempts: 2 });
    expect(o.submission_success).toMatchObject({ available: true, numerator: 2, denominator: 7 });
    expect(o.first_attempt_success).toMatchObject({ available: true, numerator: 0, denominator: 5 });
    const catalogue = fixtureCatalogue();
    const attemptedIds = QUESTIONS.slice(0, 5);
    const expectedAttempted = (t: string) => attemptedIds.filter((q) => catalogue.summary(q)!.topics.includes(t)).length;
    const topic = catalogue.summary(attemptedIds[0]!)!.topics[0]!;
    const row = o.topics.find((r: { key: string }) => r.key === topic);
    expect(row.questions_attempted).toBe(expectedAttempted(topic));
    expect(row.accuracy.denominator).toBe(row.attempts);
    expect(o.difficulties.map((r: { key: string }) => r.key)).toEqual(expect.arrayContaining(["easy", "medium"]));
    const weekly = o.weekly.at(-1);
    expect(weekly.attempts).toBe(7);
    expect(weekly.accepted).toBe(2);
    expect(weekly.first_solves).toBe(2);
  });

  it("history endpoint buckets a validated date range", async () => {
    const c = setup();
    await submit(c, "alice", "q_fixture_01", "ECHO").expect(200);
    const today = new Date().toISOString().slice(0, 10);
    const from = new Date(Date.now() - 20 * 86_400_000).toISOString().slice(0, 10);
    const res = await request(c.app).get(`/api/me/dsa-analytics/history?from=${from}&to=${today}`).set(as("alice")).expect(200);
    expect(res.body.weekly.reduce((s: number, w: { attempts: number }) => s + w.attempts, 0)).toBe(1);
    for (const q of ["from=2026-01-01", `from=${today}&to=${from}`, "from=2024-01-01&to=2026-06-01", "from=2026-13-40&to=2026-14-01", "from=x&to=y", `from=${from}&to=${today}&uid=bob`]) {
      expect((await request(c.app).get(`/api/me/dsa-analytics/history?${q}`).set(as("alice"))).status, q).toBe(400);
    }
  });

  it("validates the weeks parameter", async () => {
    const c = setup();
    for (const q of ["weeks=0", "weeks=27", "weeks=abc", "uid=bob"]) expect((await request(c.app).get(`/api/me/dsa-analytics?${q}`).set(as("alice"))).status, q).toBe(400);
    expect((await request(c.app).get("/api/me/dsa-analytics?weeks=3").set(as("alice")).expect(200)).body.weekly).toHaveLength(3);
  });
});

describe("weakness and revision from submissions", () => {
  it("a failed submission creates one revision item; more failures update it rather than duplicating", async () => {
    const c = setup();
    await submit(c, "alice", "q_fixture_01", "WRONG").expect(200);
    let q = await queue(c, "alice");
    expect(q.items).toHaveLength(1);
    expect(q.items[0]).toMatchObject({ question_id: "q_fixture_01", reason: "unsolved_attempted", priority: 2, status: "pending", due: true });
    await submit(c, "alice", "q_fixture_01", "RUNTIME").expect(200);
    await submit(c, "alice", "q_fixture_01", "WRONG").expect(200);
    q = await queue(c, "alice");
    expect(q.items).toHaveLength(1);
    expect(q.items[0]).toMatchObject({ reason: "repeated_failure", priority: 1 });
    expect(q.items[0].context).toMatchObject({ attempts: 3, failures: 3, consecutive_failures: 3, solved: false });
    expect(q.items[0].history.map((h: { event: string }) => h.event)).toEqual(["created", "failed", "failed"]);
    const o = await overview(c, "alice");
    expect(o.repeated_failures).toEqual([expect.objectContaining({ question_id: "q_fixture_01", consecutive_failures: 3 })]);
    expect(o.revision_due).toBe(1);
  });

  it("solving a failing question moves it to spaced review, and a later failure reopens it", async () => {
    const c = setup();
    await submit(c, "alice", "q_fixture_01", "WRONG").expect(200);
    await submit(c, "alice", "q_fixture_01", "ECHO").expect(200);
    const item = (await request(c.app).get("/api/me/dsa-revision/q_fixture_01").set(as("alice")).expect(200)).body;
    expect(item).toMatchObject({ reason: "spaced_review", status: "scheduled", due: false, priority: 4 });
    expect(Date.parse(item.due_at)).toBeGreaterThan(Date.now() + 23 * 3_600_000);
    expect((await queue(c, "alice", "due")).items).toEqual([]);
    expect((await queue(c, "alice", "upcoming")).items).toHaveLength(1);
    await submit(c, "alice", "q_fixture_01", "WRONG").expect(200);
    expect((await request(c.app).get("/api/me/dsa-revision/q_fixture_01").set(as("alice"))).body).toMatchObject({ status: "pending", due: true });
  });

  it("explains a weak topic with evidence only after enough questions and attempts", async () => {
    const c = setup();
    const { topic, ids: inTopic } = topicWith(3);
    await submit(c, "alice", inTopic[0]!, "WRONG").expect(200);
    let o = await overview(c, "alice");
    expect(o.weaknesses.find((w: { topic: string }) => w.topic === topic).status).toBe("insufficient_data");
    for (const q of inTopic.slice(0, 3)) {
      await submit(c, "alice", q, "WRONG").expect(200);
    }
    await submit(c, "alice", inTopic[1]!, "WRONG").expect(200);
    o = await overview(c, "alice");
    const w = o.weaknesses.find((x: { topic: string }) => x.topic === topic);
    expect(w.status).toBe("weak");
    expect(w.evidence.algorithmic_failures).toBe(5);
    expect(w.explanation.join(" ")).toMatch(/still unsolved/);
    const q = await queue(c, "alice");
    expect(q.suggestions.length).toBeGreaterThan(0);
    expect(q.suggestions[0]).toMatchObject({ topic: expect.any(String), reason: expect.stringMatching(/wrong-answer or time-limit failures/) });
  });

  it("suggestions can be added once; adding again returns the same item", async () => {
    const c = setup();
    const { ids: inTopic } = topicWith(3);
    for (const q of inTopic.slice(0, 3)) await submit(c, "alice", q, "WRONG").expect(200);
    await submit(c, "alice", inTopic[0]!, "WRONG").expect(200);
    await submit(c, "alice", inTopic[1]!, "WRONG").expect(200);
    const suggestion = (await queue(c, "alice")).suggestions[0];
    const added = await request(c.app).post("/api/me/dsa-revision").set(as("alice")).send({ question_id: suggestion.question_id }).expect(200);
    expect(added.body).toMatchObject({ reason: "topic_weakness", priority: 5, question_id: suggestion.question_id });
    const again = await request(c.app).post("/api/me/dsa-revision").set(as("alice")).send({ question_id: suggestion.question_id }).expect(200);
    expect(again.body.created_at).toBe(added.body.created_at);
    expect((await queue(c, "alice")).items.filter((i: { question_id: string }) => i.question_id === suggestion.question_id)).toHaveLength(1);
    expect((await request(c.app).post("/api/me/dsa-revision").set(as("alice")).send({ question_id: "q_ghost" })).body.error.code).toBe("QUESTION_NOT_FOUND");
    expect((await request(c.app).post("/api/me/dsa-revision").set(as("alice")).send({ question_id: "q_fixture_01", uid: "bob" })).status).toBe(400);
  });
});

describe("revision actions over HTTP", () => {
  const act = (c: Ctx, uid: string, q: string, body: object) => request(c.app).post(`/api/me/dsa-revision/${q}/actions`).set(as(uid)).send(body);

  it("start, postpone, revisit and complete move an item through its states", async () => {
    const c = setup();
    await submit(c, "alice", "q_fixture_01", "WRONG").expect(200);
    expect((await act(c, "alice", "q_fixture_01", { action: "start" })).body.status).toBe("in_progress");
    expect((await act(c, "alice", "q_fixture_01", { action: "start" })).status).toBe(400);
    const postponed = (await act(c, "alice", "q_fixture_01", { action: "postpone", days: 3 }).expect(200)).body;
    expect(postponed).toMatchObject({ status: "postponed", due: false, postponed_count: 1 });
    expect(Date.parse(postponed.due_at)).toBeGreaterThan(Date.now() + 2.5 * 86_400_000);
    expect((await act(c, "alice", "q_fixture_01", { action: "revisit" }).expect(200)).body).toMatchObject({ status: "pending", due: true });
    const done = (await act(c, "alice", "q_fixture_01", { action: "complete", outcome: "remembered" }).expect(200)).body;
    expect(done).toMatchObject({ status: "scheduled", due: false, stage: 1 });
    expect(done.last_reviewed_at).not.toBeNull();
    expect(done.history.map((h: { event: string }) => h.event)).toEqual(["created", "started", "postponed", "revisited", "completed"]);
  });

  it("validates action bodies strictly", async () => {
    const c = setup();
    await submit(c, "alice", "q_fixture_01", "WRONG").expect(200);
    for (const body of [{}, { action: "delete" }, { action: "complete" }, { action: "complete", outcome: "maybe" }, { action: "postpone", days: 0 }, { action: "postpone", days: 99 }, { action: "start", uid: "bob" }, { action: "complete", outcome: "remembered", days: 3 }]) {
      expect((await act(c, "alice", "q_fixture_01", body)).status, JSON.stringify(body)).toBe(400);
    }
    expect((await act(c, "alice", "q_fixture_02", { action: "start" })).body.error.code).toBe("REVISION_NOT_FOUND");
    expect((await request(c.app).get("/api/me/dsa-revision?view=everything").set(as("alice"))).status).toBe(400);
    expect((await request(c.app).get("/api/me/dsa-revision?page_size=500").set(as("alice"))).status).toBe(400);
  });

  it("paginates the queue", async () => {
    const c = setup();
    for (const q of QUESTIONS.slice(0, 6)) await submit(c, "alice", q, "WRONG").expect(200);
    const p1 = (await request(c.app).get("/api/me/dsa-revision?view=all&page_size=4").set(as("alice")).expect(200)).body;
    expect(p1).toMatchObject({ page: 1, page_size: 4, total: 6, total_pages: 2, counts: { due: 6, upcoming: 0, total: 6 } });
    expect(p1.items).toHaveLength(4);
    const p2 = (await request(c.app).get("/api/me/dsa-revision?view=all&page_size=4&page=2").set(as("alice")).expect(200)).body;
    expect(p2.items).toHaveLength(2);
  });
});

describe("authentication and user isolation", () => {
  it("requires a token on every analytics and revision route", async () => {
    const c = setup();
    for (const res of [
      await request(c.app).get("/api/me/dsa-analytics"),
      await request(c.app).get("/api/me/dsa-analytics/history?from=2026-01-01&to=2026-02-01"),
      await request(c.app).post("/api/me/dsa-analytics/refresh"),
      await request(c.app).get("/api/me/dsa-revision"),
      await request(c.app).get("/api/me/dsa-revision/q_fixture_01"),
      await request(c.app).post("/api/me/dsa-revision").send({ question_id: "q_fixture_01" }),
      await request(c.app).post("/api/me/dsa-revision/q_fixture_01/actions").send({ action: "start" }),
    ]) {
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("UNAUTHENTICATED");
    }
  });

  it("one student never sees or changes another's analytics or revision items", async () => {
    const c = setup();
    await submit(c, "alice", "q_fixture_01", "WRONG").expect(200);
    await submit(c, "alice", "q_fixture_02", "ECHO").expect(200);

    const bob = await overview(c, "bob");
    expect(bob.totals.eligible_attempts).toBe(0);
    expect(bob.recent).toEqual([]);
    expect((await queue(c, "bob")).items).toEqual([]);
    const spoof = await request(c.app).get("/api/me/dsa-analytics?uid=alice").set(as("bob"));
    expect(spoof.status).toBe(400);
    const spoofHeader = await request(c.app).get("/api/me/dsa-analytics").set({ ...as("bob"), "X-User-Id": "alice" }).expect(200);
    expect(spoofHeader.body.totals.eligible_attempts).toBe(0);

    const getItem = await request(c.app).get("/api/me/dsa-revision/q_fixture_01").set(as("bob"));
    expect(getItem.status).toBe(404);
    expect(getItem.body.error.code).toBe("REVISION_NOT_FOUND");
    expect((await request(c.app).post("/api/me/dsa-revision/q_fixture_01/actions").set(as("bob")).send({ action: "postpone" })).status).toBe(404);
    expect((await request(c.app).post("/api/me/dsa-analytics/refresh").set(as("bob")).expect(200)).body.totals.eligible_attempts).toBe(0);

    const alice = await queue(c, "alice");
    expect(alice.items[0]).toMatchObject({ status: "pending", postponed_count: 0 }); // untouched
    expect((await overview(c, "alice")).totals.eligible_attempts).toBe(2);
  });
});

describe("consistency when storage or the execution provider fails", () => {
  it("a provider failure records nothing and leaves statistics and revision untouched", async () => {
    const c = setup();
    const res = await submit(c, "alice", "q_fixture_01", "THROW");
    expect(res.status).toBe(503);
    expect(await c.submissionStore.listByOwner("alice")).toEqual([]);
    expect((await overview(c, "alice")).totals.eligible_attempts).toBe(0);
    expect((await queue(c, "alice")).items).toEqual([]);
  });

  it("if the statistics store fails after judging, the submission is still saved and refresh repairs the statistics", async () => {
    const c = setup();
    c.stats.failing = true;
    const res = await submit(c, "alice", "q_fixture_01", "WRONG");
    expect(res.status).toBe(200);
    expect(res.body.verdict).toBe("wrong_answer");
    expect(await c.submissionStore.listByOwner("alice")).toHaveLength(1);
    expect((await overview(c, "alice")).totals.eligible_attempts).toBe(0); // not yet reflected

    c.stats.failing = false;
    const healed = (await request(c.app).post("/api/me/dsa-analytics/refresh").set(as("alice")).expect(200)).body;
    expect(healed.totals).toEqual({ solved_unique: 0, attempted_unique: 1, eligible_attempts: 1, accepted_attempts: 0 });
    expect((await queue(c, "alice")).items).toEqual([expect.objectContaining({ question_id: "q_fixture_01", reason: "unsolved_attempted" })]); // the missing revision item was created
    const again = (await request(c.app).post("/api/me/dsa-analytics/refresh").set(as("alice")).expect(200)).body;
    expect(again.totals).toEqual(healed.totals); // refresh is idempotent
    expect((await queue(c, "alice")).items).toHaveLength(1);
  });

  it("refresh equals the incremental result, never double counts, and does not touch existing revision items", async () => {
    const c = setup();
    await submit(c, "alice", "q_fixture_01", "WRONG").expect(200);
    await submit(c, "alice", "q_fixture_01", "ECHO").expect(200);
    await submit(c, "alice", "q_fixture_02", "WRONG").expect(200);
    await request(c.app).post("/api/me/dsa-revision/q_fixture_02/actions").set(as("alice")).send({ action: "postpone", days: 5 }).expect(200);
    const before = await overview(c, "alice");
    const after = (await request(c.app).post("/api/me/dsa-analytics/refresh").set(as("alice")).expect(200)).body;
    expect(after.totals).toEqual(before.totals);
    expect(after.topics).toEqual(before.topics);
    expect((await request(c.app).get("/api/me/dsa-revision/q_fixture_02").set(as("alice"))).body).toMatchObject({ status: "postponed", postponed_count: 1 });
  });

  it("duplicate delivery of the same submission cannot inflate totals", async () => {
    const c = setup();
    await submit(c, "alice", "q_fixture_01", "WRONG").expect(200);
    const [record] = await c.submissionStore.listByOwner("alice");
    const analytics = new AnalyticsService({ stats: c.stats, revisions: c.revisions, submissions: c.submissionStore, progress: new DsaProgressService(c.progressStore, () => fixtureCatalogue()), catalogue: () => fixtureCatalogue(), logger: silentLogger });
    await analytics.recordSubmission(record!);
    await analytics.recordSubmission(record!);
    const o = await overview(c, "alice");
    expect(o.totals.eligible_attempts).toBe(1);
    expect((await queue(c, "alice")).items[0].history).toHaveLength(1);
  });

  it("reports unavailable exclusion counts instead of failing when that query cannot run", async () => {
    const c = setup();
    c.submissionStore.listRecentByOwner = async () => {
      throw new Error("index missing");
    };
    const o = await overview(c, "alice");
    expect(o.exclusions).toMatchObject({ available: false, sampled_submissions: 0 });
  });
});
