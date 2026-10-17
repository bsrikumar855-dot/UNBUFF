import request from "supertest";
import { describe, expect, it } from "vitest";
import { countingProvider, testApp } from "./app.js";

describe("efficiency", () => {
  it("report refetch makes 0 LLM calls (fix tasks and rewrites are cached)", async () => {
    const { llm, counts, total } = countingProvider();
    const app = testApp({ llm });
    const { body } = await request(app).post("/api/claims/extract").send({ role_id: "frontend_developer", declared_skills: ["React", "Git"] });
    const sid = body.session_id;
    for (const id of ["CL-001", "CL-002"]) {
      await request(app).post("/api/interrogate").send({ session_id: sid, claim_id: id });
      await request(app).post("/api/interrogate").send({ session_id: sid, claim_id: id, answer: "no clue" });
    }

    await request(app).get(`/api/report/${sid}`).expect(200);
    expect(counts.fixTask).toBe(2);
    const before = total();
    await request(app).get(`/api/report/${sid}`).expect(200);
    await request(app).get(`/api/report/${sid}`).expect(200);
    expect(total()).toBe(before);

    await request(app).post("/api/fix-task").send({ session_id: sid, claim_id: "CL-001" }).expect(200);
    expect(total()).toBe(before); // fix-task reuses the cached one
  });

  it("re-requesting the open question is free", async () => {
    const { llm, total } = countingProvider();
    const app = testApp({ llm });
    const { body } = await request(app).post("/api/claims/extract").send({ role_id: "frontend_developer", declared_skills: ["React"] });
    await request(app).post("/api/interrogate").send({ session_id: body.session_id, claim_id: "CL-001" });
    const before = total();
    await request(app).post("/api/interrogate").send({ session_id: body.session_id, claim_id: "CL-001" }).expect(200);
    expect(total()).toBe(before);
  });

  it("concurrent double-submits of the same answer grade once", async () => {
    const { llm, counts } = countingProvider();
    const app = testApp({ llm });
    const { body } = await request(app).post("/api/claims/extract").send({ role_id: "frontend_developer", declared_skills: ["React"] });
    const sid = body.session_id;
    await request(app).post("/api/interrogate").send({ session_id: sid, claim_id: "CL-001" });
    const answer = { session_id: sid, claim_id: "CL-001", answer: "We used it." };
    const [a, b] = await Promise.all([
      request(app).post("/api/interrogate").send(answer),
      request(app).post("/api/interrogate").send(answer),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 400]); // second one sees the claim already done
    expect(counts.grade).toBe(1);
  });
});
