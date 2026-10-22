import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { AccountAdmin } from "../../src/auth/verifier.js";
import { MockProvider } from "../../src/llm/mock.js";
import { healthRouter } from "../../src/routes/health.js";
import { audit } from "../../src/security/audit.js";
import { RevocationGuard } from "../../src/security/revocation.js";
import { MemoryUsageStore } from "../../src/security/usageStore.js";
import { sweepInactiveSessions } from "../../src/services/retention.js";
import { MemoryStore } from "../../src/store/memoryStore.js";
import { silentLogger } from "../helpers.js";
import express from "express";
import { bearer, testApp, unverifiedBearer } from "./app.js";

const alice = { Authorization: bearer("alice") };
const bob = { Authorization: bearer("bob") };
const declared = { role_id: "frontend_developer", declared_skills: ["React", "Git"] };
const extract = (app: ReturnType<typeof testApp>, who = alice) => request(app).post("/api/claims/extract").set(who).send({ ...declared, resume_text: "Built a React dashboard with Redux and hooks" });

describe("daily language-model budget", () => {
  it("counts each model call per student, refuses once used up, and shows the usage", async () => {
    const usageStore = new MemoryUsageStore();
    const app = testApp({ autoAuth: false, llmDailyBudget: 3, usageStore });
    const { body } = await extract(app).expect(200); // 1 call (extraction)
    const sid = body.session_id as string;
    await request(app).post("/api/interrogate").set(alice).send({ session_id: sid, claim_id: "CL-001" }).expect(200); // 2 (question)
    await request(app).post("/api/interrogate").set(alice).send({ session_id: sid, claim_id: "CL-001", answer: "I don't know" }).expect(200); // 3 (grade)

    const usage = await request(app).get("/api/me/usage").set(alice).expect(200);
    expect(usage.headers["cache-control"]).toBe("no-store");
    expect(usage.body).toMatchObject({ used: 3, limit: 3 });
    expect(usage.body.resets_at).toMatch(/T00:00:00\.000Z$/);

    const refused = await extract(app).expect(429);
    expect(refused.body.error.code).toBe("DAILY_LIMIT_REACHED");
    expect(refused.body.error.message).toMatch(/resets in about \d+ hours?/);
    // another student is unaffected
    await extract(app, bob).expect(200);
  });

  it("still serves the report (template text) and resumes an open question once the allowance is used", async () => {
    const app = testApp({ autoAuth: false, llmDailyBudget: 2 });
    const sid = (await extract(app).expect(200)).body.session_id as string; // 1
    await request(app).post("/api/interrogate").set(alice).send({ session_id: sid, claim_id: "CL-001" }).expect(200); // 2: open question
    const resumed = await request(app).post("/api/interrogate").set(alice).send({ session_id: sid, claim_id: "CL-001" }).expect(200);
    expect(resumed.body.turn).toBe("question");
    await request(app).get(`/api/report/${sid}`).set(alice).expect(200);
    const answer = await request(app).post("/api/interrogate").set(alice).send({ session_id: sid, claim_id: "CL-001", answer: "something" }).expect(429);
    expect(answer.body.error.code).toBe("DAILY_LIMIT_REACHED");
    // the refused answer left the session untouched: the question is still open
    const detail = await request(app).get(`/api/sessions/${sid}`).set(alice).expect(200);
    expect(detail.body.open_claim_id).toBe("CL-001");
    expect(detail.body.claims[0].verdict).toBe("pending");
  });

  it("resets on the next UTC day, and deleting your data does not reset it", async () => {
    let now = new Date("2026-10-22T23:00:00.000Z");
    const app = testApp({ autoAuth: false, llmDailyBudget: 1, now: () => now });
    await extract(app).expect(200);
    await extract(app).expect(429);
    await request(app).delete("/api/me").set(alice).send({ confirm: "DELETE MY DATA" }).expect(200);
    await extract(app).expect(429);
    now = new Date("2026-10-23T00:00:01.000Z");
    await extract(app).expect(200);
  });

  it("refuses model-only routes up front, without doing any work", async () => {
    const app = testApp({ autoAuth: false, llmDailyBudget: 1 });
    await extract(app).expect(200);
    const chat = await request(app).post("/api/mentor/chat").set(alice).send({ mode: "dsa_coach", message: "hi", client_message_id: "cm_alice_0001" }).expect(429);
    expect(chat.body.error.code).toBe("DAILY_LIMIT_REACHED");
    expect((await request(app).get("/api/mentor/conversations").set(alice)).body.conversations).toEqual([]);
  });

  it("the usage store never lets concurrent calls overshoot the limit", async () => {
    const store = new MemoryUsageStore();
    const results = await Promise.all(Array.from({ length: 10 }, () => store.charge("alice", "2026-10-22", 4)));
    expect(results.filter((r) => r.allowed)).toHaveLength(4);
    expect(await store.get("alice", "2026-10-22")).toBe(4);
    await expect(store.charge("../x", "2026-10-22", 4)).rejects.toThrow(/invalid id/);
  });
});

describe("per-student model rate limit", () => {
  it("limits one student without affecting another on the same IP", async () => {
    const app = testApp({ autoAuth: false, rateLimits: { globalPerMinute: 1000, llmPerMinute: 1000, llmUserPerMinute: 2 } });
    await extract(app).expect(200);
    await extract(app).expect(200);
    const limited = await extract(app).expect(429);
    expect(limited.body.error.code).toBe("RATE_LIMITED");
    await extract(app, bob).expect(200);
  });
});

describe("saved audits per student", () => {
  it("refuses a new extraction at the cap with a clear way out", async () => {
    const app = testApp({ autoAuth: false, maxSessionsPerStudent: 2 });
    const first = (await extract(app).expect(200)).body.session_id as string;
    await extract(app).expect(200);
    const refused = await extract(app).expect(400);
    expect(refused.body.error.message).toMatch(/2 saved audits.*Delete some in My sessions/);
    await extract(app, bob).expect(200);
    await request(app).delete(`/api/sessions/${first}`).set(alice).expect(204);
    await extract(app).expect(200);
  });
});

describe("verified email", () => {
  const unverified = { Authorization: unverifiedBearer("carol") };

  it("is required for student features, with a clear code", async () => {
    const app = testApp({ autoAuth: false });
    for (const [method, path, body] of [
      ["get", "/api/sessions", undefined],
      ["post", "/api/claims/extract", declared],
      ["post", "/api/mentor/chat", { mode: "dsa_coach", message: "hi", client_message_id: "cm_carol_0001" }],
      ["get", "/api/me/dsa-progress", undefined],
      ["get", "/api/resume", undefined],
    ] as const) {
      const res = await request(app)[method](path).set(unverified).send(body);
      expect(res.status, path).toBe(403);
      expect(res.body.error.code, path).toBe("EMAIL_NOT_VERIFIED");
    }
  });

  it("is not required to see, export or delete your own account data", async () => {
    const app = testApp({ autoAuth: false });
    await request(app).get("/api/me/profile").set(unverified).expect(200);
    await request(app).put("/api/me/profile").set(unverified).send({ display_name: "Carol", college: null, graduation_year: null, target_role_id: null }).expect(200);
    await request(app).get("/api/me/usage").set(unverified).expect(200);
    await request(app).get("/api/me/export").set(unverified).expect(200);
    await request(app).delete("/api/me").set(unverified).send({ confirm: "DELETE MY DATA" }).expect(200);
  });

  it("can be switched off (e.g. for a private pilot)", async () => {
    const app = testApp({ autoAuth: false, requireEmailVerification: false });
    await request(app).get("/api/sessions").set(unverified).expect(200);
  });
});

describe("token revocation", () => {
  const admin = () => {
    const users = new Map<string, { disabled: boolean; tokensValidAfterTime?: string }>([["alice", { disabled: false, tokensValidAfterTime: new Date(1_000_000_000_000).toUTCString() }]]);
    const a: AccountAdmin & { users: typeof users; lookups: number } = {
      users,
      lookups: 0,
      async getUser(uid) {
        a.lookups++;
        const u = users.get(uid);
        if (!u) throw Object.assign(new Error("no user"), { code: "auth/user-not-found" });
        return u;
      },
      async revokeRefreshTokens(uid) {
        const u = users.get(uid);
        if (u) u.tokensValidAfterTime = new Date(2_000_000_000_000).toUTCString();
      },
    };
    return a;
  };
  const signedInAt = (uid: string, sec: number) => ({ Authorization: `Bearer test:${uid}@${sec}` });

  it("refuses tokens from before 'sign out everywhere', from a deleted or a disabled account", async () => {
    const a = admin();
    const revocation = new RevocationGuard({ admin: a, logger: silentLogger });
    const app = testApp({ autoAuth: false, revocation, revokeSessions: (uid) => revocation.revokeAll(uid) });
    const before = signedInAt("alice", 1_500_000_000);
    await request(app).get("/api/me/profile").set(before).expect(200);

    await request(app).post("/api/me/sign-out-everywhere").set(before).expect(204);
    const refused = await request(app).get("/api/me/profile").set(before).expect(401);
    expect(refused.body.error.code).toBe("UNAUTHENTICATED");
    await request(app).get("/api/me/profile").set(signedInAt("alice", 2_100_000_000)).expect(200); // signed in again afterwards

    a.users.get("alice")!.disabled = true;
    revocation.forget("alice");
    await request(app).get("/api/me/profile").set(signedInAt("alice", 2_100_000_000)).expect(401);
    await request(app).get("/api/me/profile").set(signedInAt("ghost", 2_100_000_000)).expect(401); // deleted account
  });

  it("caches each student's state for a minute, and fails open (logged) when Firebase cannot be reached", async () => {
    let t = 0;
    const a = admin();
    const guard = new RevocationGuard({ admin: a, logger: silentLogger, now: () => t });
    expect(await guard.isValid("alice", 1_500_000_000)).toBe(true);
    expect(await guard.isValid("alice", 1_500_000_000)).toBe(true);
    expect(a.lookups).toBe(1);
    t = 61_000;
    await guard.isValid("alice", 1_500_000_000);
    expect(a.lookups).toBe(2);

    const error = vi.fn();
    const broken = new RevocationGuard({ admin: { getUser: async () => Promise.reject(Object.assign(new Error("x"), { code: "app/network-error" })), revokeRefreshTokens: async () => undefined }, logger: { ...silentLogger, error } as never });
    expect(await broken.isValid("alice", 1)).toBe(true);
    expect(await broken.isValid("bob", 1)).toBe(true);
    expect(error).toHaveBeenCalledTimes(1); // throttled
  });

  it("'sign out everywhere' explains when it isn't available", async () => {
    const app = testApp({ autoAuth: false });
    expect((await request(app).post("/api/me/sign-out-everywhere").set(alice)).status).toBe(500);
  });
});

describe("hygiene", () => {
  it("health does not advertise the model unless asked to", async () => {
    const llm = Object.assign(new MockProvider(), { model: "secret-model" });
    const hidden = await request(express().use(healthRouter(llm))).get("/health").expect(200);
    expect(hidden.body.model).toBeNull();
    const shown = await request(express().use(healthRouter(llm, { exposeModel: true }))).get("/health").expect(200);
    expect(shown.body.model).toBe("secret-model");
  });

  it("retention deletes only audits untouched for longer than the window", async () => {
    const store = new MemoryStore();
    const app = testApp({ autoAuth: false, store });
    const old = (await extract(app).expect(200)).body.session_id as string;
    const fresh = (await extract(app).expect(200)).body.session_id as string;
    store.setSavedAt(old, new Date("2025-01-01T00:00:00.000Z"));
    const info = vi.fn();
    const n = await sweepInactiveSessions(store, 365, { ...silentLogger, info } as never, new Date("2026-10-22T00:00:00.000Z"));
    expect(n).toBe(1);
    expect(await store.get(old)).toBeNull();
    expect(await store.get(fresh)).not.toBeNull();
    expect(info).toHaveBeenCalledWith(expect.objectContaining({ audit: "retention.sessions_deleted", count: 1 }), expect.any(String));
  });

  it("audit events carry the event name and uid, never tokens", () => {
    const info = vi.fn();
    audit({ ...silentLogger, info } as never, "account.exported", "alice", { extra: 1 });
    expect(info).toHaveBeenCalledWith({ audit: "account.exported", uid: "alice", extra: 1 }, "audit: account.exported");
  });
});

describe("Firebase App Check", () => {
  const realVerifier = { verify: async (t: string) => { if (t !== "good-app-token") throw new Error("bad"); } };

  it("enforce: refuses requests without a valid token (403, not 401, so the student isn't signed out), exempting health", async () => {
    const app = testApp({ autoAuth: false, appCheck: { mode: "enforce", verifier: realVerifier } });
    const missing = await request(app).get("/api/me/profile").set(alice).expect(403);
    expect(missing.body.error.code).toBe("APP_CHECK_FAILED");
    await request(app).get("/api/me/profile").set(alice).set("X-Firebase-AppCheck", "forged").expect(403);
    await request(app).get("/api/roles").expect(403); // public routes too: only the web app may call the API
    await request(app).get("/api/me/profile").set(alice).set("X-Firebase-AppCheck", "good-app-token").expect(200);
    await request(app).get("/api/health").expect(200);
    await request(app).options("/api/me/profile").expect((r) => expect(r.status).toBeLessThan(400)); // CORS preflight
  });

  it("monitor: verifies and logs but never refuses", async () => {
    const app = testApp({ autoAuth: false, appCheck: { mode: "monitor", verifier: realVerifier } });
    await request(app).get("/api/me/profile").set(alice).expect(200);
    await request(app).get("/api/me/profile").set(alice).set("X-Firebase-AppCheck", "forged").expect(200);
  });

  it("logs failures in the audit shape, throttled", async () => {
    const { appCheckGuard } = await import("../../src/security/appCheck.js");
    const info = vi.fn();
    const guard = appCheckGuard("monitor", realVerifier, { ...silentLogger, info } as never);
    const next = vi.fn();
    const req = (token?: string) => ({ path: "/sessions", method: "GET", header: () => token }) as never;
    await guard(req(), {} as never, next);
    await guard(req("forged"), {} as never, next);
    expect(next).toHaveBeenCalledTimes(2);
    expect(info).toHaveBeenCalledTimes(1);
    expect(info).toHaveBeenCalledWith(expect.objectContaining({ audit: "appcheck.failed", reason: "missing", mode: "monitor" }), expect.any(String));
  });

  it("enforce without a verifier refuses everything except health (fails closed)", async () => {
    const app = testApp({ autoAuth: false, appCheck: { mode: "enforce", verifier: null } });
    await request(app).get("/api/me/profile").set(alice).set("X-Firebase-AppCheck", "good-app-token").expect(403);
    await request(app).get("/api/health").expect(200);
  });
});

describe("startup Admin access check", () => {
  it("accepts 'user not found' as proof of access and classifies failures", async () => {
    const { checkAdminAccess } = await import("../../src/security/adminCheck.js");
    const failing = (code: string) => ({ getUser: async () => Promise.reject(Object.assign(new Error("x"), { code })), revokeRefreshTokens: async () => undefined });
    expect(await checkAdminAccess(failing("auth/user-not-found"))).toEqual({ ok: true });
    expect(await checkAdminAccess(failing("auth/insufficient-permission"))).toEqual({ ok: false, transient: false, code: "auth/insufficient-permission" });
    expect(await checkAdminAccess(failing("app/invalid-credential"))).toEqual({ ok: false, transient: false, code: "app/invalid-credential" });
    expect(await checkAdminAccess(failing("app/network-error"))).toEqual({ ok: false, transient: true, code: "app/network-error" });
  });
});
