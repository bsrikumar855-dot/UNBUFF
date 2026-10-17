import request from "supertest";
import { describe, expect, it } from "vitest";
import { MemoryStore } from "../../src/store/memoryStore.js";
import { bearer, sampleResume, testApp } from "./app.js";

const extract = (app: ReturnType<typeof testApp>, uid: string) =>
  request(app)
    .post("/api/claims/extract")
    .set("Authorization", bearer(uid))
    .send({ role_id: "frontend_developer", resume_text: sampleResume })
    .expect(200);

describe("authentication", () => {
  const app = testApp({ autoAuth: false });

  it("keeps health, roles and the demo report public", async () => {
    await request(app).get("/api/health").expect(200);
    await request(app).get("/api/roles").expect(200);
    await request(app).get("/api/roles/frontend_developer").expect(200);
    const demo = await request(app).get("/api/demo/report").expect(200);
    expect(demo.body.session_id).toBe("s_demo");
  });

  it.each([
    ["no header", undefined],
    ["wrong scheme", "Basic dGVzdDp0ZXN0"],
    ["empty bearer", "Bearer "],
    ["garbage token", "Bearer not-a-real-token"],
    ["expired token", "Bearer expired"],
    ["oversized token", `Bearer ${"a".repeat(5000)}`],
  ])("rejects %s on every protected route with an identical 401", async (_label, header) => {
    const set = (t: request.Test) => (header === undefined ? t : t.set("Authorization", header));
    const responses = await Promise.all([
      set(request(app).post("/api/claims/extract").send({ role_id: "frontend_developer", declared_skills: ["React"] })),
      set(request(app).post("/api/claims/confirm").send({})),
      set(request(app).post("/api/interrogate").send({})),
      set(request(app).post("/api/fix-task").send({})),
      set(request(app).get("/api/report/s_x")),
      set(request(app).get("/api/sessions")),
      set(request(app).delete("/api/sessions/s_x")),
    ]);
    for (const res of responses) {
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: { code: "UNAUTHENTICATED", message: "Sign in to continue." } });
    }
  });

  it("never echoes the token", async () => {
    const res = await request(app).get("/api/sessions").set("Authorization", "Bearer secret-token-value");
    expect(JSON.stringify(res.body)).not.toContain("secret-token-value");
  });

  it("ignores a client-supplied uid: identity comes only from the verified token", async () => {
    const a = await extract(app, "alice");
    const res = await request(app)
      .get("/api/sessions?uid=bob&owner_uid=bob")
      .set("Authorization", bearer("alice"))
      .set("X-User-Id", "bob")
      .expect(200);
    expect(res.body.sessions.map((s: { session_id: string }) => s.session_id)).toEqual([a.body.session_id]);
    const bobs = await request(app).get("/api/sessions").set("Authorization", bearer("bob")).expect(200);
    expect(bobs.body.sessions).toEqual([]);
  });
});

describe("session ownership", () => {
  it("owner can read; others get the same 404 as for a missing session", async () => {
    const app = testApp({ autoAuth: false });
    const sid = (await extract(app, "alice")).body.session_id as string;

    await request(app).get(`/api/report/${sid}`).set("Authorization", bearer("alice")).expect(200);

    const other = await request(app).get(`/api/report/${sid}`).set("Authorization", bearer("bob")).expect(404);
    const missing = await request(app).get("/api/report/s_does-not-exist").set("Authorization", bearer("bob")).expect(404);
    expect(other.body.error.code).toBe("SESSION_NOT_FOUND");
    expect(other.body.error.message.replace(sid, "X")).toBe(missing.body.error.message.replace("s_does-not-exist", "X"));
  });

  it("another student cannot confirm, interrogate, fix-task or delete a session", async () => {
    const app = testApp({ autoAuth: false });
    const created = (await extract(app, "alice")).body;
    const sid = created.session_id as string;
    const claimId = created.claims[0].id as string;
    const bob = (t: request.Test) => t.set("Authorization", bearer("bob"));

    const attempts = [
      bob(request(app).post("/api/claims/confirm").send({ session_id: sid, claims: [{ id: claimId, text: "hijack", resume_line: null, skill_id: null }] })),
      bob(request(app).post("/api/interrogate").send({ session_id: sid, claim_id: claimId })),
      bob(request(app).post("/api/interrogate").send({ session_id: sid, claim_id: claimId, answer: "my answer" })),
      bob(request(app).post("/api/fix-task").send({ session_id: sid, claim_id: claimId })),
      bob(request(app).delete(`/api/sessions/${sid}`)),
    ];
    for (const res of await Promise.all(attempts)) {
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("SESSION_NOT_FOUND");
    }
    const mine = await request(app).get("/api/sessions").set("Authorization", bearer("alice")).expect(200);
    expect(mine.body.sessions).toHaveLength(1);
    const report = await request(app).get(`/api/report/${sid}`).set("Authorization", bearer("alice")).expect(200);
    expect(JSON.stringify(report.body)).not.toContain("hijack");
  });

  it("legacy sessions without an owner are not served, listed or deletable", async () => {
    const store = new MemoryStore();
    const app = testApp({ autoAuth: false, store });
    const sid = (await extract(app, "alice")).body.session_id as string;

    // Simulate a pre-Phase-2 record: same session, no owner_uid.
    const legacy = (await store.get(sid))!;
    delete (legacy as { owner_uid?: string }).owner_uid;
    await store.save(legacy);

    for (const uid of ["alice", "bob"]) {
      await request(app).get(`/api/report/${sid}`).set("Authorization", bearer(uid)).expect(404);
      await request(app).delete(`/api/sessions/${sid}`).set("Authorization", bearer(uid)).expect(404);
      const list = await request(app).get("/api/sessions").set("Authorization", bearer(uid)).expect(200);
      expect(list.body.sessions).toEqual([]);
    }
    expect(await store.get(sid)).not.toBeNull(); // untouched, awaiting an explicit operator decision
  });
});

describe("session history and deletion", () => {
  it("lists only the caller's sessions, newest first, with progress counts", async () => {
    const app = testApp({ autoAuth: false });
    await extract(app, "alice");
    await new Promise((r) => setTimeout(r, 5));
    const second = (await extract(app, "alice")).body;
    await extract(app, "bob");

    const res = await request(app).get("/api/sessions").set("Authorization", bearer("alice")).expect(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.body.sessions).toHaveLength(2);
    expect(res.body.sessions[0]).toMatchObject({ session_id: second.session_id, role_id: "frontend_developer", claims_done: 0 });
    expect(res.body.sessions[0].claims_total).toBe(second.claims.length);
    expect(Object.keys(res.body.sessions[0]).sort()).toEqual(["claims_done", "claims_total", "created_at", "mode", "role_id", "session_id"]);
  });

  it("delete removes the whole record (resume text, answers) and is owner-only", async () => {
    const store = new MemoryStore();
    const app = testApp({ autoAuth: false, store });
    const sid = (await extract(app, "alice")).body.session_id as string;
    expect((await store.get(sid))?.resume_text).toBeTruthy();

    await request(app).delete(`/api/sessions/${sid}`).set("Authorization", bearer("bob")).expect(404);
    expect(await store.get(sid)).not.toBeNull();

    await request(app).delete(`/api/sessions/${sid}`).set("Authorization", bearer("alice")).expect(204);
    expect(await store.get(sid)).toBeNull();
    expect(await store.listByOwner("alice")).toEqual([]);
    await request(app).get(`/api/report/${sid}`).set("Authorization", bearer("alice")).expect(404);
    await request(app).delete(`/api/sessions/${sid}`).set("Authorization", bearer("alice")).expect(404);
  });

  it("the public demo report contains no per-user data", async () => {
    const res = await request(testApp({ autoAuth: false })).get("/api/demo/report").expect(200);
    expect(JSON.stringify(res.body)).not.toMatch(/owner_uid|resume_text/);
  });
});
