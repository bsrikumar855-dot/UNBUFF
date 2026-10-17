import React from "react";
import { Link } from "react-router-dom";
import { CalendarClock, CheckCircle2, RotateCcw } from "lucide-react";
import type { Claim } from "@/types/contract";
import { buttonClasses } from "@/lib/buttonClasses";
import { isWeak, percent, plural } from "@/lib/format";
import { routes } from "@/lib/routes";

interface RetestStatusProps {
  claim: Claim;
  /** null for the demo report (no live session to retest in). */
  sessionId: string | null;
}

const chip = "inline-flex items-center gap-1.5 rounded-sm px-2 py-1 text-xs font-medium";

/** Retest lifecycle chip: scheduled → due (button) → done (verified after N concepts). */
export const RetestStatus: React.FC<RetestStatusProps> = ({ claim, sessionId }) => {
  if (claim.retest_status === "done" && claim.retest) {
    return (
      <span className={`${chip} bg-verdict-defended-bg text-verdict-defended-fg`}>
        <CheckCircle2 size={14} aria-hidden="true" />
        Verified after {plural(claim.retest.interleaved_claims, "other concept")} ·{" "}
        {percent(claim.retest.before)} → {percent(claim.retest.after)}
      </span>
    );
  }
  if (claim.retest_status === "due") {
    if (!sessionId) {
      return (
        <span className={`${chip} bg-primary-soft text-primary-dark`}>
          <RotateCcw size={14} aria-hidden="true" />
          Retest ready
        </span>
      );
    }
    return (
      <Link
        to={routes.workspace(sessionId, claim.id, "retest")}
        className={buttonClasses("primary", "sm")}
      >
        <RotateCcw size={14} aria-hidden="true" />
        Retest ready
      </Link>
    );
  }
  if (claim.retest_status === "scheduled") {
    const n = claim.retest_unlocks_after ?? 0;
    return (
      <span className={`${chip} bg-surface-100 text-ink-secondary`}>
        <CalendarClock size={14} aria-hidden="true" />
        Retest in {plural(n, "concept")}
      </span>
    );
  }
  if (isWeak(claim)) {
    return <span className={`${chip} bg-surface-100 text-ink-secondary`}>Open the fix task to schedule a retest</span>;
  }
  return null;
};
