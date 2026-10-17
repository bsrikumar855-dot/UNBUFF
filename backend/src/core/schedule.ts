import type { Claim, Mode } from "../types.js";

/**
 * Delayed, interleaved retests (pure). A fix task schedules the retest; it becomes due only after
 * RETEST_DELAY other claims finish, so the student practises retrieval after a gap instead of
 * answering straight after reading the explanation.
 */
export const RETEST_DELAY = 2;

/** Internal (not in the API): when the fix task was taught, and the order it was scheduled in. */
export interface ScheduleEntry {
  teach_completed_at_claims_done: number; // session completion counter at fix-task time
  order: number; // scheduling order, for "oldest scheduled"
}
export type ScheduleState = Record<string, ScheduleEntry>;

type SchedulePatch = Pick<Claim, "retest_status" | "retest_unlocks_after">;

/** Fix task fetched: schedule the retest (no-op if already scheduled or due). */
export function scheduleRetest(
  claim: Claim,
  state: ScheduleState,
  completions: number,
): { patch: SchedulePatch; entry: ScheduleEntry } | null {
  if (claim.retest_status === "scheduled" || claim.retest_status === "due") return null;
  const order = Object.values(state).reduce((max, e) => Math.max(max, e.order), 0) + 1;
  return {
    patch: { retest_status: "scheduled", retest_unlocks_after: RETEST_DELAY },
    entry: { teach_completed_at_claims_done: completions, order },
  };
}

/** Another claim reached `done`: count down every scheduled retest; at 0 it becomes due. */
export function onClaimCompleted(claims: readonly Claim[], completedId: string): Map<string, SchedulePatch> {
  const patches = new Map<string, SchedulePatch>();
  for (const c of claims) {
    if (c.id === completedId || c.retest_status !== "scheduled" || c.retest_unlocks_after === null) continue;
    const left = Math.max(0, c.retest_unlocks_after - 1);
    patches.set(c.id, { retest_status: left === 0 ? "due" : "scheduled", retest_unlocks_after: left });
  }
  return patches;
}

/**
 * Rule 3: when nothing is pending or due but retests are still scheduled, the oldest one is
 * forced due (otherwise the student would be stuck). The real gap is still recorded.
 */
export function forcedDueClaimId(claims: readonly Claim[], state: ScheduleState): string | null {
  if (claims.some((c) => c.verdict === "pending" || c.retest_status === "due")) return null;
  const scheduled = claims.filter((c) => c.retest_status === "scheduled");
  if (scheduled.length === 0) return null;
  const oldest = scheduled.reduce((a, b) => ((state[a.id]?.order ?? Infinity) <= (state[b.id]?.order ?? Infinity) ? a : b));
  return oldest.id;
}

/** What the student should do next: due retest → pending claim → nothing. */
export function nextStep(claims: readonly Claim[]): { next_claim_id: string | null; next_mode: Mode | null } {
  const due = claims.find((c) => c.retest_status === "due");
  if (due) return { next_claim_id: due.id, next_mode: "retest" };
  const pending = claims.find((c) => c.verdict === "pending");
  if (pending) return { next_claim_id: pending.id, next_mode: "assess" };
  return { next_claim_id: null, next_mode: null };
}

/** Retest may start only when due. Returns the 400 message otherwise. */
export function retestBlockReason(claim: Claim): string | null {
  if (claim.retest_status === "due") return null;
  if (claim.retest_status === "scheduled") {
    const n = claim.retest_unlocks_after ?? RETEST_DELAY;
    return `Retest unlocks after ${n} more concept${n === 1 ? "" : "s"}`;
  }
  return "Retest unlocks after you open the fix task and complete 2 more concepts";
}

/** Real number of other claims completed between the fix task and the retest start. */
export function interleavedClaims(entry: ScheduleEntry | undefined, completionsAtRetestStart: number): number {
  return entry ? Math.max(0, completionsAtRetestStart - entry.teach_completed_at_claims_done) : 0;
}

/** root_cause must be exactly one of the skill's prerequisites; anything else becomes null. */
export function validateRootCause(rootCause: string | null | undefined, prerequisites: readonly string[]): string | null {
  return rootCause && prerequisites.includes(rootCause) ? rootCause : null;
}
