import { Firestore } from "@google-cloud/firestore";
import type { AccountProfile } from "../types.js";

/** One profile document per student, keyed by the verified uid. */
export interface AccountProfileRecord extends AccountProfile {
  owner_uid: string;
}

export interface AccountStore {
  get(uid: string): Promise<AccountProfileRecord | null>;
  put(rec: AccountProfileRecord): Promise<void>;
  delete(uid: string): Promise<void>;
}

const SAFE_UID = /^[A-Za-z0-9_-]{1,128}$/;
const assert = (ok: boolean) => {
  if (!ok) throw new Error("invalid id");
};

export class MemoryAccountStore implements AccountStore {
  private readonly docs = new Map<string, AccountProfileRecord>();
  async get(uid: string) {
    const r = SAFE_UID.test(uid) ? this.docs.get(uid) : undefined;
    return r && r.owner_uid === uid ? structuredClone(r) : null;
  }
  async put(rec: AccountProfileRecord) {
    assert(SAFE_UID.test(rec.owner_uid));
    this.docs.set(rec.owner_uid, structuredClone(rec));
  }
  async delete(uid: string) {
    if (SAFE_UID.test(uid)) this.docs.delete(uid);
  }
}

export class FirestoreAccountStore implements AccountStore {
  private readonly col;
  constructor(db: Firestore = new Firestore({ ignoreUndefinedProperties: true }), name = "unbluff_profiles") {
    this.col = db.collection(name);
  }
  async get(uid: string) {
    if (!SAFE_UID.test(uid)) return null;
    const snap = await this.col.doc(uid).get();
    const r = snap.exists ? (snap.data() as AccountProfileRecord) : null;
    return r && r.owner_uid === uid ? r : null;
  }
  async put(rec: AccountProfileRecord) {
    assert(SAFE_UID.test(rec.owner_uid));
    await this.col.doc(rec.owner_uid).set({ ...rec });
  }
  async delete(uid: string) {
    if (!SAFE_UID.test(uid)) return;
    await this.col.doc(uid).delete();
  }
}
