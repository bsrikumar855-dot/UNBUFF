import request from "supertest";
import { describe, expect, it } from "vitest";
import type { TurnResponse } from "../../src/types.js";
import { ClaimsResponseSchema, ReportSchema, TurnResponseSchema } from "../fixtures/contractSchemas.js";
import { testApp } from "./app.js";

const GOOD = "I personally built it: the component keeps state in useReducer and each update re-renders and diffs the tree";

describe("prepare mode learning loop (mock mode, HTTP)", () => {
  it("teach_now → fix task schedules retest → blocked until 2 other concepts → due retest first → retest verifies the gap", async () => {
    const app = testApp();
    const post = (path: string, body: object) => request(app).post(path).send(body);

    const ex = await post("/api/claims/extract", {
      role_id: "frontend_developer",
      mode: "prepare",
      declared_skills: ["React", "Git", "Jest", "CSS"],
    }).expect(200);
    const extracted = ClaimsResponseSchema.parse(ex.body);
    expect(extracted.mode).toBe("prepare");
    const sid = extracted.session_id;

    const runAssess = async (id: string, answers: string[]): Promise<TurnResponse> => {
      let res = TurnResponseSchema.parse((await post("/api/interrogate", { session_id: sid, claim_id: id }).expect(200)).body);
      for (const answer of answers) {
        if (res.turn === "done") break;
        res = TurnResponseSchema.parse((await post("/api/interrogate", { session_id: sid, claim_id: id, answer }).expect(200)).body);
      }
      return res;
    };

    // 1. React claim fails L1 (short answer) → bluff with a root cause, and prepare mode says teach now.
    const r1 = await runAssess("CL-001", ["We used hooks."]);
    expect(r1).toMatchObject({ turn: "done", teach_now: true, next_mode: "assess" });
    expect(r1.claim).toMatchObject({ verdict: "bluff", root_cause: "JS closures & references", retest_status: "none" });

    // 2. Opening the fix task targets the root cause and schedules the retest.
    const fix = await post("/api/fix-task", { session_id: sid, claim_id: "CL-001" }).expect(200);
    expect(fix.body.root_cause).toBe("JS closures & references");
    expect(fix.body.explanation).toContain("JS closures & references");

    // 3. Retest is locked until 2 other concepts are completed.
    const locked = await post("/api/interrogate", { session_id: sid, claim_id: "CL-001", mode: "retest" }).expect(400);
    expect(locked.body.error).toEqual({ code: "BAD_REQUEST", message: "Retest unlocks after 2 more concepts" });

    // 4. Interleave: two other claims (a defended one does NOT set teach_now).
    const r2 = await runAssess("CL-002", [GOOD, GOOD, GOOD]);
    expect(r2).toMatchObject({ teach_now: false });
    expect(r2.claim.verdict).toBe("defended");
    const afterOne = await post("/api/interrogate", { session_id: sid, claim_id: "CL-001", mode: "retest" }).expect(400);
    expect(afterOne.body.error.message).toBe("Retest unlocks after 1 more concept");

    const r3 = await runAssess("CL-003", [GOOD, GOOD, GOOD]);
    // 5. Due retest is prioritised over the still-pending CL-004.
    expect(r3.progress).toMatchObject({ next_claim_id: "CL-001", next_mode: "retest" });
    expect(r3.next_mode).toBe("retest");

    // 6. Retest: fresh scenario on the root cause, never a repeat of earlier questions.
    const start = TurnResponseSchema.parse(
      (await post("/api/interrogate", { session_id: sid, claim_id: "CL-001", mode: "retest" }).expect(200)).body,
    );
    expect(start).toMatchObject({ mode: "retest", level: 1, turn: "question" });
    expect(start.question).toContain("JS closures & references");
    const earlier = start.claim.qa.slice(0, -1).map((q) => q.question);
    expect(earlier).not.toContain(start.question);

    let res = start;
    while (res.turn !== "done") {
      res = TurnResponseSchema.parse((await post("/api/interrogate", { session_id: sid, claim_id: "CL-001", answer: GOOD }).expect(200)).body);
    }
    // 7. The retest verifies the gap: passed, with the REAL interleaving recorded.
    expect(res.claim).toMatchObject({
      verdict: "defended",
      proficiency: 1,
      retest_status: "done",
      retest_unlocks_after: null,
      root_cause: null,
      retest: { attempted: true, passed: true, before: 0, after: 1, interleaved_claims: 2 },
    });
    expect(res.teach_now).toBe(false);
    expect(res.progress).toMatchObject({ next_claim_id: "CL-004", next_mode: "assess" });

    const report = ReportSchema.parse((await request(app).get(`/api/report/${sid}`).expect(200)).body);
    expect(report.mode).toBe("prepare");
    expect(report.skills.find((s) => s.skill_id === "react_state")?.history.map((h) => h.mode)).toEqual(["assess", "retest"]);
  });

  it("defense mode never sets teach_now but still schedules retests", async () => {
    const app = testApp();
    const { body } = await request(app).post("/api/claims/extract").send({ role_id: "frontend_developer", declared_skills: ["React", "Git"] });
    expect(body.mode).toBe("defense");
    const sid = body.session_id;
    await request(app).post("/api/interrogate").send({ session_id: sid, claim_id: "CL-001" });
    const done = await request(app).post("/api/interrogate").send({ session_id: sid, claim_id: "CL-001", answer: "no idea, I don't know" });
    expect(done.body).toMatchObject({ teach_now: false });
    expect(done.body.claim.verdict).toBe("honest_gap");
    await request(app).post("/api/fix-task").send({ session_id: sid, claim_id: "CL-001" }).expect(200);
    const locked = await request(app).post("/api/interrogate").send({ session_id: sid, claim_id: "CL-001", mode: "retest" }).expect(400);
    expect(locked.body.error.message).toBe("Retest unlocks after 2 more concepts");
  });
});
