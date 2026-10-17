import { describe, expect, it } from "vitest";
import type { Claim } from "../../src/types.js";
import { buildPriorities } from "../../src/core/plan.js";
import { finalizeGrade } from "../../src/core/rules.js";
import {
  forcedDueClaimId,
  interleavedClaims,
  nextStep,
  onClaimCompleted,
  RETEST_DELAY,
  retestBlockReason,
  scheduleRetest,
  validateRootCause,
  type ScheduleState,
} from "../../src/core/schedule.js";
import { claim, rawGrade, role } from "../helpers.js";

/** Applies a pure patch map to a claim list (what the service does). */
function apply(claims: Claim[], patches: Map<string, Partial<Claim>>): Claim[] {
  return claims.map((c) => ({ ...c, ...(patches.get(c.id) ?? {}) }));
}

function schedule(c: Claim, state: ScheduleState, completions: number): Claim {
  const s = scheduleRetest(c, state, completions);
  if (!s) throw new Error("expected scheduling");
  state[c.id] = s.entry;
  return { ...c, ...s.patch };
}

describe("schedule.ts: delayed interleaved retests", () => {
  it("fix task schedules the retest to unlock after 2 concepts; re-fetching doesn't reset it", () => {
    const state: ScheduleState = {};
    const c = schedule(claim("CL-001", "react_state", "shaky", 0.25), state, 3);
    expect(c).toMatchObject({ retest_status: "scheduled", retest_unlocks_after: RETEST_DELAY });
    expect(state["CL-001"]).toEqual({ teach_completed_at_claims_done: 3, order: 1 });
    expect(scheduleRetest(c, state, 5)).toBeNull();
  });

  it("scheduled → due after exactly 2 OTHER completions", () => {
    const state: ScheduleState = {};
    let claims = [schedule(claim("CL-001", "react_state", "shaky", 0.25), state, 0), claim("CL-002", "git", "pending", 0), claim("CL-003", "testing", "pending", 0)];

    claims = apply(claims, onClaimCompleted(claims, "CL-001")); // its own completion doesn't count
    expect(claims[0]).toMatchObject({ retest_status: "scheduled", retest_unlocks_after: 2 });

    claims = apply(claims, onClaimCompleted(claims, "CL-002"));
    expect(claims[0]).toMatchObject({ retest_status: "scheduled", retest_unlocks_after: 1 });

    claims = apply(claims, onClaimCompleted(claims, "CL-003"));
    expect(claims[0]).toMatchObject({ retest_status: "due", retest_unlocks_after: 0 });
  });

  it("a not-due retest is rejected with the unlock count", () => {
    const scheduled = { ...claim("CL-001", "git", "bluff", 0), retest_status: "scheduled" as const, retest_unlocks_after: 2 };
    expect(retestBlockReason(scheduled)).toBe("Retest unlocks after 2 more concepts");
    expect(retestBlockReason({ ...scheduled, retest_unlocks_after: 1 })).toBe("Retest unlocks after 1 more concept");
    expect(retestBlockReason(claim("CL-002", "git", "bluff", 0))).toMatch(/open the fix task/);
    expect(retestBlockReason({ ...scheduled, retest_status: "due", retest_unlocks_after: 0 })).toBeNull();
  });

  it("forces the OLDEST scheduled retest due when no pending claims remain, and records the gap honestly", () => {
    const state: ScheduleState = {};
    const a = schedule(claim("CL-001", "git", "bluff", 0), state, 4); // scheduled first
    const b = schedule(claim("CL-002", "testing", "shaky", 0.25), state, 4);
    const claims = [b, a, claim("CL-003", "react_state", "defended", 0.85)];
    expect(forcedDueClaimId(claims, state)).toBe("CL-001");
    // Nothing else was completed since the fix task: the forced retest records 0, not 2.
    expect(interleavedClaims(state["CL-001"], 4)).toBe(0);
  });

  it("does not force anything while a claim is pending or a retest is already due", () => {
    const state: ScheduleState = {};
    const a = schedule(claim("CL-001", "git", "bluff", 0), state, 0);
    expect(forcedDueClaimId([a, claim("CL-002", "git", "pending", 0)], state)).toBeNull();
    const due = { ...claim("CL-003", "git", "shaky", 0.25), retest_status: "due" as const, retest_unlocks_after: 0 };
    expect(forcedDueClaimId([a, due], state)).toBeNull();
    expect(forcedDueClaimId([claim("CL-004", "git", "defended", 0.85)], state)).toBeNull();
  });

  it("a due retest is prioritised over pending claims; then pending; then nothing", () => {
    const pending = claim("CL-001", "git", "pending", 0);
    const due = { ...claim("CL-002", "react_state", "shaky", 0.25), retest_status: "due" as const, retest_unlocks_after: 0 };
    expect(nextStep([pending, due])).toEqual({ next_claim_id: "CL-002", next_mode: "retest" });
    expect(nextStep([pending])).toEqual({ next_claim_id: "CL-001", next_mode: "assess" });
    expect(nextStep([claim("CL-003", "git", "defended", 0.85)])).toEqual({ next_claim_id: null, next_mode: null });
  });

  it("interleaved_claims = real completions between the fix task and the retest start", () => {
    expect(interleavedClaims({ teach_completed_at_claims_done: 3, order: 1 }, 6)).toBe(3);
    expect(interleavedClaims({ teach_completed_at_claims_done: 3, order: 1 }, 3)).toBe(0);
    expect(interleavedClaims(undefined, 9)).toBe(0);
  });

  it("root_cause not in the prerequisites list → null (and never set on a passed level)", () => {
    const prereqs = role.skills.find((s) => s.id === "react_state")!.prerequisites;
    expect(validateRootCause("Reconciliation", prereqs)).toBe("Reconciliation");
    expect(validateRootCause("reconciliation", prereqs)).toBeNull(); // must be exact
    expect(validateRootCause("Fiber internals", prereqs)).toBeNull();
    expect(validateRootCause(null, prereqs)).toBeNull();
    expect(validateRootCause(undefined, prereqs)).toBeNull();

    const failed = finalizeGrade({ ...rawGrade([], null), root_cause: "Made-up concept" }, "answer", 2, prereqs);
    expect(failed.root_cause).toBeNull();
    const valid = finalizeGrade({ ...rawGrade([], null), root_cause: "Immutability" }, "answer", 2, prereqs);
    expect(valid.root_cause).toBe("Immutability");
    const passed = finalizeGrade({ ...rawGrade(["accuracy", "mechanism"], "answer"), root_cause: "Immutability" }, "answer", 2, prereqs);
    expect(passed.root_cause).toBeNull();
  });

  it("priority reasons mention the root cause when present", () => {
    const withRoot = { ...claim("CL-001", "react_state", "shaky", 0.25, { levels_passed: 1 }), root_cause: "Reconciliation" };
    const reason = buildPriorities(role, [withRoot]).find((p) => p.skill_id === "react_state")?.reason;
    expect(reason).toBe("20% role weight, failed at L2 (root cause: Reconciliation)");
  });
});
