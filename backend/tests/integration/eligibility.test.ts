import request from "supertest";
import { describe, expect, it } from "vitest";
import { AnalyticsService } from "../../src/analytics/service.js";
import { isCountable } from "../../src/analytics/eligibility.js";
import { MemoryRevisionStore, MemoryStatsStore } from "../../src/analytics/stores.js";
import { CodeService } from "../../src/code/service.js";
import { MemorySubmissionStore, type SubmissionRecord } from "../../src/code/submissionStore.js";
import { parseSuiteFile, SuiteRegistry } from "../../src/code/suites.js";
import { loadConfig } from "../../src/config.js";
import { DsaProgressService } from "../../src/dsa/progressService.js";
import { MemoryProgressStore } from "../../src/dsa/progressStore.js";
import { FakeProvider } from "../code/fakeProvider.js";
import { silentLogger } from "../helpers.js";
import { bearer, fixtureCatalogue, fixtureSuites, testApp } from "./app.js";

/**
 * Which stored submissions may count toward real analytics. The providers here are test doubles (FakeProvider); the
 * "non-mock" one only stands in for a real service, it is not one. These tests prove the rules, not real execution.
 */

const Q = "q_fixture_01";

function suiteFor(opts: { demonstration?: boolean; eligible?: boolean; license?: "own_work" | "development_fixture" } = {}) {
  const demonstration = opts.demonstration ?? false;
  return new SuiteRegistry(
    parseSuiteFile({
      schema_version: 1,
      suites: [
        {
          question_id: Q,
          revision: "t1",
          is_demonstration: demonstration,
          statement: null,
          source: { name: "t", license_status: opts.license ?? (demonstration ? "development_fixture" : "own_work"), license_note: "t" },
          samples: [{ input: "s\n", expected_output: "s\n" }],
          tests: ["1", "2", "3", "4", "5"].map((n) => ({ input: `${n}\n`, expected_output: `${n}\n` })),
          limits: { cpu_time_seconds: 2, memory_mb: 128 },
          starter_code: {},
          eligibility: { analytics_eligible: opts.eligible ?? !demonstration, reason: "test" },
        },
      ],
    }),
  );
}

function build(opts: { mock?: boolean; verified?: boolean; allowMock?: boolean; suites?: SuiteRegistry }) {
  const catalogue = fixtureCatalogue();
  const submissions = new MemorySubmissionStore();
  const progressStore = new MemoryProgressStore();
  const progress = new DsaProgressService(progressStore, () => catalogue);
  const analytics = new AnalyticsService({ stats: new MemoryStatsStore(), revisions: new MemoryRevisionStore(), submissions, progress, catalogue: () => catalogue, logger: silentLogger });
  const code = new CodeService({
    provider: new FakeProvider({ mock: opts.mock ?? false }),
    suites: opts.suites ?? suiteFor(),
    catalogue: () => catalogue,
    progress,
    submissions,
    logger: silentLogger,
    providerVerified: opts.verified ?? true,
    allowMockToCount: opts.allowMock,
    onJudged: (r) => analytics.recordSubmission(r),
  });
  const app = testApp({ autoAuth: false, code, analytics, catalogue, progressStore, submissionStore: submissions });
  const as = { Authorization: bearer("alice") };
  const submit = (source: string) => request(app).post("/api/code/submit").set(as).send({ question_id: Q, language: "python", source });
  const overview = async () => (await request(app).get("/api/me/dsa-analytics").set(as).expect(200)).body;
  const progressList = async () => (await request(app).get("/api/me/dsa-progress").set(as).expect(200)).body.progress as { status: string }[];
  return { app, submissions, submit, overview, progressList };
}

describe("exactly one combination counts", () => {
  const combos: { name: string; opts: Parameters<typeof build>[0]; source: string; status: string }[] = [
    { name: "eligible suite + non-mock + verified + accepted", opts: {}, source: "ECHO", status: "counted" },
    { name: "same, rejected", opts: {}, source: "WRONG", status: "counted" },
    { name: "demonstration suite", opts: { suites: suiteFor({ demonstration: true }) }, source: "ECHO", status: "excluded_demonstration" },
    { name: "demonstration suite declared eligible is impossible, so a fixture licence alone also excludes", opts: { suites: suiteFor({ license: "development_fixture", eligible: false }) }, source: "ECHO", status: "excluded_demonstration" },
    { name: "suite not declared eligible", opts: { suites: suiteFor({ eligible: false }) }, source: "ECHO", status: "excluded_ineligible_suite" },
    { name: "mock provider, even verified", opts: { mock: true, verified: true }, source: "ECHO", status: "excluded_mock_execution" },
    { name: "unverified provider", opts: { verified: false }, source: "ECHO", status: "excluded_unverified_provider" },
    { name: "judge error", opts: {}, source: "JUDGE", status: "excluded_judge_error" },
  ];

  it.each(combos)("$name -> $status", async ({ opts, source, status }) => {
    const c = build(opts);
    const res = await c.submit(source).expect(200);
    expect(res.body.analytics_status).toBe(status);
    const o = await c.overview();
    const counted = status === "counted";
    expect(o.totals.eligible_attempts).toBe(counted ? 1 : 0);
    expect(o.totals.solved_unique).toBe(counted && res.body.verdict === "accepted" ? 1 : 0);
  });

  it("the TEST-ONLY policy is the only way a mock provider counts, and the record says so", async () => {
    const c = build({ mock: true, allowMock: true });
    const res = await c.submit("ECHO").expect(200);
    expect(res.body.analytics_status).toBe("counted");
    const [stored] = await c.submissions.listByOwner("alice");
    expect(stored).toMatchObject({ provider_mock: true, mock_counting_allowed: true, provider_verified: true, suite_eligible: true, judged_tests: 5, total: 5 });
    expect(() => loadConfig({ LLM_MODE: "mock", ALLOW_MOCK_ANALYTICS: "true" })).not.toThrow(); // unknown variables are ignored, so nothing in the environment can enable it
    expect(loadConfig({ LLM_MODE: "mock", ALLOW_MOCK_ANALYTICS: "true" })).not.toHaveProperty("allowMockToCount");
  });

  it("the shipped demonstration exercises never count, whatever the provider flags say", async () => {
    const catalogue = fixtureCatalogue();
    const submissions = new MemorySubmissionStore();
    const progress = new DsaProgressService(new MemoryProgressStore(), () => catalogue);
    const code = new CodeService({ provider: new FakeProvider({ mock: false, solve: (s) => s }), suites: fixtureSuites(), catalogue: () => catalogue, progress, submissions, logger: silentLogger, providerVerified: true });
    const res = await code.submit("alice", { question_id: "q_fixture_06", language: "python", source: "ECHO" });
    expect(res.analytics_status).toBe("excluded_demonstration");
  });
});

describe("a rejected submission never marks a question solved", () => {
  it("wrong answer, compile error, runtime error and time limit leave progress and analytics untouched", async () => {
    for (const source of ["WRONG", "COMPILE", "RUNTIME", "SLOW"]) {
      const c = build({});
      const res = await c.submit(source).expect(200);
      expect(res.body.verdict).not.toBe("accepted");
      expect(res.body.progress_updated).toBe(false);
      expect(await c.progressList()).toEqual([]);
      expect((await c.overview()).totals.solved_unique).toBe(0);
    }
  });
});

describe("isCountable re-checks the record's own evidence", () => {
  const good: SubmissionRecord = {
    id: "sub_ok",
    owner_uid: "alice",
    question_id: Q,
    language: "python",
    source: "x",
    verdict: "accepted",
    passed: 5,
    total: 5,
    failed_test: null,
    compile_output: null,
    time_ms: 1,
    memory_kb: 1,
    test_revision: "t1",
    progress_updated: true,
    created_at: "2026-06-01T00:00:00.000Z",
    analytics_status: "counted",
    provider: "judge0",
    provider_verified: true,
    suite_license: "own_work",
    suite_eligible: true,
    judged_tests: 5,
    provider_mock: false,
  };
  const wrong: SubmissionRecord = { ...good, id: "sub_wrong", verdict: "wrong_answer", passed: 2, failed_test: 3 };

  it("accepts consistent genuine records", () => {
    expect(isCountable(good)).toBe(true);
    expect(isCountable(wrong)).toBe(true);
  });

  it.each([
    ["legacy record without provenance", { analytics_status: undefined, provider_verified: undefined, suite_eligible: undefined, judged_tests: undefined }],
    ["marked counted but the operator flag was off", { provider_verified: false }],
    ["marked counted but the suite was not eligible", { suite_eligible: false }],
    ["marked counted but the suite licence is a fixture", { suite_license: "development_fixture" }],
    ["a mock provider without the test policy", { provider_mock: true }],
    ["accepted although not every test passed", { passed: 4 }],
    ["accepted but a failing test is recorded", { failed_test: 2 }],
    ["not every hidden test actually ran", { judged_tests: 3 }],
    ["no test results at all", { judged_tests: 0 }],
    ["no tests", { total: 0, passed: 0, judged_tests: 0 }],
    ["no suite revision", { test_revision: "" }],
    ["judge error", { verdict: "judge_error" }],
    ["still pending provenance: excluded status", { analytics_status: "excluded_demonstration" }],
    ["passed more than total", { passed: 9 }],
  ] as [string, Partial<SubmissionRecord>][])("rejects %s", (_name, over) => {
    expect(isCountable({ ...good, ...over } as SubmissionRecord)).toBe(false);
  });

  it("rejects a failing verdict that does not identify a failing test or claims everything passed", () => {
    expect(isCountable({ ...wrong, failed_test: null })).toBe(false);
    expect(isCountable({ ...wrong, passed: 5 })).toBe(false);
    expect(isCountable({ ...wrong, failed_test: 99 })).toBe(false);
  });

  it("a tampered record cannot raise a student's solved count, even through a rebuild", async () => {
    const c = build({});
    const forged: SubmissionRecord = { ...good, id: "sub_forged", judged_tests: 0 }; // claims acceptance without any test having run
    await c.submissions.save(forged);
    const analytics = await request(c.app).post("/api/me/dsa-analytics/refresh").set({ Authorization: bearer("alice") }).expect(200);
    expect(analytics.body.totals.solved_unique).toBe(0);
    expect(analytics.body.exclusions.unknown_provenance).toBe(1);
  });
});

describe("invalid or missing provider configuration", () => {
  it("with no execution service configured, submit fails honestly, nothing is stored and nothing counts", async () => {
    const app = testApp({ autoAuth: false }); // UnavailableProvider
    const as = { Authorization: bearer("alice") };
    const res = await request(app).post("/api/code/submit").set(as).send({ question_id: Q, language: "python", source: "x" });
    expect(res.status).toBe(503);
    expect((await request(app).get("/api/code/submissions").set(as)).body.submissions).toEqual([]);
    expect((await request(app).get("/api/me/dsa-analytics").set(as)).body.has_eligible_activity).toBe(false);
  });

  it("rejects invalid execution settings at startup", () => {
    expect(() => loadConfig({ LLM_MODE: "mock", EXECUTION_PROVIDER: "judge0" })).toThrow(/JUDGE0_URL is required/);
    expect(() => loadConfig({ LLM_MODE: "mock", EXECUTION_PROVIDER: "judge0", JUDGE0_URL: "http://judge.example.com" })).toThrow(/https/);
    expect(() => loadConfig({ LLM_MODE: "mock", EXECUTION_PROVIDER: "something-else" })).toThrow(/EXECUTION_PROVIDER/);
    expect(loadConfig({ LLM_MODE: "mock" }).EXECUTION_PROVIDER_VERIFIED).toBe(false);
  });
});
