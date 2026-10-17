import request from "supertest";
import { describe, expect, it } from "vitest";
import { testApp } from "./app.js";

// A resume pasted from a PDF as ONE line (no newlines), with bullets, ~3000 chars.
const ONE_LINE =
  "Shreekumar B AI Software Engineer | Generative AI & Multi-Agent Systems | Full-Stack Development " +
  "Technical Skills Languages : Python, TypeScript, JavaScript, SQL Frontend : React, Next.js, TypeScript, Tailwind CSS " +
  "Tools : Git, GitHub Actions, Docker ".repeat(40) +
  "• Architected a deterministic-core platform (15-endpoint FastAPI backend, React + TanStack frontend) with 71 automated tests " +
  "• Built a full-stack grading platform (FastAPI, Next.js 14) combining PaddleOCR and EasyOCR " +
  "• Designed a single configurable component system generating multiple NGO fundraising site templates from one React codebase";

describe("very long / single-line resumes", () => {
  it("extract never returns claims that confirm would reject", async () => {
    const app = testApp();
    expect(ONE_LINE.length).toBeGreaterThan(1500);
    const ex = await request(app).post("/api/claims/extract").send({ role_id: "frontend_developer", resume_text: ONE_LINE }).expect(200);
    expect(ex.body.claims.length).toBeGreaterThan(1); // bullets became separate lines
    for (const c of ex.body.claims) {
      expect(c.text.length).toBeLessThanOrEqual(300);
      expect((c.resume_line ?? "").length).toBeLessThanOrEqual(500);
    }
    const claims = ex.body.claims.map((c: { id: string; text: string; resume_line: string | null; skill_id: string | null }) => ({
      id: c.id, text: c.text, resume_line: c.resume_line, skill_id: c.skill_id,
    }));
    await request(app).post("/api/claims/confirm").send({ session_id: ex.body.session_id, claims }).expect(200);

    const report = await request(app).get(`/api/report/${ex.body.session_id}`).expect(200);
    expect(report.body.resume_lines.length).toBeGreaterThan(1); // heatmap has one row per bullet
  });
});
