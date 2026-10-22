import { Firestore } from "@google-cloud/firestore";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FirebaseTokenVerifier } from "../../src/auth/verifier.js";
import { RevocationGuard } from "../../src/security/revocation.js";
import { FirestoreUsageStore } from "../../src/security/usageStore.js";
import { FirestoreStore } from "../../src/store/firestoreStore.js";
import { silentLogger } from "../helpers.js";
import { testApp } from "../integration/app.js";
import { createEmulatorUser, emulatorSignIn, PROJECT_ID, requireEmulators } from "./emulator.js";

/** Security layers against the Firebase EMULATORS (Auth + Firestore), with the real firebase-admin SDK. Never a live project. */
const run = randomUUID().slice(0, 8);
const names = { usage: `t_sec_usage_${run}`, sessions: `t_sec_sess_${run}` };
let db: Firestore;
let authHost: string;
let verifier: FirebaseTokenVerifier;

beforeAll(() => {
  ({ authHost } = requireEmulators());
  db = new Firestore({ projectId: PROJECT_ID, ignoreUndefinedProperties: true });
  verifier = new FirebaseTokenVerifier(PROJECT_ID);
});
afterAll(async () => {
  for (const c of Object.values(names)) {
    const snap = await db.collection(c).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }
  await db.terminate();
});

const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

describe("Auth emulator: verified email and revocation with real tokens", () => {
  it("an unverified address is refused until it is verified", async () => {
    const app = testApp({ autoAuth: false, verifier });
    const email = `unv-${randomUUID()}@example.test`;
    const u = await createEmulatorUser(authHost, email, "test-password-123", { verified: false });
    const res = await request(app).get("/api/sessions").set(auth(u.idToken)).expect(403);
    expect(res.body.error.code).toBe("EMAIL_NOT_VERIFIED");
    await request(app).get("/api/me/profile").set(auth(u.idToken)).expect(200); // account routes stay open
  });

  it("'sign out everywhere' makes existing tokens fail; signing in again works", async () => {
    const admin = verifier.admin();
    expect(admin).not.toBeNull();
    const revocation = new RevocationGuard({ admin: admin!, logger: silentLogger });
    const app = testApp({ autoAuth: false, verifier, revocation, revokeSessions: (uid) => revocation.revokeAll(uid) });
    const email = `rev-${randomUUID()}@example.test`;
    const u = await createEmulatorUser(authHost, email);
    await request(app).get("/api/sessions").set(auth(u.idToken)).expect(200);

    await new Promise((r) => setTimeout(r, 1100)); // revocation times have one-second resolution
    await request(app).post("/api/me/sign-out-everywhere").set(auth(u.idToken)).expect(204);
    await request(app).get("/api/sessions").set(auth(u.idToken)).expect(401);

    await new Promise((r) => setTimeout(r, 1100));
    const fresh = await emulatorSignIn(authHost, email);
    await request(app).get("/api/sessions").set(auth(fresh)).expect(200);
  });

  it("a deleted account's still-unexpired token is refused", async () => {
    const admin = verifier.admin()!;
    const revocation = new RevocationGuard({ admin, logger: silentLogger });
    const app = testApp({ autoAuth: false, verifier, revocation });
    const u = await createEmulatorUser(authHost, `del-${randomUUID()}@example.test`);
    await request(app).get("/api/sessions").set(auth(u.idToken)).expect(200);
    const del = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer owner" },
      body: JSON.stringify({ localId: u.uid }),
    });
    expect(del.ok).toBe(true);
    revocation.forget(u.uid); // skip the one-minute cache
    await request(app).get("/api/sessions").set(auth(u.idToken)).expect(401);
  });
});

describe("Auth emulator: the revocation guard itself (the production path)", () => {
  // In emulator mode the Admin SDK's verifyIdToken also checks revocation, which production does not do by default; so
  // the HTTP tests above would pass even without the guard. These call the guard directly with the real Admin SDK.
  const authTimeOf = (t: string) => (JSON.parse(Buffer.from(t.split(".")[1]!, "base64url").toString("utf8")) as { auth_time: number }).auth_time;

  it("refuses a sign-in from before 'sign out everywhere' and accepts one after it", async () => {
    const guard = new RevocationGuard({ admin: verifier.admin()!, logger: silentLogger });
    const email = `guard-${randomUUID()}@example.test`;
    const u = await createEmulatorUser(authHost, email);
    expect(await guard.isValid(u.uid, authTimeOf(u.idToken))).toBe(true);
    await new Promise((r) => setTimeout(r, 1100));
    await guard.revokeAll(u.uid);
    expect(await guard.isValid(u.uid, authTimeOf(u.idToken))).toBe(false);
    await new Promise((r) => setTimeout(r, 1100));
    expect(await guard.isValid(u.uid, authTimeOf(await emulatorSignIn(authHost, email)))).toBe(true);
  });

  it("refuses a deleted account", async () => {
    const guard = new RevocationGuard({ admin: verifier.admin()!, logger: silentLogger });
    const u = await createEmulatorUser(authHost, `gone-${randomUUID()}@example.test`);
    await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer owner" },
      body: JSON.stringify({ localId: u.uid }),
    });
    expect(await guard.isValid(u.uid, authTimeOf(u.idToken))).toBe(false);
  });
});

describe("Firestore emulator: usage counters and retention", () => {
  it("never lets concurrent charges overshoot the daily limit, per student and per day", async () => {
    const store = new FirestoreUsageStore(db, names.usage);
    const results = await Promise.all(Array.from({ length: 8 }, () => store.charge("sec-a", "2026-10-22", 3)));
    expect(results.filter((r) => r.allowed)).toHaveLength(3);
    expect(await store.get("sec-a", "2026-10-22")).toBe(3);
    expect(await store.get("sec-a", "2026-10-23")).toBe(0);
    expect(await store.get("sec-b", "2026-10-22")).toBe(0);
    await db.collection(names.usage).doc("sec-c_2026-10-22").set({ owner_uid: "sec-a", day: "2026-10-22", count: 99 }); // misfiled
    expect(await store.get("sec-c", "2026-10-22")).toBe(0);
  });

  it("deletes only sessions last saved before the cutoff", async () => {
    const store = new FirestoreStore(names.sessions, db);
    const base = { owner_uid: "sec-a", role_id: "frontend_developer", mode: "prepare" as const, created_at: "x", resume_text: "r", declared_skills: [], claims: [], next_seq: 1, cursors: {}, history: [], guard_flips: 0, completions: 0, schedule: {} };
    await store.save({ ...base, id: "s_old" });
    await db.collection(names.sessions).doc("s_old").update({ updated_at: new Date("2024-01-01T00:00:00.000Z") });
    await store.save({ ...base, id: "s_new" });
    expect(await store.deleteInactiveBefore(new Date("2025-01-01T00:00:00.000Z"), 100)).toBe(1);
    expect(await store.get("s_old")).toBeNull();
    expect(await store.get("s_new")).not.toBeNull();
  });
});
