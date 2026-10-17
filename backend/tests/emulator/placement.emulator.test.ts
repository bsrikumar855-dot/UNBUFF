import { Firestore } from "@google-cloud/firestore";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FirestorePlacementStore, type TaskRecord } from "../../src/placement/store.js";
import type { PlacementDashboard } from "../../src/types.js";
import { A, B, harness, ready } from "../placement/harness.js";
import { PROJECT_ID, requireEmulators } from "./emulator.js";

/** The planner's storage and flow on the Firestore EMULATOR (the model is the deterministic mock). The emulator is not a live project. */
const run = randomUUID().slice(0, 8);
const names = { profiles: `t_pl_prof_${run}`, plans: `t_pl_plan_${run}`, tasks: `t_pl_task_${run}` };
let db: Firestore;
let store: FirestorePlacementStore;

beforeAll(() => {
  requireEmulators();
  db = new Firestore({ projectId: PROJECT_ID, ignoreUndefinedProperties: true });
  store = new FirestorePlacementStore(db, names);
});
afterAll(async () => {
  for (const c of Object.values(names)) {
    const snap = await db.collection(c).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }
  await db.terminate();
});

const task = (id: string, owner: string): TaskRecord => ({
  id: `t_${id.padEnd(24, "0")}`, owner_uid: owner, type: "general", title: id, description: "", skill_area: "x", priority: 3, estimated_minutes: 15, due_date: "2026-06-15", original_due_date: "2026-06-15", link: "/",
  ref: { kind: "review", id }, completion_criteria: "c", completion_check: "student", evidence_source: "s", reason: "r", reason_codes: [], depends_on: [], blocked: false, status: "planned", postponed_count: 0,
  skip_reason: null, completed_at: null, completed_by: null, student_scheduled: false, created_at: "x", updated_at: "x", history: [],
});

describe("Firestore emulator: placement store", () => {
  it("keeps tasks owned, bounded and deletable per student", async () => {
    await store.saveTasks([task("a1", "pl-a"), task("a2", "pl-a"), task("b1", "pl-b")]);
    expect((await store.listTasks("pl-a", 10)).map((t) => t.title).sort()).toEqual(["a1", "a2"]);
    expect((await store.listTasks("pl-a", 1)).length).toBe(1);
    expect((await store.listTasks("pl-b", 10)).map((t) => t.title)).toEqual(["b1"]);
    expect((await store.getTask(`t_${"a1".padEnd(24, "0")}`))?.owner_uid).toBe("pl-a");
    await store.saveProfile({ owner_uid: "pl-a", profile: { role_ids: [], target_companies: [], placement_date: null, available_weekdays: [1], daily_minutes: 30, preferred_language: null, experience_level: null, strengths: [], weak_areas: [], priorities: [] }, created_at: "x", updated_at: "x" });
    await db.collection(names.profiles).doc("pl-c").set({ owner_uid: "pl-a" }); // filed under the wrong key
    expect(await store.getProfile("pl-c")).toBeNull();
    await store.deleteAll("pl-a");
    expect(await store.getProfile("pl-a")).toBeNull();
    expect(await store.listTasks("pl-a", 10)).toEqual([]);
    expect((await store.listTasks("pl-b", 10)).length).toBe(1);
    await expect(store.saveTasks([{ ...task("bad", "pl-a"), id: "not-an-id" }])).rejects.toThrow(/invalid id/);
    await expect(store.saveProfile({ owner_uid: "a/b", profile: {} as never, created_at: "x", updated_at: "x" })).rejects.toThrow(/invalid id/);
  });
});

describe("Firestore emulator: the planner end to end", () => {
  it("generates, persists, adapts to a verified result without duplicates, and isolates two students", async () => {
    const h = harness({ placementStore: new FirestorePlacementStore(db, names) });
    const uidA = `${A}-${run}`;
    const uidB = `${B}-${run}`;
    const d = await ready(h, {}, uidA);
    const ids = (x: PlacementDashboard) => [...new Set(x.week.flatMap((w) => w.tasks).map((t) => t.id))].sort();
    expect(d.plan?.generation).toBe(1);
    const again = (await h.api.post("/refresh", {}, uidA)).body as PlacementDashboard;
    expect(ids(again)).toEqual(ids(d)); // persisted and idempotent

    const diag = d.today_tasks.find((t) => t.type === "diagnostic")!;
    h.advance(0, 12);
    await h.setStats(uidA, diag.ref.id, { attempts: 1, accepted: 1 });
    const done = (await h.api.post("/refresh", {}, uidA)).body as PlacementDashboard;
    expect(done.history.recent_completed.find((t) => t.id === diag.id)).toMatchObject({ completed_by: "verified_event" });

    expect((await h.api.get("/dashboard", uidB)).body.needs_profile).toBe(true);
    expect((await h.api.post(`/tasks/${diag.id}/action`, { action: "remove" }, uidB)).status).toBe(404);
    expect((await h.api.del("/data", uidA)).status).toBe(204);
    expect((await h.api.get("/dashboard", uidA)).body.needs_profile).toBe(true);
    expect((await db.collection(names.tasks).where("owner_uid", "==", uidA).get()).size).toBe(0);
  });
});
