import type { Session, SessionStore } from "./SessionStore.js";

/** In-memory store. Deep-copies on read/write so callers can't mutate stored state by accident. */
export class MemoryStore implements SessionStore {
  private readonly sessions = new Map<string, Session>();

  constructor(private readonly maxSessions = 5000) {}

  async get(id: string): Promise<Session | null> {
    const s = this.sessions.get(id);
    return s ? structuredClone(s) : null;
  }

  async save(session: Session): Promise<void> {
    if (!this.sessions.has(session.id) && this.sessions.size >= this.maxSessions) {
      // Evict the oldest session (Map keeps insertion order) to bound memory.
      const oldest = this.sessions.keys().next().value;
      if (oldest !== undefined) this.sessions.delete(oldest);
    }
    this.sessions.set(session.id, structuredClone(session));
  }
}
