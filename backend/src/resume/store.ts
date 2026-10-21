import { Firestore } from "@google-cloud/firestore";
import type { ResumeDocument } from "../types.js";

/** One résumé per student, owner-scoped. The owner is always the verified uid; nothing here accepts another. */
export interface ResumeRecord extends ResumeDocument {
  owner_uid: string;
}

export interface ResumeStore {
  get(uid: string): Promise<ResumeRecord | null>;
  put(rec: ResumeRecord): Promise<void>;
  delete(uid: string): Promise<void>;
}

const SAFE_UID = /^[A-Za-z0-9_-]{1,128}$/;
const assert = (ok: boolean) => {
  if (!ok) throw new Error("invalid id");
};

export class MemoryResumeStore implements ResumeStore {
  private readonly docs = new Map<string, ResumeRecord>();
  async get(uid: string) {
    const r = SAFE_UID.test(uid) ? this.docs.get(uid) : undefined;
    return r && r.owner_uid === uid ? structuredClone(r) : null;
  }
  async put(rec: ResumeRecord) {
    assert(SAFE_UID.test(rec.owner_uid));
    this.docs.set(rec.owner_uid, structuredClone(rec));
  }
  async delete(uid: string) {
    if (SAFE_UID.test(uid)) this.docs.delete(uid);
  }
}

export class FirestoreResumeStore implements ResumeStore {
  private readonly col;
  constructor(db: Firestore = new Firestore({ ignoreUndefinedProperties: true }), name = "unbluff_resume_documents") {
    this.col = db.collection(name);
  }
  async get(uid: string) {
    if (!SAFE_UID.test(uid)) return null;
    const snap = await this.col.doc(uid).get();
    const r = snap.exists ? (snap.data() as ResumeRecord) : null;
    return r && r.owner_uid === uid ? r : null;
  }
  async put(rec: ResumeRecord) {
    assert(SAFE_UID.test(rec.owner_uid));
    await this.col.doc(rec.owner_uid).set({ ...rec });
  }
  async delete(uid: string) {
    if (!SAFE_UID.test(uid)) return;
    await this.col.doc(uid).delete();
  }
}
