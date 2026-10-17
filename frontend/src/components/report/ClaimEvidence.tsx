import React from "react";
import { Check, X } from "lucide-react";
import type { Claim, Criterion, QA } from "@/types/contract";
import { VerdictBadge } from "@/components/ui/StatusBadge";
import { percent } from "@/lib/format";

const CRITERIA: Criterion[] = ["accuracy", "specificity", "mechanism", "ownership", "tradeoff"];
const CRITERION_LABEL: Record<Criterion, string> = {
  accuracy: "Accuracy",
  specificity: "Specificity",
  mechanism: "Mechanism",
  ownership: "Ownership",
  tradeoff: "Trade-off",
};

const Turn: React.FC<{ qa: QA }> = ({ qa }) => (
  <li className="rounded-md border border-line p-3">
    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">
      L{qa.level} · {qa.mode === "retest" ? "Retest" : qa.kind === "clarify" ? "Follow-up" : "Question"}
    </p>
    <p className="mb-2 font-medium text-ink-primary">{qa.question}</p>
    <p className="mb-2 whitespace-pre-line text-ink-secondary">
      <span className="font-semibold">Answer: </span>
      {qa.answer ?? "(not answered yet)"}
    </p>
    {qa.grade && (
      <ul className="grid gap-1.5">
        {CRITERIA.filter((c) => {
          const r = qa.grade?.criteria[c];
          return r && (r.passed || r.evidence_quote || r.missing_concept);
        }).map((c) => {
          const r = qa.grade!.criteria[c];
          return (
            <li key={c} className="flex gap-2 text-xs">
              {r.passed ? (
                <Check size={14} className="mt-0.5 shrink-0 text-verdict-defended-fg" aria-hidden="true" />
              ) : (
                <X size={14} className="mt-0.5 shrink-0 text-verdict-bluff-fg" aria-hidden="true" />
              )}
              <span>
                <span className="font-semibold">
                  {CRITERION_LABEL[c]} {r.passed ? "shown" : "missing"}
                </span>
                {r.evidence_quote && <q className="ml-1 italic">{r.evidence_quote}</q>}
                {!r.passed && r.missing_concept && <span className="ml-1">— {r.missing_concept}</span>}
              </span>
            </li>
          );
        })}
      </ul>
    )}
  </li>
);

/** Everything the evidence drawer shows for one claim. */
export const ClaimEvidence: React.FC<{ claim: Claim }> = ({ claim }) => (
  <article className="mb-6 text-sm">
    <div className="mb-2 flex flex-wrap items-center gap-2">
      <VerdictBadge verdict={claim.verdict} />
      <span className="text-ink-muted">
        {claim.id} · levels passed {claim.levels_passed}/3 · proficiency {percent(claim.proficiency)}
      </span>
    </div>
    <h3 className="mb-3 font-semibold text-ink-primary">{claim.text}</h3>

    {claim.root_cause && (
      <p className="mb-3 rounded-md border-l-4 border-verdict-shaky-fg bg-verdict-shaky-bg px-3 py-2 text-verdict-shaky-fg">
        <span className="font-bold">Root cause: </span>
        {claim.root_cause}
      </p>
    )}

    {claim.qa.length > 0 ? (
      <ol className="mb-3 grid gap-2">
        {claim.qa.map((qa, i) => (
          <Turn key={i} qa={qa} />
        ))}
      </ol>
    ) : (
      <p className="mb-3 text-ink-muted">Not interrogated yet.</p>
    )}

    {claim.missing_concepts.length > 0 && (
      <p className="mb-3 text-ink-secondary">
        <span className="font-semibold">Missing concepts: </span>
        {claim.missing_concepts.join("; ")}
      </p>
    )}

    {claim.rewrite && (
      <div className="rounded-md border border-line bg-surface-50 px-3 py-2">
        <p className="font-semibold text-ink-primary">Honest rewrite suggestion</p>
        <p className="text-ink-secondary">{claim.rewrite}</p>
      </div>
    )}
  </article>
);
