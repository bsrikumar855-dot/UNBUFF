import { Firestore } from "@google-cloud/firestore";
import type { Session, SessionStore } from "./SessionStore.js";

/**
 * Firestore-backed store for Cloud Run (STORE=firestore). Uses Application Default
 * Credentials, so no key is needed on Cloud Run. Sessions are stored as one JSON document.
 */
export class FirestoreStore implements SessionStore {
  private readonly collection;

  constructor(collectionName = "unbluff_sessions", db = new Firestore({ ignoreUndefinedProperties: true })) {
    this.collection = db.collection(collectionName);
  }

  async get(id: string): Promise<Session | null> {
    const snap = await this.collection.doc(id).get();
    if (!snap.exists) return null;
    const data = snap.data() as { json?: string } | undefined;
    return data?.json ? (JSON.parse(data.json) as Session) : null;
  }

  async save(session: Session): Promise<void> {
    // Stored as a JSON string: sessions contain nested arrays Firestore can't index anyway,
    // and this sidesteps Firestore's nested-array restrictions.
    await this.collection.doc(session.id).set({ json: JSON.stringify(session), updated_at: new Date() });
  }
}
