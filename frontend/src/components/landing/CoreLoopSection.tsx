import React from "react";
import { ArrowRight } from "lucide-react";

const STAGES = [
  {
    step: "01",
    name: "Claim",
    copy: "Pulled from your resume or the skills you declare.",
  },
  {
    step: "02",
    name: "Prove",
    copy: "Defend it through three rounds of increasingly specific questioning.",
  },
  {
    step: "03",
    name: "Fix",
    copy: "See exactly what was missing, then work through a targeted exercise.",
  },
  {
    step: "04",
    name: "Retest",
    copy: "A new scenario checks whether the gap actually closed.",
  },
] as const;

export const CoreLoopSection: React.FC = () => {
  return (
    <section className="border-t border-line bg-white px-4 py-16 sm:px-6 sm:py-20">
      <div className="mx-auto max-w-6xl">
        <p className="mb-2 font-mono text-xs font-semibold uppercase tracking-wider text-ink-subtle">
          The core loop
        </p>
        <h2 className="text-balance text-2xl font-bold tracking-tight text-ink-primary sm:text-3xl">
          Claim &rarr; Prove &rarr; Fix &rarr; Retest
        </h2>

        <ol className="mt-10 flex flex-col gap-0 sm:flex-row sm:items-stretch sm:gap-0">
          {STAGES.map((stage, i) => (
            <li key={stage.step} className="flex flex-1 sm:flex-col">
              <div className="flex flex-1 flex-col border-l-2 border-line-strong py-1 pl-4 sm:border-l-0 sm:border-t-2 sm:py-0 sm:pl-0 sm:pt-4">
                <span className="font-mono text-xs text-ink-subtle">{stage.step}</span>
                <h3 className="mt-1 text-base font-semibold text-ink-primary">
                  {stage.name}
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-ink-secondary">
                  {stage.copy}
                </p>
              </div>
              {i < STAGES.length - 1 && (
                <div
                  className="my-3 hidden items-center justify-center sm:mx-2 sm:my-0 sm:flex"
                  aria-hidden="true"
                >
                  <ArrowRight size={16} className="text-ink-subtle" />
                </div>
              )}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
};
