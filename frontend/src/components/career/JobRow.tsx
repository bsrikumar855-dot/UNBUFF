import { Enter } from "@/components/motion/Enter";
import { Swap } from "@/components/motion/Marks";
import { DUR, RISE } from "@/components/motion/tokens";
import React, { useId, useState } from "react";
import { Bookmark, BookmarkCheck, ChevronDown, ExternalLink } from "lucide-react";
import { api } from "@/api/endpoints";
import { TILE } from "@/components/ui/GlassCard";
import { Tag } from "@/components/ui/Tag";
import { ErrorState } from "@/components/ui/ErrorState";
import { cn } from "@/lib/cn";
import {
  confidenceText,
  employmentLabel,
  formatSalary,
  freshnessText,
  matchSummary,
  postedText,
  safeHref,
  statusLabel,
  words,
} from "@/lib/career";
import type { CareerJobCard, CareerMatch, CareerTracker } from "@/types/contract";
import { TrackerControls } from "./TrackerControls";

const STATE_TEXT: Record<string, string> = {
  match: "Match",
  partial: "Partly",
  mismatch: "No match",
  unknown: "Not stated",
  not_set: "Not set",
};

/** The score as a plain number with its confidence in words: never a probability, never colour alone. */
export const MatchFigure: React.FC<{ match: CareerMatch }> = ({ match }) => (
  <div className="w-18 shrink-0 text-right sm:w-24 sm:text-center">
    <p
      className={cn(
        "serif num text-[1.75rem] font-medium leading-none",
        match.score === null ? "text-ink-muted" : "text-ink-primary"
      )}
    >
      {match.score === null ? "–" : match.score}
    </p>
    <p className="mt-1 text-[11px] leading-tight text-ink-muted">
      {match.score === null ? "Not scored" : `of 100, ${confidenceText(match)}`}
    </p>
    <span className="sr-only">{`Match ${matchSummary(match)}, ${confidenceText(match)}`}</span>
  </div>
);

export const MatchDetails: React.FC<{ match: CareerMatch }> = ({ match }) => (
  <div className="grid gap-5 lg:grid-cols-2">
    <div>
      <h4 className="eyebrow mb-2">Why this match</h4>
      <ul className="border-t border-line text-sm">
        {match.components.map((c) => (
          <li
            key={c.key}
            className="grid grid-cols-[7rem_5.5rem_1fr] gap-2 border-b border-line py-2"
          >
            <span className="font-medium text-ink-primary">{c.label}</span>
            <span className="font-mono text-[11px] uppercase tracking-wide text-ink-secondary">
              {STATE_TEXT[c.state]}
            </span>
            <span className="text-ink-secondary">{c.note || "—"}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-ink-muted">
        A comparison of facts you and the posting stated. It is not the chance of an
        interview or an offer, and a field a posting leaves out is never counted against
        it.
      </p>
    </div>
    <div className="flex flex-col gap-4">
      <div>
        <h4 className="eyebrow mb-2">Skills</h4>
        {match.matched_skills.length === 0 && match.missing_skills.length === 0 && (
          <p className="text-sm text-ink-secondary">Nothing to compare yet.</p>
        )}
        {match.matched_skills.length > 0 && (
          <p className="flex flex-wrap items-center gap-1.5 text-sm">
            <span className="mr-1 text-ink-secondary">You have:</span>
            {match.matched_skills.map((s) => (
              <Tag key={s.skill} tone={s.provenance === "verified" ? "verified" : "self"}>
                {s.skill}
                {s.provenance === "resume" && <span aria-hidden="true"> · resume</span>}
                <span className="sr-only">
                  {" "}
                  (
                  {s.provenance === "verified"
                    ? "verified"
                    : s.provenance === "resume"
                      ? "from your resume"
                      : "self-reported"}
                  )
                </span>
              </Tag>
            ))}
          </p>
        )}
        {match.missing_skills.length > 0 && (
          <p className="mt-2 flex flex-wrap items-center gap-1.5 text-sm">
            <span className="mr-1 text-ink-secondary">Listed, not in your profile:</span>
            {match.missing_skills.map((s) => (
              <Tag key={s} tone="none">
                {s}
              </Tag>
            ))}
          </p>
        )}
      </div>
      {match.hard_mismatches.length > 0 && (
        <div
          role="note"
          className="border-l-2 border-redline pl-3 text-sm text-ink-primary"
        >
          <p className="font-semibold">Breaks something you marked as required</p>
          <ul>
            {match.hard_mismatches.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      )}
      {match.unverified_constraints.length > 0 && (
        <div
          role="note"
          className="border-l-2 border-line-strong pl-3 text-sm text-ink-secondary"
        >
          <p className="font-semibold text-ink-primary">
            Can't confirm what you marked as required
          </p>
          <ul>
            {match.unverified_constraints.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  </div>
);

/** One posting as a dense, comparable row. It expands to show the match, the posting's own details and the student's tracker. */
export const JobRow: React.FC<{
  card: CareerJobCard;
  onTracker: (slug: string, tracker: CareerTracker | null) => void;
  defaultOpen?: boolean;
  /** Position in the list, for the staggered entrance. */
  index?: number;
}> = ({ card, onTracker, defaultOpen = false, index = 0 }) => {
  const { job, match, tracker } = card;
  const [open, setOpen] = useState(defaultOpen);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const panel = useId();
  const href = safeHref(job.apply_url);
  const salary = formatSalary(job.salary);
  const posted = postedText(job);
  const fresh = freshnessText(job);
  const saved = tracker?.saved === true;

  const toggleSave = async () => {
    setBusy(true);
    setError(null);
    try {
      const { item } = await api.updateCareerTracked(job.slug, { saved: !saved });
      onTracker(job.slug, item?.tracker ?? null);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Enter
      as="li"
      index={Math.min(index, 6)}
      y={RISE.sm}
      duration={DUR.fast}
      className={cn(TILE, "p-4 sm:p-5")}
      data-slug={job.slug}
    >
      <div className="flex flex-wrap items-start gap-x-4 gap-y-3 sm:flex-nowrap sm:gap-5">
        <span
          aria-hidden="true"
          className="hidden size-14 shrink-0 place-items-center rounded-2xl bg-white font-serif text-xl font-semibold uppercase text-ink-primary shadow-[inset_0_0_0_1px_rgba(24,24,27,0.08),0_6px_14px_-8px_rgba(24,24,27,0.3)] sm:grid"
        >
          {(job.company ?? job.title).trim().slice(0, 1) || "·"}
        </span>
        <div className="min-w-0 flex-1 basis-[calc(100%-5.5rem)] sm:basis-0">
          <h3 className="text-[15px] font-semibold leading-snug text-ink-primary">
            <button
              type="button"
              aria-expanded={open}
              aria-controls={panel}
              onClick={() => setOpen((v) => !v)}
              className="group flex w-full items-start gap-1.5 text-left underline-offset-4 hover:underline"
            >
              <span className="min-w-0 wrap-break-word">{job.title}</span>
              <ChevronDown
                size={16}
                aria-hidden="true"
                className={cn(
                  "mt-0.5 shrink-0 text-ink-muted transition-transform duration-200",
                  open && "rotate-180"
                )}
              />
            </button>
          </h3>
          <p className="mt-0.5 text-sm text-ink-secondary">
            {job.company ?? "Employer not named in the listing"}
            {job.location ? ` · ${job.location}` : ""}
          </p>
          <p className="mt-2 flex flex-wrap items-center gap-1.5">
            {job.employment_type && <Tag>{employmentLabel(job.employment_type)}</Tag>}
            {job.seniority && <Tag>{job.seniority.replace("_", "-")}</Tag>}
            {job.work_mode && <Tag>{job.work_mode}</Tag>}
            {job.category && <Tag>{words(job.category)}</Tag>}
            {salary && <Tag>{salary}</Tag>}
            {tracker?.status && tracker.status !== "saved" && (
              <Tag tone="alert">{statusLabel(tracker.status)}</Tag>
            )}
          </p>
          <p className="mt-1.5 text-xs text-ink-muted">
            {[
              posted,
              job.reality?.class === "stale"
                ? "Marked stale by Freehire"
                : job.reality?.class === "likely-evergreen"
                  ? "May be an always-open ad"
                  : null,
              job.ghost_level ? "Flagged as possibly inactive" : null,
            ]
              .filter(Boolean)
              .join(" · ") || "No posting date given"}
          </p>
        </div>
        <MatchFigure match={match} />
        <div className="flex w-full shrink-0 flex-wrap items-stretch gap-2 sm:w-auto sm:flex-nowrap sm:items-center *:flex-1 sm:*:flex-none">
          <button
            type="button"
            onClick={() => void toggleSave()}
            disabled={busy}
            aria-pressed={saved}
            className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full border border-line-strong bg-white/80 px-4 py-2 text-sm font-medium text-ink-primary hover:border-ink-primary disabled:opacity-50"
          >
            <Swap state={saved ? "saved" : "unsaved"}>
              {saved ? (
                <BookmarkCheck size={16} aria-hidden="true" />
              ) : (
                <Bookmark size={16} aria-hidden="true" />
              )}
            </Swap>
            {saved ? "Saved" : "Save"}
            <span className="sr-only">{` ${job.title}`}</span>
          </button>
          {href ? (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Apply on employer site
              <ExternalLink size={14} aria-hidden="true" />
              <span className="sr-only"> (opens in a new tab): {job.title}</span>
            </a>
          ) : (
            <a
              href={job.freehire_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full border border-line-strong bg-white/80 px-4 py-2 text-sm font-medium text-ink-primary hover:border-ink-primary"
            >
              View on Freehire
              <ExternalLink size={14} aria-hidden="true" />
              <span className="sr-only"> (opens in a new tab): {job.title}</span>
            </a>
          )}
        </div>
      </div>
      {error !== null && <ErrorState className="mt-3" error={error} />}
      {open && (
        <Enter
          id={panel}
          role="region"
          aria-label={`Details for ${job.title}`}
          y={RISE.sm}
          duration={DUR.fast}
          className="mt-4 flex flex-col gap-6 rounded-2xl border-l-2 border-line-strong bg-white/60 p-4 sm:p-5"
        >
          {(job.summary || job.preview) && (
            <div>
              <h4 className="eyebrow mb-1">About the role</h4>
              <p className="max-w-3xl text-sm leading-relaxed text-ink-secondary">
                {job.summary ?? job.preview}
              </p>
            </div>
          )}
          <MatchDetails match={match} />
          {job.requirements.length > 0 && (
            <div>
              <h4 className="eyebrow mb-2">Requirements the posting states</h4>
              <ul className="max-w-3xl list-none text-sm text-ink-secondary">
                {job.requirements.map((r, i) => (
                  <li key={`${i}-${r.text}`} className="border-b border-line py-1.5">
                    <span className="mr-2 font-mono text-[11px] uppercase text-ink-muted">
                      {r.priority}
                    </span>
                    {r.text}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-xs leading-relaxed text-ink-muted">
            {fresh ? `${fresh} ` : ""}A listing appearing here is not a guarantee that it
            is still open: check the employer's page before you spend time on an
            application. Listing data from{" "}
            <a
              href={job.freehire_url}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4"
            >
              Freehire
            </a>
            .
          </p>
          <div>
            <h4 className="eyebrow mb-2">Your tracker</h4>
            <TrackerControls
              slug={job.slug}
              tracker={tracker}
              onChange={(item) => onTracker(job.slug, item?.tracker ?? null)}
            />
          </div>
        </Enter>
      )}
    </Enter>
  );
};
