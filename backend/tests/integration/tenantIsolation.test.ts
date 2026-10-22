import { describe, expect, it } from "vitest";
import request from "supertest";
import { CodeService } from "../../src/code/service.js";
import { MemorySubmissionStore } from "../../src/code/submissionStore.js";
import { DsaProgressService } from "../../src/dsa/progressService.js";
import { MemoryProgressStore } from "../../src/dsa/progressStore.js";
import { FakeProvider } from "../code/fakeProvider.js";
import { silentLogger } from "../helpers.js";
import { bearer, fixtureCatalogue, fixtureSuites, sampleResume, testApp } from "./app.js";

/**
 * Tenant isolation: one student must never be able to read, change, list or delete another student's data, whatever
 * route, id, query string, header or body they use. Alice writes a unique canary string into every private domain;
 * Bob then walks every read route (and tries Alice's ids) and none of Alice's data may appear in anything he is sent
 * or be altered by anything he does. The owner is always the verified token's uid.
 */
const CANARY = "CANARY-7f3a91c2e5";
const alice = { Authorization: bearer("alice") };
const bob = { Authorization: bearer("bob") };

const PROFILE = {
  role_ids: ["frontend_developer"],
  target_companies: [`${CANARY}-corp`],
  placement_date: "2027-03-15",
  available_weekdays: [1, 2, 3, 4, 5],
  daily_minutes: 60,
  preferred_language: "python",
  experience_level: "intermediate",
  strengths: [],
  weak_areas: [`${CANARY}-topic`],
  priorities: ["dsa"],
};

async function seedAlice(app: ReturnType<typeof testApp>) {
  const ids: Record<string, string> = {};
  const ok = (res: request.Response, what: string) => {
    expect([200, 201, 204], `${what}: ${res.status} ${JSON.stringify(res.body).slice(0, 200)}`).toContain(res.status);
    return res;
  };
  // interview session
  const ext = ok(await request(app).post("/api/claims/extract").set(alice).send({ role_id: "frontend_developer", resume_text: `${sampleResume}\nSide project: ${CANARY}-project built with React.` }), "session");
  ids.session = ext.body.session_id;
  // DSA progress
  ok(await request(app).put("/api/me/dsa-progress/q_fixture_03").set(alice).send({ status: "solved", notes: `${CANARY}-note`, bookmarked: true }), "dsa progress");
  // mentor: a conversation and a memory
  const chat = ok(await request(app).post("/api/mentor/chat").set(alice).send({ mode: "dsa_coach", message: `Please help me with ${CANARY}-question`, client_message_id: "cm_alice_0001" }), "mentor chat");
  ids.conversation = chat.body.conversation.id;
  const mem = ok(await request(app).post("/api/mentor/memories").set(alice).send({ type: "goal", content: `${CANARY}-goal` }), "mentor memory");
  ids.memory = mem.body.id ?? mem.body.memory?.id;
  // placement, career, LeetCode, résumé, learn
  ok(await request(app).put("/api/placement/profile").set(alice).send(PROFILE), "placement profile");
  ok(await request(app).put("/api/career/preferences").set(alice).send({ categories: ["frontend"], skills: ["react"], countries: ["in"], cities: [`${CANARY}-city`], work_modes: ["remote"], employment_types: ["internship"], must_match_location: false, must_match_work_mode: false, must_match_employment: false }), "career preferences");
  ok(await request(app).put("/api/leetcode/connection").set(alice).send({ profile: "https://leetcode.com/u/CanaryAlice77/" }), "leetcode connection");
  ok(await request(app).put("/api/resume").set(alice).send({ latex: `\\documentclass{article}\\begin{document}${CANARY}-resume\\end{document}` }), "resume");
  ok(await request(app).put("/api/learn/patterns/two-pointers-opposite/progress").set(alice).send({ done: true }), "learn progress");
  ok(await request(app).post("/api/learn/dbms/joins/quiz").set(alice).send({ answers: [0, 0, 0, 0] }), "dbms quiz");
  ok(await request(app).put("/api/me/profile").set(alice).send({ display_name: `${CANARY}-name`, college: `${CANARY}-college`, graduation_year: 2026, target_role_id: "frontend_developer" }), "account profile");
  return ids;
}

/** Every private read route, with no per-student id. */
const READ_ROUTES = [
  "/api/sessions",
  "/api/me/dsa-progress",
  "/api/me/dsa-analytics",
  "/api/me/dsa-revision",
  "/api/code/submissions",
  "/api/mentor/conversations",
  "/api/mentor/memories",
  "/api/mentor/profile",
  "/api/github/connection",
  "/api/placement/profile",
  "/api/placement/dashboard",
  "/api/career/preferences",
  "/api/career/resume-skills",
  "/api/career/tracked",
  "/api/leetcode/connection",
  "/api/leetcode/insights",
  "/api/leetcode/import-history",
  "/api/resume",
  "/api/learn/progress",
  "/api/me/profile",
  "/api/me/export",
];

describe("tenant isolation", () => {
  it("Bob never sees any of Alice's data on any read route", async () => {
    const app = testApp({ autoAuth: false });
    await seedAlice(app);
    // sanity: Alice does see her own canary somewhere, so the check below is meaningful
    const aliceSees = await Promise.all(READ_ROUTES.map(async (p) => JSON.stringify((await request(app).get(p).set(alice)).body)));
    expect(aliceSees.filter((b) => b.includes(CANARY)).length).toBeGreaterThanOrEqual(6);
    for (const path of READ_ROUTES) {
      const res = await request(app).get(path).set(bob);
      expect(res.status, path).toBeLessThan(500);
      expect(JSON.stringify(res.body), path).not.toContain(CANARY);
      expect(JSON.stringify(res.body), path).not.toContain("CanaryAlice77");
      expect(JSON.stringify(res.body), path).not.toContain("alice");
    }
  });

  it("Bob cannot read, change or delete Alice's records by id, and they survive his attempts", async () => {
    const app = testApp({ autoAuth: false });
    const ids = await seedAlice(app);
    const notFound = [404, 403];
    const attempts: [string, request.Test][] = [
      ["report", request(app).get(`/api/report/${ids.session}`).set(bob)],
      ["resume session", request(app).get(`/api/sessions/${ids.session}`).set(bob)],
      ["delete session", request(app).delete(`/api/sessions/${ids.session}`).set(bob)],
      ["get conversation", request(app).get(`/api/mentor/conversations/${ids.conversation}`).set(bob)],
      ["summarise conversation", request(app).post(`/api/mentor/conversations/${ids.conversation}/summary`).set(bob).send({})],
      ["delete conversation", request(app).delete(`/api/mentor/conversations/${ids.conversation}`).set(bob)],
      ["patch memory", request(app).patch(`/api/mentor/memories/${ids.memory}`).set(bob).send({ content: "hijacked" })],
      ["delete memory", request(app).delete(`/api/mentor/memories/${ids.memory}`).set(bob)],
      ["continue conversation", request(app).post("/api/mentor/chat").set(bob).send({ conversation_id: ids.conversation, mode: "dsa_coach", message: "hello", client_message_id: "cm_bob_0001" })],
    ];
    for (const [what, req] of attempts) {
      const res = await req;
      expect(notFound, `${what} -> ${res.status}`).toContain(res.status);
      expect(JSON.stringify(res.body), what).not.toContain(CANARY);
    }
    // Alice's data is intact
    expect((await request(app).get(`/api/mentor/conversations/${ids.conversation}`).set(alice).expect(200)).body.messages.length).toBeGreaterThan(0);
    const memories = (await request(app).get("/api/mentor/memories").set(alice).expect(200)).body;
    expect(JSON.stringify(memories)).toContain(`${CANARY}-goal`);
    expect(JSON.stringify(memories)).not.toContain("hijacked");
    expect((await request(app).get(`/api/report/${ids.session}`).set(alice)).status).toBe(200);
    expect(JSON.stringify((await request(app).get("/api/me/dsa-progress").set(alice)).body)).toContain(`${CANARY}-note`);
  });

  it("Bob's own deletes and resets never touch Alice's data", async () => {
    const app = testApp({ autoAuth: false });
    await seedAlice(app);
    for (const [method, path] of [
      ["delete", "/api/me/dsa-progress/q_fixture_03"],
      ["delete", "/api/placement/data"],
      ["delete", "/api/career/data"],
      ["delete", "/api/leetcode/connection"],
      ["delete", "/api/resume"],
      ["delete", "/api/mentor/memories"],
      ["delete", "/api/github/connection"],
      ["delete", "/api/me"],
    ] as const) {
      const res = await request(app)[method](path).set(bob).send(path === "/api/me" ? { confirm: "DELETE MY DATA" } : {});
      expect(res.status, `${method} ${path}`).toBeLessThan(500);
    }
    const after = await Promise.all(READ_ROUTES.map(async (p) => JSON.stringify((await request(app).get(p).set(alice)).body)));
    for (const canary of [`${CANARY}-note`, `${CANARY}-topic`, `${CANARY}-city`, `${CANARY}-resume`, `${CANARY}-goal`, `${CANARY}-college`, "CanaryAlice77"]) {
      expect(after.some((b) => b.includes(canary)), canary).toBe(true);
    }
  });

  it("the owner comes only from the verified token: a uid in the query, a header or the body is ignored", async () => {
    const app = testApp({ autoAuth: false });
    await seedAlice(app);
    for (const path of READ_ROUTES) {
      const res = await request(app)
        .get(`${path}?uid=alice&owner_uid=alice&user=alice`)
        .set({ ...bob, "X-User-Id": "alice", "X-Uid": "alice", "X-Forwarded-User": "alice" });
      expect(JSON.stringify(res.body), path).not.toContain(CANARY);
    }
    // a body that names another owner is rejected outright, and a normal write always lands on the token's own student
    const named = await request(app).put("/api/me/dsa-progress/q_fixture_05").set(bob).send({ status: "attempted", notes: "bob-named", owner_uid: "alice" });
    expect(named.status).toBe(400);
    await request(app).put("/api/me/dsa-progress/q_fixture_05").set(bob).send({ status: "attempted", notes: "bob-note" }).expect(200);
    expect(JSON.stringify((await request(app).get("/api/me/dsa-progress").set(alice)).body)).not.toContain("bob-");
    expect(JSON.stringify((await request(app).get("/api/me/dsa-progress").set(bob)).body)).toContain("bob-note");
  });

  it("every private route refuses a missing, malformed or forged token", async () => {
    const app = testApp({ autoAuth: false });
    for (const path of READ_ROUTES) {
      expect((await request(app).get(path)).status, `${path} without a token`).toBe(401);
      expect((await request(app).get(path).set({ Authorization: "Bearer not-a-real-token" })).status, `${path} forged`).toBe(401);
      expect((await request(app).get(path).set({ Authorization: "Basic YWxpY2U6eA==" })).status, `${path} wrong scheme`).toBe(401);
    }
  });

  it("public routes carry no student data", async () => {
    const app = testApp({ autoAuth: false });
    await seedAlice(app);
    for (const path of ["/api/health", "/api/roles", "/api/learn/patterns", "/api/learn/dbms", "/api/companies?page=1&page_size=5", "/api/questions?page=1&page_size=5", "/api/code/languages", "/api/demo/report"]) {
      const res = await request(app).get(path);
      expect(res.status, path).toBe(200);
      expect(JSON.stringify(res.body), path).not.toContain(CANARY);
      expect(JSON.stringify(res.body), path).not.toContain("alice");
    }
  });

  it("code submissions: Bob cannot list, read or delete Alice's, and the source she wrote never reaches him", async () => {
    const catalogue = fixtureCatalogue();
    const progressStore = new MemoryProgressStore();
    const submissionStore = new MemorySubmissionStore();
    const code = new CodeService({
      provider: new FakeProvider({ solve: () => "YES" }),
      suites: fixtureSuites(),
      catalogue: () => catalogue,
      progress: new DsaProgressService(progressStore, () => catalogue),
      submissions: submissionStore,
      logger: silentLogger,
    });
    const app = testApp({ autoAuth: false, code, catalogue, progressStore });
    const sub = await request(app).post("/api/code/submit").set(alice).send({ question_id: "q_fixture_06", language: "python", source: `# ${CANARY}-source\nprint("YES")` });
    expect(sub.status, JSON.stringify(sub.body).slice(0, 200)).toBeLessThan(300);
    const id = sub.body.submission_id ?? sub.body.id ?? sub.body.submission?.id;
    expect(id).toBeTruthy();
    expect(JSON.stringify((await request(app).get(`/api/code/submissions/${id}`).set(alice).expect(200)).body)).toContain(CANARY);
    expect(JSON.stringify((await request(app).get("/api/code/submissions").set(bob).expect(200)).body)).not.toContain(CANARY);
    expect([403, 404]).toContain((await request(app).get(`/api/code/submissions/${id}`).set(bob)).status);
    expect([403, 404]).toContain((await request(app).delete(`/api/code/submissions/${id}`).set(bob)).status);
    expect((await request(app).get(`/api/code/submissions/${id}`).set(alice)).status).toBe(200);
    // the hidden tests are never sent to anyone
    const exercise = await request(app).get("/api/code/exercises/q_fixture_06").set(bob).expect(200);
    expect(exercise.body.tests).toBeUndefined();
    const suite = fixtureSuites().suite("q_fixture_06");
    const shown = JSON.stringify(exercise.body);
    const samples = new Set((suite?.samples ?? []).map((x) => x.input));
    const hidden = (suite?.tests ?? []).filter((t) => !samples.has(t.input));
    expect(hidden.length).toBeGreaterThan(0);
    for (const t of hidden) expect(shown).not.toContain(JSON.stringify(t.input).slice(1, -1));
  });

  it("private responses can never be stored by a shared cache or proxy", async () => {
    const app = testApp({ autoAuth: false });
    await seedAlice(app);
    const weak: string[] = [];
    for (const path of READ_ROUTES) {
      const res = await request(app).get(path).set(alice);
      const cc = String(res.headers["cache-control"] ?? "");
      if (!/no-store|private/i.test(cc)) weak.push(`${path} -> "${cc}"`);
    }
    expect(weak, `routes without no-store/private:\n${weak.join("\n")}`).toEqual([]);
  });
});
