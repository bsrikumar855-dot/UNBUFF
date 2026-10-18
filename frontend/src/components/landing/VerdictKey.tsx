import React, { useRef, useState } from "react";
import { AnimatePresence, m } from "motion/react";
import { ScanReveal } from "@/components/motion/ScanReveal";
import { canObserve } from "@/components/motion/ease";
import { DUR, settle, stepDelay } from "@/components/motion/tokens";
import { cn } from "@/lib/cn";
import { VERDICT_CONFIG } from "@/styles/tokens";
import type { Verdict } from "@/types/contract";

/**
 * The scoring rules, shown as the product's own verdict ladder. Every line is taken from the contract: a claim is tested
 * at three levels, the number of levels passed decides the verdict, and only a weak verdict produces a fix task and a
 * retest. Pick a verdict to see what it means. Verdict colours mark the pips only, never the label text.
 */
const ROWS: { verdict: Extract<Verdict, "defended" | "shaky" | "bluff" | "honest_gap">; passed: number; rule: string; next: string }[] = [
  { verdict: "defended", passed: 3, rule: "You passed all three levels: what you built, how it works underneath, and why you chose it.", next: "Nothing to fix. The claim stands, backed by what you said." },
  { verdict: "shaky", passed: 2, rule: "You passed one or two of the three levels. Part of the claim holds; part of it does not yet.", next: "A fix task for the gap, and a retest with a new scenario once it is due." },
  { verdict: "bluff", passed: 0, rule: "You passed none of the three levels. The resume line is not backed by what you could explain.", next: "A fix task, and a retest from the first level once it is due." },
  { verdict: "honest_gap", passed: 0, rule: "You said you had not used it. Saying so is recorded as an honest gap, not as a bluff.", next: "A fix task to close the gap, and a retest once it is due." },
];

const Pips: React.FC<{ count: number; colour: string }> = ({ count, colour }) => {
  const animated = canObserve();
  return (
    <span className="flex items-center gap-1" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <m.span
          key={i}
          className="block h-2.5 w-5 border"
          style={{ borderColor: colour }}
          initial={animated ? { backgroundColor: "rgba(0,0,0,0)" } : false}
          animate={{ backgroundColor: i < count ? colour : "rgba(0,0,0,0)" }}
          transition={settle(DUR.fast, stepDelay(i, 0.07))}
        />
      ))}
    </span>
  );
};

export const VerdictKey: React.FC<{ className?: string }> = ({ className }) => {
  const [active, setActive] = useState<(typeof ROWS)[number]["verdict"]>("shaky");
  const group = useRef<HTMLDivElement>(null);
  const row = ROWS.find((r) => r.verdict === active)!;
  const colour = VERDICT_CONFIG[active].fg;
  const animated = canObserve();

  const onKey = (e: React.KeyboardEvent) => {
    const i = ROWS.findIndex((r) => r.verdict === active);
    const next = e.key === "ArrowDown" || e.key === "ArrowRight" ? i + 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? i - 1 : null;
    if (next === null) return;
    e.preventDefault();
    const target = ROWS[(next + ROWS.length) % ROWS.length]!;
    setActive(target.verdict);
    group.current?.querySelector<HTMLElement>(`[data-verdict="${target.verdict}"]`)?.focus();
  };

  return (
    <ScanReveal className={className} delay={1.9}>
      <div className="border border-foreground bg-surface-50/80 backdrop-blur-[1px]">
        <p className="eyebrow flex items-center justify-between border-b border-foreground px-4 py-2.5">
          <span>How a claim is scored</span>
          <span className="text-ink-muted">3 levels</span>
        </p>
        <div ref={group} role="radiogroup" aria-label="Verdict">
          {ROWS.map((r) => {
            const on = r.verdict === active;
            return (
              <button
                key={r.verdict}
                type="button"
                role="radio"
                aria-checked={on}
                data-verdict={r.verdict}
                tabIndex={on ? 0 : -1}
                onClick={() => setActive(r.verdict)}
                onKeyDown={onKey}
                className={cn(
                  "group relative flex w-full items-center justify-between gap-4 border-b border-line px-4 py-3 text-left transition-colors duration-200 focus-visible:z-10",
                  on ? "bg-foreground text-surface-50" : "hover:bg-surface-100"
                )}
              >
                <span className="serif text-xl leading-none">{VERDICT_CONFIG[r.verdict].label}</span>
                <span className={cn("flex items-center gap-3 font-mono text-[11px] uppercase tracking-wide", on ? "text-surface-50/80" : "text-ink-muted")}>
                  {r.verdict === "honest_gap" ? "said so" : `${r.passed} of 3`}
                  <Pips count={on ? r.passed : 0} colour={on ? "#FBF9F4" : VERDICT_CONFIG[r.verdict].fg} />
                </span>
              </button>
            );
          })}
        </div>
        <div className="min-h-[9.5rem] px-4 py-4" aria-live="polite">
          <AnimatePresence mode="wait" initial={false}>
            <m.div
              key={active}
              initial={animated ? { opacity: 0, y: 6 } : false}
              animate={{ opacity: 1, y: 0 }}
              exit={animated ? { opacity: 0, y: -4 } : undefined}
              transition={settle(DUR.fast)}
            >
              <p className="flex items-center gap-2 text-sm leading-relaxed text-ink-primary">
                <span aria-hidden="true" className="block h-2 w-2 shrink-0" style={{ backgroundColor: colour }} />
                {row.rule}
              </p>
              <p className="eyebrow mt-3">Then</p>
              <p className="mt-1 text-sm leading-relaxed text-ink-secondary">{row.next}</p>
            </m.div>
          </AnimatePresence>
        </div>
      </div>
    </ScanReveal>
  );
};
