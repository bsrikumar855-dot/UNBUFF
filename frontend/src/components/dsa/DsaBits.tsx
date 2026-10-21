import React from "react";
import {
  AlertCircle,
  Bookmark,
  CheckCircle2,
  CircleDashed,
  Info,
  RotateCcw,
  Timer,
  type LucideIcon,
} from "lucide-react";
import type { DsaDifficulty, DsaSource, DsaStatus } from "@/types/contract";
import { DIFFICULTY_LABEL, STATUS_LABEL } from "@/lib/dsa";
import { cn } from "@/lib/cn";
import { buttonClasses } from "@/lib/buttonClasses";
import { TILE } from "@/components/ui/GlassCard";

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
          TILE,
          "flex items-start gap-3 p-4 text-sm text-ink-secondary",
          className
        )}
      >
        <Info
          size={18}
          strokeWidth={1.75}
          aria-hidden="true"
          className="mt-0.5 shrink-0 text-ink-muted"
        />
        <span>
          No question catalogue is loaded on this server yet, so there are no companies or
          questions to show.
        </span>
      </p>
    );
  }
  const imported = new Date(source.imported_at).toLocaleDateString();
  const updated = source.source_updated_at
    ? ` · source updated ${source.source_updated_at}`
    : "";
  const warn = source.is_sample_data || source.license_status === "unlicensed_local_use";
  return (
    <div
      role="note"
      className={cn(
        TILE,
        "flex items-start gap-3 p-4 text-sm",
        warn ? "text-ink-primary" : "text-ink-secondary",
        className
      )}
    >
      {warn ? (
        <AlertCircle
          size={20}
          strokeWidth={1.75}
          aria-hidden="true"
          className="mt-0.5 shrink-0 text-redline"
        />
      ) : (
        <Info
          size={20}
          strokeWidth={1.75}
          aria-hidden="true"
          className="mt-0.5 shrink-0 text-ink-muted"
        />
      )}
      <div className="min-w-0">
        {source.is_sample_data && (
          <p className="mb-1 font-semibold">
            Sample data for development: not real company interview data. Companies and
            links below are invented.
          </p>
        )}
        {source.license_status === "unlicensed_local_use" && (
          <p className="mb-1 font-semibold">
            The source of this data declares no licence. It is loaded for local evaluation
            only and must not be deployed or redistributed.
          </p>
        )}
        <p>
          Source: {source.name} · {source.license_status.replace(/_/g, " ")} · imported{" "}
          {imported}
          {updated}
        </p>
        <p className="mt-1 text-xs text-ink-muted">{source.license_note}</p>
      </div>
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
