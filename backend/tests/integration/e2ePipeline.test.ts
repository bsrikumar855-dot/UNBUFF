import { join } from "node:path";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { AnalyticsService } from "../../src/analytics/service.js";
import { MemoryRevisionStore, MemoryStatsStore } from "../../src/analytics/stores.js";
import { CodeService } from "../../src/code/service.js";
import { MemorySubmissionStore } from "../../src/code/submissionStore.js";
import { SuiteRegistry } from "../../src/code/suites.js";
import { Catalogue } from "../../src/dsa/catalogue.js";
import { DsaProgressService } from "../../src/dsa/progressService.js";
import { MemoryProgressStore } from "../../src/dsa/progressStore.js";
import { exercises } from "../../scripts/lib/practicePack.js";
import { FakeProvider } from "../code/fakeProvider.js";
import { silentLogger } from "../helpers.js";
import { bearer, testApp } from "./app.js";

/**
 * END-TO-END DATA PIPELINE, WITH A MOCK PROVIDER.
 * Every result below comes from FakeProvider, which does not run code: it answers with the reference solution's output
 * (marker CORRECT) or a wrong answer (marker WRONG). The first-party practice pack is used as shipped. Mock results are
 * labelled on each stored record and are excluded from real analytics by default; the second describe block shows that,
 * and the first one uses the TEST-ONLY policy so the whole pipeline can be exercised. It proves our pipeline, not that
 * any real compiler works.
 */

const data = join(import.meta.dirname, "..", "..", "data");
const catalogue = Catalogue.fromPath(join(data, "dsa", "practice-pack.json"));
const packSuites = SuiteRegistry.fromPath(join(data, "code", "practice-suites.json"));
const byId = new Map(exercises().map((e) => [e.id, e]));

/** A provider whose "student program" is chosen per call by the source marker, using the exercise's reference solution. */
class PackProvider extends FakeProvider {
  constructor(private readonly question: () => string) {
    super({ mock: true, solve: () => "" });
  }
  override async execute(input: Parameters<FakeProvider["execute"]>[0]) {
    if (input.source.includes("CORRECT")) return { outcome: "completed" as const, stdout: `${byId.get(this.question())!.solve(input.stdin)}\n`, stderr: "", compile_output: "", time_ms: 7, memory_kb: 2500 };
    return super.execute(input);
  }
}

function pipeline(allowMock: boolean) {
  let current = "";
  const submissions = new MemorySubmissionStore();
  const progressStore = new MemoryProgressStore();
  const progress = new DsaProgressService(progressStore, () => catalogue);
  const stats = new MemoryStatsStore();
  const revisions = new MemoryRevisionStore();
  const analytics = new AnalyticsService({ stats, revisions, submissions, progress, catalogue: () => catalogue, logger: silentLogger });
  const code = new CodeService({
    provider: new PackProvider(() => current),
    suites: packSuites,
    catalogue: () => catalogue,
    progress,
    submissions,
    logger: silentLogger,
    providerVerified: true,
    allowMockToCount: allowMock,
    onJudged: (r) => analytics.recordSubmission(r),
  });
  const app = testApp({ autoAuth: false, code, analytics, catalogue, progressStore, submissionStore: submissions });
  const as = { Authorization: bearer("alice") };
  const texts: string[] = [];
  const keep = <T extends { text: string }>(r: T): T => (texts.push(r.text), r);
  return {
    app,
    texts,
    submissions,
    analytics,
    submit: async (q: string, source: string) => {
      current = q;
      return keep(await request(app).post("/api/code/submit").set(as).send({ question_id: q, language: "python", source }));
    },
    get: async (path: string) => keep(await request(app).get(path).set(as)),
    overview: async () => (await request(app).get("/api/me/dsa-analytics").set(as).expect(200)).body,
    queue: async () => (await request(app).get("/api/me/dsa-revision?view=all").set(as).expect(200)).body,
    progress: async () => (await request(app).get("/api/me/dsa-progress").set(as).expect(200)).body.progress as { question_id: string; status: string }[],
  };
}

describe("judged submission -> history -> progress -> analytics -> revision (mock provider, test policy)", () => {
  it("runs the whole pipeline on the shipped practice pack", async () => {
    const p = pipeline(true);
    const Q1 = "fp_002_pair_count";

    // Three genuine-looking wrong answers: stored, counted, queued for revision, never solved.
    for (let i = 0; i < 3; i++) {
      const res = await p.submit(Q1, "WRONG").then((r) => r.body);
      expect(res).toMatchObject({ verdict: "wrong_answer", failed_test: 1, passed: 0, progress_updated: false, analytics_status: "counted", test_revision: "fp-1" });
    }
    expect(await p.progress()).toEqual([]);
    let queue = await p.queue();
    expect(queue.items).toHaveLength(1);
    expect(queue.items[0]).toMatchObject({ question_id: Q1, reason: "repeated_failure", priority: 1, title: "Pair Count", due: true });
    let o = await p.overview();
    expect(o.totals).toEqual({ solved_unique: 0, attempted_unique: 1, eligible_attempts: 3, accepted_attempts: 0 });
    expect(o.repeated_failures).toEqual([expect.objectContaining({ question_id: Q1, consecutive_failures: 3 })]);

    // A correct solution: judged on every hidden test, accepted, progress updated, revision becomes spaced review.
    const ok = (await p.submit(Q1, "CORRECT")).body;
    const suite = packSuites.suite(Q1)!;
    expect(ok).toMatchObject({ verdict: "accepted", passed: suite.tests.length, total: suite.tests.length, failed_test: null, progress_updated: true, analytics_status: "counted" });
    expect(await p.progress()).toEqual([expect.objectContaining({ question_id: Q1, status: "solved" })]);
    queue = await p.queue();
    expect(queue.items[0]).toMatchObject({ reason: "spaced_review", status: "scheduled", due: false, priority: 4 });
    expect(Date.parse(queue.items[0].due_at)).toBeGreaterThan(Date.now() + 23 * 3_600_000);

    // History keeps all four, newest first, in the owner's account only.
    const history = (await p.get("/api/code/submissions")).body.submissions as { verdict: string }[];
    expect(history.map((s) => s.verdict)).toEqual(["accepted", "wrong_answer", "wrong_answer", "wrong_answer"]);

    o = await p.overview();
    expect(o.totals).toEqual({ solved_unique: 1, attempted_unique: 1, eligible_attempts: 4, accepted_attempts: 1 });
    expect(o.submission_success).toMatchObject({ numerator: 1, denominator: 4, available: false }); // 4 < 5 submissions: no percentage yet
    expect(o.first_attempt_success).toMatchObject({ available: false, denominator: 1 });
    expect(o.topics.map((t: { key: string }) => t.key).sort()).toEqual(["Arrays", "Hash Table"]);
    expect(o.difficulties).toEqual([expect.objectContaining({ key: "easy", attempts: 4, accepted: 1, questions_solved: 1 })]);
    expect(o.weekly.at(-1)).toMatchObject({ attempts: 4, accepted: 1, first_solves: 1 });
    expect(o.exclusions).toMatchObject({ available: true, sampled_submissions: 4, mock_execution: 0 });

    // Every stored record is labelled as mock output allowed only by the test policy.
    for (const r of await p.submissions.listByOwner("alice")) expect(r).toMatchObject({ provider_mock: true, mock_counting_allowed: true, provider_verified: true, suite_eligible: true, suite_license: "own_work" });
  });

  it("detects a weak topic from repeated algorithmic failures across questions, with its evidence", async () => {
    const p = pipeline(true);
    // Strings is carried by three exercises.
    const strings = ["fp_001_balanced_brackets", "fp_003_longest_run", "fp_010_edit_cost"];
    for (const q of strings) await p.submit(q, "WRONG");
    await p.submit(strings[0]!, "WRONG");
    await p.submit(strings[1]!, "WRONG");
    const o = await p.overview();
    const w = o.weaknesses.find((x: { topic: string }) => x.topic === "Strings");
    expect(w).toMatchObject({ status: "weak" });
    expect(w.evidence).toMatchObject({ questions_attempted: 3, questions_solved: 0, attempts: 5, algorithmic_failures: 5 });
    expect(w.explanation.join(" ")).toMatch(/3 of 3 attempted questions are still unsolved/);
    const queue = await p.queue();
    expect(queue.items).toHaveLength(3); // one item per question
  });

  it("is idempotent: processing the same stored submission again changes nothing", async () => {
    const p = pipeline(true);
    await p.submit("fp_003_longest_run", "WRONG");
    const [record] = await p.submissions.listByOwner("alice");
    await p.analytics.recordSubmission(record!);
    await p.analytics.recordSubmission(record!);
    expect((await p.overview()).totals.eligible_attempts).toBe(1);
    expect((await p.queue()).items[0].history).toHaveLength(1);
  });

  it("never lets hidden tests leave the server: no response in the whole flow contains one", async () => {
    const p = pipeline(true);
    await p.submit("fp_005_coin_ways", "WRONG");
    await p.submit("fp_005_coin_ways", "CORRECT");
    await p.submit("fp_006_shortest_hops", "COMPILE");
    await p.get("/api/code/exercises/fp_005_coin_ways");
    await p.get("/api/questions?page_size=100");
    await p.get("/api/code/submissions");
    await p.overview();
    await p.queue();
    const secrets = ["fp_005_coin_ways", "fp_006_shortest_hops", "fp_002_pair_count"].flatMap((id) => {
      const s = packSuites.suite(id)!;
      const visible = new Set(s.samples.map((x) => x.input));
      return s.tests.map((t) => t.input).filter((i) => i.length >= 20 && !visible.has(i));
    });
    expect(secrets.length).toBeGreaterThan(3);
    for (const text of p.texts) for (const secret of secrets) expect(text.includes(JSON.stringify(secret).slice(1, -1))).toBe(false);
  });
});

describe("the same flow with the default policy (mock results are excluded from real analytics)", () => {
  it("stores and judges the submissions, but nothing is counted and no revision item appears", async () => {
    const p = pipeline(false);
    const bad = (await p.submit("fp_002_pair_count", "WRONG")).body;
    const good = (await p.submit("fp_002_pair_count", "CORRECT")).body;
    expect(bad).toMatchObject({ verdict: "wrong_answer", analytics_status: "excluded_mock_execution" });
    expect(good).toMatchObject({ verdict: "accepted", analytics_status: "excluded_mock_execution" });
    const o = await p.overview();
    expect(o.totals).toEqual({ solved_unique: 0, attempted_unique: 0, eligible_attempts: 0, accepted_attempts: 0 });
    expect(o.has_eligible_activity).toBe(false);
    expect(o.exclusions).toMatchObject({ mock_execution: 2, sampled_submissions: 2 });
    expect((await p.queue()).items).toEqual([]);
    const [stored] = await p.submissions.listByOwner("alice");
    expect(stored).toMatchObject({ provider_mock: true });
    expect(stored!.mock_counting_allowed).toBeUndefined();
  });
});
