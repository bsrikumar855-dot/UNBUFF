import React from "react";
import { m } from "motion/react";
import { MaskedText } from "@/components/motion/MaskedText";
import { EASE, canObserve } from "@/components/motion/ease";

const COUNTS = [
  "A coding submission judged against the hidden tests of a first-party exercise, by an execution service the operator has verified",
  "A DBMS quiz passed, graded on the server from answers it never sent you",
  "Interview answers graded during an audit session",
];
const NEVER = [
  "Sample runs and anything you only ran, never submitted",
  "Demonstration exercises",
  "Results from a stand-in or unverified judge",
  "Skills you say you have. They are shown, labelled as self-reported, and never scored",
];

/** The text with a red pen drawn through it when it scrolls into view: this is what never counts. */
const Struck: React.FC<{ children: React.ReactNode; delay: number }> = ({
  children,
  delay,
}) => {
  const animated = canObserve();
  return (
    <m.span
      initial={animated ? { backgroundSize: "0% 2px", opacity: 1 } : false}
      whileInView={{ backgroundSize: "100% 2px", opacity: 0.6 }}
      viewport={{ once: true, margin: "0px 0px -15% 0px" }}
      transition={{
        delay,
        duration: 0.8,
        ease: EASE,
        opacity: { delay: delay + 0.4, duration: 0.5 },
      }}
      // A background line per text line (box-decoration-break: clone), so wrapped text is struck on every line.
      className="[box-decoration-break:clone] bg-[linear-gradient(var(--color-accent),var(--color-accent))] bg-no-repeat bg-position-[0_58%] bg-size-[100%_2px]"
    >
      {children}
    </m.span>
  );
};

/** A green tick that draws itself. */
const Tick: React.FC<{ delay: number }> = ({ delay }) => {
  const animated = canObserve();
  return (
    <svg
      aria-hidden="true"
      width="18"
      height="18"
      viewBox="0 0 18 18"
      className="mt-1 shrink-0 text-verified"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="square"
    >
      <m.path
        d="M3 9.5l4 4 8-9"
        initial={animated ? { pathLength: 0 } : false}
        whileInView={{ pathLength: 1 }}
        viewport={{ once: true, margin: "0px 0px -15% 0px" }}
        transition={{ delay, duration: 0.55, ease: EASE }}
      />
    </svg>
  );
};

/** The evidence rules, stated plainly and shown with the red pen: what counts is ticked, what never counts is struck. */
export const CountsSection: React.FC = () => (
  <section aria-labelledby="counts-title" className="border-b border-line">
    <div className="mx-auto max-w-384 px-6 py-20 sm:px-14 sm:py-32">
      <p className="eyebrow">02 · Evidence</p>
      <h2
        id="counts-title"
        className="serif mt-4 max-w-4xl text-display font-medium leading-[1.02]"
      >
        <MaskedText text="Practice counts only when it is judged" inView />
      </h2>
      <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-secondary">
        Your plan, analytics and revision queue are built from records the system can
        stand behind. When there is not enough evidence, the page says so instead of
        guessing a score.
      </p>
      <div className="mt-16 grid gap-6 md:grid-cols-2">
        <div className="rounded-[1.75rem] bg-white/55 p-8 shadow-[inset_0_0_0_1px_rgba(24,24,27,0.07),inset_0_1px_0_rgba(255,255,255,0.95),0_16px_32px_-24px_rgba(24,24,27,0.35)] backdrop-blur-sm sm:p-10">
          <h3 className="eyebrow text-verified">Counts toward your progress</h3>
          <ul className="mt-6 space-y-5">
            {COUNTS.map((c, i) => (
              <li
                key={c}
                className="flex gap-4 text-[1.0625rem] leading-relaxed text-foreground"
              >
                <Tick delay={0.1 + i * 0.18} />
                {c}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-[1.75rem] bg-[linear-gradient(160deg,rgba(255,214,205,0.7),rgba(255,255,255,0.45))] p-8 shadow-[inset_0_0_0_1px_rgba(179,41,26,0.14),inset_0_1px_0_rgba(255,255,255,0.95),0_16px_32px_-24px_rgba(179,41,26,0.35)] backdrop-blur-sm sm:p-10">
          <h3 className="eyebrow text-redline">Never counts</h3>
          <ul className="mt-6 space-y-5">
            {NEVER.map((c, i) => (
              <li
                key={c}
                className="flex gap-4 text-[1.0625rem] leading-relaxed text-foreground"
              >
                <span aria-hidden="true" className="num mt-0.5 text-redline">
                  &minus;
                </span>
                <Struck delay={0.15 + i * 0.22}>{c}</Struck>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  </section>
);
