import { Firestore } from "@google-cloud/firestore";
import type { CodeSubmissionDetail } from "../types.js";

/** A stored submission. `owner_uid` is internal and never sent to clients. */
export interface SubmissionRecord extends CodeSubmissionDetail {
  owner_uid: string;
}

export interface SubmissionStore {
  save(record: SubmissionRecord): Promise<void>;
  get(id: string): Promise<SubmissionRecord | null>;
  listByOwner(uid: string, questionId?: string): Promise<SubmissionRecord[]>;
  delete(id: string): Promise<void>;
}

export class MemorySubmissionStore implements SubmissionStore {
  private readonly records = new Map<string, SubmissionRecord>();

  async save(record: SubmissionRecord): Promise<void> {
    this.records.set(record.id, { ...record });
  }

  async get(id: string): Promise<SubmissionRecord | null> {
    const r = this.records.get(id);
    return r ? { ...r } : null;
  }

  async listByOwner(uid: string, questionId?: string): Promise<SubmissionRecord[]> {
    return [...this.records.values()].filter((r) => r.owner_uid === uid && (!questionId || r.question_id === questionId)).map((r) => ({ ...r }));
  }

  async delete(id: string): Promise<void> {
    this.records.delete(id);
  }
}

const SAFE_ID = /^sub_[A-Za-z0-9-]{1,64}$/;

/**
 * One document per submission (the id is the document id, so a submission can never be stored twice).
 * Ownership is the top-level `owner_uid`; reads are always re-checked against it by the service.
 */
export class FirestoreSubmissionStore implements SubmissionStore {
  private readonly collection;

  constructor(collectionName = "unbluff_code_submissions", db = new Firestore({ ignoreUndefinedProperties: true })) {
    this.collection = db.collection(collectionName);
  }

  async save(record: SubmissionRecord): Promise<void> {
    if (!SAFE_ID.test(record.id)) throw new Error("invalid submission id");
    await this.collection.doc(record.id).set({ ...record });
  }

  async get(id: string): Promise<SubmissionRecord | null> {
    if (!SAFE_ID.test(id)) return null;
    const snap = await this.collection.doc(id).get();
    return snap.exists ? (snap.data() as SubmissionRecord) : null;
  }

  async listByOwner(uid: string, questionId?: string): Promise<SubmissionRecord[]> {
    const snap = await this.collection.where("owner_uid", "==", uid).get();
    return snap.docs.map((d) => d.data() as SubmissionRecord).filter((r) => r.owner_uid === uid && (!questionId || r.question_id === questionId));
  }

  async delete(id: string): Promise<void> {
    if (!SAFE_ID.test(id)) return;
    await this.collection.doc(id).delete();
  }
}
