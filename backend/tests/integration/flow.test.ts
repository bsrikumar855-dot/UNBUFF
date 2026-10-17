import request from "supertest";
import { describe, expect, it } from "vitest";
import type { ClaimsResponse, Report, TurnResponse } from "../../src/types.js";
import { ClaimsResponseSchema, ReportSchema, TurnResponseSchema } from "../fixtures/contractSchemas.js";
import { demoReportJson, sampleResume, testApp } from "./app.js";

const GOOD = "I built this myself: the component keeps state in useReducer, and each update re-renders and diffs the virtual DOM tree";

describe("full flow over HTTP (mock mode)", () => {
  it("extract → confirm → interrogate all → report → fix-task → retest → report", async () => {
    const app = testApp();

    const health = await request(app).get("/api/health").expect(200);
    expect(health.body).toEqual({ status: "ok", llm_mode: "mock", model: null });

    const roles = await request(app).get("/api/roles").expect(200);
    expect(roles.body.roles).toEqual([
      expect.objectContaining({ id: "frontend_developer", name: "Frontend Developer", skill_count: 7 }),
    ]);
    const role = await request(app).get("/api/roles/frontend_developer").expect(200);
    expect(role.body.skills).toHaveLength(7);

    const extract = await request(app)
      .post("/api/claims/extract")
      .send({ role_id: "frontend_developer", resume_text: sampleResume, declared_skills: ["Accessibility"] })
      .expect(200);
    const extracted: ClaimsResponse = ClaimsResponseSchema.parse(extract.body);
    expect(extracted.claims.map((c) => c.id)).toEqual(["CL-001", "CL-002", "CL-003", "CL-004", "CL-005", "CL-006", "CL-007"]);
    expect(extracted.claims.at(-1)).toMatchObject({ text: "Knows Accessibility", source: "declared", skill_id: "accessibility" });
    expect(extracted.blind_spots).toEqual([]);
    const sid = extracted.session_id;

    // Student removes the Accessibility chip and adds a claim → blind spot recomputed, new id.
    const confirmClaims = extracted.claims
      .filter((c) => c.source === "resume")
      .map(({ id, text, resume_line, skill_id }) => ({ id, text, resume_line, skill_id }));
    confirmClaims.push({ id: null, text: "Knows TypeScript generics", resume_line: null, skill_id: "js_fundamentals" } as never);
    const confirm = await request(app).post("/api/claims/confirm").send({ session_id: sid, claims: confirmClaims }).expect(200);
    const confirmed: ClaimsResponse = ClaimsResponseSchema.parse(confirm.body);
    expect(confirmed.claims.at(-1)?.id).toBe("CL-008");
    expect(confirmed.blind_spots.map((b) => b.skill_id)).toEqual(["accessibility"]);

    const answers: Record<string, string[]> = {
      "CL-001": [GOOD, GOOD, GOOD], // defended
      "CL-002": [GOOD, "It just works."], // shaky (short answer fails L2)
      "CL-003": [GOOD, GOOD, GOOD],
      "CL-004": ["I don't know what the coverage measured"], // honest gap
      "CL-005": ["We used git."], // bluff
      "CL-006": [GOOD, GOOD, GOOD],
      "CL-008": [GOOD, GOOD, GOOD],
    };
    let last: TurnResponse | undefined;
    for (const [claimId, list] of Object.entries(answers)) {
      const start = await request(app).post("/api/interrogate").send({ session_id: sid, claim_id: claimId }).expect(200);
      expect(TurnResponseSchema.parse(start.body)).toMatchObject({ turn: "question", level: 1 });
      for (const answer of list) {
        const res = await request(app).post("/api/interrogate").send({ session_id: sid, claim_id: claimId, answer }).expect(200);
        last = TurnResponseSchema.parse(res.body);
      }
      expect(last?.turn).toBe("done");
    }
    expect(last?.progress).toEqual({ claims_total: 7, claims_done: 7, next_claim_id: null, next_mode: null });

    const reportRes = await request(app).get(`/api/report/${sid}`).expect(200);
    const report: Report = ReportSchema.parse(reportRes.body);
    const verdicts = Object.fromEntries(report.claims.map((c) => [c.id, c.verdict]));
    expect(verdicts).toEqual({
      "CL-001": "defended",
      "CL-002": "shaky",
      "CL-003": "defended",
      "CL-004": "honest_gap",
      "CL-005": "bluff",
      "CL-006": "defended",
      "CL-008": "defended",
    });
    expect(report.resume_lines.find((l) => l.claim_ids.includes("CL-005"))?.verdict).toBe("bluff");
    expect(report.claims.find((c) => c.id === "CL-002")?.rewrite).toBeTruthy();

    const fix = await request(app).post("/api/fix-task").send({ session_id: sid, claim_id: "CL-002" }).expect(200);
    expect(fix.body).toMatchObject({ claim_id: "CL-002", skill_id: "rest_apis" });
    expect(fix.body.missing_concepts.length).toBeGreaterThan(0);

    const r1 = await request(app).post("/api/interrogate").send({ session_id: sid, claim_id: "CL-002", mode: "retest" }).expect(200);
    expect(r1.body).toMatchObject({ mode: "retest", turn: "question", level: 2 });
    await request(app).post("/api/interrogate").send({ session_id: sid, claim_id: "CL-002", answer: GOOD }).expect(200);
    const r3 = await request(app).post("/api/interrogate").send({ session_id: sid, claim_id: "CL-002", answer: GOOD }).expect(200);
    expect(r3.body.claim).toMatchObject({
      verdict: "defended",
      retest_status: "done",
      retest: { attempted: true, passed: true, before: 0.25, after: 1, interleaved_claims: 0 }, // forced due: honest 0
    });

    const after = ReportSchema.parse((await request(app).get(`/api/report/${sid}`).expect(200)).body);
    expect(after.readiness).toBeGreaterThan(report.readiness);
    const rest = after.skills.find((s) => s.skill_id === "rest_apis");
    expect(rest?.history.map((h) => h.mode)).toEqual(["assess", "retest"]);
  });

  it("GET /api/demo/report serves the contract mock verbatim and it matches the Report type", async () => {
    const res = await request(app()).get("/api/demo/report").expect(200);
    expect(res.body).toEqual(JSON.parse(demoReportJson));
    const report = ReportSchema.parse(res.body);
    expect(report.readiness).toBe(45);
    expect(report.coverage).toBe(90);
  });
});

function app() {
  return testApp();
}
