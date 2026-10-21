import { Firestore } from "@google-cloud/firestore";
import type { DbmsProgress, PatternProgress } from "../types.js";

/** One progress document per student, owner-scoped. The owner is always the verified uid. */
export interface LearnRecord {
  owner_uid: string;
  patterns: Record<string, PatternProgress>;
  dbms: Record<string, DbmsProgress>;
  updated_at: string;
}

export interface LearnStore {
  get(uid: string): Promise<LearnRecord | null>;
  put(rec: LearnRecord): Promise<void>;
  delete(uid: string): Promise<void>;
}

const SAFE_UID = /^[A-Za-z0-9_-]{1,128}$/;
const assert = (ok: boolean) => {
  if (!ok) throw new Error("invalid id");
};

export class MemoryLearnStore implements LearnStore {
  private readonly docs = new Map<string, LearnRecord>();
  async get(uid: string) {
    const r = SAFE_UID.test(uid) ? this.docs.get(uid) : undefined;
    return r && r.owner_uid === uid ? structuredClone(r) : null;
  }
  async put(rec: LearnRecord) {
    assert(SAFE_UID.test(rec.owner_uid));
    this.docs.set(rec.owner_uid, structuredClone(rec));
  }
  async delete(uid: string) {
    if (SAFE_UID.test(uid)) this.docs.delete(uid);
  }
}

export class FirestoreLearnStore implements LearnStore {
  private readonly col;
  constructor(db: Firestore = new Firestore({ ignoreUndefinedProperties: true }), name = "unbluff_learn_progress") {
    this.col = db.collection(name);
  }
  async get(uid: string) {
    if (!SAFE_UID.test(uid)) return null;
    const snap = await this.col.doc(uid).get();
    const r = snap.exists ? (snap.data() as LearnRecord) : null;
    return r && r.owner_uid === uid ? r : null;
  }
  async put(rec: LearnRecord) {
    assert(SAFE_UID.test(rec.owner_uid));
    await this.col.doc(rec.owner_uid).set({ ...rec });
  }
  async delete(uid: string) {
    if (!SAFE_UID.test(uid)) return;
    await this.col.doc(uid).delete();
  }
}
