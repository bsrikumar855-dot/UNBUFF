import { Firestore } from "@google-cloud/firestore";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { exerciseById } from "../../src/graphqllab/curriculum.js";
import type { QueryExercise } from "../../src/graphqllab/model.js";
import { FirestoreLabStore, type AttemptRecord, type ProgressRecord } from "../../src/graphqllab/store.js";
import { seedState } from "../../src/graphqllab/trainingApi.js";
import { RecordingLlm } from "../mentor/recordingLlm.js";
import { bearer, testApp } from "../integration/app.js";
import { PROJECT_ID, requireEmulators } from "./emulator.js";

/** The Lab's storage and flow on the Firestore EMULATOR (the model is the deterministic mock). The emulator is not a live project. */
const run = randomUUID().slice(0, 8);
const names = { state: `t_lab_state_${run}`, progress: `t_lab_prog_${run}`, attempts: `t_lab_att_${run}` };
let db: Firestore;
let store: FirestoreLabStore;

beforeAll(() => {
  requireEmulators();
  db = new Firestore({ projectId: PROJECT_ID, ignoreUndefinedProperties: true });
  store = new FirestoreLabStore(db, names);
});
afterAll(async () => {
  for (const c of Object.values(names)) {
    const snap = await db.collection(c).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }
  await db.terminate();
});

const NOW = "2026-06-15T12:00:00.000Z";
const attempt = (id: string, owner: string, exercise: string, at: string): AttemptRecord => ({ id, owner_uid: owner, exercise_id: exercise, at, passed: false, query: "{ x }", variables: null, answer: null, feedback: "f", checks: [] });

describe("Firestore emulator: GraphQL Lab store", () => {
  it("updates progress atomically: concurrent increments are not lost", async () => {
    const uid = `atomic-${run}`;
    const bump = () =>
      store.updateProgress(uid, (cur) => {
        const p: ProgressRecord = cur ?? { owner_uid: uid, created_at: NOW, updated_at: NOW, exercises: {}, activity: [] };
        const ex = p.exercises["m1-e1"] ?? { attempts: 0, passed: false, passed_at: null, hints_used: 0, last_attempt_at: null, counted: [] };
        ex.attempts += 1;
        p.exercises["m1-e1"] = ex;
        return p;
      });
    await Promise.all(Array.from({ length: 6 }, bump));
    expect((await store.getProgress(uid))!.exercises["m1-e1"]!.attempts).toBe(6);
  });

  it("never returns another student's records, and keeps attempts separate", async () => {
    await store.saveState({ owner_uid: "lab-a", updated_at: NOW, state: seedState() });
    await db.collection(names.state).doc("lab-b").set({ owner_uid: "lab-a", updated_at: NOW, state: seedState() }); // filed under the wrong key
    expect(await store.getState("lab-a")).not.toBeNull();
    expect(await store.getState("lab-b")).toBeNull();
    expect(await store.getProgress("../x")).toBeNull();
    await store.saveAttempt(attempt("att_a1", "lab-a", "m1-e1", "2026-06-15T12:00:01Z"));
    await store.saveAttempt(attempt("att_a2", "lab-a", "m1-e2", "2026-06-15T12:00:02Z"));
    await store.saveAttempt(attempt("att_b1", "lab-b", "m1-e1", "2026-06-15T12:00:03Z"));
    expect((await store.listAttempts("lab-a", null, 10)).map((a) => a.id)).toEqual(["att_a2", "att_a1"]);
    expect((await store.listAttempts("lab-a", "m1-e1", 10)).map((a) => a.id)).toEqual(["att_a1"]);
    expect((await store.listAttempts("lab-b", null, 10)).map((a) => a.id)).toEqual(["att_b1"]);
    await store.deleteAll("lab-a");
    expect(await store.getState("lab-a")).toBeNull();
    expect(await store.listAttempts("lab-a", null, 10)).toEqual([]);
    expect((await store.listAttempts("lab-b", null, 10)).length).toBe(1);
    await expect(store.saveState({ owner_uid: "a/b", updated_at: NOW, state: seedState() })).rejects.toThrow(/invalid id/);
  });
});

describe("Firestore emulator: the Lab end to end", () => {
  it("persists mutations, grades, counts a retried submission once and isolates two students", async () => {
    const app = testApp({ autoAuth: false, llm: new RecordingLlm(), labStore: new FirestoreLabStore(db, names) });
    const a = { Authorization: bearer(`lab-e2e-a-${run}`) };
    const b = { Authorization: bearer(`lab-e2e-b-${run}`) };
    const post = (p: string, body: object, h = a) => request(app).post(`/api/graphql-lab${p}`).set(h).send(body);

    await post("/execute", { query: 'mutation { applyToRole(input: { roleId: "r3" }) { application { id } } }' });
    expect((await post("/execute", { query: "{ me { applicationCount } }" })).body.result.data.me.applicationCount).toBe(3);
    expect((await post("/execute", { query: "{ me { applicationCount } }" }, b)).body.result.data.me.applicationCount).toBe(2);

    const def = exerciseById("m3-e1")!.def as QueryExercise;
    const body = { client_attempt_id: "attempt_emu_0001", query: def.reference };
    const first = await post("/exercises/m3-e1/submit", body);
    const retry = await post("/exercises/m3-e1/submit", body);
    expect(first.body.outcome).toBe("passed");
    expect(retry.body.replayed).toBe(true);
    expect(retry.body.exercise.attempts).toBe(1);
    const progress = await request(app).get("/api/graphql-lab/progress").set(a);
    expect(progress.body.totals).toMatchObject({ exercises_passed: 1, attempts: 1, modules_started: 1 });
    expect((await request(app).get("/api/graphql-lab/progress").set(b)).body.has_started).toBe(false);

    expect((await request(app).delete("/api/graphql-lab/progress").set(a)).status).toBe(204);
    expect((await request(app).get("/api/graphql-lab/progress").set(a)).body.has_started).toBe(false);
    expect((await post("/execute", { query: "{ me { applicationCount } }" })).body.result.data.me.applicationCount).toBe(2);
  });
});
