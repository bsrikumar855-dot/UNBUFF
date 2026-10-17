import { Firestore } from "@google-cloud/firestore";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FirestoreStore } from "../../src/store/firestoreStore.js";
import type { Session } from "../../src/store/SessionStore.js";
import { bearer, sampleResume, testApp } from "../integration/app.js";
import { claim } from "../helpers.js";
import { PROJECT_ID, requireEmulators } from "./emulator.js";

/** FirestoreStore against the real Firestore emulator, in a unique throwaway collection. */
const collection = `unbluff_test_${randomUUID()}`;
let db: Firestore;
let store: FirestoreStore;

function session(id: string, owner: string | undefined): Session {
  const s: Session = {
    id,
    owner_uid: owner as string,
    role_id: "frontend_developer",
    mode: "defense",
    created_at: new Date().toISOString(),
    resume_text: "Built a React dashboard with secret@example.com",
    declared_skills: ["React"],
    claims: [claim("CL-001", "react_state", "pending", 0)],
    next_seq: 2,
    cursors: {},
    history: [],
    guard_flips: 0,
    completions: 0,
    schedule: {},
  };
  if (owner === undefined) delete (s as { owner_uid?: string }).owner_uid;
  return s;
}

beforeAll(() => {
  requireEmulators();
  db = new Firestore({ projectId: PROJECT_ID, ignoreUndefinedProperties: true });
  store = new FirestoreStore(collection, db);
});

afterAll(async () => {
  // Remove only what these tests created.
  const snap = await db.collection(collection).get();
  await Promise.all(snap.docs.map((d) => d.ref.delete()));
  await db.terminate();
});

describe("FirestoreStore on the Firestore emulator", () => {
  it("creates, reads, updates and deletes a session", async () => {
    const s = session("s_crud", "alice");
    expect(await store.get("s_crud")).toBeNull();
    await store.save(s);
    expect(await store.get("s_crud")).toEqual(s);

    s.guard_flips = 4;
    s.claims[0]!.verdict = "defended";
    await store.save(s);
    const updated = await store.get("s_crud");
    expect(updated?.guard_flips).toBe(4);
    expect(updated?.claims[0]?.verdict).toBe("defended");

    await store.delete("s_crud");
    expect(await store.get("s_crud")).toBeNull();
    await expect(store.delete("s_crud")).resolves.toBeUndefined();
  });

  it("stores ownership both inside the JSON and as a top-level field, and a new client sees it (restart)", async () => {
    await store.save(session("s_owner", "alice"));
    const raw = (await db.collection(collection).doc("s_owner").get()).data() as { owner_uid: string; json: string };
    expect(raw.owner_uid).toBe("alice");
    expect((JSON.parse(raw.json) as Session).owner_uid).toBe("alice");

    const freshClient = new Firestore({ projectId: PROJECT_ID });
    const afterRestart = new FirestoreStore(collection, freshClient);
    expect((await afterRestart.get("s_owner"))?.owner_uid).toBe("alice");
    await freshClient.terminate();
  });

  it("listByOwner uses the real query and returns only that owner's sessions", async () => {
    await store.save(session("s_a1", "owner-list-a"));
    await store.save(session("s_a2", "owner-list-a"));
    await store.save(session("s_b1", "owner-list-b"));
    expect((await store.listByOwner("owner-list-a")).map((s) => s.id).sort()).toEqual(["s_a1", "s_a2"]);
    expect((await store.listByOwner("owner-list-b")).map((s) => s.id)).toEqual(["s_b1"]);
    expect(await store.listByOwner("nobody")).toEqual([]);
  });

  it("a legacy document without an owner is never listed", async () => {
    await store.save(session("s_legacy", undefined));
    const raw = (await db.collection(collection).doc("s_legacy").get()).data() as Record<string, unknown>;
    expect(raw.owner_uid).toBeUndefined();
    expect(await store.listByOwner("undefined")).toEqual([]);
    expect(await store.listByOwner("")).toEqual([]);
  });
});

describe("HTTP API with FirestoreStore on the emulator", () => {
  it("enforces ownership, history and deletion end to end", async () => {
    const app = testApp({ autoAuth: false, store });
    const extract = (uid: string) =>
      request(app)
        .post("/api/claims/extract")
        .set("Authorization", bearer(uid))
        .send({ role_id: "frontend_developer", resume_text: sampleResume })
        .expect(200);

    const sid = (await extract("http-alice")).body.session_id as string;
    await request(app).get(`/api/report/${sid}`).set("Authorization", bearer("http-alice")).expect(200);
    await request(app).get(`/api/report/${sid}`).set("Authorization", bearer("http-bob")).expect(404);
    await request(app).delete(`/api/sessions/${sid}`).set("Authorization", bearer("http-bob")).expect(404);

    const list = await request(app).get("/api/sessions").set("Authorization", bearer("http-alice")).expect(200);
    expect(list.body.sessions.map((s: { session_id: string }) => s.session_id)).toEqual([sid]);

    await request(app).delete(`/api/sessions/${sid}`).set("Authorization", bearer("http-alice")).expect(204);
    expect(await store.get(sid)).toBeNull();
    expect((await db.collection(collection).doc(sid).get()).exists).toBe(false);
  });
});
