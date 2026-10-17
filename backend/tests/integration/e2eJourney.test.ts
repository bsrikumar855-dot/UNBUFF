/* eslint-disable @typescript-eslint/no-explicit-any -- these tests walk arbitrary API response JSON */
import request from "supertest";
import { describe, expect, it } from "vitest";
import type { PlacementDashboard, PlacementTask } from "../../src/types.js";
import { RecordingLlm } from "../mentor/recordingLlm.js";
import { A, B, harness, standardProfile, type Harness } from "../placement/harness.js";
import { bearer } from "./app.js";

/**
 * The intended student journey, end to end, through the real HTTP API and the real services.
 *
 * WHAT THIS PROVES AND WHAT IT DOES NOT. Sign-in is a test verifier, storage is in memory, the AI mentor is the
 * deterministic mock, and code "execution" is a stand-in whose result is chosen by a marker word (the test-only switch
 * `allowMockToCount` lets that stand-in's results count, which production never does). So this proves how the modules
 * are wired together and how evidence flows between them. It does NOT prove that real code was compiled and run, that a
 * live model behaved, that Firebase or Firestore persisted anything, or that GitHub OAuth works.
 */

const as = (uid: string) => ({ Authorization: bearer(uid) });
const all = (d: PlacementDashboard): PlacementTask[] => [...new Map([...d.today_tasks, ...d.week.flatMap((w) => w.tasks)].map((t) => [t.id, t])).values()];
const refresh = async (h: Harness, uid = A) => (await h.api.post("/refresh", {}, uid)).body as PlacementDashboard;
/** The harness clock is frozen; real events happen later than the task that asked for them. */
const tick = (h: Harness) => void (h.clock.now = new Date(h.clock.now.getTime() + 300_000));
const submit = (h: Harness, uid: string, q: string, source: string) => (tick(h), request(h.app)).post("/api/code/submit").set(as(uid)).send({ question_id: q, language: "python", source });
const overview = async (h: Harness, uid: string) => (await request(h.app).get("/api/me/dsa-analytics").set(as(uid)).expect(200)).body;

describe("student journey: execution results are counted (test-only stand-in policy)", () => {
  it("runs the whole workflow, with evidence flowing from one module to the next", async () => {
    const llm = new RecordingLlm();
    const h = harness({ llm, code: { verified: true, allowMockToCount: true } });

    // 1. sign in: personal resources need a verified student
    expect((await request(h.app).get("/api/placement/dashboard")).status).toBe(401);
    expect((await h.api.get("/dashboard")).body.needs_profile).toBe(true);

    // 2. goals, timeline and availability
    expect((await h.api.put("/profile", standardProfile({ priorities: ["dsa", "interview", "graphql"] }))).status).toBe(200);

    // 3. the plan is built from content that really exists
    const plan = await refresh(h);
    expect(plan.plan?.generation).toBe(1);
    const diag = all(plan).find((t) => t.type === "diagnostic")!;
    expect(diag.completion_check).toBe("verified_event");
    expect(h.catalogue.summary(diag.ref.id)).not.toBeNull();
    const gradable = (await request(h.app).get(`/api/code/exercises/${diag.ref.id}`)).body;
    expect(gradable.gradable).toBe(true);
    const lab = all(plan).find((t) => t.type === "graphql" && t.depends_on.length === 0)!;
    expect(lab.ref.id).toBe("m1-e1");

    // 4. the exercise is opened: only the public projection is returned, never the hidden cases
    expect(Object.keys(gradable).sort()).toEqual(["gradable", "hidden_test_count", "is_demonstration", "limits", "question_id", "samples", "starter_code", "statement", "test_revision"]);
    expect(gradable.hidden_test_count).toBe(5);
    expect(JSON.stringify(gradable)).not.toMatch(/"tests"|expected_output.*expected_output.*expected_output/);

    // 5. edit and run: a sample run is not stored and not counted
    const run = await request(h.app).post("/api/code/run").set(as(A)).send({ language: "python", source: "ECHO", question_id: diag.ref.id, sample_index: 0 });
    expect(run.status).toBe(200);
    expect((await request(h.app).get("/api/code/submissions").set(as(A))).body.submissions).toEqual([]);
    expect((await overview(h, A)).totals.eligible_attempts).toBe(0);

    // 6. a wrong judged submission, then a correct one, are recorded for the owner
    const wrong = await submit(h, A, diag.ref.id, "WRONG");
    expect(wrong.body).toMatchObject({ verdict: "wrong_answer", analytics_status: "counted" });
    expect(JSON.stringify(wrong.body)).not.toMatch(/expected_output|"tests"/);
    const wrongId = wrong.body.id ?? wrong.body.submission_id;

    // 7. analytics use only the eligible evidence
    expect((await overview(h, A)).totals).toEqual({ solved_unique: 0, attempted_unique: 1, eligible_attempts: 1, accepted_attempts: 0 });

    // 8. the revision queue has the question once, and the plan follows it without duplicates
    await submit(h, A, diag.ref.id, "WRONG");
    const q = (await request(h.app).get("/api/me/dsa-revision?view=all").set(as(A))).body.items.filter((i: any) => i.question_id === diag.ref.id);
    expect(q).toHaveLength(1);
    const afterFail = await refresh(h);
    expect(all(afterFail).find((t) => t.id === diag.id)).toMatchObject({ status: "completed", completed_by: "verified_event" }); // the first measurement was made
    expect(afterFail.history.recent_completed.find((t) => t.id === diag.id)).toMatchObject({ completed_by: "verified_event" });
    const revTasks = (d: PlacementDashboard) => all(d).filter((t) => t.type === "dsa_revision" && t.ref.id === diag.ref.id);
    expect(revTasks(afterFail).length).toBeLessThanOrEqual(1);
    expect(revTasks(await refresh(h)).length).toBe(revTasks(afterFail).length); // refreshing again adds no duplicate

    const accepted = await submit(h, A, diag.ref.id, "ECHO");
    expect(accepted.body).toMatchObject({ verdict: "accepted", analytics_status: "counted" });
    const o = await overview(h, A);
    expect(o.totals).toMatchObject({ solved_unique: 1, eligible_attempts: 3, accepted_attempts: 1 });

    // 9. a GraphQL exercise is passed in the Lab; the plan unlocks the next one
    tick(h);
    const lessonPass = await request(h.app).post("/api/graphql-lab/exercises/m1-e1/submit").set(as(A)).send({ client_attempt_id: "attempt_journey_01", answer: ["b"] });
    expect(lessonPass.body.outcome).toBe("passed");
    const afterLab = await refresh(h);
    expect(afterLab.history.recent_completed.find((t) => t.id === lab.id)).toMatchObject({ completed_by: "verified_event" });
    expect(all(afterLab).filter((t) => t.type === "graphql" && t.status === "planned").some((t) => t.ref.id === "m1-e2" && !t.blocked)).toBe(true);

    // 10. the mentor keeps what the student said, and in a separate conversation sees it with the current evidence
    const first = await request(h.app).post("/api/mentor/chat").set(as(A)).send({ mode: "placement_mentor", message: "My target role is Frontend Developer.", client_message_id: "cm_journey_001" });
    expect(first.body.memory_saved.length).toBeGreaterThanOrEqual(1);
    const second = await request(h.app).post("/api/mentor/chat").set(as(A)).send({ mode: "placement_mentor", message: "What should I work on next?", client_message_id: "cm_journey_002" });
    expect(second.body.conversation.id).not.toBe(first.body.conversation.id);
    const prompt = llm.chats.at(-1)!.prompt;
    expect(prompt).toMatch(/Frontend Developer/);
    expect(/<verified_activity>([\s\S]*?)<\/verified_activity>/.exec(prompt)![1]).toMatch(/judged submission|solved/i);
    expect(/<verified_activity>([\s\S]*?)<\/verified_activity>/.exec(prompt)![1]).not.toMatch(/No verified judged practice is recorded yet/);

    // 11. the planner reflects real outcomes in what it says and what it plans
    const ask = await h.api.post("/assistant", { message: "What changed since last week?" });
    expect(ask.body.answer).toMatch(/Completed: /);
    expect(llm.chats.at(-1)!.prompt).toMatch(/<placement_plan>/);
    const skill = (await h.api.get("/dashboard")).body.skills.skills.find((s: any) => s.evidence.kind === "dsa_judged");
    expect(skill.evidence.provenance).toBe("verified");

    // 12. the student reviews and modifies the plan
    const dash = await refresh(h);
    const movable = all(dash).find((t) => t.status === "planned" && !t.blocked)!;
    expect((await h.api.post(`/tasks/${movable.id}/action`, { action: "postpone", days: 1 })).body.postponed_count).toBe(1);
    expect((await h.api.put("/profile", standardProfile({ daily_minutes: 45, priorities: ["dsa", "interview", "graphql"] }))).status).toBe(200);
    const trimmed = (await h.api.get("/dashboard")).body as PlacementDashboard;
    for (const day of trimmed.week) expect(day.planned_minutes <= 45 || day.tasks.length === 1).toBe(true);
    expect(trimmed.history.changes.some((c) => c.kind === "profile_changed")).toBe(true);

    // 13. isolation and deletion
    expect((await h.api.get("/dashboard", B)).body.needs_profile).toBe(true);
    expect((await overview(h, B)).totals.eligible_attempts).toBe(0);
    expect((await request(h.app).get(`/api/code/submissions/${wrongId}`).set(as(B))).status).toBe(404);
    expect((await request(h.app).get("/api/mentor/memories").set(as(B))).body.memories).toEqual([]);
    expect((await h.api.del("/data")).status).toBe(204);
    expect((await h.api.get("/dashboard")).body.needs_profile).toBe(true);
    expect((await overview(h, A)).totals.solved_unique).toBe(1); // the planner's data is gone; the practice record is not
    expect((await h.lab.progress(A)).totals.exercises_passed).toBe(1);
    const memories = (await request(h.app).get("/api/mentor/memories").set(as(A))).body.memories as { id: string; content: string }[];
    const target = memories.find((m) => /Frontend Developer/i.test(m.content))!;
    expect((await request(h.app).delete(`/api/mentor/memories/${target.id}`).set(as(A))).status).toBe(204);
    await request(h.app).post("/api/mentor/chat").set(as(A)).send({ mode: "placement_mentor", message: "Anything else?", client_message_id: "cm_journey_003" });
    expect(llm.chats.at(-1)!.prompt).not.toMatch(/Target roles?: Frontend Developer|Finds .*Frontend/);
  });
});

describe("student journey: production policy excludes stand-in execution results", () => {
  it("never turns a mock-executed submission into an achievement, and says so", async () => {
    const h = harness({ code: { verified: true, allowMockToCount: false } });
    await h.api.put("/profile", standardProfile());
    const plan = await refresh(h);
    const diag = all(plan).find((t) => t.type === "diagnostic")!;
    const res = await submit(h, A, diag.ref.id, "ECHO");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ verdict: "accepted", analytics_status: "excluded_mock_execution" });
    expect((await overview(h, A)).totals).toEqual({ solved_unique: 0, attempted_unique: 0, eligible_attempts: 0, accepted_attempts: 0 });
    expect((await overview(h, A)).exclusions.mock_execution).toBe(1);
    const d = await refresh(h);
    expect(all(d).find((t) => t.id === diag.id)!.status).toBe("planned"); // not completed by a result that does not count
    expect(d.limitations.some((l) => /excluded from your results/.test(l.message))).toBe(true);
    expect(d.skills.skills.filter((s) => s.category === "dsa").every((s) => s.estimate === null && s.evidence.count === 0)).toBe(true);
    expect((await request(h.app).get("/api/me/dsa-revision?view=all").set(as(A))).body.items).toEqual([]);
  });

  it("an unverified execution service produces the same exclusion, and the plan marks DSA practice as self-attested", async () => {
    const h = harness({ code: { verified: false, allowMockToCount: true }, execution: { configured: true, verified: false } });
    await h.api.put("/profile", standardProfile());
    const plan = await refresh(h);
    const diag = all(plan).find((t) => t.type === "diagnostic")!;
    expect(diag.completion_check).toBe("student");
    expect((await submit(h, A, diag.ref.id, "ECHO")).body.analytics_status).toBe("excluded_unverified_provider");
    expect((await overview(h, A)).totals.solved_unique).toBe(0);
    expect(all(await refresh(h)).find((t) => t.id === diag.id)!.status).toBe("planned");
  });
});

describe("student journey: the sections that depend on missing infrastructure stay honestly blocked", () => {
  it("without a configured execution service, judging reports unavailable and the planner schedules no DSA work", async () => {
    const h = harness({ execution: { configured: false, verified: false } }); // testApp's default code service has no provider
    await h.api.put("/profile", standardProfile());
    const d = await refresh(h);
    expect(all(d).some((t) => ["diagnostic", "dsa_practice", "dsa_revision"].includes(t.type))).toBe(false);
    const res = await submit(h, A, "q_fixture_01", "ECHO");
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("EXECUTION_UNAVAILABLE");
    expect((await overview(h, A)).has_eligible_activity).toBe(false);
    // the rest of the journey still works
    expect(all(d).some((t) => t.type === "technical_interview")).toBe(true);
    expect(all(d).some((t) => t.type === "graphql")).toBe(true);
  });

  it("a disconnected GitHub account blocks nothing, and the student can still be advised", async () => {
    const h = harness({ github: { status: "disconnected", cached: null } });
    await h.api.put("/profile", standardProfile());
    const d = await refresh(h);
    expect(all(d).length).toBeGreaterThan(0);
    expect(all(d).some((t) => t.type === "project")).toBe(false);
    expect(d.limitations.find((l) => l.source === "github")!.severity).toBe("info");
  });
});
