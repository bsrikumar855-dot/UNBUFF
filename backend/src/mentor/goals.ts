import type { RevisionStore, StatsStore } from "../analytics/stores.js";
import type { MemoryRecord } from "./store.js";

/**
 * Goal completion is decided by application records, never by the model. A tracked goal is done only when the
 * application itself shows it, AFTER the goal was set:
 *  - question_solved: a counted, accepted judged submission (the statistics rollup holds its event);
 *  - revision_completed: the revision item's history shows a completed review;
 *  - topic_practice: at least `target` counted judged submissions in that topic.
 * Untracked goals stay active until the student marks them done.
 */
export async function evaluateGoals(
  uid: string,
  goals: MemoryRecord[],
  deps: { stats: StatsStore; revisions: RevisionStore },
  now: Date,
): Promise<MemoryRecord[]> {
  const done: MemoryRecord[] = [];
  const active = goals.filter((g) => g.type === "goal" && g.status === "active" && g.track !== null);
  if (active.length === 0) return done;
  const allStats = active.some((g) => g.track!.kind === "topic_practice") ? await deps.stats.listByOwner(uid, 5000) : [];

  for (const g of active) {
    const t = g.track!;
    let complete: boolean;
    if (t.kind === "question_solved") {
      const s = await deps.stats.get(uid, t.question_id);
      complete = s?.events.some((e) => e.verdict === "accepted" && e.at >= g.created_at) ?? false;
    } else if (t.kind === "revision_completed") {
      const r = await deps.revisions.get(uid, t.question_id);
      complete = r?.history.some((h) => h.event === "completed" && h.at >= g.created_at) ?? false;
    } else {
      const count = allStats.filter((s) => s.topics.includes(t.topic)).reduce((n, s) => n + s.events.filter((e) => e.at >= g.created_at).length, 0);
      complete = count >= t.target;
    }
    if (complete) done.push({ ...g, status: "completed", completed_by: "verified_activity", updated_at: now.toISOString() });
  }
  return done;
}
