import { Firestore } from "@google-cloud/firestore";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FirestoreProgressStore } from "../../src/dsa/progressStore.js";
import { bearer, testApp } from "../integration/app.js";
import { PROJECT_ID, requireEmulators } from "./emulator.js";

/** DSA progress on the real Firestore emulator, in a unique throwaway collection. */
const collection = `unbluff_test_progress_${randomUUID()}`;
let db: Firestore;
let app: ReturnType<typeof testApp>;

beforeAll(() => {
  requireEmulators();
  db = new Firestore({ projectId: PROJECT_ID, ignoreUndefinedProperties: true });
  app = testApp({ autoAuth: false, progressStore: new FirestoreProgressStore(collection, db) });
});

afterAll(async () => {
  const snap = await db.collection(collection).get();
  await Promise.all(snap.docs.map((d) => d.ref.delete()));
  await db.terminate();
});

const q = "q_fixture_05";
const put = (uid: string, body: object) => request(app).put(`/api/me/dsa-progress/${q}`).set("Authorization", bearer(uid)).send(body);
const list = (uid: string) => request(app).get("/api/me/dsa-progress").set("Authorization", bearer(uid));

describe("DSA progress on the Firestore emulator", () => {
  it("creates a single record, updates it in place and persists notes and bookmarks", async () => {
    await put("emu-alice", { status: "attempted" }).expect(200);
    await put("emu-alice", { bookmarked: true, notes: "persisted note" }).expect(200);
    await put("emu-alice", { status: "solved" }).expect(200);

    const res = await list("emu-alice").expect(200);
    expect(res.body.progress).toEqual([expect.objectContaining({ question_id: q, status: "solved", bookmarked: true, notes: "persisted note" })]);

    const docs = await db.collection(collection).get();
    expect(docs.docs.filter((d) => d.data().owner_uid === "emu-alice")).toHaveLength(1);
    expect(docs.docs.map((d) => d.id)).toContain(`emu-alice~${q}`);
  });

  it("a fresh client sees the stored progress (restart) and the real owner query isolates students", async () => {
    const fresh = new Firestore({ projectId: PROJECT_ID });
    const freshApp = testApp({ autoAuth: false, progressStore: new FirestoreProgressStore(collection, fresh) });
    const alice = await request(freshApp).get("/api/me/dsa-progress").set("Authorization", bearer("emu-alice")).expect(200);
    expect(alice.body.progress).toHaveLength(1);
    const bob = await request(freshApp).get("/api/me/dsa-progress").set("Authorization", bearer("emu-bob")).expect(200);
    expect(bob.body.progress).toEqual([]);
    await fresh.terminate();
  });

  it("cross-user writes and deletes cannot touch another student's record", async () => {
    await put("emu-bob", { status: "attempted", notes: "bob's own" }).expect(200);
    await request(app).delete(`/api/me/dsa-progress/${q}`).set("Authorization", bearer("emu-bob")).expect(204);
    const alice = await list("emu-alice").expect(200);
    expect(alice.body.progress).toEqual([expect.objectContaining({ status: "solved", notes: "persisted note" })]);
    expect((await list("emu-bob")).body.progress).toEqual([]);
  });

  it("delete removes the document", async () => {
    await request(app).delete(`/api/me/dsa-progress/${q}`).set("Authorization", bearer("emu-alice")).expect(204);
    expect((await db.collection(collection).doc(`emu-alice~${q}`).get()).exists).toBe(false);
  });
});
