import React, { useEffect, useId, useState } from "react";
import { api } from "@/api/endpoints";
import { Button } from "@/components/ui/button";
import { CheckMark } from "@/components/motion/Marks";
import { ErrorState } from "@/components/ui/ErrorState";
import { NEXT_STATUSES, STATUSES, statusLabel } from "@/lib/career";
import type {
  CareerApplicationStatus,
  CareerTracker,
  CareerTrackedItem,
} from "@/types/contract";

const field =
  "min-h-10 w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm font-normal text-ink-primary";

/**
 * The student's private record for one listing: where the application stands, when they applied, when to follow up
 * and their own notes. It never applies for anything: the employer's own page is where the student applies.
 */
export const TrackerControls: React.FC<{
  slug: string;
  tracker: CareerTracker | null;
  onChange: (item: CareerTrackedItem | null) => void;
}> = ({ slug, tracker, onChange }) => {
  const id = useId();
  const current = tracker?.status ?? null;
  const [status, setStatus] = useState<CareerApplicationStatus | "">(current ?? "");
  const [appliedOn, setAppliedOn] = useState(tracker?.applied_on ?? "");
  const [followUp, setFollowUp] = useState(tracker?.follow_up_on ?? "");
  const [notes, setNotes] = useState(tracker?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    setStatus(tracker?.status ?? "");
    setAppliedOn(tracker?.applied_on ?? "");
    setFollowUp(tracker?.follow_up_on ?? "");
    setNotes(tracker?.notes ?? "");
  }, [tracker]);

  const options = [current, ...NEXT_STATUSES[current ?? "none"]].filter(
    (v, i, a): v is CareerApplicationStatus => v !== null && a.indexOf(v) === i
  );
  const choices = STATUSES.filter((s) => options.includes(s.value));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { item } = await api.updateCareerTracked(slug, {
        ...(status && status !== current ? { status } : {}),
        applied_on: appliedOn || null,
        follow_up_on: followUp || null,
        notes,
      });
      onChange(item);
      setSavedAt(new Date().toLocaleTimeString());
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={save}
      aria-label="Application tracker"
      className="grid gap-3 sm:grid-cols-3"
    >
      <label
        className="flex flex-col gap-1.5 text-sm font-medium text-ink-primary"
        htmlFor={`${id}-status`}
      >
        Status
        <select
          id={`${id}-status`}
          className={field}
          value={status}
          onChange={(e) => setStatus(e.target.value as CareerApplicationStatus | "")}
        >
          {current === null && <option value="">No status yet</option>}
          {choices.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <label
        className="flex flex-col gap-1.5 text-sm font-medium text-ink-primary"
        htmlFor={`${id}-applied`}
      >
        Applied on
        <input
          id={`${id}-applied`}
          type="date"
          className={field}
          value={appliedOn}
          onChange={(e) => setAppliedOn(e.target.value)}
        />
      </label>
      <label
        className="flex flex-col gap-1.5 text-sm font-medium text-ink-primary"
        htmlFor={`${id}-follow`}
      >
        Follow up on
        <input
          id={`${id}-follow`}
          type="date"
          className={field}
          value={followUp}
          onChange={(e) => setFollowUp(e.target.value)}
        />
      </label>
      <label
        className="flex flex-col gap-1.5 text-sm font-medium text-ink-primary sm:col-span-3"
        htmlFor={`${id}-notes`}
      >
        Private notes
        <textarea
          id={`${id}-notes`}
          rows={3}
          maxLength={2000}
          className={field}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Contacts, referrals, what to prepare. Only you can see these."
        />
      </label>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-3">
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? "Saving…" : "Save tracker"}
        </Button>
        {savedAt && !error && (
          <span
            role="status"
            className="inline-flex items-center gap-1.5 text-sm text-ink-secondary"
          >
            <CheckMark size={14} className="text-verified" />
            Saved at {savedAt}. Current status:{" "}
            {statusLabel(status === "" ? current : status)}.
          </span>
        )}
      </div>
      {error !== null && <ErrorState className="sm:col-span-3" error={error} />}
    </form>
  );
};
