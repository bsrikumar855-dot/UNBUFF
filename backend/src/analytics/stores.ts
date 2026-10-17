import { Firestore } from "@google-cloud/firestore";
import type { RevisionRecord } from "./revision.js";
import type { StatsRecord } from "./stats.js";

/** Both stores key a record by (owner uid, question id), so a student has at most one of each per question. */

export interface StatsStore {
  get(uid: string, questionId: string): Promise<StatsRecord | null>;
  put(record: StatsRecord): Promise<void>;
  delete(uid: string, questionId: string): Promise<void>;
  /** At most `limit` records of this student (a student has at most one per catalogue question). */
  listByOwner(uid: string, limit: number): Promise<StatsRecord[]>;
}

export interface RevisionStore {
  get(uid: string, questionId: string): Promise<RevisionRecord | null>;
  put(record: RevisionRecord): Promise<void>;
  delete(uid: string, questionId: string): Promise<void>;
  listByOwner(uid: string, limit: number): Promise<RevisionRecord[]>;
}

const SAFE = /^[A-Za-z0-9_-]{1,128}$/;
function check(uid: string, questionId: string): void {
  if (!SAFE.test(uid) || !SAFE.test(questionId)) throw new Error("invalid key");
}
const key = (uid: string, questionId: string) => `${uid}~${questionId}`;

class MemoryKeyed<T extends { owner_uid: string; question_id: string }> {
  private readonly rows = new Map<string, T>();
  async get(uid: string, q: string): Promise<T | null> {
    check(uid, q);
    const r = this.rows.get(key(uid, q));
    return r ? structuredClone(r) : null;
  }
  async put(record: T): Promise<void> {
    check(record.owner_uid, record.question_id);
    this.rows.set(key(record.owner_uid, record.question_id), structuredClone(record));
  }
  async delete(uid: string, q: string): Promise<void> {
    check(uid, q);
    this.rows.delete(key(uid, q));
  }
  async listByOwner(uid: string, limit: number): Promise<T[]> {
    return [...this.rows.values()].filter((r) => r.owner_uid === uid).slice(0, limit).map((r) => structuredClone(r));
  }
}

export class MemoryStatsStore extends MemoryKeyed<StatsRecord> implements StatsStore {}
export class MemoryRevisionStore extends MemoryKeyed<RevisionRecord> implements RevisionStore {}

class FirestoreKeyed<T extends { owner_uid: string; question_id: string }> {
  private readonly collection;
  constructor(name: string, db: Firestore) {
    this.collection = db.collection(name);
  }
  async get(uid: string, q: string): Promise<T | null> {
    check(uid, q);
    const snap = await this.collection.doc(key(uid, q)).get();
    const data = snap.exists ? (snap.data() as T) : null;
    return data && data.owner_uid === uid ? data : null; // the stored owner is authoritative
  }
  async put(record: T): Promise<void> {
    check(record.owner_uid, record.question_id);
    await this.collection.doc(key(record.owner_uid, record.question_id)).set({ ...record });
  }
  async delete(uid: string, q: string): Promise<void> {
    check(uid, q);
    await this.collection.doc(key(uid, q)).delete();
  }
  async listByOwner(uid: string, limit: number): Promise<T[]> {
    // Single-field equality query: served by the automatic index, no composite index needed.
    const snap = await this.collection.where("owner_uid", "==", uid).limit(limit).get();
    return snap.docs.map((d) => d.data() as T).filter((r) => r.owner_uid === uid);
  }
}

const defaultDb = () => new Firestore({ ignoreUndefinedProperties: true });
export class FirestoreStatsStore extends FirestoreKeyed<StatsRecord> implements StatsStore {
  constructor(name = "unbluff_dsa_stats", db: Firestore = defaultDb()) {
    super(name, db);
  }
}
export class FirestoreRevisionStore extends FirestoreKeyed<RevisionRecord> implements RevisionStore {
  constructor(name = "unbluff_dsa_revision", db: Firestore = defaultDb()) {
    super(name, db);
  }
}
