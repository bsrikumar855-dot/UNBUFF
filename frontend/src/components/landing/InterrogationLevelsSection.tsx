import React from "react";

const LEVELS = [
  {
    tag: "L1",
    name: "What you did",
    copy: "The specific thing you built, and your part in it.",
  },
  {
    tag: "L2",
    name: "How it works",
    copy: "The mechanism underneath — not just that it works, but why.",
  },
  {
    tag: "L3",
    name: "Why / trade-offs",
    copy: "The alternatives you didn't take, and what they would have cost.",
  },
] as const;

export const InterrogationLevelsSection: React.FC = () => {
  return (
    <section className="px-4 py-16 sm:px-6 sm:py-20">
      <div className="mx-auto max-w-6xl">
        <p className="mb-2 font-mono text-xs font-semibold uppercase tracking-wider text-ink-subtle">
          Three levels deep
        </p>
        <h2 className="text-balance text-2xl font-bold tracking-tight text-ink-primary sm:text-3xl">
          Every claim gets interrogated, not just asked about
        </h2>

        <div className="mt-10 grid gap-8 sm:grid-cols-3 sm:gap-6">
          {LEVELS.map((level) => (
            <div
              key={level.tag}
              className="border-l-2 border-primary/30 pl-4 sm:border-l-0 sm:border-t-2 sm:pl-0 sm:pt-5"
            >
              <span
                className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-primary font-mono text-xs font-semibold text-primary"
                aria-hidden="true"
              >
                {level.tag}
              </span>
              <h3 className="mt-3 text-base font-semibold text-ink-primary">
                {level.name}
              </h3>
              <p className="mt-1 max-w-xs text-sm leading-relaxed text-ink-secondary">
                {level.copy}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
