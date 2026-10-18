import { Enter } from "@/components/motion/Enter";
import { DUR, RISE } from "@/components/motion/tokens";
import React, { useState } from "react";
import { ExternalLink } from "lucide-react";
import { api } from "@/api/endpoints";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/ErrorState";
import { Tag } from "@/components/ui/Tag";
import { safeHref, statusLabel } from "@/lib/career";
import type { CareerTrackedItem } from "@/types/contract";
import { TrackerControls } from "./TrackerControls";

const dateText = (d: string | null) =>
  d
    ? new Date(`${d}T00:00:00`).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;

const Row: React.FC<{
  item: CareerTrackedItem;
  mode: "saved" | "applications";
  onChanged: () => void;
  index: number;
}> = ({ item, mode, onChanged, index }) => {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [checked, setChecked] = useState<string | null>(null);
  const t = item.tracker;
  const href = safeHref(item.apply_url);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  const check = () =>
    run(async () => {
      try {
        const r = await api.getCareerJob(item.slug);
        setChecked(
          r.job.closed_at
            ? "Freehire now records this listing as closed."
            : "Freehire still lists this posting. That is not a promise that it is open: check the employer's page."
        );
      } catch (e) {
        const code = (e as { code?: string }).code;
        if (code === "CAREER_JOB_NOT_FOUND")
          setChecked(
            "Freehire no longer lists this posting. Your notes and history are kept."
          );
        else throw e;
      }
      onChanged();
    });

  return (
    <Enter
      as="li"
      index={index}
      y={RISE.sm}
      duration={DUR.fast}
      className="border-b border-line py-4"
      data-slug={item.slug}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-ink-primary">{item.title}</h3>
          <p className="text-sm text-ink-secondary">
            {item.company ?? "Employer not named in the listing"}
          </p>
          <p className="mt-2 flex flex-wrap items-center gap-1.5">
            <Tag tone={t.status && t.status !== "saved" ? "alert" : "neutral"}>
              {statusLabel(t.status)}
            </Tag>
            {t.saved && mode === "applications" && <Tag>Saved</Tag>}
            {t.posting_state === "possibly_unavailable" && (
              <Tag tone="unavailable">Listing may no longer be available</Tag>
            )}
          </p>
          <p className="mt-1.5 text-xs text-ink-muted">
            {[
              t.applied_on ? `Applied ${dateText(t.applied_on)}` : null,
              t.follow_up_on ? `Follow up ${dateText(t.follow_up_on)}` : null,
              t.notes ? "Has notes" : null,
            ]
              .filter(Boolean)
              .join(" · ") || "No dates or notes yet"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "Hide tracker" : "Edit tracker"}
            <span className="sr-only">{` for ${item.title}`}</span>
          </Button>
          {href ? (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-line-strong px-3 text-sm font-medium text-ink-primary hover:border-ink-primary"
            >
              Employer page <ExternalLink size={14} aria-hidden="true" />
              <span className="sr-only"> (opens in a new tab): {item.title}</span>
            </a>
          ) : null}
          <a
            href={item.freehire_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-line-strong px-3 text-sm font-medium text-ink-primary hover:border-ink-primary"
          >
            On Freehire <ExternalLink size={14} aria-hidden="true" />
            <span className="sr-only"> (opens in a new tab): {item.title}</span>
          </a>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => void check()}
          >
            Check listing<span className="sr-only">{` ${item.title}`}</span>
          </Button>
        </div>
      </div>
      {checked && (
        <p role="status" className="mt-2 text-sm text-ink-secondary">
          {checked}
        </p>
      )}
      {error !== null && <ErrorState className="mt-3" error={error} />}
      {open && (
        <div className="mt-4 border-l-2 border-line-strong bg-surface-100/50 p-4">
          <TrackerControls slug={item.slug} tracker={t} onChange={() => onChanged()} />
          <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3">
            {t.saved && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await api.removeCareerTracked(item.slug, "bookmark");
                    onChanged();
                  })
                }
              >
                Remove bookmark<span className="sr-only">{` ${item.title}`}</span>
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await api.removeCareerTracked(item.slug, "all");
                  onChanged();
                })
              }
            >
              Delete this record<span className="sr-only">{` ${item.title}`}</span>
            </Button>
            <p className="basis-full text-xs text-ink-muted">
              {t.saved
                ? "Removing the bookmark keeps your status, dates and notes if you have recorded any. "
                : ""}
              Deleting removes everything you stored for this listing.
            </p>
          </div>
        </div>
      )}
    </Enter>
  );
};

export const TrackedList: React.FC<{
  items: CareerTrackedItem[];
  mode: "saved" | "applications";
  onChanged: () => void;
}> = ({ items, mode, onChanged }) => (
  <ul
    className="border-t border-line"
    aria-label={mode === "saved" ? "Saved jobs" : "Applications"}
  >
    {items.map((i, ri) => (
      <Row
        key={i.slug}
        item={i}
        index={Math.min(ri, 6)}
        mode={mode}
        onChanged={onChanged}
      />
    ))}
  </ul>
);
