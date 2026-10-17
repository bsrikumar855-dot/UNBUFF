import { Firestore } from "@google-cloud/firestore";
import type { GithubSection, GithubSyncFailure } from "../types.js";
import type { SealedToken } from "./vault.js";

/**
 * GitHub integration storage. Every record is owned by exactly one student. Nothing here is readable by browsers:
 * the backend (Admin SDK) is the only reader, and the deployment should deny all client access to these collections.
 *
 * Collections:
 *   unbluff_github_states       one-time OAuth states (document id = sha256 of the state)
 *   unbluff_github_connections  one per student (document id = uid): linked account, status, sync bookkeeping
 *   unbluff_github_credentials  one per student (document id = uid): the ENCRYPTED access token only
 *   unbluff_github_identities   one per GitHub account (document id = GitHub numeric id): which student owns it
 *   unbluff_github_insights     one per student (document id = uid): the last synchronised, normalised summaries
 */

export interface OAuthStateRecord {
  owner_uid: string;
  code_verifier: string; // PKCE; useless without the authorization code and the browser's state
  created_at: string;
  expires_at: string;
}

export interface ConnectionRecord {
  owner_uid: string;
  github_user_id: string;
  login: string;
  profile_url: string;
  permissions: string[];
  status: "connected" | "reauthorization_required";
  connected_at: string;
  last_synced_at: string | null;
  last_attempt_at: string | null;
  /** Manual syncs before this time are answered from the cache (protects GitHub's rate limit). */
  next_sync_allowed_at: string | null;
  last_error: GithubSyncFailure | null;
  last_error_at: string | null;
  /** Cross-instance sync lock: a sync is running until this time. */
  sync_lock_until: string | null;
}

export interface CredentialRecord {
  owner_uid: string;
  github_user_id: string;
  sealed: SealedToken;
  created_at: string;
}

/** What a synchronisation produced for one section. Replaced wholesale on the next successful sync of that section. */
export interface SectionSnapshot<T> {
  synced_at: string;
  data: T;
}

export interface InsightsRecord {
  owner_uid: string;
  login: string;
  github_user_id: string;
  updated_at: string;
  contributions?: SectionSnapshot<unknown>;
  repositories?: SectionSnapshot<unknown>;
  activity?: SectionSnapshot<unknown>;
  /** Sections whose last attempt failed (their data above, if any, is older). */
  unavailable: GithubSection[];
}

export interface GithubStore {
  // OAuth states
  saveState(hash: string, record: OAuthStateRecord): Promise<void>;
  /** Atomically reads and deletes a state, so it can be used once. */
  consumeState(hash: string): Promise<OAuthStateRecord | null>;
  /** Deletes this student's pending states beyond `keep` (oldest first) and any that expired. Returns the count removed. */
  pruneStates(uid: string, now: string, keep: number): Promise<number>;

  // connection
  getConnection(uid: string): Promise<ConnectionRecord | null>;
  saveConnection(record: ConnectionRecord): Promise<void>;
  deleteConnection(uid: string): Promise<void>;

  // credentials
  getCredential(uid: string): Promise<CredentialRecord | null>;
  saveCredential(record: CredentialRecord): Promise<void>;
  deleteCredential(uid: string): Promise<void>;

  // GitHub identity ownership: one GitHub account belongs to at most one student
  /** Claims the account for this student. Returns false when another student already owns it. Re-claiming your own is fine. */
  claimIdentity(githubUserId: string, uid: string, now: string): Promise<boolean>;
  releaseIdentity(githubUserId: string, uid: string): Promise<void>;

  // insights cache
  getInsights(uid: string): Promise<InsightsRecord | null>;
  saveInsights(record: InsightsRecord): Promise<void>;
  deleteInsights(uid: string): Promise<void>;

  /** Cross-instance mutual exclusion for synchronisation. Returns false when another sync holds an unexpired lock. */
  acquireSyncLock(uid: string, now: string, until: string): Promise<boolean>;
  releaseSyncLock(uid: string): Promise<void>;
}

const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;
const HASH = /^[a-f0-9]{64}$/;
const NUMERIC = /^[0-9]{1,20}$/;
const assert = (ok: boolean) => {
  if (!ok) throw new Error("invalid id");
};

export class MemoryGithubStore implements GithubStore {
  private readonly states = new Map<string, OAuthStateRecord>();
  private readonly connections = new Map<string, ConnectionRecord>();
  private readonly credentials = new Map<string, CredentialRecord>();
  private readonly identities = new Map<string, string>();
  private readonly insights = new Map<string, InsightsRecord>();

  async saveState(hash: string, record: OAuthStateRecord) {
    assert(HASH.test(hash));
    this.states.set(hash, structuredClone(record));
  }
  async consumeState(hash: string) {
    if (!HASH.test(hash)) return null;
    const r = this.states.get(hash);
    this.states.delete(hash);
    return r ? structuredClone(r) : null;
  }
  async pruneStates(uid: string, now: string, keep: number) {
    const mine = [...this.states.entries()].filter(([, s]) => s.owner_uid === uid).sort((a, b) => b[1].created_at.localeCompare(a[1].created_at));
    let n = 0;
    mine.forEach(([hash, s], i) => {
      if (i >= keep || s.expires_at <= now) {
        this.states.delete(hash);
        n++;
      }
    });
    return n;
  }

  async getConnection(uid: string) {
    const r = this.connections.get(uid);
    return r ? structuredClone(r) : null;
  }
  async saveConnection(r: ConnectionRecord) {
    assert(SAFE_ID.test(r.owner_uid));
    this.connections.set(r.owner_uid, structuredClone(r));
  }
  async deleteConnection(uid: string) {
    this.connections.delete(uid);
  }

  async getCredential(uid: string) {
    const r = this.credentials.get(uid);
    return r ? structuredClone(r) : null;
  }
  async saveCredential(r: CredentialRecord) {
    assert(SAFE_ID.test(r.owner_uid));
    this.credentials.set(r.owner_uid, structuredClone(r));
  }
  async deleteCredential(uid: string) {
    this.credentials.delete(uid);
  }

  async claimIdentity(githubUserId: string, uid: string) {
    assert(NUMERIC.test(githubUserId));
    const owner = this.identities.get(githubUserId);
    if (owner && owner !== uid) return false;
    this.identities.set(githubUserId, uid);
    return true;
  }
  async releaseIdentity(githubUserId: string, uid: string) {
    if (this.identities.get(githubUserId) === uid) this.identities.delete(githubUserId);
  }

  async getInsights(uid: string) {
    const r = this.insights.get(uid);
    return r ? structuredClone(r) : null;
  }
  async saveInsights(r: InsightsRecord) {
    assert(SAFE_ID.test(r.owner_uid));
    this.insights.set(r.owner_uid, structuredClone(r));
  }
  async deleteInsights(uid: string) {
    this.insights.delete(uid);
  }

  async acquireSyncLock(uid: string, now: string, until: string) {
    const c = this.connections.get(uid);
    if (!c) return false;
    if (c.sync_lock_until && c.sync_lock_until > now) return false;
    c.sync_lock_until = until;
    return true;
  }
  async releaseSyncLock(uid: string) {
    const c = this.connections.get(uid);
    if (c) c.sync_lock_until = null;
  }
}

export class FirestoreGithubStore implements GithubStore {
  private readonly states;
  private readonly connections;
  private readonly credentials;
  private readonly identities;
  private readonly insights;

  constructor(
    private readonly db: Firestore = new Firestore({ ignoreUndefinedProperties: true }),
    names = {
      states: "unbluff_github_states",
      connections: "unbluff_github_connections",
      credentials: "unbluff_github_credentials",
      identities: "unbluff_github_identities",
      insights: "unbluff_github_insights",
    },
  ) {
    this.states = db.collection(names.states);
    this.connections = db.collection(names.connections);
    this.credentials = db.collection(names.credentials);
    this.identities = db.collection(names.identities);
    this.insights = db.collection(names.insights);
  }

  async saveState(hash: string, record: OAuthStateRecord) {
    assert(HASH.test(hash));
    await this.states.doc(hash).set({ ...record });
  }
  async consumeState(hash: string) {
    if (!HASH.test(hash)) return null;
    const ref = this.states.doc(hash);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return null;
      tx.delete(ref);
      return snap.data() as OAuthStateRecord;
    });
  }
  async pruneStates(uid: string, now: string, keep: number) {
    const snap = await this.states.where("owner_uid", "==", uid).get();
    const mine = snap.docs.filter((d) => (d.data() as OAuthStateRecord).owner_uid === uid).sort((a, b) => (b.data() as OAuthStateRecord).created_at.localeCompare((a.data() as OAuthStateRecord).created_at));
    const drop = mine.filter((d, i) => i >= keep || (d.data() as OAuthStateRecord).expires_at <= now);
    if (drop.length === 0) return 0;
    const batch = this.db.batch();
    for (const d of drop) batch.delete(d.ref);
    await batch.commit();
    return drop.length;
  }

  async getConnection(uid: string) {
    if (!SAFE_ID.test(uid)) return null;
    const snap = await this.connections.doc(uid).get();
    const r = snap.exists ? (snap.data() as ConnectionRecord) : null;
    return r && r.owner_uid === uid ? r : null;
  }
  async saveConnection(r: ConnectionRecord) {
    assert(SAFE_ID.test(r.owner_uid));
    await this.connections.doc(r.owner_uid).set({ ...r });
  }
  async deleteConnection(uid: string) {
    if (SAFE_ID.test(uid)) await this.connections.doc(uid).delete();
  }

  async getCredential(uid: string) {
    if (!SAFE_ID.test(uid)) return null;
    const snap = await this.credentials.doc(uid).get();
    const r = snap.exists ? (snap.data() as CredentialRecord) : null;
    return r && r.owner_uid === uid ? r : null;
  }
  async saveCredential(r: CredentialRecord) {
    assert(SAFE_ID.test(r.owner_uid));
    await this.credentials.doc(r.owner_uid).set({ ...r });
  }
  async deleteCredential(uid: string) {
    if (SAFE_ID.test(uid)) await this.credentials.doc(uid).delete();
  }

  async claimIdentity(githubUserId: string, uid: string, now: string) {
    assert(NUMERIC.test(githubUserId));
    const ref = this.identities.doc(githubUserId);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const owner = snap.exists ? (snap.data() as { owner_uid?: string }).owner_uid : undefined;
      if (owner && owner !== uid) return false;
      tx.set(ref, { owner_uid: uid, linked_at: now });
      return true;
    });
  }
  async releaseIdentity(githubUserId: string, uid: string) {
    if (!NUMERIC.test(githubUserId)) return;
    const ref = this.identities.doc(githubUserId);
    await this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists && (snap.data() as { owner_uid?: string }).owner_uid === uid) tx.delete(ref);
    });
  }

  async getInsights(uid: string) {
    if (!SAFE_ID.test(uid)) return null;
    const snap = await this.insights.doc(uid).get();
    const r = snap.exists ? (snap.data() as InsightsRecord) : null;
    return r && r.owner_uid === uid ? r : null;
  }
  async saveInsights(r: InsightsRecord) {
    assert(SAFE_ID.test(r.owner_uid));
    await this.insights.doc(r.owner_uid).set({ ...r });
  }
  async deleteInsights(uid: string) {
    if (SAFE_ID.test(uid)) await this.insights.doc(uid).delete();
  }

  async acquireSyncLock(uid: string, now: string, until: string) {
    if (!SAFE_ID.test(uid)) return false;
    const ref = this.connections.doc(uid);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return false;
      const c = snap.data() as ConnectionRecord;
      if (c.owner_uid !== uid) return false;
      if (c.sync_lock_until && c.sync_lock_until > now) return false;
      tx.update(ref, { sync_lock_until: until });
      return true;
    });
  }
  async releaseSyncLock(uid: string) {
    if (!SAFE_ID.test(uid)) return;
    const ref = this.connections.doc(uid);
    const snap = await ref.get();
    if (snap.exists) await ref.update({ sync_lock_until: null });
  }
}
