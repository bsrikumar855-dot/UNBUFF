import request from "supertest";
import { describe, expect, it } from "vitest";
import { ErrorSchema } from "../fixtures/contractSchemas.js";
import { testApp } from "./app.js";

const app = testApp();

async function expectError(res: request.Response, status: number, code: string) {
  expect(res.status).toBe(status);
  expect(ErrorSchema.parse(res.body).error.code).toBe(code);
}

describe("error contract", () => {
  it("400 BAD_REQUEST with a readable message on invalid bodies", async () => {
    const res = await request(app).post("/api/claims/extract").send({ role_id: "frontend_developer" });
    await expectError(res, 400, "BAD_REQUEST");
    expect(res.body.error.message).toMatch(/resume_text or at least one declared skill/);

    const tooLong = await request(app).post("/api/interrogate").send({ session_id: "s", claim_id: "CL-001", answer: "x".repeat(4001) });
    await expectError(tooLong, 400, "BAD_REQUEST");
    expect(tooLong.body.error.message).toContain("answer");

    await expectError(await request(app).post("/api/interrogate").send({ session_id: "s", claim_id: "CL-001", mode: "hack" }), 400, "BAD_REQUEST");
    await expectError(await request(app).post("/api/interrogate").send({ session_id: "s", claim_id: "CL-001", extra: 1 }), 400, "BAD_REQUEST");
  });

  it("400 on malformed JSON and oversized bodies", async () => {
    const bad = await request(app).post("/api/claims/extract").set("Content-Type", "application/json").send("{not json");
    await expectError(bad, 400, "BAD_REQUEST");
    const big = await request(app).post("/api/claims/extract").send({ role_id: "frontend_developer", resume_text: "a".repeat(200_000) });
    await expectError(big, 400, "BAD_REQUEST");
  });

  it("404s: route, role, session, claim", async () => {
    await expectError(await request(app).get("/api/nope"), 404, "NOT_FOUND");
    await expectError(await request(app).get("/api/roles/astronaut"), 404, "ROLE_NOT_FOUND");
    await expectError(await request(app).post("/api/claims/extract").send({ role_id: "astronaut", declared_skills: ["React"] }), 404, "ROLE_NOT_FOUND");
    await expectError(await request(app).get("/api/report/s_missing"), 404, "SESSION_NOT_FOUND");
    await expectError(await request(app).post("/api/fix-task").send({ session_id: "s_missing", claim_id: "CL-001" }), 404, "SESSION_NOT_FOUND");

    const { body } = await request(app).post("/api/claims/extract").send({ role_id: "frontend_developer", declared_skills: ["React"] });
    await expectError(await request(app).post("/api/interrogate").send({ session_id: body.session_id, claim_id: "CL-042" }), 404, "CLAIM_NOT_FOUND");
    await expectError(
      await request(app).post("/api/claims/confirm").send({ session_id: body.session_id, claims: [{ id: "CL-042", text: "x", resume_line: null, skill_id: null }] }),
      404,
      "CLAIM_NOT_FOUND",
    );
  });

  it("400 on confirm with a skill that is not in the role", async () => {
    const { body } = await request(app).post("/api/claims/extract").send({ role_id: "frontend_developer", declared_skills: ["React"] });
    const res = await request(app)
      .post("/api/claims/confirm")
      .send({ session_id: body.session_id, claims: [{ id: null, text: "Knows Rust", resume_line: null, skill_id: "rust" }] });
    await expectError(res, 400, "BAD_REQUEST");
  });

  it("400 fix-task on a claim that is not weak", async () => {
    const { body } = await request(app).post("/api/claims/extract").send({ role_id: "frontend_developer", declared_skills: ["React"] });
    await expectError(await request(app).post("/api/fix-task").send({ session_id: body.session_id, claim_id: "CL-001" }), 400, "BAD_REQUEST");
  });

  it("429 RATE_LIMITED in the contract shape", async () => {
    const limited = testApp({ rateLimits: { globalPerMinute: 1000, llmPerMinute: 2 } });
    const send = () => request(limited).post("/api/claims/extract").send({ role_id: "frontend_developer", declared_skills: ["React"] });
    await send().expect(200);
    await send().expect(200);
    await expectError(await send(), 429, "RATE_LIMITED");
    await request(limited).get("/api/health").expect(200); // non-LLM routes unaffected
  });

  it("sets security headers and hides the framework", async () => {
    const res = await request(app).get("/api/health");
    expect(res.headers["x-powered-by"]).toBeUndefined();
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["content-security-policy"]).toBeDefined();
    expect(res.headers["access-control-allow-origin"]).toBe("*");
  });
});
