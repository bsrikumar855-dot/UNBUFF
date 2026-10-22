import { Firestore, Timestamp } from "@google-cloud/firestore";

/**
 * Per-student, per-UTC-day counters of language-model calls. `charge` is atomic: it only counts a call (and only lets it
 * through) while the count is below the limit, so concurrent requests or several server instances cannot overshoot it.
 * Counters are abuse controls, not student content: they are not removed by "delete my data" (that would reset the
 * budget) and expire on their own after two days.
 */
export interface UsageStore {
  charge(uid: string, day: string, limit: number): Promise<{ allowed: boolean; used: number }>;
  get(uid: string, day: string): Promise<number>;
}

const SAFE_UID = /^[A-Za-z0-9_-]{1,128}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const check = (uid: string, day: string) => {
  if (!SAFE_UID.test(uid) || !DAY.test(day)) throw new Error("invalid id");
};

export class MemoryUsageStore implements UsageStore {
  private readonly counts = new Map<string, number>();
  async charge(uid: string, day: string, limit: number) {
    check(uid, day);
    // Keep only today's counters: old days are never read again.
    for (const k of this.counts.keys()) if (!k.endsWith(`:${day}`)) this.counts.delete(k);
    const key = `${uid}:${day}`;
    const used = this.counts.get(key) ?? 0;
    if (used >= limit) return { allowed: false, used };
    this.counts.set(key, used + 1);
    return { allowed: true, used: used + 1 };
  }
  async get(uid: string, day: string) {
    check(uid, day);
    return this.counts.get(`${uid}:${day}`) ?? 0;
  }
}

interface UsageDoc {
  owner_uid: string;
  day: string;
  count: number;
  /** For a Firestore TTL policy on this field (optional; old documents are harmless if it isn't enabled). */
  expires_at: Timestamp;
}

export class FirestoreUsageStore implements UsageStore {
  private readonly col;
  constructor(
    private readonly db: Firestore = new Firestore({ ignoreUndefinedProperties: true }),
    name = "unbluff_llm_usage",
  ) {
    this.col = db.collection(name);
  }

  async charge(uid: string, day: string, limit: number) {
    check(uid, day);
    const ref = this.col.doc(`${uid}_${day}`);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.exists ? (snap.data() as UsageDoc) : null;
      const used = data && data.owner_uid === uid ? data.count : 0;
      if (used >= limit) return { allowed: false, used };
      const expires = new Date(`${day}T00:00:00.000Z`);
      expires.setUTCDate(expires.getUTCDate() + 2);
      const next: UsageDoc = { owner_uid: uid, day, count: used + 1, expires_at: Timestamp.fromDate(expires) };
      tx.set(ref, next);
      return { allowed: true, used: used + 1 };
    });
  }

  async get(uid: string, day: string) {
    check(uid, day);
    const snap = await this.col.doc(`${uid}_${day}`).get();
    const data = snap.exists ? (snap.data() as UsageDoc) : null;
    return data && data.owner_uid === uid ? data.count : 0;
  }
}
