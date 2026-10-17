import { Firestore } from "@google-cloud/firestore";
import type { DsaProgress } from "../types.js";

/** One record per (student, question). Personal data: never mixed into the public catalogue. */
export interface ProgressRecord extends DsaProgress {
  owner_uid: string;
}

export interface ProgressStore {
  get(uid: string, questionId: string): Promise<ProgressRecord | null>;
  put(record: ProgressRecord): Promise<void>;
  delete(uid: string, questionId: string): Promise<void>;
  listByOwner(uid: string): Promise<ProgressRecord[]>;
}

const SAFE_PART = /^[A-Za-z0-9_-]{1,128}$/;

function assertSafe(uid: string, questionId: string): void {
  // Keeps the composite key unambiguous and valid as a Firestore document id.
  if (!SAFE_PART.test(uid) || !SAFE_PART.test(questionId)) throw new Error("invalid progress key");
}

const key = (uid: string, questionId: string) => `${uid}~${questionId}`;

export class MemoryProgressStore implements ProgressStore {
  private readonly records = new Map<string, ProgressRecord>();

  async get(uid: string, questionId: string): Promise<ProgressRecord | null> {
    assertSafe(uid, questionId);
    const r = this.records.get(key(uid, questionId));
    return r ? { ...r } : null;
  }

  async put(record: ProgressRecord): Promise<void> {
    assertSafe(record.owner_uid, record.question_id);
    this.records.set(key(record.owner_uid, record.question_id), { ...record });
  }

  async delete(uid: string, questionId: string): Promise<void> {
    assertSafe(uid, questionId);
    this.records.delete(key(uid, questionId));
  }

  async listByOwner(uid: string): Promise<ProgressRecord[]> {
    return [...this.records.values()].filter((r) => r.owner_uid === uid).map((r) => ({ ...r }));
  }
}

/**
 * Firestore-backed progress. The document id is `<uid>~<questionId>`, so a student can never have two
 * records for one question (set() on the same id overwrites). `owner_uid` is a top-level field for the
 * single-field listing query.
 */
export class FirestoreProgressStore implements ProgressStore {
  private readonly collection;

  constructor(collectionName = "unbluff_dsa_progress", db = new Firestore({ ignoreUndefinedProperties: true })) {
    this.collection = db.collection(collectionName);
  }

  async get(uid: string, questionId: string): Promise<ProgressRecord | null> {
    assertSafe(uid, questionId);
    const snap = await this.collection.doc(key(uid, questionId)).get();
    return snap.exists ? toRecord(snap.data() as Record<string, unknown>, uid) : null;
  }

  async put(record: ProgressRecord): Promise<void> {
    assertSafe(record.owner_uid, record.question_id);
    await this.collection.doc(key(record.owner_uid, record.question_id)).set({ ...record });
  }

  async delete(uid: string, questionId: string): Promise<void> {
    assertSafe(uid, questionId);
    await this.collection.doc(key(uid, questionId)).delete();
  }

  async listByOwner(uid: string): Promise<ProgressRecord[]> {
    const snap = await this.collection.where("owner_uid", "==", uid).get();
    return snap.docs.map((d) => toRecord(d.data() as Record<string, unknown>, uid)).filter((r): r is ProgressRecord => r !== null);
  }
}

function toRecord(data: Record<string, unknown>, uid: string): ProgressRecord | null {
  // The stored owner is authoritative: a document that does not name this student is never returned.
  if (data.owner_uid !== uid || typeof data.question_id !== "string") return null;
  return {
    owner_uid: uid,
    question_id: data.question_id,
    status: data.status as ProgressRecord["status"],
    bookmarked: data.bookmarked === true,
    notes: typeof data.notes === "string" ? data.notes : "",
    created_at: String(data.created_at),
    updated_at: String(data.updated_at),
  };
}
