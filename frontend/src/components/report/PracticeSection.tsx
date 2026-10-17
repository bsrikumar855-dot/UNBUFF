import React, { useState } from "react";
import type { Claim, FixTask } from "@/types/contract";
import { api } from "@/api/endpoints";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { VerdictBadge } from "@/components/ui/StatusBadge";
import { FixTaskCard } from "@/components/common/FixTaskCard";
import { isWeak } from "@/lib/format";
import { RetestStatus } from "./RetestStatus";

interface PracticeSectionProps {
  claims: Claim[];
  sessionId: string | null;
  /** Called after a fix task is opened (it schedules the retest), so the report can refresh. */
  onChanged: () => void;
}

const PracticeRow: React.FC<{ claim: Claim; sessionId: string | null; onChanged: () => void }> = ({
  claim,
  sessionId,
  onChanged,
}) => {
  const [task, setTask] = useState<FixTask | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const openTask = async () => {
    if (!sessionId) return;
    setLoading(true);
    setError(null);
    try {
      setTask(await api.getFixTask({ session_id: sessionId, claim_id: claim.id }));
      onChanged();
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  const shown = task ?? (claim.retest_status !== "none" ? claim.fix_task : null);
  return (
    <li className="rounded-md border border-line p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <VerdictBadge verdict={claim.verdict} />
        <span className="text-sm font-medium text-ink-primary">{claim.text}</span>
      </div>
      {claim.root_cause && (
        <p className="mb-2 text-sm text-ink-secondary">
          <span className="font-semibold">Root cause:</span> {claim.root_cause}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <RetestStatus claim={claim} sessionId={sessionId} />
        {sessionId && isWeak(claim) && !shown && (
          <Button variant="secondary" size="sm" onClick={openTask} disabled={loading}>
            Open fix task
          </Button>
        )}
      </div>
      {loading && <LoadingState message="Writing your fix task…" className="mt-3" />}
      {error !== null && <ErrorState error={error} onRetry={openTask} className="mt-3" />}
      {shown && (
        <div className="mt-3">
          <FixTaskCard task={shown} />
        </div>
      )}
    </li>
  );
};

/** Weak and retested claims with their fix task and retest lifecycle. */
export const PracticeSection: React.FC<PracticeSectionProps> = ({ claims, sessionId, onChanged }) => {
  const rows = claims.filter((c) => isWeak(c) || c.retest !== null);
  if (rows.length === 0) return null;
  return (
    <section aria-labelledby="practice-heading" className="rounded-lg border border-line bg-white p-5">
      <h2 id="practice-heading" className="mb-4 text-lg font-semibold text-ink-primary">
        Practice &amp; retest
      </h2>
      <ul className="grid gap-3">
        {rows.map((c) => (
          <PracticeRow key={c.id} claim={c} sessionId={sessionId} onChanged={onChanged} />
        ))}
      </ul>
    </section>
  );
};
