import React from "react";
import { Bookmark, CheckCircle2, CircleDashed, RotateCcw, Timer, type LucideIcon } from "lucide-react";
import type { DsaDifficulty, DsaSource, DsaStatus } from "@/types/contract";
import { DIFFICULTY_LABEL, STATUS_LABEL } from "@/lib/dsa";
import { cn } from "@/lib/cn";

/** Provenance and licence status of the loaded catalogue, or an honest empty message. Sample data is loudly labelled. */
export const SourceBanner: React.FC<{ source: DsaSource | null; className?: string }> = ({ source, className }) => {
  if (!source) {
    return (
      <p role="note" className={cn("rounded-md border border-line bg-white p-3 text-sm text-ink-secondary", className)}>
        No question catalogue is loaded on this server yet, so there are no companies or questions to show.
      </p>
    );
  }
  const imported = new Date(source.imported_at).toLocaleDateString();
  const updated = source.source_updated_at ? ` · source updated ${source.source_updated_at}` : "";
  return (
    <div
      role="note"
      className={cn(
        "rounded-md border p-3 text-sm",
        source.is_sample_data ? "border-verdict-shaky-fg bg-white text-ink-primary" : "border-line bg-white text-ink-secondary",
        className,
      )}
    >
      {source.is_sample_data && (
        <p className="mb-1 font-semibold">Sample data for development: not real company interview data. Companies and links below are invented.</p>
      )}
      <p>
        Source: {source.name} · {source.license_status.replace(/_/g, " ")} · imported {imported}
        {updated}
      </p>
      <p className="mt-1 text-xs text-ink-muted">{source.license_note}</p>
    </div>
  );
};

const DIFF_DOT: Record<DsaDifficulty, string> = {
  easy: "bg-verdict-defended-fg",
  medium: "bg-verdict-shaky-fg",
  hard: "bg-verdict-bluff-fg",
};

export const DifficultyBadge: React.FC<{ difficulty: DsaDifficulty }> = ({ difficulty }) => (
  <span className="inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-white px-2 py-0.5 text-xs font-medium text-ink-primary">
    <span className={cn("h-2 w-2 rounded-full", DIFF_DOT[difficulty])} aria-hidden="true" />
    {DIFFICULTY_LABEL[difficulty]}
  </span>
);

const STATUS_ICON: Record<DsaStatus, LucideIcon> = {
  not_started: CircleDashed,
  attempted: Timer,
  solved: CheckCircle2,
  needs_revision: RotateCcw,
};

export const ProgressBadge: React.FC<{ status: DsaStatus; bookmarked?: boolean }> = ({ status, bookmarked }) => {
  const Icon = STATUS_ICON[status];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-secondary">
      <Icon size={14} aria-hidden="true" />
      {STATUS_LABEL[status]}
      {bookmarked && (
        <>
          <Bookmark size={14} className="fill-current text-primary" aria-hidden="true" />
          <span className="sr-only">Bookmarked</span>
        </>
      )}
    </span>
  );
};

export const TopicTags: React.FC<{ topics: string[] }> = ({ topics }) => (
  <ul className="flex flex-wrap gap-1.5" aria-label="Topics">
    {topics.map((t) => (
      <li key={t} className="rounded bg-surface-100 px-2 py-0.5 text-xs text-ink-secondary">
        {t}
      </li>
    ))}
  </ul>
);

export const Pager: React.FC<{ page: number; totalPages: number; onPage: (p: number) => void }> = ({ page, totalPages, onPage }) => {
  if (totalPages <= 1) return null;
  const btn = "rounded-md border border-line-strong bg-white px-3 py-1.5 text-sm font-medium text-ink-primary hover:bg-surface-100 disabled:cursor-not-allowed disabled:text-ink-subtle";
  return (
    <nav aria-label="Pagination" className="mt-4 flex items-center justify-between gap-3">
      <button type="button" className={btn} disabled={page <= 1} onClick={() => onPage(page - 1)}>
        Previous
      </button>
      <span className="text-sm text-ink-secondary" aria-live="polite">
        Page {page} of {totalPages}
      </span>
      <button type="button" className={btn} disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
        Next
      </button>
    </nav>
  );
};
