import { Firestore } from "@google-cloud/firestore";
import type { LeetCodeSnapshot } from "../types.js";

/**
 * Storage for the LeetCode link and the student's imported progress. Everything is owned by one student (owner_uid, from
 * the verified token); the browser never reads it directly and no file can name another owner.
 *
 *   unbluff_leetcode_connections  one per student (id = uid): the linked username
 *   unbluff_leetcode_snapshots    one per student and distinct imported data (id = "<uid>__<content hash>")
 *
 * No access token, cookie, password or session value of any kind is stored, because none is ever collected.
 */

export interface ConnectionRecord {
  owner_uid: string;
  username: string;
  username_key: string; // lower case, for comparison
  profile_url: string;
  linked_at: string;
  updated_at: string;
}
export interface SnapshotRecord extends LeetCodeSnapshot {
  owner_uid: string;
}

export interface LeetCodeStore {
  getConnection(uid: string): Promise<ConnectionRecord | null>;
  saveConnection(rec: ConnectionRecord): Promise<void>;
  deleteConnection(uid: string): Promise<void>;
  getSnapshot(uid: string, id: string): Promise<SnapshotRecord | null>;
  /** Creates the snapshot only if this student has none with the same id. Returns false (and changes nothing) when it already exists. */
  createSnapshot(rec: SnapshotRecord): Promise<boolean>;
  /** At most `limit` of this student's snapshots, unordered. */
  listSnapshots(uid: string, limit: number): Promise<SnapshotRecord[]>;
  deleteSnapshot(uid: string, id: string): Promise<boolean>;
  /** Removes the student's snapshots (and only theirs); returns how many. */
  deleteSnapshots(uid: string): Promise<number>;
}

const SAFE_UID = /^[A-Za-z0-9_-]{1,128}$/;
export const SNAPSHOT_ID = /^[a-f0-9]{32}$/;
const assert = (ok: boolean) => {
  if (!ok) throw new Error("invalid id");
};
const keyOf = (uid: string, id: string) => `${uid}__${id}`;

export class MemoryLeetCodeStore implements LeetCodeStore {
  private readonly connections = new Map<string, ConnectionRecord>();
  private readonly snapshots = new Map<string, SnapshotRecord>();

  async getConnection(uid: string) {
    const r = SAFE_UID.test(uid) ? this.connections.get(uid) : undefined;
    return r && r.owner_uid === uid ? structuredClone(r) : null;
  }
  async saveConnection(rec: ConnectionRecord) {
    assert(SAFE_UID.test(rec.owner_uid));
    this.connections.set(rec.owner_uid, structuredClone(rec));
  }
  async deleteConnection(uid: string) {
    if (SAFE_UID.test(uid)) this.connections.delete(uid);
  }
  async getSnapshot(uid: string, id: string) {
    if (!SAFE_UID.test(uid) || !SNAPSHOT_ID.test(id)) return null;
    const r = this.snapshots.get(keyOf(uid, id));
    return r && r.owner_uid === uid ? structuredClone(r) : null;
  }
  async createSnapshot(rec: SnapshotRecord) {
    assert(SAFE_UID.test(rec.owner_uid) && SNAPSHOT_ID.test(rec.id));
    const k = keyOf(rec.owner_uid, rec.id);
    if (this.snapshots.has(k)) return false;
    this.snapshots.set(k, structuredClone(rec));
    return true;
  }
  async listSnapshots(uid: string, limit: number) {
    if (!SAFE_UID.test(uid)) return [];
    return [...this.snapshots.values()]
      .filter((r) => r.owner_uid === uid)
      .slice(0, limit)
      .map((r) => structuredClone(r));
  }
  async deleteSnapshot(uid: string, id: string) {
    if (!SAFE_UID.test(uid) || !SNAPSHOT_ID.test(id)) return false;
    return this.snapshots.delete(keyOf(uid, id));
  }
  async deleteSnapshots(uid: string) {
    if (!SAFE_UID.test(uid)) return 0;
    let n = 0;
    for (const [k, r] of this.snapshots) {
      if (r.owner_uid === uid) {
        this.snapshots.delete(k);
        n += 1;
      }
    }
    return n;
  }
}

export class FirestoreLeetCodeStore implements LeetCodeStore {
  private readonly connections;
  private readonly snapshots;

  constructor(
    private readonly db: Firestore = new Firestore({ ignoreUndefinedProperties: true }),
    names = { connections: "unbluff_leetcode_connections", snapshots: "unbluff_leetcode_snapshots" },
  ) {
    this.connections = db.collection(names.connections);
    this.snapshots = db.collection(names.snapshots);
  }

  async getConnection(uid: string) {
    if (!SAFE_UID.test(uid)) return null;
    const snap = await this.connections.doc(uid).get();
    const r = snap.exists ? (snap.data() as ConnectionRecord) : null;
    return r && r.owner_uid === uid ? r : null;
  }
  async saveConnection(rec: ConnectionRecord) {
    assert(SAFE_UID.test(rec.owner_uid));
    await this.connections.doc(rec.owner_uid).set({ ...rec });
  }
  async deleteConnection(uid: string) {
    if (!SAFE_UID.test(uid)) return;
    await this.connections.doc(uid).delete();
  }
  async getSnapshot(uid: string, id: string) {
    if (!SAFE_UID.test(uid) || !SNAPSHOT_ID.test(id)) return null;
    const snap = await this.snapshots.doc(keyOf(uid, id)).get();
    const r = snap.exists ? (snap.data() as SnapshotRecord) : null;
    return r && r.owner_uid === uid ? r : null;
  }
  async createSnapshot(rec: SnapshotRecord) {
    assert(SAFE_UID.test(rec.owner_uid) && SNAPSHOT_ID.test(rec.id));
    try {
      await this.snapshots.doc(keyOf(rec.owner_uid, rec.id)).create({ ...rec }); // atomic: fails if the same data is already stored
      return true;
    } catch (e) {
      if ((e as { code?: number }).code === 6) return false; // ALREADY_EXISTS
      throw e;
    }
  }
  async listSnapshots(uid: string, limit: number) {
    if (!SAFE_UID.test(uid)) return [];
    const snap = await this.snapshots.where("owner_uid", "==", uid).limit(limit).get();
    return snap.docs.map((d) => d.data() as SnapshotRecord).filter((r) => r.owner_uid === uid);
  }
  async deleteSnapshot(uid: string, id: string) {
    if (!SAFE_UID.test(uid) || !SNAPSHOT_ID.test(id)) return false;
    const ref = this.snapshots.doc(keyOf(uid, id));
    const snap = await ref.get();
    if (!snap.exists || (snap.data() as SnapshotRecord).owner_uid !== uid) return false;
    await ref.delete();
    return true;
  }
  async deleteSnapshots(uid: string) {
    if (!SAFE_UID.test(uid)) return 0;
    const snap = await this.snapshots.where("owner_uid", "==", uid).get();
    const docs = snap.docs.filter((d) => (d.data() as SnapshotRecord).owner_uid === uid);
    for (let i = 0; i < docs.length; i += 400) {
      const batch = this.db.batch();
      for (const d of docs.slice(i, i + 400)) batch.delete(d.ref);
      await batch.commit();
    }
    return docs.length;
  }
}
