import React, { useState } from "react";
import { GrowBar } from "@/components/motion/GrowBar";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/ui/Tag";
import { FRESHNESS_LABEL, SOURCE_LABEL, formatDay, formatWhen } from "@/lib/leetcode";
import type { LeetCodeInsightsResponse, LeetCodeSnapshotSummary } from "@/types/contract";

const pct = (n: number) => `${Math.round(n * 100)}%`;
const DIFFICULTY_NAME = { easy: "Easy", medium: "Medium", hard: "Hard" } as const;

/** Where the numbers came from and how old they are, always shown above them: they are never presented as live. */
export const SourceBanner: React.FC<{
  source: NonNullable<LeetCodeInsightsResponse["source"]>;
}> = ({ source }) => (
  <div
    role="note"
    className="border-l-2 border-line-strong pl-3 text-sm text-ink-secondary"
  >
    <p>
      <span className="font-medium text-ink-primary">{source.label}.</span> Captured{" "}
      {formatWhen(source.captured_at)} as you stated, imported{" "}
      {formatWhen(source.imported_at)}. {source.age_days} day
      {source.age_days === 1 ? "" : "s"} old:{" "}
      <Tag
        tone={source.freshness === "stale" ? "alert" : "neutral"}
        className="align-middle"
      >
        {FRESHNESS_LABEL[source.freshness]}
      </Tag>
    </p>
    {source.description && (
      <p className="mt-1 text-xs text-ink-muted">Your note: {source.description}</p>
    )}
    <p className="mt-1 text-xs text-ink-muted">
      These are the numbers you supplied. They are not live, not checked against LeetCode,
      and not verified.
    </p>
  </div>
);

/** A row that says a part of the data is missing, instead of leaving a gap or a made-up zero. */
export const Unavailable: React.FC<{ what: string; how: string }> = ({ what, how }) => (
  <p className="text-sm text-ink-muted">
    <span className="font-medium text-ink-secondary">{what}: unavailable.</span> {how}
  </p>
);

export const DifficultyBars: React.FC<{
  rows: NonNullable<LeetCodeInsightsResponse["difficulty"]>;
}> = ({ rows }) => (
  <ul
    aria-label="Problems solved by difficulty, as you reported them"
    className="flex flex-col gap-5"
  >
    {rows.map((r, i) => (
      <li key={r.difficulty}>
        <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
          <span className="font-medium text-ink-primary">
            {DIFFICULTY_NAME[r.difficulty]}
          </span>
          <span className="num text-ink-secondary">
            {r.solved} solved ({pct(r.share_of_solved)} of your total)
            {r.available !== null ? ` · ${r.available} available at the time` : ""}
          </span>
        </div>
        <GrowBar
          value={r.share_of_solved}
          delay={i * 0.06}
          className="mt-2 h-2 bg-surface-100"
          barClassName="bg-ink-primary/80"
        />
      </li>
    ))}
  </ul>
);

export const TopicList: React.FC<{
  topics: NonNullable<LeetCodeInsightsResponse["topics"]>;
}> = ({ topics }) => {
  const top = Math.max(1, ...topics.map((t) => t.solved));
  return (
    <ul
      aria-label="Topic counts you supplied"
      className="grid gap-x-10 gap-y-3 sm:grid-cols-2"
    >
      {topics.map((t) => (
        <li key={t.topic}>
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="text-ink-primary">{t.topic}</span>
            <span className="num text-ink-secondary">{t.solved}</span>
          </div>
          <GrowBar
            value={t.solved / top}
            className="mt-1.5 h-1.5 bg-surface-100"
            barClassName="bg-ink-primary/60"
          />
        </li>
      ))}
    </ul>
  );
};

/** Solved per snapshot. Only real imported snapshots appear, each at the date it was captured; nothing is interpolated. */
export const HistoryBars: React.FC<{ rows: LeetCodeInsightsResponse["history"] }> = ({
  rows,
}) => {
  const max = Math.max(1, ...rows.map((r) => r.solved));
  return (
    <ol
      aria-label="Problems solved at each imported snapshot, oldest first"
      className="flex flex-col gap-3"
    >
      {rows.map((r, i) => (
        <li key={r.id}>
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <span className="text-ink-secondary">{formatDay(r.captured_at)}</span>
            <span className="num font-medium text-ink-primary">{r.solved} solved</span>
          </div>
          <GrowBar
            value={r.solved / max}
            delay={i * 0.05}
            className="mt-1.5 h-2 bg-surface-100"
            barClassName="bg-redline/70"
          />
        </li>
      ))}
    </ol>
  );
};

/** UNBLUFF's judged results beside the LeetCode numbers, never added to them. */
export const SeparationPanel: React.FC<{ data: LeetCodeInsightsResponse }> = ({
  data,
}) => (
  <div
    className="grid gap-px border border-line bg-line sm:grid-cols-2"
    aria-label="Imported numbers compared with UNBLUFF's judged results, kept separate"
  >
    <div className="bg-surface p-4">
      <p className="eyebrow">Reported by you from LeetCode</p>
      <p className="num mt-2 text-3xl font-medium leading-none text-ink-primary">
        {data.totals?.solved ?? "–"}
      </p>
      <p className="mt-2 text-xs text-ink-muted">
        Imported, unverified, as of {formatDay(data.source?.captured_at ?? null)}.
      </p>
    </div>
    <div className="bg-surface p-4">
      <p className="eyebrow">Judged in UNBLUFF</p>
      <p className="num mt-2 text-3xl font-medium leading-none text-ink-primary">
        {data.unbluff.judged_solved_unique ?? "–"}
      </p>
      <p className="mt-2 text-xs text-ink-muted">
        {data.unbluff.judged_solved_unique === null
          ? "Could not be read right now."
          : data.unbluff.judged_available
            ? "Distinct questions accepted by UNBLUFF's own code judge."
            : "Nothing counted yet: UNBLUFF counts only submissions its own judge verified."}
      </p>
    </div>
    <p className="col-span-full bg-surface px-4 py-3 text-xs text-ink-secondary">
      These are two different things and are never added together. Imported numbers do not
      mark any UNBLUFF question as solved, create submissions, or change your DSA
      analytics, revision queue or acceptance rates.
    </p>
  </div>
);

/** Imported snapshots with a way to remove a mistaken one. Removing never touches the others. */
export const SnapshotList: React.FC<{
  snapshots: LeetCodeSnapshotSummary[];
  onDelete: (id: string) => Promise<void>;
}> = ({ snapshots, onDelete }) => {
  const [asking, setAsking] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  return (
    <ul aria-label="Imported snapshots" className="border-t border-line text-sm">
      {snapshots.map((s) => (
        <li
          key={s.id}
          className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-2.5"
        >
          <span className="text-ink-primary">
            <span className="num font-medium">{s.solved}</span> solved · captured{" "}
            {formatDay(s.captured_at)}
            <span className="block text-xs text-ink-muted">
              imported {formatWhen(s.imported_at)} ·{" "}
              {SOURCE_LABEL[s.source.kind].toLowerCase()}
              {s.linked_username ? ` · linked as ${s.linked_username}` : ""} ·{" "}
              {s.fields.length > 0 ? s.fields.join(", ") : "totals only"}
            </span>
          </span>
          {asking === s.id ? (
            <span
              role="group"
              aria-label={`Confirm removing the snapshot from ${formatDay(s.captured_at)}`}
              className="flex items-center gap-2"
            >
              <Button
                size="sm"
                disabled={busy !== null}
                onClick={() => {
                  setBusy(s.id);
                  void onDelete(s.id).finally(() => {
                    setBusy(null);
                    setAsking(null);
                  });
                }}
              >
                {busy === s.id ? "Removing…" : "Yes, remove"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAsking(null)}>
                Keep
              </Button>
            </span>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setAsking(s.id)}
              aria-label={`Remove the snapshot captured ${formatDay(s.captured_at)}`}
            >
              Remove
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
};
