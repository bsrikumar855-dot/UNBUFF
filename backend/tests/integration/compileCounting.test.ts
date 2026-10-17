import request from "supertest";
import { describe, expect, it } from "vitest";
import { A, harness, standardProfile } from "../placement/harness.js";
import { bearer } from "./app.js";

/**
 * Found by the live Judge0 run: a compile error stops judging after the first test (the error is the same for every
 * test), so only one provider result exists. The eligibility rule demands a provider result for every hidden test and
 * therefore refused to count it, although the documented analytics treat compile errors as counted "technical" failures.
 */
describe("a compile error is a counted technical failure", () => {
  it("is counted, creates one revision item, and is never a solve", async () => {
    const h = harness({ code: { verified: true, allowMockToCount: true } });
    await h.api.put("/profile", standardProfile());
    const q = "q_fixture_01";
    const res = await request(h.app).post("/api/code/submit").set({ Authorization: bearer(A) }).send({ question_id: q, language: "python", source: "COMPILE" });
    expect(res.body.verdict).toBe("compile_error");
    expect(res.body.analytics_status).toBe("counted");
    const o = (await request(h.app).get("/api/me/dsa-analytics").set({ Authorization: bearer(A) })).body;
    expect(o.totals).toMatchObject({ eligible_attempts: 1, accepted_attempts: 0, solved_unique: 0 });
    const items = (await request(h.app).get("/api/me/dsa-revision?view=all").set({ Authorization: bearer(A) })).body.items;
    expect(items.filter((i: { question_id: string }) => i.question_id === q)).toHaveLength(1);
  });
});
