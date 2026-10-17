import { Firestore } from "@google-cloud/firestore";
import type { PlacementChange, PlacementFeasibility, PlacementProfile, PlacementTask } from "../types.js";

/**
 * Storage for the placement planner. Everything is owned by one student (owner_uid, from the verified token).
 * Collections:
 *   unbluff_placement_profiles  one per student (id = uid): goals and availability
 *   unbluff_placement_plans     one per student (id = uid): plan generation, feasibility and the change log
 *   unbluff_placement_tasks     one per task (id derived from the activity): the task and its history
 */

export interface ProfileRecord {
  owner_uid: string;
  profile: PlacementProfile;
  created_at: string;
  updated_at: string;
}
export interface PlanRecord {
  owner_uid: string;
  generation: number;
  generated_at: string | null;
  feasibility: PlacementFeasibility | null;
  changes: PlacementChange[]; // newest first, bounded
  last_refresh_at: string | null;
  updated_at: string;
}
export interface TaskRecord extends PlacementTask {
  owner_uid: string;
}

export interface PlacementStore {
  getProfile(uid: string): Promise<ProfileRecord | null>;
  saveProfile(rec: ProfileRecord): Promise<void>;
  getPlan(uid: string): Promise<PlanRecord | null>;
  savePlan(rec: PlanRecord): Promise<void>;
  /** At most `limit` of this student's tasks. */
  listTasks(uid: string, limit: number): Promise<TaskRecord[]>;
  saveTasks(recs: TaskRecord[]): Promise<void>;
  getTask(id: string): Promise<TaskRecord | null>;
  deleteTasks(ids: string[]): Promise<void>;
  /** Removes everything this student has in the planner. */
  deleteAll(uid: string): Promise<void>;
}

const SAFE_UID = /^[A-Za-z0-9_-]{1,128}$/;
const SAFE_ID = /^t_[a-f0-9]{24}$/;
const assert = (ok: boolean) => {
  if (!ok) throw new Error("invalid id");
};

export class MemoryPlacementStore implements PlacementStore {
  private readonly profiles = new Map<string, ProfileRecord>();
  private readonly plans = new Map<string, PlanRecord>();
  private readonly tasks = new Map<string, TaskRecord>();

  async getProfile(uid: string) {
    const r = this.profiles.get(uid);
    return r ? structuredClone(r) : null;
  }
  async saveProfile(rec: ProfileRecord) {
    assert(SAFE_UID.test(rec.owner_uid));
    this.profiles.set(rec.owner_uid, structuredClone(rec));
  }
  async getPlan(uid: string) {
    const r = this.plans.get(uid);
    return r ? structuredClone(r) : null;
  }
  async savePlan(rec: PlanRecord) {
    assert(SAFE_UID.test(rec.owner_uid));
    this.plans.set(rec.owner_uid, structuredClone(rec));
  }
  async listTasks(uid: string, limit: number) {
    return [...this.tasks.values()].filter((t) => t.owner_uid === uid).slice(0, limit).map((t) => structuredClone(t));
  }
  async saveTasks(recs: TaskRecord[]) {
    for (const r of recs) assert(SAFE_ID.test(r.id) && SAFE_UID.test(r.owner_uid));
    for (const r of recs) this.tasks.set(r.id, structuredClone(r));
  }
  async getTask(id: string) {
    const r = this.tasks.get(id);
    return r ? structuredClone(r) : null;
  }
  async deleteTasks(ids: string[]) {
    for (const id of ids) this.tasks.delete(id);
  }
  async deleteAll(uid: string) {
    this.profiles.delete(uid);
    this.plans.delete(uid);
    for (const [id, t] of this.tasks) if (t.owner_uid === uid) this.tasks.delete(id);
  }
}

export class FirestorePlacementStore implements PlacementStore {
  private readonly profiles;
  private readonly plans;
  private readonly tasks;

  constructor(
    private readonly db: Firestore = new Firestore({ ignoreUndefinedProperties: true }),
    names = { profiles: "unbluff_placement_profiles", plans: "unbluff_placement_plans", tasks: "unbluff_placement_tasks" },
  ) {
    this.profiles = db.collection(names.profiles);
    this.plans = db.collection(names.plans);
    this.tasks = db.collection(names.tasks);
  }

  async getProfile(uid: string) {
    if (!SAFE_UID.test(uid)) return null;
    const snap = await this.profiles.doc(uid).get();
    const r = snap.exists ? (snap.data() as ProfileRecord) : null;
    return r && r.owner_uid === uid ? r : null;
  }
  async saveProfile(rec: ProfileRecord) {
    assert(SAFE_UID.test(rec.owner_uid));
    await this.profiles.doc(rec.owner_uid).set({ ...rec });
  }
  async getPlan(uid: string) {
    if (!SAFE_UID.test(uid)) return null;
    const snap = await this.plans.doc(uid).get();
    const r = snap.exists ? (snap.data() as PlanRecord) : null;
    return r && r.owner_uid === uid ? r : null;
  }
  async savePlan(rec: PlanRecord) {
    assert(SAFE_UID.test(rec.owner_uid));
    await this.plans.doc(rec.owner_uid).set({ ...rec });
  }
  async listTasks(uid: string, limit: number) {
    if (!SAFE_UID.test(uid)) return [];
    const snap = await this.tasks.where("owner_uid", "==", uid).limit(limit).get();
    return snap.docs.map((d) => d.data() as TaskRecord).filter((t) => t.owner_uid === uid);
  }
  async saveTasks(recs: TaskRecord[]) {
    for (const r of recs) assert(SAFE_ID.test(r.id) && SAFE_UID.test(r.owner_uid));
    for (let i = 0; i < recs.length; i += 400) {
      const batch = this.db.batch();
      for (const r of recs.slice(i, i + 400)) batch.set(this.tasks.doc(r.id), { ...r });
      await batch.commit();
    }
  }
  async getTask(id: string) {
    if (!SAFE_ID.test(id)) return null;
    const snap = await this.tasks.doc(id).get();
    return snap.exists ? (snap.data() as TaskRecord) : null;
  }
  async deleteTasks(ids: string[]) {
    const safe = ids.filter((i) => SAFE_ID.test(i));
    for (let i = 0; i < safe.length; i += 400) {
      const batch = this.db.batch();
      for (const id of safe.slice(i, i + 400)) batch.delete(this.tasks.doc(id));
      await batch.commit();
    }
  }
  async deleteAll(uid: string) {
    if (!SAFE_UID.test(uid)) return;
    await this.profiles.doc(uid).delete();
    await this.plans.doc(uid).delete();
    for (;;) {
      const snap = await this.tasks.where("owner_uid", "==", uid).limit(400).get();
      const mine = snap.docs.filter((d) => (d.data() as TaskRecord).owner_uid === uid);
      if (mine.length === 0) return;
      const batch = this.db.batch();
      for (const d of mine) batch.delete(d.ref);
      await batch.commit();
    }
  }
}
