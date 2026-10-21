import request from "supertest";
import { describe, expect, it } from "vitest";
import { DBMS_TOPICS, PATTERNS } from "../../src/learn/content/index.js";
import { bearer, testApp } from "./app.js";

const as = (uid: string) => ({ Authorization: bearer(uid) });
const NOW = new Date("2026-10-21T10:00:00Z");
const setup = () => testApp({ autoAuth: false, now: () => NOW });
const correct = (topicId: string) => DBMS_TOPICS.find((t) => t.id === topicId)!.quiz.map((q) => q.answer);
const wrong = (topicId: string) => DBMS_TOPICS.find((t) => t.id === topicId)!.quiz.map((q) => (q.answer + 1) % 4);

describe("the learning content is public", () => {
  it("lists patterns and DBMS topics with no sign-in, and lets the browser cache them", async () => {
    const app = setup();
    const p = await request(app).get("/api/learn/patterns").expect(200);
    expect(p.headers["cache-control"]).toMatch(/public/);
    expect(p.body.patterns).toHaveLength(PATTERNS.length);
    expect(p.body.patterns[0]).toMatchObject({ id: "two-pointers-opposite", name: "Two Pointers: opposite ends", topic: "Arrays and Strings", level: "core" });
    expect(p.body.patterns[0].cues.length).toBeGreaterThan(2);
    expect(p.body.topics[0]).toBe("Arrays and Strings");
    expect(p.body.topics.at(-1)).toBe("Dynamic Programming");
    const d = await request(app).get("/api/learn/dbms").expect(200);
    expect(d.body.topics).toHaveLength(DBMS_TOPICS.length);
    expect(d.body.groups[0]).toBe("Design");
  });

  it("returns a pattern in full, with problem links built by the server and related names resolved", async () => {
    const r = await request(setup()).get("/api/learn/patterns/sliding-window-variable").expect(200);
    expect(r.body.template).toContain("def longest_unique");
    expect(r.body.complexity.time).toMatch(/O\(n\)/);
    const lc = r.body.problems.find((p: { key: string }) => p.key === "longest-substring-without-repeating-characters");
    expect(lc).toMatchObject({ url: "https://leetcode.com/problems/longest-substring-without-repeating-characters/", practice_id: "fp_021_longest_unique_stretch" });
    const own = r.body.problems.find((p: { key: string }) => p.key === "fp_008_window_distinct");
    expect(own).toMatchObject({ url: null, practice_id: "fp_008_window_distinct" });
    expect(r.body.related[0]).toEqual({ id: "sliding-window-fixed", name: "Sliding Window: fixed size" });
  });

  it("never sends quiz answers with the questions, anywhere in a topic", async () => {
    const r = await request(setup()).get("/api/learn/dbms/joins").expect(200);
    expect(r.body.quiz).toHaveLength(4);
    for (const q of r.body.quiz) expect(Object.keys(q).sort()).toEqual(["id", "options", "question"]);
    expect(JSON.stringify(r.body)).not.toMatch(/"answer"|"why"/);
    expect(r.body.example.rows).toEqual([["Asha", 2, 350], ["Meena", 0, 0], ["Ravi", 1, 75]]);
  });

  it("answers an unknown or malformed id with a clean 404 or 400", async () => {
    const app = setup();
    expect((await request(app).get("/api/learn/patterns/nope").expect(404)).body.error.code).toBe("LEARN_NOT_FOUND");
    expect((await request(app).get("/api/learn/dbms/nope").expect(404)).body.error.code).toBe("LEARN_NOT_FOUND");
    expect((await request(app).get("/api/learn/patterns/..%2Fetc").expect(400)).body.error.code).toBe("BAD_REQUEST");
  });
});

describe("progress and quizzes need a verified student", () => {
  it("rejects missing and invalid tokens", async () => {
    const app = setup();
    for (const r of [
      await request(app).get("/api/learn/progress"),
      await request(app).put("/api/learn/patterns/kadane/progress").send({ done: true }),
      await request(app).post("/api/learn/dbms/joins/quiz").send({ answers: [0, 0, 0, 0] }),
      await request(app).get("/api/learn/progress").set({ Authorization: "Bearer nope" }),
    ]) expect(r.status).toBe(401);
  });
});

describe("DBMS quizzes", () => {
  it("grades on the server, explains every question, and records the attempt", async () => {
    const app = setup();
    const r = await request(app).post("/api/learn/dbms/joins/quiz").set(as("alice")).send({ answers: correct("joins") }).expect(200);
    expect(r.body).toMatchObject({ topic_id: "joins", score: 4, total: 4, pass_mark: 3, passed: true });
    expect(r.body.results).toHaveLength(4);
    for (const x of r.body.results) expect(x).toMatchObject({ correct: true, why: expect.any(String) });
    expect(r.body.progress).toEqual({ best_score: 4, total: 4, attempts: 1, passed_at: NOW.toISOString(), last_attempt_at: NOW.toISOString() });
    const prog = await request(app).get("/api/learn/progress").set(as("alice")).expect(200);
    expect(prog.body).toMatchObject({ dbms_passed: 1, dbms_total: DBMS_TOPICS.length, patterns_done: 0, patterns_total: PATTERNS.length });
  });

  it("passes at three of four, fails below, and says which answers were wrong", async () => {
    const app = setup();
    const three = correct("keys-constraints");
    three[0] = (three[0]! + 1) % 4;
    const ok = await request(app).post("/api/learn/dbms/keys-constraints/quiz").set(as("alice")).send({ answers: three }).expect(200);
    expect(ok.body).toMatchObject({ score: 3, passed: true });
    expect(ok.body.results.map((x: { correct: boolean }) => x.correct)).toEqual([false, true, true, true]);
    const bad = await request(app).post("/api/learn/dbms/sql-basics/quiz").set(as("alice")).send({ answers: wrong("sql-basics") }).expect(200);
    expect(bad.body).toMatchObject({ score: 0, passed: false });
    expect(bad.body.progress.passed_at).toBeNull();
  });

  it("keeps the best score and the first pass: a worse retry never undoes a pass", async () => {
    const app = setup();
    const post = (answers: number[]) => request(app).post("/api/learn/dbms/indexing/quiz").set(as("alice")).send({ answers }).expect(200);
    const first = await post(wrong("indexing"));
    expect(first.body.progress).toMatchObject({ best_score: 0, attempts: 1, passed_at: null });
    const second = await post(correct("indexing"));
    expect(second.body.progress).toMatchObject({ best_score: 4, attempts: 2, passed_at: NOW.toISOString() });
    const third = await post(wrong("indexing"));
    expect(third.body).toMatchObject({ score: 0, passed: false });
    expect(third.body.progress).toMatchObject({ best_score: 4, attempts: 3, passed_at: NOW.toISOString() });
  });

  it("rejects the wrong number of answers, out-of-range answers and unknown keys", async () => {
    const app = setup();
    const post = (b: object, id = "joins") => request(app).post(`/api/learn/dbms/${id}/quiz`).set(as("alice")).send(b);
    expect((await post({ answers: [0, 1, 2] })).status).toBe(400);
    expect((await post({ answers: [0, 1, 2, 3, 0] })).status).toBe(400);
    expect((await post({ answers: [0, 1, 2, 4] })).status).toBe(400);
    expect((await post({ answers: [0, 1, -1, 3] })).status).toBe(400);
    expect((await post({ answers: [0, 1, 1.5, 3] })).status).toBe(400);
    expect((await post({ answers: [0, 1, 2, 3], score: 4 })).status).toBe(400); // a student cannot send a score
    expect((await post({})).status).toBe(400);
    expect((await post({ answers: [0, 1, 2, 3] }, "nope")).status).toBe(404);
  });

  it("keeps every student's progress private", async () => {
    const app = setup();
    await request(app).post("/api/learn/dbms/joins/quiz").set(as("alice")).send({ answers: correct("joins") }).expect(200);
    expect((await request(app).get("/api/learn/progress").set(as("bob")).expect(200)).body).toMatchObject({ dbms_passed: 0, progress: { dbms: {} } });
    expect((await request(app).get("/api/learn/progress").set(as("alice")).expect(200)).body.dbms_passed).toBe(1);
  });
});

describe("pattern progress", () => {
  const put = (app: ReturnType<typeof setup>, id: string, body: object, uid = "alice") => request(app).put(`/api/learn/patterns/${id}/progress`).set(as(uid)).send(body);

  it("records finished problems and patterns, ignores repeats, and keeps them in the pattern's own order", async () => {
    const app = setup();
    await put(app, "kadane", { problems: [{ key: "maximum-product-subarray", done: true }, { key: "maximum-subarray", done: true }] }).expect(200);
    const r = await put(app, "kadane", { done: true, problems: [{ key: "maximum-subarray", done: true }] }).expect(200);
    expect(r.body.progress.patterns.kadane).toEqual({ done: true, problems_done: ["maximum-subarray", "maximum-product-subarray"] });
    expect(r.body).toMatchObject({ patterns_done: 1, patterns_total: PATTERNS.length });
    const undo = await put(app, "kadane", { done: false, problems: [{ key: "maximum-subarray", done: false }] }).expect(200);
    expect(undo.body.progress.patterns.kadane).toEqual({ done: false, problems_done: ["maximum-product-subarray"] });
  });

  it("accepts an UNBLUFF question id as a problem key", async () => {
    const r = await put(setup(), "kadane", { problems: [{ key: "fp_018_best_stretch", done: true }] }).expect(200);
    expect(r.body.progress.patterns.kadane.problems_done).toEqual(["fp_018_best_stretch"]);
  });

  it("refuses a problem from another pattern, an unknown pattern, an empty update and unknown fields", async () => {
    const app = setup();
    expect((await put(app, "kadane", { problems: [{ key: "two-sum", done: true }] })).status).toBe(400);
    expect((await put(app, "nope", { done: true })).status).toBe(404);
    expect((await put(app, "kadane", {})).status).toBe(400);
    expect((await put(app, "kadane", { done: true, owner_uid: "bob" })).status).toBe(400);
    expect((await put(app, "kadane", { problems: [{ key: "maximum-subarray", done: true, extra: 1 }] })).status).toBe(400);
  });
});
