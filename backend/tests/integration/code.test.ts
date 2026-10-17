import request from "supertest";
import { describe, expect, it } from "vitest";
import { CodeService } from "../../src/code/service.js";
import { MemorySubmissionStore } from "../../src/code/submissionStore.js";
import { MemoryProgressStore } from "../../src/dsa/progressStore.js";
import { DsaProgressService } from "../../src/dsa/progressService.js";
import { FakeProvider } from "../code/fakeProvider.js";
import { silentLogger } from "../helpers.js";
import { bearer, fixtureCatalogue, fixtureSuites, testApp } from "./app.js";

const Q = "q_fixture_06"; // demonstration exercise: pair sum
const NO_SUITE = "q_fixture_02";

const pairSum = (stdin: string): string => {
  const [head, arr] = stdin.trim().split("\n");
  const target = Number(head!.split(" ")[1]);
  const a = (arr ?? "").split(" ").filter(Boolean).map(Number);
  const seen = new Set<number>();
  for (const x of a) {
    if (seen.has(target - x)) return "YES";
    seen.add(x);
  }
  return "NO";
};

function setup(opts: { provider?: FakeProvider; judgeDeadlineMs?: number; rateLimits?: Parameters<typeof testApp>[0] extends infer O ? (O extends { rateLimits?: infer R } ? R : never) : never } = {}) {
  const provider = opts.provider ?? new FakeProvider({ solve: pairSum });
  const progressStore = new MemoryProgressStore();
  const submissionStore = new MemorySubmissionStore();
  const catalogue = fixtureCatalogue();
  const progress = new DsaProgressService(progressStore, () => catalogue);
  const code = new CodeService({
    provider,
    suites: fixtureSuites(),
    catalogue: () => catalogue,
    progress,
    submissions: submissionStore,
    logger: silentLogger,
    judgeDeadlineMs: opts.judgeDeadlineMs,
  });
  const app = testApp({ autoAuth: false, code, catalogue, progressStore, rateLimits: opts.rateLimits });
  return { app, provider, progressStore, submissionStore };
}

const as = (uid: string) => ({ Authorization: bearer(uid) });
const run = (app: ReturnType<typeof setup>["app"], uid: string, body: object) => request(app).post("/api/code/run").set(as(uid)).send(body);
const submit = (app: ReturnType<typeof setup>["app"], uid: string, source: string, language = "python", question_id = Q) =>
  request(app).post("/api/code/submit").set(as(uid)).send({ question_id, language, source });
const progressOf = async (app: ReturnType<typeof setup>["app"], uid: string) => (await request(app).get("/api/me/dsa-progress").set(as(uid)).expect(200)).body.progress as { question_id: string; status: string }[];

describe("languages and exercises (public)", () => {
  it("lists exactly the languages the service reports, with its real version names", async () => {
    const { app } = setup();
    const res = await request(app).get("/api/code/languages").expect(200);
    expect(res.body.execution_available).toBe(true);
    expect(res.body.languages.map((l: { id: string; name: string }) => [l.id, l.name])).toEqual([
      ["python", "Python (3.14.0)"],
      ["javascript", "JavaScript (Node.js 22.08.0)"],
      ["cpp", "C++ (GCC 14.1.0)"],
      ["java", "Java (JDK 17.0.6)"],
    ]);
    expect(JSON.stringify(res.body)).not.toMatch(/providerId|"id":\s*\d/); // provider ids stay server-side
  });

  it("reports no languages, honestly, when no execution service is configured", async () => {
    const app = testApp({ autoAuth: false }); // UnavailableProvider
    const res = await request(app).get("/api/code/languages").expect(200);
    expect(res.body).toEqual({ languages: [], execution_available: false });
  });

  it("reports no languages when the service is unreachable instead of guessing", async () => {
    const provider = new FakeProvider();
    provider.listLanguages = async () => {
      throw new Error("down");
    };
    const { app } = setup({ provider });
    expect((await request(app).get("/api/code/languages").expect(200)).body).toEqual({ languages: [], execution_available: false });
  });

  it("shows samples and a hidden-test count but never the hidden tests", async () => {
    const { app } = setup();
    const res = await request(app).get(`/api/code/exercises/${Q}`).expect(200);
    expect(res.body).toMatchObject({ gradable: true, is_demonstration: true, hidden_test_count: 8, test_revision: "demo-1" });
    expect(res.body.samples).toHaveLength(2);
    const suite = fixtureSuites().suite(Q)!;
    const sampleInputs = new Set(suite.samples.map((s) => s.input));
    const body = JSON.stringify(res.body);
    const hiddenInputs = suite.tests.map((t) => t.input).filter((i) => !sampleInputs.has(i));
    expect(hiddenInputs.length).toBeGreaterThan(4);
    for (const input of hiddenInputs) expect(body).not.toContain(JSON.stringify(input).slice(1, -1));
    expect(res.body).not.toHaveProperty("tests");
  });

  it("marks questions without a suite as not gradable and rejects unknown ids", async () => {
    const { app } = setup();
    const res = await request(app).get(`/api/code/exercises/${NO_SUITE}`).expect(200);
    expect(res.body).toMatchObject({ gradable: false, samples: [], hidden_test_count: 0, statement: null });
    expect((await request(app).get("/api/code/exercises/q_ghost")).body.error.code).toBe("QUESTION_NOT_FOUND");
    expect((await request(app).get("/api/code/exercises/Bad%20Id")).status).toBe(400);
  });
});

describe("authentication and validation", () => {
  it("requires a token for every private code route", async () => {
    const { app } = setup();
    for (const res of [
      await request(app).post("/api/code/run").send({ language: "python", source: "x" }),
      await request(app).post("/api/code/submit").send({ question_id: Q, language: "python", source: "x" }),
      await request(app).get("/api/code/submissions"),
      await request(app).get("/api/code/submissions/sub_x"),
      await request(app).delete("/api/code/submissions/sub_x"),
    ]) {
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("UNAUTHENTICATED");
    }
  });

  it("validates language, sizes and body shape", async () => {
    const { app, provider } = setup();
    const bad = [
      { language: "cobol", source: "x" },
      { language: "python", source: "" },
      { language: "python" },
      { language: "python", source: "x".repeat(50_001) },
      { language: "python", source: "x", stdin: "y".repeat(20_001) },
      { language: "python", source: "x", sample_index: 0 },
      { language: "python", source: "x", question_id: Q, sample_index: 0, stdin: "1" },
      { language: "python", source: "x", question_id: Q, sample_index: 9 },
      { language: "python", source: "x", extra: 1 },
      { language: "python", source: "x", provider_url: "http://169.254.169.254/" },
    ];
    for (const body of bad) {
      const res = await run(app, "alice", body);
      expect(res.status, JSON.stringify(body).slice(0, 80)).toBe(400);
    }
    expect((await submit(app, "alice", "x".repeat(50_001))).status).toBe(400);
    expect((await submit(app, "alice", "x", "python", "Bad Id")).status).toBe(400);
    expect(provider.calls).toHaveLength(0); // nothing invalid ever reached the execution service
  });

  it("counts source size in bytes, not characters", async () => {
    const { app } = setup();
    const res = await run(app, "alice", { language: "python", source: "€".repeat(20_000) }); // 60,000 bytes
    expect(res.status).toBe(400);
  });

  it("is honest when no execution service is configured: 503, never a fake result", async () => {
    const app = testApp({ autoAuth: false });
    const r = await run(app, "alice", { language: "python", source: "print(1)", stdin: "" });
    expect(r.status).toBe(503);
    expect(r.body.error.code).toBe("EXECUTION_UNAVAILABLE");
    const s = await submit(app, "alice", "print(1)");
    expect(s.status).toBe(503);
    expect(JSON.stringify(s.body)).not.toMatch(/accepted/);
  });
});

describe("run", () => {
  it("returns the program's real output for custom input and passes limits to the service", async () => {
    const { app, provider } = setup();
    const res = await run(app, "alice", { language: "python", source: "ECHO", stdin: "hello\n" }).expect(200);
    expect(res.body).toMatchObject({ status: "completed", stdout: "hello\n", sample_passed: null });
    expect(provider.calls[0]).toMatchObject({ providerLanguageId: 113, stdin: "hello\n", limits: { cpuTimeSeconds: 2, memoryMb: 128 } });
  });

  it.each([
    ["COMPILE", "compile_error"],
    ["RUNTIME", "runtime_error"],
    ["SLOW", "time_limit_exceeded"],
    ["JUDGE", "judge_error"],
  ])("reports %s as %s with diagnostics", async (marker, status) => {
    const { app } = setup();
    const res = await run(app, "alice", { language: "python", source: marker, stdin: "" }).expect(200);
    expect(res.body.status).toBe(status);
    if (marker === "COMPILE") expect(res.body.compile_output).toContain("expected ';'");
    if (marker === "RUNTIME") expect(res.body.stderr).toContain("ZeroDivisionError");
  });

  it("runs a visible sample and says whether it matched, without touching progress or history", async () => {
    const { app, submissionStore } = setup();
    const pass = await run(app, "alice", { language: "python", source: "OK", question_id: Q, sample_index: 0 }).expect(200);
    expect(pass.body).toMatchObject({ status: "completed", sample_passed: true });
    const fail = await run(app, "alice", { language: "python", source: "WRONG", question_id: Q, sample_index: 1 }).expect(200);
    expect(fail.body).toMatchObject({ status: "completed", sample_passed: false });
    expect(await progressOf(app, "alice")).toEqual([]);
    expect(await submissionStore.listByOwner("alice")).toEqual([]);
  });

  it("rejects a sample for a question that has none", async () => {
    const { app } = setup();
    expect((await run(app, "alice", { language: "python", source: "OK", question_id: NO_SUITE, sample_index: 0 })).status).toBe(400);
  });

  it("maps provider outages and timeouts to 503 without infrastructure details", async () => {
    const { app } = setup();
    for (const marker of ["THROW", "DOWN_AFTER_FIRST"]) {
      const provider = new FakeProvider({ solve: pairSum });
      provider.calls.push({} as never); // makes DOWN_AFTER_FIRST fail on its first real call
      const ctx = setup({ provider });
      const res = await run(ctx.app, "alice", { language: "python", source: marker, stdin: "" });
      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe("EXECUTION_UNAVAILABLE");
      expect(JSON.stringify(res.body)).not.toMatch(/judge|10\.|http|token/i);
    }
    void app;
  });

  it("limits a user to two runs in flight and rate limits per user, not per address", async () => {
    const { app } = setup();
    const slow = () => run(app, "alice", { language: "python", source: "SLEEP ECHO", stdin: "x" });
    const results = await Promise.all([slow(), slow(), slow()]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 200, 429]);

    const limited = setup({ rateLimits: { globalPerMinute: 1000, llmPerMinute: 1000, codeRunPerMinute: 2, codeSubmitPerMinute: 2 } });
    const statuses = [];
    for (let i = 0; i < 3; i++) statuses.push((await run(limited.app, "alice", { language: "python", source: "ECHO", stdin: "x" })).status);
    expect(statuses).toEqual([200, 200, 429]);
    expect((await run(limited.app, "bob", { language: "python", source: "ECHO", stdin: "x" })).status).toBe(200); // another user is unaffected
  });
});

describe("submit and grading", () => {
  it("accepts a correct solution, stores it under the owner, and only then marks the question solved", async () => {
    const { app, submissionStore } = setup();
    expect(await progressOf(app, "alice")).toEqual([]);
    const res = await submit(app, "alice", "OK").expect(200);
    expect(res.body).toMatchObject({ verdict: "accepted", passed: 8, total: 8, failed_test: null, progress_updated: true, test_revision: "demo-1", question_id: Q, language: "python" });
    expect(res.body.id).toMatch(/^sub_/);
    expect(res.body.owner_uid).toBeUndefined();
    expect(res.body.source).toBeUndefined();
    expect(await progressOf(app, "alice")).toEqual([expect.objectContaining({ question_id: Q, status: "solved" })]);
    const stored = await submissionStore.listByOwner("alice");
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ owner_uid: "alice", source: "OK" });
    expect(await progressOf(app, "bob")).toEqual([]);
  });

  it("a wrong answer is recorded but never marks the question solved, and reveals only the failing test number", async () => {
    const { app } = setup();
    const res = await submit(app, "alice", "WRONG").expect(200);
    expect(res.body).toMatchObject({ verdict: "wrong_answer", passed: 0, total: 8, failed_test: 1, progress_updated: false });
    expect(await progressOf(app, "alice")).toEqual([]);
  });

  it.each([
    ["COMPILE", "compile_error"],
    ["RUNTIME", "runtime_error"],
    ["SLOW", "time_limit_exceeded"],
    ["JUDGE", "judge_error"],
  ])("verdict for %s is %s and progress is unchanged", async (marker, verdict) => {
    const { app } = setup();
    const res = await submit(app, "alice", marker).expect(200);
    expect(res.body.verdict).toBe(verdict);
    expect(res.body.progress_updated).toBe(false);
    if (marker === "COMPILE") {
      expect(res.body.compile_output).toContain("expected ';'");
    } else {
      expect(res.body.compile_output).toBeNull();
    }
    expect(await progressOf(app, "alice")).toEqual([]);
  });

  it("compiles once: a compile error stops judging after the first test", async () => {
    const { app, provider } = setup();
    await submit(app, "alice", "COMPILE").expect(200);
    expect(provider.calls).toHaveLength(1);
  });

  it("a later failing submission never downgrades a question already solved", async () => {
    const { app } = setup();
    await submit(app, "alice", "OK").expect(200);
    await submit(app, "alice", "WRONG").expect(200);
    expect(await progressOf(app, "alice")).toEqual([expect.objectContaining({ status: "solved" })]);
  });

  it("refuses to judge a question without a validated suite: nothing is recorded, nothing is called", async () => {
    const { app, provider, submissionStore } = setup();
    const res = await submit(app, "alice", "OK", "python", NO_SUITE);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("GRADING_UNAVAILABLE");
    expect(provider.calls).toHaveLength(0);
    expect(await submissionStore.listByOwner("alice")).toEqual([]);
    expect(await progressOf(app, "alice")).toEqual([]);
    expect((await submit(app, "alice", "OK", "python", "q_ghost")).body.error.code).toBe("QUESTION_NOT_FOUND");
  });

  it("a provider failure mid-judging returns 503 and stores nothing", async () => {
    const { app, submissionStore } = setup();
    const res = await submit(app, "alice", "DOWN_AFTER_FIRST");
    expect(res.status).toBe(503);
    expect(await submissionStore.listByOwner("alice")).toEqual([]);
    expect(await progressOf(app, "alice")).toEqual([]);
  });

  it("running out of judging time is a judge_error, never an accepted verdict", async () => {
    const { app } = setup({ judgeDeadlineMs: 1 });
    const res = await submit(app, "alice", "SLEEP OK").expect(200);
    expect(res.body.verdict).toBe("judge_error");
    expect(res.body.passed).toBeLessThan(res.body.total);
    expect(await progressOf(app, "alice")).toEqual([]);
  });

  it("allows one judging job per user at a time", async () => {
    const { app } = setup();
    const a = submit(app, "alice", "SLEEP OK");
    const b = submit(app, "alice", "SLEEP OK");
    const statuses = (await Promise.all([a, b])).map((r) => r.status).sort();
    expect(statuses).toEqual([200, 429]);
  });

  it("rate limits submissions per user", async () => {
    const { app } = setup({ rateLimits: { globalPerMinute: 1000, llmPerMinute: 1000, codeRunPerMinute: 20, codeSubmitPerMinute: 2 } });
    const statuses = [];
    for (let i = 0; i < 3; i++) statuses.push((await submit(app, "alice", "OK")).status);
    expect(statuses).toEqual([200, 200, 429]);
  });
});

describe("submission history and ownership", () => {
  it("lists only the caller's submissions, newest first, without source or owner", async () => {
    const { app } = setup();
    await submit(app, "alice", "WRONG").expect(200);
    await new Promise((r) => setTimeout(r, 5));
    const second = (await submit(app, "alice", "OK").expect(200)).body;
    await submit(app, "bob", "OK").expect(200);

    const res = await request(app).get("/api/code/submissions").set(as("alice")).expect(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.body.submissions.map((s: { id: string }) => s.id)[0]).toBe(second.id);
    expect(res.body.submissions).toHaveLength(2);
    expect(JSON.stringify(res.body)).not.toMatch(/owner_uid|"source"/);
    const filtered = await request(app).get(`/api/code/submissions?question_id=${NO_SUITE}`).set(as("alice")).expect(200);
    expect(filtered.body.submissions).toEqual([]);
    expect((await request(app).get("/api/code/submissions?bogus=1").set(as("alice"))).status).toBe(400);
  });

  it("returns the source only to the owner; others get the same 404 as for a missing id", async () => {
    const { app } = setup();
    const id = (await submit(app, "alice", "OK # my secret solution").expect(200)).body.id as string;
    const mine = await request(app).get(`/api/code/submissions/${id}`).set(as("alice")).expect(200);
    expect(mine.body.source).toBe("OK # my secret solution");
    expect(mine.body.owner_uid).toBeUndefined();

    const other = await request(app).get(`/api/code/submissions/${id}`).set(as("bob")).expect(404);
    const missing = await request(app).get("/api/code/submissions/sub_does-not-exist").set(as("bob")).expect(404);
    expect(other.body.error.code).toBe("SUBMISSION_NOT_FOUND");
    expect(JSON.stringify(other.body)).not.toContain("secret solution");
    expect(other.body.error.message.replace(id, "X")).toBe(missing.body.error.message.replace("sub_does-not-exist", "X"));
    expect((await request(app).get("/api/code/submissions/Bad%20Id").set(as("alice"))).status).toBe(400);
  });

  it("deletion is owner-only and removes the stored source", async () => {
    const { app, submissionStore } = setup();
    const id = (await submit(app, "alice", "OK").expect(200)).body.id as string;
    await request(app).delete(`/api/code/submissions/${id}`).set(as("bob")).expect(404);
    expect(await submissionStore.get(id)).not.toBeNull();
    await request(app).delete(`/api/code/submissions/${id}`).set(as("alice")).expect(204);
    expect(await submissionStore.get(id)).toBeNull();
    await request(app).get(`/api/code/submissions/${id}`).set(as("alice")).expect(404);
    await request(app).delete(`/api/code/submissions/${id}`).set(as("alice")).expect(404);
  });
});

describe("hidden test isolation", () => {
  it("no response from any code route ever contains hidden test inputs or expected outputs", async () => {
    const { app } = setup();
    const hidden = fixtureSuites().suite(Q)!.tests;
    const bodies: string[] = [];
    const collect = (r: { text: string }) => bodies.push(r.text);

    collect(await request(app).get(`/api/code/exercises/${Q}`));
    collect(await request(app).get("/api/code/languages"));
    collect(await submit(app, "alice", "WRONG"));
    collect(await submit(app, "alice", "RUNTIME"));
    const accepted = await submit(app, "alice", "OK");
    collect(accepted);
    collect(await request(app).get("/api/code/submissions").set(as("alice")));
    collect(await request(app).get(`/api/code/submissions/${accepted.body.id}`).set(as("alice")));
    collect(await run(app, "alice", { language: "python", source: "WRONG", question_id: Q, sample_index: 0 }));

    const sampleInputs = new Set(fixtureSuites().suite(Q)!.samples.map((s) => s.input));
    const secrets = hidden.flatMap((t) => [t.input, t.expected_output]).filter((s) => s.length > 12 && !sampleInputs.has(s));
    expect(secrets.length).toBeGreaterThan(4);
    for (const text of bodies) for (const s of secrets) expect(text).not.toContain(JSON.stringify(s).slice(1, -1));
  });

  it("the public question catalogue never references grading data", async () => {
    const { app } = setup();
    const text = (await request(app).get("/api/questions?page_size=100")).text + (await request(app).get(`/api/questions/${Q}`)).text;
    expect(text).not.toMatch(/expected_output|hidden_test|"tests"|test_revision/);
  });
});
