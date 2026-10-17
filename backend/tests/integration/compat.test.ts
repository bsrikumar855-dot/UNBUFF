import request from "supertest";
import { describe, expect, it } from "vitest";
import type { TurnResponse } from "../../src/types.js";
import { TurnResponseSchema } from "../fixtures/contractSchemas.js";
import { countingProvider, testApp } from "./app.js";

const GOOD = "I personally built it: the component keeps state in useReducer and each update re-renders and diffs the tree";

/** Every alias must equal its canonical field. */
function expectAliases(t: TurnResponse) {
  expect(t.last_grade).toEqual(t.grade);
  expect(t.verdict).toBe(t.claim.verdict);
  expect(t.levels_passed).toBe(t.claim.levels_passed);
  expect(t.next_claim_id).toBe(t.progress.next_claim_id);
  expect(t.retest).toEqual(t.claim.retest);
}

describe("backward compatibility", () => {
  it("answer: null is identical to an omitted answer (start, then resume without an LLM call)", async () => {
    const { llm, total } = countingProvider();
    const app = testApp({ llm });
    const { body } = await request(app).post("/api/claims/extract").send({ role_id: "frontend_developer", declared_skills: ["React"] });
    const sid = body.session_id;

    const started = TurnResponseSchema.parse(
      (await request(app).post("/api/interrogate").send({ session_id: sid, claim_id: "CL-001", answer: null }).expect(200)).body,
    );
    expect(started).toMatchObject({ turn: "question", level: 1, grade: null, last_grade: null });

    const calls = total();
    const resumedNull = await request(app).post("/api/interrogate").send({ session_id: sid, claim_id: "CL-001", answer: null }).expect(200);
    const resumedOmitted = await request(app).post("/api/interrogate").send({ session_id: sid, claim_id: "CL-001" }).expect(200);
    expect(resumedNull.body.question).toBe(started.question);
    expect(resumedOmitted.body).toEqual(resumedNull.body);
    expect(total()).toBe(calls); // resuming is free either way
    expect(resumedNull.body.claim.qa).toHaveLength(1);
  });

  it("empty or blank answers are still rejected (only null means 'no answer')", async () => {
    const app = testApp();
    const { body } = await request(app).post("/api/claims/extract").send({ role_id: "frontend_developer", declared_skills: ["React"] });
    const res = await request(app).post("/api/interrogate").send({ session_id: body.session_id, claim_id: "CL-001", answer: "   " }).expect(400);
    expect(res.body.error).toMatchObject({ code: "BAD_REQUEST", message: "answer: answer cannot be empty" });
  });

  it("TurnResponse aliases mirror the canonical fields on every turn type, including retest", async () => {
    const app = testApp();
    const post = (b: object) => request(app).post("/api/interrogate").send(b).expect(200);
    const { body } = await request(app).post("/api/claims/extract").send({ role_id: "frontend_developer", declared_skills: ["React"] });
    const sid = body.session_id;

    const turns: TurnResponse[] = [];
    turns.push(TurnResponseSchema.parse((await post({ session_id: sid, claim_id: "CL-001" })).body));
    turns.push(TurnResponseSchema.parse((await post({ session_id: sid, claim_id: "CL-001", answer: GOOD })).body));
    const done = TurnResponseSchema.parse((await post({ session_id: sid, claim_id: "CL-001", answer: "It just works." })).body);
    turns.push(done);
    expect(done).toMatchObject({ turn: "done", verdict: "shaky", levels_passed: 1, next_claim_id: null, retest: null });
    expect(done.last_grade?.level_passed).toBe(false);

    await request(app).post("/api/fix-task").send({ session_id: sid, claim_id: "CL-001" }).expect(200);
    turns.push(TurnResponseSchema.parse((await post({ session_id: sid, claim_id: "CL-001", mode: "retest" })).body));
    let last = TurnResponseSchema.parse((await post({ session_id: sid, claim_id: "CL-001", answer: GOOD })).body);
    turns.push(last);
    while (last.turn !== "done") {
      last = TurnResponseSchema.parse((await post({ session_id: sid, claim_id: "CL-001", answer: GOOD })).body);
      turns.push(last);
    }
    expect(last).toMatchObject({ verdict: "defended", levels_passed: 3 });
    expect(last.retest).toMatchObject({ attempted: true, passed: true });

    for (const t of turns) expectAliases(t);
  });
});
