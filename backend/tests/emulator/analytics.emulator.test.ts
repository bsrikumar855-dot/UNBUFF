import { Firestore } from "@google-cloud/firestore";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AnalyticsService } from "../../src/analytics/service.js";
import { FirestoreRevisionStore, FirestoreStatsStore } from "../../src/analytics/stores.js";
import type { StatsRecord } from "../../src/analytics/stats.js";
import { CodeService } from "../../src/code/service.js";
import { checkSubmissionIndex } from "../../src/code/indexes.js";
import { FirestoreSubmissionStore, type SubmissionRecord } from "../../src/code/submissionStore.js";
import { parseSuiteFile, SuiteRegistry } from "../../src/code/suites.js";
import { DsaProgressService } from "../../src/dsa/progressService.js";
import { FirestoreProgressStore } from "../../src/dsa/progressStore.js";
import { FakeProvider } from "../code/fakeProvider.js";
import { silentLogger } from "../helpers.js";
import { bearer, fixtureCatalogue, testApp } from "../integration/app.js";
import { PROJECT_ID, requireEmulators } from "./emulator.js";

/** Analytics statistics, revision items and submission queries on the real Firestore emulator (execution itself is faked). */
const run = randomUUID();
const names = { stats: `t_stats_${run}`, rev: `t_rev_${run}`, subs: `t_subs_${run}`, prog: `t_prog_${run}` };
let db: Firestore;
let app: ReturnType<typeof testApp>;
let statsStore: FirestoreStatsStore;
let revStore: FirestoreRevisionStore;
let subStore: FirestoreSubmissionStore;

const suites = () =>
  new SuiteRegistry(
    parseSuiteFile({
      schema_version: 1,
      suites: ["q_fixture_01", "q_fixture_02"].map((question_id) => ({
        question_id,
        revision: "t1",
        is_demonstration: false,
        statement: null,
        source: { name: "emulator test", license_status: "own_work", license_note: "tests" },
        samples: [{ input: "s\n", expected_output: "s\n" }],
        tests: ["1", "2", "3", "4", "5"].map((n) => ({ input: `${n}\n`, expected_output: `${n}\n` })),
        limits: { cpu_time_seconds: 2, memory_mb: 128 },
        starter_code: {},
        eligibility: { analytics_eligible: true, reason: "emulator test suite" },
      })),
    }),
  );

beforeAll(() => {
  requireEmulators();
  db = new Firestore({ projectId: PROJECT_ID, ignoreUndefinedProperties: true });
  statsStore = new FirestoreStatsStore(names.stats, db);
  revStore = new FirestoreRevisionStore(names.rev, db);
  subStore = new FirestoreSubmissionStore(names.subs, db);
  const progressStore = new FirestoreProgressStore(names.prog, db);
  const catalogue = fixtureCatalogue();
  const progress = new DsaProgressService(progressStore, () => catalogue);
  const analytics = new AnalyticsService({ stats: statsStore, revisions: revStore, submissions: subStore, progress, catalogue: () => catalogue, logger: silentLogger });
  const code = new CodeService({
    provider: new FakeProvider(),
    suites: suites(),
    catalogue: () => catalogue,
    progress,
    submissions: subStore,
    logger: silentLogger,
    providerVerified: true,
    allowMockToCount: true, // TEST ONLY
    onJudged: (r) => analytics.recordSubmission(r),
  });
  app = testApp({ autoAuth: false, code, analytics, catalogue, progressStore });
});

afterAll(async () => {
  for (const c of Object.values(names)) {
    const snap = await db.collection(c).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }
  await db.terminate();
});

const as = (uid: string) => ({ Authorization: bearer(uid) });
const submit = (uid: string, q: string, source: string) => request(app).post("/api/code/submit").set(as(uid)).send({ question_id: q, language: "python", source });

describe("stores on the Firestore emulator", () => {
  it("keeps one stats record per student and question and isolates owners", async () => {
    const rec = (uid: string): StatsRecord => ({
      owner_uid: uid, question_id: "q_x", topics: ["T"], difficulty: "easy", attempts: 1, accepted: 0, first_attempt: null, first_accepted_at: null,
      last_attempt_at: null, last_verdict: null, failures: { wrong_answer: 1, time_limit_exceeded: 0, compile_error: 0, runtime_error: 0 },
      consecutive_failures: 1, failures_after_solved: 0, events: [], updated_at: "2026-01-01T00:00:00Z",
    });
    await statsStore.put(rec("s-a"));
    await statsStore.put({ ...rec("s-a"), attempts: 2 });
    await statsStore.put(rec("s-b"));
    expect((await statsStore.listByOwner("s-a", 100)).map((r) => r.attempts)).toEqual([2]);
    expect(await statsStore.listByOwner("s-nobody", 100)).toEqual([]);
    expect(await statsStore.get("s-b", "q_x")).toMatchObject({ owner_uid: "s-b" });
    await statsStore.delete("s-b", "q_x");
    expect(await statsStore.get("s-b", "q_x")).toBeNull();
  });

  it("listRecentByOwner orders newest first and listCountedByOwner filters on provenance", async () => {
    const base = (id: string, at: string, status?: SubmissionRecord["analytics_status"]): SubmissionRecord => ({
      id, owner_uid: "s-list", question_id: "q_fixture_01", language: "python", source: "x", verdict: "accepted", passed: 1, total: 1, failed_test: null,
      compile_output: null, time_ms: 1, memory_kb: 1, test_revision: "t1", progress_updated: false, created_at: at, ...(status ? { analytics_status: status } : {}),
    });
    await subStore.save(base("sub_l1", "2026-03-01T00:00:00Z", "counted"));
    await subStore.save(base("sub_l2", "2026-03-03T00:00:00Z", "excluded_demonstration"));
    await subStore.save(base("sub_l3", "2026-03-02T00:00:00Z")); // legacy: no provenance
    expect((await subStore.listRecentByOwner("s-list", 10)).map((r) => r.id)).toEqual(["sub_l2", "sub_l3", "sub_l1"]);
    expect((await subStore.listRecentByOwner("s-list", 2)).map((r) => r.id)).toEqual(["sub_l2", "sub_l3"]);
    expect((await subStore.listCountedByOwner("s-list", 10)).map((r) => r.id)).toEqual(["sub_l1"]);
  });
});

describe("index check on the emulator", () => {
  it("runs the exact query that needs the composite index (the emulator does not enforce indexes, so this is not proof of a deployment)", async () => {
    expect(await checkSubmissionIndex(db, names.subs)).toMatchObject({ ok: true });
  });
});

describe("analytics over Firestore on the emulator", () => {
  it("persists statistics and one revision item per question, and keeps students apart", async () => {
    await submit("emu-alice", "q_fixture_01", "WRONG").expect(200);
    await submit("emu-alice", "q_fixture_01", "WRONG").expect(200);
    await submit("emu-alice", "q_fixture_02", "ECHO").expect(200);

    const o = (await request(app).get("/api/me/dsa-analytics").set(as("emu-alice")).expect(200)).body;
    expect(o.totals).toEqual({ solved_unique: 1, attempted_unique: 2, eligible_attempts: 3, accepted_attempts: 1 });
    expect(o.exclusions).toMatchObject({ available: true, sampled_submissions: 3 });

    const q = (await request(app).get("/api/me/dsa-revision?view=all").set(as("emu-alice")).expect(200)).body;
    expect(q.items).toHaveLength(1);
    expect(q.items[0]).toMatchObject({ question_id: "q_fixture_01", reason: "unsolved_attempted" });
    expect((await revStore.listByOwner("emu-alice", 100)).filter((r) => r.question_id === "q_fixture_01")).toHaveLength(1);

    const bob = (await request(app).get("/api/me/dsa-analytics").set(as("emu-bob")).expect(200)).body;
    expect(bob.totals.eligible_attempts).toBe(0);
    await request(app).post("/api/me/dsa-revision/q_fixture_01/actions").set(as("emu-bob")).send({ action: "start" }).expect(404);

    await request(app).post("/api/me/dsa-revision/q_fixture_01/actions").set(as("emu-alice")).send({ action: "postpone", days: 2 }).expect(200);
    const refreshed = (await request(app).post("/api/me/dsa-analytics/refresh").set(as("emu-alice")).expect(200)).body;
    expect(refreshed.totals).toEqual(o.totals); // rebuilt from stored submissions, same numbers
    expect((await request(app).get("/api/me/dsa-revision/q_fixture_01").set(as("emu-alice"))).body).toMatchObject({ status: "postponed" });
  });
});
