import { Firestore } from "@google-cloud/firestore";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CodeService } from "../../src/code/service.js";
import { FirestoreSubmissionStore, type SubmissionRecord } from "../../src/code/submissionStore.js";
import { DsaProgressService } from "../../src/dsa/progressService.js";
import { FirestoreProgressStore } from "../../src/dsa/progressStore.js";
import { FakeProvider } from "../code/fakeProvider.js";
import { silentLogger } from "../helpers.js";
import { bearer, fixtureCatalogue, fixtureSuites, testApp } from "../integration/app.js";
import { PROJECT_ID, requireEmulators } from "./emulator.js";

/** Submission persistence and ownership on the real Firestore emulator (the code execution itself is faked). */
const subs = `unbluff_test_subs_${randomUUID()}`;
const prog = `unbluff_test_subprog_${randomUUID()}`;
let db: Firestore;
let store: FirestoreSubmissionStore;
let app: ReturnType<typeof testApp>;

const Q = "q_fixture_06";
const solve = (stdin: string) => {
  const [head, arr] = stdin.trim().split("\n");
  const target = Number(head!.split(" ")[1]);
  const seen = new Set<number>();
  for (const x of (arr ?? "").split(" ").filter(Boolean).map(Number)) {
    if (seen.has(target - x)) return "YES";
    seen.add(x);
  }
  return "NO";
};

beforeAll(() => {
  requireEmulators();
  db = new Firestore({ projectId: PROJECT_ID, ignoreUndefinedProperties: true });
  store = new FirestoreSubmissionStore(subs, db);
  const catalogue = fixtureCatalogue();
  const progressStore = new FirestoreProgressStore(prog, db);
  const code = new CodeService({
    provider: new FakeProvider({ solve }),
    suites: fixtureSuites(),
    catalogue: () => catalogue,
    progress: new DsaProgressService(progressStore, () => catalogue),
    submissions: store,
    logger: silentLogger,
  });
  app = testApp({ autoAuth: false, code, catalogue, progressStore });
});

afterAll(async () => {
  for (const c of [subs, prog]) {
    const snap = await db.collection(c).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }
  await db.terminate();
});

const record = (id: string, owner: string): SubmissionRecord => ({
  id,
  owner_uid: owner,
  question_id: Q,
  language: "python",
  source: "print(1)",
  verdict: "wrong_answer",
  passed: 1,
  total: 8,
  failed_test: 2,
  compile_output: null,
  time_ms: 10,
  memory_kb: 2000,
  test_revision: "demo-1",
  progress_updated: false,
  created_at: new Date().toISOString(),
});

describe("FirestoreSubmissionStore on the emulator", () => {
  it("saves, reads, lists by owner (and question) and deletes", async () => {
    await store.save(record("sub_a1", "owner-a"));
    await store.save(record("sub_a2", "owner-a"));
    await store.save({ ...record("sub_b1", "owner-b"), question_id: "q_fixture_04" });
    expect((await store.get("sub_a1"))?.owner_uid).toBe("owner-a");
    expect((await store.listByOwner("owner-a")).map((r) => r.id).sort()).toEqual(["sub_a1", "sub_a2"]);
    expect((await store.listByOwner("owner-b", Q)).map((r) => r.id)).toEqual([]);
    expect((await store.listByOwner("owner-b", "q_fixture_04")).map((r) => r.id)).toEqual(["sub_b1"]);
    expect(await store.listByOwner("nobody")).toEqual([]);
    await store.delete("sub_a1");
    expect(await store.get("sub_a1")).toBeNull();
    expect(await store.get("not a valid id")).toBeNull();
  });

  it("saving the same id twice keeps one document", async () => {
    await store.save(record("sub_dup", "owner-c"));
    await store.save({ ...record("sub_dup", "owner-c"), verdict: "accepted" });
    expect((await store.listByOwner("owner-c")).map((r) => r.verdict)).toEqual(["accepted"]);
  });
});

describe("code API over Firestore on the emulator", () => {
  it("persists a judged submission, updates progress only on acceptance, and keeps it private to its owner", async () => {
    const as = (uid: string) => ({ Authorization: bearer(uid) });
    const wrong = await request(app).post("/api/code/submit").set(as("emu-alice")).send({ question_id: Q, language: "python", source: "WRONG" }).expect(200);
    expect(wrong.body.verdict).toBe("wrong_answer");
    expect((await request(app).get("/api/me/dsa-progress").set(as("emu-alice"))).body.progress).toEqual([]);

    const ok = await request(app).post("/api/code/submit").set(as("emu-alice")).send({ question_id: Q, language: "python", source: "OK" }).expect(200);
    expect(ok.body).toMatchObject({ verdict: "accepted", passed: 8, progress_updated: true });
    expect((await request(app).get("/api/me/dsa-progress").set(as("emu-alice"))).body.progress).toEqual([expect.objectContaining({ question_id: Q, status: "solved" })]);

    const list = await request(app).get("/api/code/submissions").set(as("emu-alice")).expect(200);
    expect(list.body.submissions).toHaveLength(2);
    const detail = await request(app).get(`/api/code/submissions/${ok.body.id}`).set(as("emu-alice")).expect(200);
    expect(detail.body.source).toBe("OK");

    await request(app).get(`/api/code/submissions/${ok.body.id}`).set(as("emu-bob")).expect(404);
    await request(app).delete(`/api/code/submissions/${ok.body.id}`).set(as("emu-bob")).expect(404);
    expect((await request(app).get("/api/code/submissions").set(as("emu-bob"))).body.submissions).toEqual([]);

    const raw = (await db.collection(subs).doc(ok.body.id).get()).data() as SubmissionRecord;
    expect(raw.owner_uid).toBe("emu-alice");
    await request(app).delete(`/api/code/submissions/${ok.body.id}`).set(as("emu-alice")).expect(204);
    expect((await db.collection(subs).doc(ok.body.id).get()).exists).toBe(false);
  });
});
