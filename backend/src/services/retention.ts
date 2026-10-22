import type { Logger } from "../logger.js";
import { audit } from "../security/audit.js";
import type { SessionStore } from "../store/SessionStore.js";

const BATCH = 200;
const MAX_BATCHES = 50;

/**
 * Deletes readiness audits (with their resume text and answers) that nobody has touched for `days` days. Runs in bounded
 * batches so one sweep cannot hog the store; whatever is left is picked up by the next sweep. Safe to run on several
 * instances at once (deleting an already-deleted session is a no-op).
 */
export async function sweepInactiveSessions(store: SessionStore, days: number, logger: Logger, now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - days * 86_400_000);
  let total = 0;
  for (let i = 0; i < MAX_BATCHES; i++) {
    const n = await store.deleteInactiveBefore(cutoff, BATCH);
    total += n;
    if (n < BATCH) break;
  }
  if (total > 0) audit(logger, "retention.sessions_deleted", null, { count: total, older_than_days: days });
  return total;
}
