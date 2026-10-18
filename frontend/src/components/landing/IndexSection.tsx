import React from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { m } from "motion/react";
import { MaskedText } from "@/components/motion/MaskedText";
import { EASE, canObserve } from "@/components/motion/ease";
import { routes } from "@/lib/routes";

const MODULES = [
  {
    to: routes.placement,
    name: "Placement plan",
    copy: "Today's tasks and a weekly plan built from your goals, your time and your verified results.",
  },
  {
    to: routes.dsa,
    name: "DSA Arena",
    copy: "Company and topic navigation, search and filters, with a coding workspace for every judged exercise.",
  },
  {
    to: routes.dsaAnalytics,
    name: "Analytics and revision",
    copy: "What your judged submissions show, and which questions to come back to, and when.",
  },
  {
    to: routes.mentor(),
    name: "AI Mentor",
    copy: "A mentor that reads your real records, remembers only what you tell it, and lets you delete it.",
  },
  {
    to: routes.graphqlLab,
    name: "GraphQL Lab",
    copy: "Lessons and graded exercises against a controlled training API, decided by running your query.",
  },
  {
    to: routes.github,
    name: "GitHub insights",
    copy: "Read-only, public data only: your contribution history and repositories, as context.",
  },
  {
    to: routes.setup,
    name: "Readiness audit",
    copy: "Your resume claims, interrogated, with a report and a retest.",
  },
] as const;

/**
 * The product as an oversized table of contents. Each row is a real route. On hover or keyboard focus an ink panel
 * wipes up behind the row and the name shifts: an interaction that carries no information on its own, so every row also
 * shows its description and the link works the same without it.
 */
export const IndexSection: React.FC = () => {
  const animated = canObserve();
  return (
    <section aria-labelledby="index-title" className="border-b border-line">
      <div className="mx-auto max-w-[96rem] px-6 py-20 sm:px-14 sm:py-32">
        <p className="eyebrow">03 · Contents</p>
        <h2
          id="index-title"
          className="serif mt-4 max-w-3xl text-display font-medium leading-[1.02]"
        >
          <MaskedText text="One plan, seven places to work" inView />
        </h2>
        <ul className="mt-16 border-t border-foreground">
          {MODULES.map((mod, i) => (
            <m.li
              key={mod.name}
              initial={animated ? { opacity: 0, y: 36 } : false}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "0px 0px -8% 0px" }}
              transition={{ duration: 0.7, ease: EASE, delay: 0.04 * (i % 3) }}
              className="border-b border-line"
            >
              <Link
                to={mod.to}
                className="group relative grid grid-cols-[2.5rem_1fr_2rem] items-center gap-x-4 overflow-hidden py-6 sm:grid-cols-[4.5rem_minmax(0,0.9fr)_minmax(0,1fr)_2.5rem] sm:py-9"
              >
                <span
                  aria-hidden="true"
                  className="absolute inset-0 -z-10 translate-y-full bg-foreground transition-transform duration-500 ease-out group-hover:translate-y-0 group-focus-visible:translate-y-0 motion-reduce:transition-none"
                />
                <span className="num text-sm text-ink-muted transition-colors duration-300 group-hover:text-background group-focus-visible:text-background">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="serif text-[clamp(2rem,5.4vw,5rem)] font-medium leading-[1.02] tracking-[-0.03em] text-foreground transition-[transform,color] duration-500 ease-out group-hover:translate-x-3 group-hover:text-background group-focus-visible:translate-x-3 group-focus-visible:text-background motion-reduce:transform-none">
                  {mod.name}
                </span>
                <span className="col-start-2 mt-2 text-[15px] leading-relaxed text-ink-secondary transition-colors duration-300 group-hover:text-background/80 group-focus-visible:text-background/80 sm:col-start-auto sm:mt-0">
                  {mod.copy}
                </span>
                <ArrowUpRight
                  aria-hidden="true"
                  className="col-start-3 row-start-1 size-6 justify-self-end text-ink-muted transition-[transform,color] duration-500 group-hover:-translate-y-1 group-hover:translate-x-1 group-hover:text-background group-focus-visible:text-background sm:col-start-auto sm:row-start-auto"
                />
              </Link>
            </m.li>
          ))}
        </ul>
      </div>
    </section>
  );
};
