import { Firestore } from "@google-cloud/firestore";
import type { AnalyticsStatus, CodeSubmissionDetail } from "../types.js";

/**
 * A stored submission. `owner_uid` and the provenance fields are internal. Records written before provenance
 * existed lack `analytics_status`/`provider*`; readers treat that as "unknown provenance" and never count them.
 */
export type SubmissionRecord = Omit<CodeSubmissionDetail, "analytics_status"> & {
  owner_uid: string;
  analytics_status?: AnalyticsStatus;
  provider?: string; // adapter name that executed the tests, e.g. "judge0"
  provider_verified?: boolean; // operator declared the execution service a real deployment when this was judged
  suite_license?: string; // licence status of the test suite (development_fixture = demonstration data)
};

export interface SubmissionStore {
  save(record: SubmissionRecord): Promise<void>;
  get(id: string): Promise<SubmissionRecord | null>;
  listByOwner(uid: string, questionId?: string): Promise<SubmissionRecord[]>;
  delete(id: string): Promise<void>;
  /** Newest first. Firestore needs the (owner_uid, created_at desc) index in firestore.indexes.json. */
  listRecentByOwner(uid: string, limit: number): Promise<SubmissionRecord[]>;
  /** Only submissions that count toward analytics (used to rebuild statistics). Unordered. */
  listCountedByOwner(uid: string, limit: number): Promise<SubmissionRecord[]>;
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

  async listRecentByOwner(uid: string, limit: number): Promise<SubmissionRecord[]> {
    return (await this.listByOwner(uid)).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit);
  }

  async listCountedByOwner(uid: string, limit: number): Promise<SubmissionRecord[]> {
    return (await this.listByOwner(uid)).filter((r) => r.analytics_status === "counted").slice(0, limit);
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

  async listRecentByOwner(uid: string, limit: number): Promise<SubmissionRecord[]> {
    const snap = await this.collection.where("owner_uid", "==", uid).orderBy("created_at", "desc").limit(limit).get();
    return snap.docs.map((d) => d.data() as SubmissionRecord).filter((r) => r.owner_uid === uid);
  }

  async listCountedByOwner(uid: string, limit: number): Promise<SubmissionRecord[]> {
    const snap = await this.collection.where("owner_uid", "==", uid).where("analytics_status", "==", "counted").limit(limit).get();
    return snap.docs.map((d) => d.data() as SubmissionRecord).filter((r) => r.owner_uid === uid);
  }
}
