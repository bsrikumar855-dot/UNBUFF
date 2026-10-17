import { describe, expect, it } from "vitest";
import { ApiError } from "../../src/errors.js";
import { runLimited } from "../../src/services/assessment.js";
import { ALL, GOOD, rawGrade, reactSession, ScriptedProvider, service } from "../helpers.js";

const Q = "useState and useReducer";
const pass = () => rawGrade(ALL, Q);

describe("AssessmentService ladder", () => {
  it("4. clarify once at a level, then pass all levels → defended", async () => {
    const llm = new ScriptedProvider([
      rawGrade(["specificity", "ownership"], Q, { needs_clarification: true }),
      pass(),
      pass(),
      pass(),
    ]);
    const { svc } = service(llm);
    const sid = await reactSession(svc);
    const start = await svc.interrogate({ session_id: sid, claim_id: "CL-001" });
    expect(start).toMatchObject({ turn: "question", level: 1, mode: "assess", grade: null });

    const clarify = await svc.interrogate({ session_id: sid, claim_id: "CL-001", answer: GOOD });
    expect(clarify).toMatchObject({ turn: "clarify", level: 1 });
    expect(clarify.claim.qa.at(-1)?.kind).toBe("clarify");

    expect((await svc.interrogate({ session_id: sid, claim_id: "CL-001", answer: GOOD })).level).toBe(2);
    expect((await svc.interrogate({ session_id: sid, claim_id: "CL-001", answer: GOOD })).level).toBe(3);
    const done = await svc.interrogate({ session_id: sid, claim_id: "CL-001", answer: GOOD });
    expect(done).toMatchObject({ turn: "done", level: null, question: null });
    expect(done.claim).toMatchObject({ verdict: "defended", levels_passed: 3, proficiency: 0.85 });
    expect(done.progress).toEqual({ claims_total: 1, claims_done: 1, next_claim_id: null, next_mode: null });
    expect(done.teach_now).toBe(false);
  });

  it("6. invalid LLM output → verdict error, excluded from coverage, restartable", async () => {
    const { svc } = service(new ScriptedProvider(["invalid"]));
    const sid = await reactSession(svc);
    await svc.interrogate({ session_id: sid, claim_id: "CL-001" });
    const done = await svc.interrogate({ session_id: sid, claim_id: "CL-001", answer: GOOD });
    expect(done).toMatchObject({ turn: "done", grade: null });
    expect(done.claim).toMatchObject({ verdict: "error", proficiency: 0 });

    const report = await svc.report(sid);
    expect(report.coverage).toBe(0);
    expect(report.skills.find((s) => s.skill_id === "react_state")?.state).toBe("unverified");

    const restart = await svc.interrogate({ session_id: sid, claim_id: "CL-001" });
    expect(restart).toMatchObject({ turn: "question", level: 1 });
    expect(restart.claim.verdict).toBe("pending");
  });

  it("8. retest passes → after 1.0, retest.passed, history appended with mode retest", async () => {
    const { svc } = service(new ScriptedProvider([pass(), rawGrade(["accuracy"], Q), pass(), pass()]));
    const sid = await reactSession(svc);
    await svc.interrogate({ session_id: sid, claim_id: "CL-001" });
    await svc.interrogate({ session_id: sid, claim_id: "CL-001", answer: GOOD });
    const shaky = await svc.interrogate({ session_id: sid, claim_id: "CL-001", answer: GOOD });
    expect(shaky.claim).toMatchObject({ verdict: "shaky", levels_passed: 1, proficiency: 0.25, missing_concepts: ["missing mechanism"] });

    // Opening the fix task schedules the retest; with nothing else pending it is forced due (rule 3).
    const fix = await svc.fixTask(sid, "CL-001");
    expect(fix.root_cause).toBeNull(); // scripted grades carry no root cause
    const r1 = await svc.interrogate({ session_id: sid, claim_id: "CL-001", mode: "retest" });
    expect(r1).toMatchObject({ mode: "retest", turn: "question", level: 2 });
    expect(r1.question).toContain("missing mechanism");
    const previous = r1.claim.qa.slice(0, -1).map((q) => q.question);
    expect(previous).not.toContain(r1.question);

    await svc.interrogate({ session_id: sid, claim_id: "CL-001", answer: GOOD });
    const done = await svc.interrogate({ session_id: sid, claim_id: "CL-001", answer: GOOD });
    expect(done.claim).toMatchObject({
      verdict: "defended",
      proficiency: 1,
      retest: { attempted: true, passed: true, before: 0.25, after: 1, interleaved_claims: 0 },
      retest_status: "done",
    });

    const report = await svc.report(sid);
    const history = report.skills.find((s) => s.skill_id === "react_state")?.history ?? [];
    expect(history.map((h) => [h.mode, h.proficiency])).toEqual([
      ["assess", 0.25],
      ["retest", 1],
    ]);
  });

  it("admits_gap ends the claim as honest_gap with the level's criteria as missing concepts", async () => {
    const { svc } = service();
    const sid = await reactSession(svc);
    await svc.interrogate({ session_id: sid, claim_id: "CL-001" });
    const done = await svc.interrogate({ session_id: sid, claim_id: "CL-001", answer: "Honestly I don't know" });
    expect(done.claim.verdict).toBe("honest_gap");
    expect(done.claim.missing_concepts.length).toBeGreaterThan(0);
  });

  it("guard flips are counted per session", async () => {
    const { svc, store } = service(new ScriptedProvider([rawGrade(ALL, "not in the answer at all")]));
    const sid = await reactSession(svc);
    await svc.interrogate({ session_id: sid, claim_id: "CL-001" });
    const done = await svc.interrogate({ session_id: sid, claim_id: "CL-001", answer: GOOD });
    expect(done.grade?.guard_flips).toHaveLength(5);
    expect(done.claim.verdict).toBe("bluff");
    expect((await store.get(sid))?.guard_flips).toBe(5);
  });

  it("start without answer on an in-progress claim returns the open question (no LLM call)", async () => {
    const llm = new ScriptedProvider([]);
    const { svc } = service(llm);
    const sid = await reactSession(svc);
    const a = await svc.interrogate({ session_id: sid, claim_id: "CL-001" });
    const b = await svc.interrogate({ session_id: sid, claim_id: "CL-001" });
    expect(b.question).toBe(a.question);
    expect(b.claim.qa).toHaveLength(1);
  });

  it("rejects retest on defended/pending claims and answers on idle claims", async () => {
    const { svc } = service();
    const sid = await reactSession(svc);
    await expect(svc.interrogate({ session_id: sid, claim_id: "CL-001", mode: "retest" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(svc.interrogate({ session_id: sid, claim_id: "CL-001", answer: "x" })).rejects.toBeInstanceOf(ApiError);
    await expect(svc.interrogate({ session_id: sid, claim_id: "CL-999" })).rejects.toMatchObject({ code: "CLAIM_NOT_FOUND" });
    await expect(svc.report("s_nope")).rejects.toMatchObject({ code: "SESSION_NOT_FOUND" });
  });
});

describe("runLimited (report-time LLM concurrency)", () => {
  it("never runs more than `limit` jobs at once and completes all on success", async () => {
    let active = 0;
    let peak = 0;
    const jobs = Array.from({ length: 6 }, () => async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
    });
    expect(await runLimited(jobs, 2)).toEqual({ done: 6, skipped: 0 });
    expect(peak).toBe(2);
  });

  it("stops starting new jobs after the first failure", async () => {
    const started: number[] = [];
    const jobs = [0, 1, 2, 3, 4].map((i) => async () => {
      started.push(i);
      if (i === 0) throw new Error("429");
    });
    const res = await runLimited(jobs, 1);
    expect(started).toEqual([0]);
    expect(res).toEqual({ done: 0, skipped: 5 });
  });
});
