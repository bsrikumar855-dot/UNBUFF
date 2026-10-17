import React from "react";
import { ArrowDown, Check, AlertTriangle } from "lucide-react";
import { VerdictBadge } from "@/components/ui/StatusBadge";
import { Card } from "@/components/ui/Card";

function StageLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
      {children}
    </p>
  );
}

function Connector() {
  return (
    <div className="flex justify-center py-2" aria-hidden="true">
      <ArrowDown size={14} className="text-ink-subtle" />
    </div>
  );
}

/**
 * Illustrative preview of one interrogation — claim, question, evidence,
 * verdict. Clearly labeled as an example so it can never be mistaken for a
 * live assessment; the verdict badge reuses the real StatusBadge/token
 * system rather than inventing a second color scheme.
 */
export const ProductPreviewCard: React.FC = () => {
  return (
    <Card className="w-full max-w-sm motion-safe:animate-fade-up">
      <p className="mb-4 font-mono text-[11px] uppercase tracking-wider text-ink-subtle">
        Example interrogation
      </p>

      <StageLabel>Claim</StageLabel>
      <p className="mt-1 text-sm text-ink-primary">
        &ldquo;Built a React dashboard with optimized rendering&rdquo;
      </p>

      <Connector />

      <StageLabel>Level 1</StageLabel>
      <p className="mt-1 text-sm text-ink-primary">What did you actually build?</p>

      <Connector />

      <StageLabel>Evidence</StageLabel>
      <ul className="mt-1 space-y-1 text-sm text-ink-secondary">
        <li className="flex items-start gap-1.5">
          <Check size={14} className="mt-0.5 shrink-0 text-verdict-defended-fg" aria-hidden="true" />
          Specific implementation detail
        </li>
        <li className="flex items-start gap-1.5">
          <Check size={14} className="mt-0.5 shrink-0 text-verdict-defended-fg" aria-hidden="true" />
          Clear ownership of the work
        </li>
        <li className="flex items-start gap-1.5">
          <AlertTriangle
            size={14}
            className="mt-0.5 shrink-0 text-verdict-shaky-fg"
            aria-hidden="true"
          />
          Missing explanation of the mechanism
        </li>
      </ul>

      <Connector />

      <StageLabel>Status</StageLabel>
      <div className="mt-1.5">
        <VerdictBadge verdict="shaky" />
      </div>
    </Card>
  );
};
