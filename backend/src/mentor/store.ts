import { Firestore } from "@google-cloud/firestore";
import type { MentorMemory, MentorMessage, MentorMode } from "../types.js";

/** Raw conversation and memory records for the AI mentor. Both are owned by exactly one student (owner_uid). */

export interface StoredMessage extends MentorMessage {
  /** Idempotency key supplied by the client for user messages. */
  client_message_id?: string;
}

export interface ConversationRecord {
  id: string;
  owner_uid: string;
  title: string;
  mode: MentorMode;
  hint_level: number;
  created_at: string;
  updated_at: string;
  messages: StoredMessage[];
  /** Total user turns so far (messages are capped, this is not). */
  turns: number;
  /** Number of user turns when the last summary was written (0 = never). */
  summarized_turns: number;
  /** Conversations are deleted after this time (retention). */
  expires_at: string;
}

export interface MemoryRecord extends MentorMemory {
  owner_uid: string;
  /** Structured value for profile memories (never sent to clients as-is). */
  value?: unknown;
}

export interface MentorStore {
  getConversation(id: string): Promise<ConversationRecord | null>;
  saveConversation(record: ConversationRecord): Promise<void>;
  listConversations(uid: string, limit: number): Promise<ConversationRecord[]>;
  deleteConversation(id: string): Promise<void>;
  /** Deletes every conversation of this student. Returns how many were removed. */
  deleteConversationsByOwner(uid: string): Promise<number>;

  getMemory(id: string): Promise<MemoryRecord | null>;
  saveMemory(record: MemoryRecord): Promise<void>;
  listMemories(uid: string, limit: number): Promise<MemoryRecord[]>;
  deleteMemory(id: string): Promise<void>;
  /** Deletes every memory of this student. Returns how many were removed. */
  deleteMemoriesByOwner(uid: string): Promise<number>;
}

const SAFE_ID = /^[A-Za-z0-9_-]{1,100}$/;
const assertId = (id: string) => {
  if (!SAFE_ID.test(id)) throw new Error("invalid id");
};

export class MemoryMentorStore implements MentorStore {
  private readonly conversations = new Map<string, ConversationRecord>();
  private readonly memories = new Map<string, MemoryRecord>();

  async getConversation(id: string) {
    const r = this.conversations.get(id);
    return r ? structuredClone(r) : null;
  }
  async saveConversation(r: ConversationRecord) {
    assertId(r.id);
    this.conversations.set(r.id, structuredClone(r));
  }
  async listConversations(uid: string, limit: number) {
    return [...this.conversations.values()].filter((c) => c.owner_uid === uid).slice(0, limit).map((c) => structuredClone(c));
  }
  async deleteConversation(id: string) {
    this.conversations.delete(id);
  }
  async deleteConversationsByOwner(uid: string) {
    let n = 0;
    for (const [id, c] of this.conversations) if (c.owner_uid === uid && this.conversations.delete(id)) n++;
    return n;
  }

  async getMemory(id: string) {
    const r = this.memories.get(id);
    return r ? structuredClone(r) : null;
  }
  async saveMemory(r: MemoryRecord) {
    assertId(r.id);
    this.memories.set(r.id, structuredClone(r));
  }
  async listMemories(uid: string, limit: number) {
    return [...this.memories.values()].filter((m) => m.owner_uid === uid).slice(0, limit).map((m) => structuredClone(m));
  }
  async deleteMemory(id: string) {
    this.memories.delete(id);
  }
  async deleteMemoriesByOwner(uid: string) {
    let n = 0;
    for (const [id, m] of this.memories) if (m.owner_uid === uid && this.memories.delete(id)) n++;
    return n;
  }
}

/**
 * Firestore-backed mentor storage. One document per conversation and per memory; ownership is the top-level
 * `owner_uid` (single-field equality queries, no composite index) and is re-checked on every read.
 */
export class FirestoreMentorStore implements MentorStore {
  private readonly conversations;
  private readonly memories;
  private readonly db: Firestore;

  constructor(names = { conversations: "unbluff_mentor_conversations", memories: "unbluff_mentor_memories" }, db: Firestore = new Firestore({ ignoreUndefinedProperties: true })) {
    this.db = db;
    this.conversations = db.collection(names.conversations);
    this.memories = db.collection(names.memories);
  }

  async getConversation(id: string) {
    if (!SAFE_ID.test(id)) return null;
    const snap = await this.conversations.doc(id).get();
    return snap.exists ? (snap.data() as ConversationRecord) : null;
  }
  async saveConversation(r: ConversationRecord) {
    assertId(r.id);
    await this.conversations.doc(r.id).set({ ...r });
  }
  async listConversations(uid: string, limit: number) {
    const snap = await this.conversations.where("owner_uid", "==", uid).limit(limit).get();
    return snap.docs.map((d) => d.data() as ConversationRecord).filter((c) => c.owner_uid === uid);
  }
  async deleteConversation(id: string) {
    if (SAFE_ID.test(id)) await this.conversations.doc(id).delete();
  }
  async deleteConversationsByOwner(uid: string) {
    return this.deleteAll(this.conversations, uid);
  }

  async getMemory(id: string) {
    if (!SAFE_ID.test(id)) return null;
    const snap = await this.memories.doc(id).get();
    return snap.exists ? (snap.data() as MemoryRecord) : null;
  }
  async saveMemory(r: MemoryRecord) {
    assertId(r.id);
    await this.memories.doc(r.id).set({ ...r });
  }
  async listMemories(uid: string, limit: number) {
    const snap = await this.memories.where("owner_uid", "==", uid).limit(limit).get();
    return snap.docs.map((d) => d.data() as MemoryRecord).filter((m) => m.owner_uid === uid);
  }
  async deleteMemory(id: string) {
    if (SAFE_ID.test(id)) await this.memories.doc(id).delete();
  }
  async deleteMemoriesByOwner(uid: string) {
    return this.deleteAll(this.memories, uid);
  }

  /** Deletes this student's documents in batches of 400 until none are left. */
  private async deleteAll(collection: ReturnType<Firestore["collection"]>, uid: string): Promise<number> {
    let total = 0;
    for (;;) {
      const snap = await collection.where("owner_uid", "==", uid).limit(400).get();
      const mine = snap.docs.filter((d) => (d.data() as { owner_uid?: string }).owner_uid === uid);
      if (mine.length === 0) return total;
      const batch = this.db.batch();
      for (const d of mine) batch.delete(d.ref);
      await batch.commit();
      total += mine.length;
    }
  }
}
