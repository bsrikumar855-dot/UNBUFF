import request from "supertest";
import { describe, expect, it } from "vitest";
import type { Session } from "../../src/store/SessionStore.js";
import { MemoryStore } from "../../src/store/memoryStore.js";
import { bearer, testApp } from "./app.js";

const alice = { Authorization: bearer("alice") };
const bob = { Authorization: bearer("bob") };
const CONFIRM = { confirm: "DELETE MY DATA" };

const declared = (app: ReturnType<typeof testApp>, who = alice) =>
  request(app).post("/api/claims/extract").set(who).send({ role_id: "frontend_developer", declared_skills: ["React", "Git"] }).expect(200);

describe("resuming a session (GET /api/sessions/:id)", () => {
  it("returns the full claim list and walks review → interrogate → complete", async () => {
    const app = testApp({ autoAuth: false });
    const { body: created } = await declared(app);
    const sid = created.session_id as string;

    const review = (await request(app).get(`/api/sessions/${sid}`).set(alice).expect(200)).body;
    expect(review).toMatchObject({ session_id: sid, role_id: "frontend_developer", stage: "review", open_claim_id: null });
    expect(review.claims.map((c: { id: string }) => c.id)).toEqual(created.claims.map((c: { id: string }) => c.id));
    expect(review.blind_spots).toEqual(created.blind_spots);
    expect(typeof review.created_at).toBe("string");

    const inputs = created.claims.map((c: { id: string; text: string; resume_line: string | null; skill_id: string | null }) => ({ id: c.id, text: c.text, resume_line: c.resume_line, skill_id: c.skill_id }));
    await request(app).post("/api/claims/confirm").set(alice).send({ session_id: sid, claims: inputs }).expect(200);
    expect((await request(app).get(`/api/sessions/${sid}`).set(alice)).body.stage).toBe("interrogate");

    await request(app).post("/api/interrogate").set(alice).send({ session_id: sid, claim_id: "CL-001" }).expect(200);
    expect((await request(app).get(`/api/sessions/${sid}`).set(alice)).body.open_claim_id).toBe("CL-001");

    for (const claim of inputs as { id: string }[]) {
      if (claim.id !== "CL-001") await request(app).post("/api/interrogate").set(alice).send({ session_id: sid, claim_id: claim.id }).expect(200);
      await request(app).post("/api/interrogate").set(alice).send({ session_id: sid, claim_id: claim.id, answer: "no idea, I don't know" }).expect(200);
    }
    const done = (await request(app).get(`/api/sessions/${sid}`).set(alice)).body;
    expect(done).toMatchObject({ stage: "complete", open_claim_id: null });
    expect((await request(app).get("/api/sessions").set(alice)).body.sessions[0].stage).toBe("complete");
  });

  it("is read-only, owner-only and never cached", async () => {
    const store = new MemoryStore();
    const app = testApp({ autoAuth: false, store });
    const sid = (await declared(app)).body.session_id as string;
    const before = JSON.stringify(await store.get(sid));
    const res = await request(app).get(`/api/sessions/${sid}`).set(alice).expect(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(JSON.stringify(await store.get(sid))).toBe(before);
    const other = await request(app).get(`/api/sessions/${sid}`).set(bob).expect(404);
    expect(other.body.error.code).toBe("SESSION_NOT_FOUND");
    await request(app).get(`/api/sessions/${sid}`).expect(401);
    await request(app).get(`/api/sessions/s_${"x".repeat(120)}`).set(alice).expect(400);
  });

  it("treats a session saved before confirmed_at existed as confirmed once any claim has moved", async () => {
    const store = new MemoryStore();
    const app = testApp({ autoAuth: false, store });
    const sid = (await declared(app)).body.session_id as string;
    const legacy = (await store.get(sid)) as Session;
    legacy.claims[0]!.verdict = "defended";
    delete legacy.confirmed_at;
    await store.save(legacy);
    expect((await request(app).get(`/api/sessions/${sid}`).set(alice)).body.stage).toBe("interrogate");
  });
});

describe("account profile (/api/me/profile)", () => {
  it("starts empty, saves, normalises whitespace and is per student", async () => {
    const app = testApp({ autoAuth: false });
    const empty = await request(app).get("/api/me/profile").set(alice).expect(200);
    expect(empty.headers["cache-control"]).toBe("no-store");
    expect(empty.body.profile).toEqual({ display_name: null, college: null, graduation_year: null, target_role_id: null, updated_at: null });

    const saved = await request(app)
      .put("/api/me/profile")
      .set(alice)
      .send({ display_name: "  Asha   Rao ", college: "IIT  Madras", graduation_year: 2027, target_role_id: "frontend_developer" })
      .expect(200);
    expect(saved.body.profile).toMatchObject({ display_name: "Asha Rao", college: "IIT Madras", graduation_year: 2027, target_role_id: "frontend_developer" });
    expect((await request(app).get("/api/me/profile").set(alice)).body.profile.display_name).toBe("Asha Rao");
    expect((await request(app).get("/api/me/profile").set(bob)).body.profile.display_name).toBeNull();

    const cleared = await request(app).put("/api/me/profile").set(alice).send({ display_name: "   ", college: null, graduation_year: null, target_role_id: null }).expect(200);
    expect(cleared.body.profile).toMatchObject({ display_name: null, college: null, graduation_year: null, target_role_id: null });
  });

  it("rejects unknown fields, unknown roles, bad years, over-long text and another owner", async () => {
    const app = testApp({ autoAuth: false });
    const base = { display_name: "A", college: null, graduation_year: null, target_role_id: null };
    for (const body of [
      { ...base, owner_uid: "bob" },
      { ...base, target_role_id: "astronaut" },
      { ...base, target_role_id: "../etc" },
      { ...base, graduation_year: 1800 },
      { ...base, graduation_year: 2026.5 },
      { ...base, display_name: "x".repeat(61) },
      { display_name: "A" },
    ]) {
      const res = await request(app).put("/api/me/profile").set(alice).send(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body.error.code).toBe("BAD_REQUEST");
    }
  });
});

/** Puts something for `who` into most domains, so export and delete have real data to work on. */
async function seed(app: ReturnType<typeof testApp>, who: { Authorization: string }, tag: string) {
  const sid = (await declared(app, who)).body.session_id as string;
  await request(app).put("/api/me/profile").set(who).send({ display_name: `${tag}-name`, college: null, graduation_year: 2026, target_role_id: null }).expect(200);
  await request(app).put("/api/me/dsa-progress/q_fixture_03").set(who).send({ status: "solved", notes: `${tag}-note`, bookmarked: true }).expect(200);
  await request(app).post("/api/mentor/memories").set(who).send({ type: "goal", content: `${tag}-goal` }).expect((r) => expect(r.status).toBeLessThan(300));
  await request(app).put("/api/resume").set(who).send({ latex: `\\documentclass{article}\\begin{document}${tag}-resume\\end{document}` }).expect(200);
  await request(app).put("/api/learn/patterns/two-pointers-opposite/progress").set(who).send({ done: true }).expect(200);
  await request(app).put("/api/leetcode/connection").set(who).send({ profile: `https://leetcode.com/u/${tag}User/` }).expect(200);
  await request(app).put("/api/career/preferences").set(who).send({ categories: ["frontend"], skills: ["react"], countries: ["in"], cities: [`${tag}-city`], work_modes: ["remote"], employment_types: ["internship"], must_match_location: false, must_match_work_mode: false, must_match_employment: false }).expect(200);
  return sid;
}

describe("data export (GET /api/me/export)", () => {
  it("downloads everything the student has, and nothing of anyone else's", async () => {
    const app = testApp({ autoAuth: false });
    const sid = await seed(app, alice, "ALICE7");
    await seed(app, bob, "BOB9");
    const res = await request(app).get("/api/me/export").set(alice).expect(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.headers["content-disposition"]).toMatch(/^attachment; filename="unbluff-export-\d{4}-\d{2}-\d{2}\.json"$/);
    expect(res.body).toMatchObject({ format: "unbluff-export/1", uid: "alice", profile: { display_name: "ALICE7-name" } });
    const text = JSON.stringify(res.body);
    for (const s of [sid, "ALICE7-note", "ALICE7-goal", "ALICE7-resume", "ALICE7User", "ALICE7-city", "two-pointers-opposite"]) expect(text, s).toContain(s);
    expect(text).not.toContain("BOB9");
    expect(text).not.toMatch(/"sealed"|access_token|refresh_token/);
  });
});

describe("delete everything (DELETE /api/me)", () => {
  it("needs the exact confirmation phrase", async () => {
    const app = testApp({ autoAuth: false });
    await seed(app, alice, "ALICE7");
    for (const body of [{}, { confirm: "delete my data" }, { confirm: "DELETE MY DATA", extra: 1 }]) {
      expect((await request(app).delete("/api/me").set(alice).send(body)).status, JSON.stringify(body)).toBe(400);
    }
    expect(JSON.stringify((await request(app).get("/api/me/export").set(alice)).body)).toContain("ALICE7-note");
  });

  it("removes the student's data in every domain, is idempotent, and leaves other students alone", async () => {
    const app = testApp({ autoAuth: false });
    await seed(app, alice, "ALICE7");
    await seed(app, bob, "BOB9");
    const res = await request(app).delete("/api/me").set(alice).send(CONFIRM).expect(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.body.deleted).toBe(true);
    expect(res.body.removed).toMatchObject({ readiness_sessions: 1, dsa_progress: 1, resume: 1, learn_progress: 1, profile: 1 });
    expect(res.body.removed.mentor).toBeGreaterThanOrEqual(1);

    const after = JSON.stringify((await request(app).get("/api/me/export").set(alice)).body);
    expect(after).not.toContain("ALICE7");
    expect((await request(app).get("/api/sessions").set(alice)).body.sessions).toEqual([]);
    expect((await request(app).get("/api/me/profile").set(alice)).body.profile.display_name).toBeNull();

    const again = await request(app).delete("/api/me").set(alice).send(CONFIRM).expect(200);
    expect(Object.values(again.body.removed as Record<string, number>).every((n) => n === 0)).toBe(true);

    const bobs = JSON.stringify((await request(app).get("/api/me/export").set(bob)).body);
    for (const s of ["BOB9-note", "BOB9-goal", "BOB9-resume", "BOB9-name", "BOB9User"]) expect(bobs, s).toContain(s);
  });

  it("keeps going past a failing domain, reports the failure, and a retry finishes the job", async () => {
    let failOnce = true;
    const store = new (class extends MemoryStore {
      override async delete(id: string) {
        if (failOnce) {
          failOnce = false;
          throw new Error("transient");
        }
        return super.delete(id);
      }
    })();
    const app = testApp({ autoAuth: false, store });
    await seed(app, alice, "ALICE7");
    const first = await request(app).delete("/api/me").set(alice).send(CONFIRM).expect(500);
    expect(first.body.error.message).toContain("readiness_sessions");
    // later domains were still removed
    expect(JSON.stringify((await request(app).get("/api/me/dsa-progress").set(alice)).body)).not.toContain("ALICE7-note");
    await request(app).delete("/api/me").set(alice).send(CONFIRM).expect(200);
    expect((await request(app).get("/api/sessions").set(alice)).body.sessions).toEqual([]);
  });
});
