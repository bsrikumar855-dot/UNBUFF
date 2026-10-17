import React from "react";
import { Check, X } from "lucide-react";
import type { Criterion, TurnResponse } from "@/types/contract";
import { VerdictBadge } from "@/components/ui/StatusBadge";
import { VERDICT_CONFIG } from "@/styles/tokens";

const CRITERIA: Criterion[] = ["accuracy", "specificity", "mechanism", "ownership", "tradeoff"];

/** Done turn: verdict (announced) plus the evidence summary from the last grade. */
export const TurnResult: React.FC<{ turn: TurnResponse }> = ({ turn }) => {
  const { claim, grade } = turn;
  return (
    <div>
      <p className="sr-only" role="status">
        Verdict for this claim: {VERDICT_CONFIG[claim.verdict].label}
      </p>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold text-ink-primary">Claim finished</h2>
        <VerdictBadge verdict={claim.verdict} />
        <span className="text-sm text-ink-muted">Levels passed {claim.levels_passed}/3</span>
      </div>
      {claim.root_cause && (
        <p className="mb-3 rounded-md border-l-4 border-verdict-shaky-fg bg-verdict-shaky-bg px-3 py-2 text-sm text-verdict-shaky-fg">
          <span className="font-bold">Root cause: </span>
          {claim.root_cause}
        </p>
      )}
      {claim.retest && (
        <p className="mb-3 text-sm text-ink-secondary">
          Retest after {claim.retest.interleaved_claims} other concepts:{" "}
          {Math.round(claim.retest.before * 100)}% → {Math.round(claim.retest.after * 100)}%
        </p>
      )}
      {grade && (
        <ul className="grid gap-1.5 text-sm" aria-label="Evidence from your last answer">
          {grade.admits_gap && <li className="text-ink-secondary">You said you don&apos;t know. That&apos;s an honest gap.</li>}
          {CRITERIA.map((c) => {
            const r = grade.criteria[c];
            if (!r.passed && !r.missing_concept) return null;
            return (
              <li key={c} className="flex gap-2">
                {r.passed ? (
                  <Check size={16} className="mt-0.5 shrink-0 text-verdict-defended-fg" aria-hidden="true" />
                ) : (
                  <X size={16} className="mt-0.5 shrink-0 text-verdict-bluff-fg" aria-hidden="true" />
                )}
                <span>
                  <span className="font-semibold capitalize">
                    {c} {r.passed ? "shown" : "missing"}
                  </span>
                  {r.passed && r.evidence_quote && <q className="ml-1 italic">{r.evidence_quote}</q>}
                  {!r.passed && r.missing_concept && <span className="ml-1">— {r.missing_concept}</span>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
