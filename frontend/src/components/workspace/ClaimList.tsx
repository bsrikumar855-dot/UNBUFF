import React from "react";
import type { Claim } from "@/types/contract";
import { VerdictBadge } from "@/components/ui/StatusBadge";
import { cn } from "@/lib/cn";

/** Left column: every claim with its current verdict (label + icon + color). */
export const ClaimList: React.FC<{ claims: Claim[]; activeId: string | null }> = ({ claims, activeId }) => (
  <nav aria-label="Claims" className="rounded-lg border border-line bg-white p-4">
    <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-muted">Claims</h2>
    <ol className="grid gap-2">
      {claims.map((c) => (
        <li
          key={c.id}
          aria-current={c.id === activeId ? "step" : undefined}
          className={cn("rounded-md border p-2 text-sm", c.id === activeId ? "border-primary bg-primary-soft" : "border-line")}
        >
          <p className="mb-1 line-clamp-2 text-ink-primary">{c.text}</p>
          <VerdictBadge verdict={c.verdict} />
        </li>
      ))}
    </ol>
  </nav>
);
