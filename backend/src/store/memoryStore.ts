import type { Session, SessionStore } from "./SessionStore.js";

/** In-memory store. Deep-copies on read/write so callers can't mutate stored state by accident. */
export class MemoryStore implements SessionStore {
  private readonly sessions = new Map<string, Session>();
  private readonly savedAt = new Map<string, number>();

  constructor(private readonly maxSessions = 5000) {}

  async get(id: string): Promise<Session | null> {
    const s = this.sessions.get(id);
    return s ? structuredClone(s) : null;
  }

  async save(session: Session): Promise<void> {
    if (!this.sessions.has(session.id) && this.sessions.size >= this.maxSessions) {
      // Evict the oldest session (Map keeps insertion order) to bound memory.
      const oldest = this.sessions.keys().next().value;
      if (oldest !== undefined) {
        this.sessions.delete(oldest);
        this.savedAt.delete(oldest);
      }
    }
    this.sessions.set(session.id, structuredClone(session));
    this.savedAt.set(session.id, Date.now());
  }

  async deleteInactiveBefore(cutoff: Date, limit: number): Promise<number> {
    let n = 0;
    for (const [id, at] of this.savedAt) {
      if (n >= limit) break;
      if (at < cutoff.getTime()) {
        this.sessions.delete(id);
        this.savedAt.delete(id);
        n++;
      }
    }
    return n;
  }

  /** Test seam: pretend a session was last saved at `when`. */
  setSavedAt(id: string, when: Date): void {
    if (this.sessions.has(id)) this.savedAt.set(id, when.getTime());
  }

  async listByOwner(uid: string): Promise<Session[]> {
    return [...this.sessions.values()].filter((s) => s.owner_uid === uid).map((s) => structuredClone(s));
  }

  async delete(id: string): Promise<void> {
    this.sessions.delete(id);
    this.savedAt.delete(id);
  }
}
