import React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/cn";

const LEVELS = [
  { n: 1, name: "What", hint: "What you built, your part" },
  { n: 2, name: "How", hint: "How it works inside" },
  { n: 3, name: "Why", hint: "Why this, when not, alternatives" },
];

interface LevelTrackerProps {
  /** Level being asked now (null when the claim is done). */
  current: number | null;
  levelsPassed: number;
}

/** Right column: L1 → L2 → L3 with passed / current / upcoming states in text, not just color. */
export const LevelTracker: React.FC<LevelTrackerProps> = ({ current, levelsPassed }) => (
  <section aria-labelledby="levels-heading" className="rounded-lg border border-line bg-white p-4">
    <h2 id="levels-heading" className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-muted">
      Depth
    </h2>
    <ol className="grid gap-2">
      {LEVELS.map((l) => {
        const passed = current !== null ? l.n < current : l.n <= levelsPassed;
        const active = l.n === current;
        const status = passed ? "passed" : active ? "current" : "not reached";
        return (
          <li
            key={l.n}
            aria-current={active ? "step" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-md border p-2 text-sm",
              active ? "border-primary bg-primary-soft" : "border-line",
            )}
          >
            <span
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                passed ? "bg-verdict-defended-bg text-verdict-defended-fg" : active ? "bg-primary text-white" : "bg-surface-100 text-ink-muted",
              )}
              aria-hidden="true"
            >
              {passed ? <Check size={14} /> : `L${l.n}`}
            </span>
            <span>
              <span className="font-semibold text-ink-primary">
                L{l.n} {l.name}
              </span>
              <span className="block text-xs text-ink-muted">
                {l.hint} · {status}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  </section>
);
