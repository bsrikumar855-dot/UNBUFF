import { Firestore } from "@google-cloud/firestore";
import type { LabAttempt } from "../types.js";
import type { StudentState } from "./trainingApi.js";

/**
 * Storage for the GraphQL Learning Lab. Every record belongs to one student (owner_uid, always taken from the verified
 * token). Collections:
 *   unbluff_graphql_lab_state     one per student (id = uid): the student's private training data
 *   unbluff_graphql_lab_progress  one per student (id = uid): per-exercise progress and recent activity
 *   unbluff_graphql_lab_attempts  one per submission (id derived from uid, exercise and client attempt id)
 */

export interface ExerciseProgress {
  attempts: number;
  passed: boolean;
  passed_at: string | null;
  hints_used: number;
  last_attempt_at: string | null;
  /** Ids of attempts already counted above, so replaying a submission can never count it twice. */
  counted: string[];
}
export interface ActivityEntry {
  at: string;
  kind: "passed" | "attempt" | "hint";
  exercise_id: string;
}
export interface ProgressRecord {
  owner_uid: string;
  created_at: string;
  updated_at: string;
  exercises: Record<string, ExerciseProgress>;
  activity: ActivityEntry[];
}
export interface AttemptRecord extends LabAttempt {
  owner_uid: string;
}
export interface StateRecord {
  owner_uid: string;
  updated_at: string;
  state: StudentState;
}

export interface LabStore {
  getState(uid: string): Promise<StateRecord | null>;
  saveState(rec: StateRecord): Promise<void>;
  getProgress(uid: string): Promise<ProgressRecord | null>;
  /** Atomic read-modify-write. `fn` receives the current record (or null) and must be pure. */
  updateProgress(uid: string, fn: (current: ProgressRecord | null) => ProgressRecord): Promise<ProgressRecord>;
  getAttempt(id: string): Promise<AttemptRecord | null>;
  saveAttempt(rec: AttemptRecord): Promise<void>;
  listAttempts(uid: string, exerciseId: string | null, limit: number): Promise<AttemptRecord[]>;
  deleteAttempts(ids: string[]): Promise<void>;
  /** Removes everything this student has in the Lab. */
  deleteAll(uid: string): Promise<void>;
}

const SAFE_UID = /^[A-Za-z0-9_-]{1,128}$/;
const SAFE_ID = /^[A-Za-z0-9_~-]{1,200}$/;
const assert = (ok: boolean) => {
  if (!ok) throw new Error("invalid id");
};

export class MemoryLabStore implements LabStore {
  private readonly states = new Map<string, StateRecord>();
  private readonly progress = new Map<string, ProgressRecord>();
  private readonly attempts = new Map<string, AttemptRecord>();

  async getState(uid: string) {
    const r = this.states.get(uid);
    return r ? structuredClone(r) : null;
  }
  async saveState(rec: StateRecord) {
    assert(SAFE_UID.test(rec.owner_uid));
    this.states.set(rec.owner_uid, structuredClone(rec));
  }
  async getProgress(uid: string) {
    const r = this.progress.get(uid);
    return r ? structuredClone(r) : null;
  }
  async updateProgress(uid: string, fn: (c: ProgressRecord | null) => ProgressRecord) {
    assert(SAFE_UID.test(uid));
    const next = fn(this.progress.has(uid) ? structuredClone(this.progress.get(uid)!) : null);
    this.progress.set(uid, structuredClone(next));
    return structuredClone(next);
  }
  async getAttempt(id: string) {
    const r = this.attempts.get(id);
    return r ? structuredClone(r) : null;
  }
  async saveAttempt(rec: AttemptRecord) {
    assert(SAFE_ID.test(rec.id));
    this.attempts.set(rec.id, structuredClone(rec));
  }
  async listAttempts(uid: string, exerciseId: string | null, limit: number) {
    return [...this.attempts.values()]
      .filter((a) => a.owner_uid === uid && (exerciseId === null || a.exercise_id === exerciseId))
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, limit)
      .map((a) => structuredClone(a));
  }
  async deleteAttempts(ids: string[]) {
    for (const id of ids) this.attempts.delete(id);
  }
  async deleteAll(uid: string) {
    this.states.delete(uid);
    this.progress.delete(uid);
    for (const [id, a] of this.attempts) if (a.owner_uid === uid) this.attempts.delete(id);
  }
}

export class FirestoreLabStore implements LabStore {
  private readonly states;
  private readonly progress;
  private readonly attempts;

  constructor(
    private readonly db: Firestore = new Firestore({ ignoreUndefinedProperties: true }),
    names = { state: "unbluff_graphql_lab_state", progress: "unbluff_graphql_lab_progress", attempts: "unbluff_graphql_lab_attempts" },
  ) {
    this.states = db.collection(names.state);
    this.progress = db.collection(names.progress);
    this.attempts = db.collection(names.attempts);
  }

  async getState(uid: string) {
    if (!SAFE_UID.test(uid)) return null;
    const snap = await this.states.doc(uid).get();
    const r = snap.exists ? (snap.data() as StateRecord) : null;
    return r && r.owner_uid === uid ? r : null;
  }
  async saveState(rec: StateRecord) {
    assert(SAFE_UID.test(rec.owner_uid));
    await this.states.doc(rec.owner_uid).set({ ...rec });
  }
  async getProgress(uid: string) {
    if (!SAFE_UID.test(uid)) return null;
    const snap = await this.progress.doc(uid).get();
    const r = snap.exists ? (snap.data() as ProgressRecord) : null;
    return r && r.owner_uid === uid ? r : null;
  }
  async updateProgress(uid: string, fn: (c: ProgressRecord | null) => ProgressRecord) {
    assert(SAFE_UID.test(uid));
    const ref = this.progress.doc(uid);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const cur = snap.exists ? (snap.data() as ProgressRecord) : null;
      const next = fn(cur && cur.owner_uid === uid ? cur : null);
      tx.set(ref, { ...next });
      return next;
    });
  }
  async getAttempt(id: string) {
    if (!SAFE_ID.test(id)) return null;
    const snap = await this.attempts.doc(id).get();
    return snap.exists ? (snap.data() as AttemptRecord) : null;
  }
  async saveAttempt(rec: AttemptRecord) {
    assert(SAFE_ID.test(rec.id));
    await this.attempts.doc(rec.id).set({ ...rec });
  }
  async listAttempts(uid: string, exerciseId: string | null, limit: number) {
    let q = this.attempts.where("owner_uid", "==", uid);
    if (exerciseId !== null) q = q.where("exercise_id", "==", exerciseId);
    const snap = await q.limit(1000).get();
    return snap.docs
      .map((d) => d.data() as AttemptRecord)
      .filter((a) => a.owner_uid === uid)
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, limit);
  }
  async deleteAttempts(ids: string[]) {
    const safe = ids.filter((i) => SAFE_ID.test(i));
    for (let i = 0; i < safe.length; i += 400) {
      const batch = this.db.batch();
      for (const id of safe.slice(i, i + 400)) batch.delete(this.attempts.doc(id));
      await batch.commit();
    }
  }
  async deleteAll(uid: string) {
    if (!SAFE_UID.test(uid)) return;
    await this.states.doc(uid).delete();
    await this.progress.doc(uid).delete();
    for (;;) {
      const snap = await this.attempts.where("owner_uid", "==", uid).limit(400).get();
      const mine = snap.docs.filter((d) => (d.data() as AttemptRecord).owner_uid === uid);
      if (mine.length === 0) return;
      const batch = this.db.batch();
      for (const d of mine) batch.delete(d.ref);
      await batch.commit();
    }
  }
}
