import React from "react";
import {
  Bookmark,
  CheckCircle2,
  CircleDashed,
  RotateCcw,
  Timer,
  type LucideIcon,
} from "lucide-react";
import type { DsaDifficulty, DsaSource, DsaStatus } from "@/types/contract";
import { DIFFICULTY_LABEL, STATUS_LABEL } from "@/lib/dsa";
import { cn } from "@/lib/cn";
import { buttonClasses } from "@/lib/buttonClasses";

/** Provenance and licence status of the loaded catalogue, or an honest empty message. Sample data is loudly labelled. */
export const SourceBanner: React.FC<{ source: DsaSource | null; className?: string }> = ({
  source,
  className,
}) => {
  if (!source) {
    return (
      <p
        role="note"
        className={cn(
          "border-l-2 border-line-strong bg-surface-100/60 py-2 pl-4 pr-3 text-sm text-ink-secondary",
          className
        )}
      >
        No question catalogue is loaded on this server yet, so there are no companies or
        questions to show.
      </p>
    );
  }
  const imported = new Date(source.imported_at).toLocaleDateString();
  const updated = source.source_updated_at
    ? ` · source updated ${source.source_updated_at}`
    : "";
  return (
    <div
      role="note"
      className={cn(
        "border-l-2 py-2 pl-4 pr-3 text-sm",
        source.is_sample_data || source.license_status === "unlicensed_local_use"
          ? "border-verdict-shaky-fg bg-surface text-ink-primary"
          : "border-line-strong bg-surface-100/60 text-ink-secondary",
        className
      )}
    >
      {source.is_sample_data && (
        <p className="mb-1 font-semibold">
          Sample data for development: not real company interview data. Companies and
          links below are invented.
        </p>
      )}
      {source.license_status === "unlicensed_local_use" && (
        <p className="mb-1 font-semibold">
          The source of this data declares no licence. It is loaded for local evaluation only and
          must not be deployed or redistributed.
        </p>
      )}
      <p>
        Source: {source.name} · {source.license_status.replace(/_/g, " ")} · imported{" "}
        {imported}
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

export const DifficultyBadge: React.FC<{ difficulty: DsaDifficulty }> = ({
  difficulty,
}) => (
  <span className="inline-flex items-center gap-1.5 font-mono text-xs font-medium uppercase tracking-wide text-ink-primary">
    <span className={cn("size-2 shrink-0", DIFF_DOT[difficulty])} aria-hidden="true" />
    {DIFFICULTY_LABEL[difficulty]}
  </span>
);

const STATUS_ICON: Record<DsaStatus, LucideIcon> = {
  not_started: CircleDashed,
  attempted: Timer,
  solved: CheckCircle2,
  needs_revision: RotateCcw,
};

export const ProgressBadge: React.FC<{ status: DsaStatus; bookmarked?: boolean }> = ({
  status,
  bookmarked,
}) => {
  const Icon = STATUS_ICON[status];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-secondary">
      <Icon size={14} aria-hidden="true" />
      {STATUS_LABEL[status]}
      {bookmarked && (
        <>
          <Bookmark size={14} className="fill-current text-redline" aria-hidden="true" />
          <span className="sr-only">Bookmarked</span>
        </>
      )}
    </span>
  );
};

export const TopicTags: React.FC<{ topics: string[] }> = ({ topics }) => (
  <ul
    className="flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-ink-muted"
    aria-label="Topics"
  >
    {topics.map((t, i) => (
      <li key={t} className="flex items-center gap-2">
        {i > 0 && <span aria-hidden="true">/</span>}
        {t}
      </li>
    ))}
  </ul>
);

export const Pager: React.FC<{
  page: number;
  totalPages: number;
  onPage: (p: number) => void;
}> = ({ page, totalPages, onPage }) => {
  if (totalPages <= 1) return null;
  const btn = buttonClasses("secondary", "sm");
  return (
    <nav aria-label="Pagination" className="mt-4 flex items-center justify-between gap-3">
      <button
        type="button"
        className={btn}
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
      >
        Previous
      </button>
      <span className="text-sm text-ink-secondary" aria-live="polite">
        Page {page} of {totalPages}
      </span>
      <button
        type="button"
        className={btn}
        disabled={page >= totalPages}
        onClick={() => onPage(page + 1)}
      >
        Next
      </button>
    </nav>
  );
};
