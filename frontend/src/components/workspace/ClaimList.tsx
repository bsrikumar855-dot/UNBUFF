import React from "react";
import type { Claim } from "@/types/contract";
import { VerdictBadge } from "@/components/ui/StatusBadge";
import { GLASS } from "@/components/ui/GlassCard";
import { cn } from "@/lib/cn";

/** Left column: every claim with its current verdict (label + icon + color). */
export const ClaimList: React.FC<{ claims: Claim[]; activeId: string | null }> = ({
  claims,
  activeId,
}) => (
  <nav aria-label="Claims" className={cn(GLASS, "p-4")}>
    <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-muted">
      Claims
    </h2>
    <ol className="grid gap-2">
      {claims.map((c) => (
        <li
          key={c.id}
          aria-current={c.id === activeId ? "step" : undefined}
          className={cn(
            "rounded-2xl p-3 text-sm",
            c.id === activeId
              ? "bg-redline-soft/60 shadow-[inset_0_0_0_1.5px_rgba(179,41,26,0.5)]"
              : "bg-white/60 shadow-[inset_0_0_0_1px_rgba(24,24,27,0.07)]"
          )}
        >
          <p className="mb-1 line-clamp-2 text-ink-primary">{c.text}</p>
          <VerdictBadge verdict={c.verdict} />
        </li>
      ))}
    </ol>
  </nav>
);
