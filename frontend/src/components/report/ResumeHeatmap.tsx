import React from "react";
import type { Claim, ResumeLine } from "@/types/contract";
import { VerdictBadge } from "@/components/ui/StatusBadge";
import { VERDICT_CONFIG } from "@/styles/tokens";

interface ResumeHeatmapProps {
  lines: ResumeLine[];
  claims: Claim[];
  /** Opens the evidence drawer for these claims; the clicked button gets focus back on close. */
  onOpen: (title: string, claimIds: string[]) => void;
}

/**
 * Resume heatmap: every line with a verdict is a button (left border + tint in the verdict color,
 * plus label + icon). Lines without claims render as plain text. Declared-only sessions list claims.
 */
export const ResumeHeatmap: React.FC<ResumeHeatmapProps> = ({ lines, claims, onOpen }) => {
  const rows =
    lines.length > 0
      ? lines.map((l) => ({ key: `line-${l.index}`, text: l.text, verdict: l.verdict, claimIds: l.claim_ids }))
      : claims.map((c) => ({ key: c.id, text: c.text, verdict: c.verdict, claimIds: [c.id] }));

  return (
    <section aria-labelledby="heatmap-heading" className="rounded-lg border border-line bg-white p-5">
      <h2 id="heatmap-heading" className="mb-1 text-lg font-semibold text-ink-primary">
        {lines.length > 0 ? "Resume heatmap" : "Claims"}
      </h2>
      <p className="mb-4 text-sm text-ink-muted">Select a line to see the evidence behind its verdict.</p>
      <ul className="grid gap-2">
        {rows.map((row) => {
          if (row.verdict === null) {
            return (
              <li key={row.key} className="px-3 py-2 text-sm text-ink-muted">
                {row.text}
              </li>
            );
          }
          const cfg = VERDICT_CONFIG[row.verdict];
          return (
            <li key={row.key}>
              <button
                type="button"
                onClick={() => onOpen(row.text, row.claimIds)}
                aria-label={`Resume line: ${row.text}. Verdict: ${cfg.label}. Open evidence.`}
                className="flex w-full flex-wrap items-center justify-between gap-2 rounded-md border-l-4 px-3 py-2 text-left text-sm text-ink-primary hover:brightness-95"
                style={{ borderLeftColor: cfg.fg, backgroundColor: cfg.bg }}
              >
                <span className="min-w-0 flex-1 break-words">{row.text}</span>
                <VerdictBadge verdict={row.verdict} className="bg-white/70" />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
};
