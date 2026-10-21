import React, { useRef, useState } from "react";
import {
  m,
  useMotionValue,
  useMotionValueEvent,
  useScroll,
  useTransform,
  type MotionValue,
} from "motion/react";
import { Stamp } from "@/components/motion/Stamp";
import { usePinnedStory } from "@/components/motion/usePinnedStory";
import { cn } from "@/lib/cn";

/** The four stages, in the words the product uses. */
const STEPS = [
  {
    n: "01",
    name: "Claim",
    copy: "Claims are pulled from your resume or from the skills you declare. You confirm the list before a single question is asked.",
  },
  {
    n: "02",
    name: "Prove",
    copy: "Each claim is questioned in up to three rounds, each more specific than the last.",
  },
  {
    n: "03",
    name: "Fix",
    copy: "The report shows exactly what was missing, with a targeted exercise for the gap.",
  },
  {
    n: "04",
    name: "Retest",
    copy: "A fresh scenario checks whether the gap actually closed.",
  },
] as const;

const ROW =
  "grid grid-cols-[5.5rem_1fr] items-baseline gap-x-5 border-t border-line py-5 first:border-t-0 sm:grid-cols-[7rem_1fr]";

/** A row of the specimen that is revealed by scroll progress between `from` and `to` (0 to 1). */
const ScrollRow: React.FC<{
  progress: MotionValue<number>;
  from: number;
  to: number;
  className?: string;
  children: React.ReactNode;
}> = ({ progress, from, to, className, children }) => {
  const opacity = useTransform(progress, [from, to], [0, 1]);
  const y = useTransform(progress, [from, to], [28, 0]);
  return (
    <m.div style={{ opacity, y }} className={className}>
      {children}
    </m.div>
  );
};

/** The specimen itself. `progress` drives it on a wide screen; without it every row is simply shown. */
const Specimen: React.FC<{ progress?: MotionValue<number>; stamped: boolean }> = ({
  progress,
  stamped,
}) => {
  const wrap = (
    from: number,
    to: number,
    className: string,
    children: React.ReactNode
  ) =>
    progress ? (
      <ScrollRow progress={progress} from={from} to={to} className={className}>
        {children}
      </ScrollRow>
    ) : (
      <div className={className}>{children}</div>
    );
  const fallback = useMotionValue(1);
  const underline = useTransform(progress ?? fallback, [0.56, 0.66], [0, 1]);
  return (
    <figure
      aria-label="A specimen proof sheet: one claim, three questions, the evidence found, and the verdict"
      className="relative border border-foreground bg-card"
    >
      <div className="flex items-center justify-between border-b border-foreground px-5 py-2.5">
        <span className="eyebrow text-foreground">Proof sheet</span>
        <span className="eyebrow">Specimen, not a student</span>
      </div>
      <div className="px-5 sm:px-7">
        {wrap(
          0.04,
          0.14,
          ROW,
          <>
            <span className="eyebrow pt-1">Claim</span>
            <p className="serif text-[1.35rem] leading-snug text-foreground sm:text-[1.6rem]">
              &ldquo;Built a React dashboard with optimized rendering&rdquo;
            </p>
          </>
        )}
        {wrap(
          0.16,
          0.28,
          ROW,
          <>
            <span className="eyebrow pt-1">Level 1</span>
            <p className="text-[17px] text-foreground">What did you actually build?</p>
          </>
        )}
        {wrap(
          0.3,
          0.42,
          ROW,
          <>
            <span className="eyebrow pt-1">Level 2</span>
            <p className="text-[17px] text-foreground">How does it work underneath?</p>
          </>
        )}
        {wrap(
          0.44,
          0.54,
          ROW,
          <>
            <span className="eyebrow pt-1">Level 3</span>
            <p className="text-[17px] text-foreground">
              Why did you choose it, and what are the trade-offs?
            </p>
          </>
        )}
        {wrap(
          0.52,
          0.7,
          ROW,
          <>
            <span className="eyebrow pt-1">Evidence</span>
            <ul className="space-y-2 text-[17px] text-ink-secondary">
              <li className="flex gap-3">
                <span aria-hidden="true" className="num text-verified">
                  +
                </span>
                <span>
                  <span className="sr-only">Found: </span>Specific implementation detail
                </span>
              </li>
              <li className="flex gap-3">
                <span aria-hidden="true" className="num text-verified">
                  +
                </span>
                <span>
                  <span className="sr-only">Found: </span>Clear ownership of the work
                </span>
              </li>
              <li className="flex gap-3">
                <span aria-hidden="true" className="num text-redline">
                  &minus;
                </span>
                <span className="relative">
                  <span className="sr-only">Missing: </span>Explanation of the mechanism
                  <m.span
                    aria-hidden="true"
                    style={{ scaleX: underline }}
                    className="absolute inset-x-0 -bottom-0.5 h-[3px] origin-left bg-redline"
                  />
                </span>
              </li>
            </ul>
          </>
        )}
        {wrap(
          0.7,
          0.76,
          cn(ROW, "min-h-22"),
          <>
            <span className="eyebrow pt-1">Verdict</span>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
              <p className="serif text-[1.6rem] text-foreground">Shaky</p>
              {(stamped || !progress) && <Stamp label="Shaky" tone="redline" tilt={-7} />}
            </div>
          </>
        )}
        {wrap(
          0.82,
          0.94,
          ROW,
          <>
            <span className="eyebrow pt-1">Next</span>
            <p className="text-[17px] text-ink-secondary">
              A targeted exercise on the missing piece, then a retest with a new scenario.
            </p>
          </>
        )}
      </div>
    </figure>
  );
};

/** Pinned: the section is tall, the stage sticks, and scroll progress plays the interrogation. */
const Pinned: React.FC = () => {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end end"],
  });
  const [stamped, setStamped] = useState(false);
  const [step, setStep] = useState(0);
  useMotionValueEvent(scrollYProgress, "change", (v) => {
    setStamped(v > 0.74);
    setStep(v < 0.2 ? 0 : v < 0.7 ? 1 : v < 0.9 ? 2 : 3);
  });
  const railHeight = useTransform(scrollYProgress, [0, 1], ["0%", "100%"]);

  return (
    <div ref={ref} className="relative h-[430vh]">
      <div className="sticky top-0 flex h-screen items-center">
        <div className="mx-auto grid w-full max-w-384 grid-cols-[17rem_minmax(0,1fr)] gap-14 px-14">
          <div className="relative flex flex-col justify-center">
            <p className="eyebrow">01 · Method</p>
            <h2 id="interrogation-title" className="serif mt-4 text-title font-medium">
              How a claim is tested
            </h2>
            <ol className="relative mt-10 space-y-6 border-l border-line pl-6">
              <m.span
                aria-hidden="true"
                style={{ height: railHeight }}
                className="absolute -left-px top-0 w-[2px] bg-redline"
              />
              {STEPS.map((s, i) => (
                <li
                  key={s.n}
                  className="transition-colors duration-300"
                  aria-current={i === step ? "step" : undefined}
                >
                  <p className={cn("num text-xs", i === step ? "text-redline" : "text-ink-muted")}>{s.n}</p>
                  <p
                    className={cn(
                      "serif text-2xl font-medium transition-colors duration-300",
                      i === step ? "text-foreground" : "text-ink-muted"
                    )}
                  >
                    {s.name}
                  </p>
                </li>
              ))}
            </ol>
          </div>
          <div className="min-w-0 self-center">
            <p className="mb-4 max-w-xl text-lg leading-relaxed text-ink-secondary">
              {STEPS[step]?.copy}
            </p>
            <Specimen progress={scrollYProgress} stamped={stamped} />
          </div>
        </div>
      </div>
    </div>
  );
};

/** Not pinned (phones, reduced motion): the same story as an ordinary section. */
const Static: React.FC = () => (
  <div className="mx-auto grid max-w-384 gap-10 px-6 py-16 sm:px-14 sm:py-24 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-20">
    <div>
      <p className="eyebrow">01 · Method</p>
      <h2 id="interrogation-title" className="serif mt-4 text-title font-medium">
        How a claim is tested
      </h2>
      <ol className="mt-8 border-t border-foreground">
        {STEPS.map((s) => (
          <li
            key={s.n}
            className="grid grid-cols-[3rem_1fr] gap-4 border-b border-line py-5"
          >
            <span className="num pt-1 text-sm text-ink-muted">{s.n}</span>
            <div>
              <p className="serif text-heading font-medium">{s.name}</p>
              <p className="mt-1 leading-relaxed text-ink-secondary">{s.copy}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
    <Specimen stamped />
  </div>
);

export const Interrogation: React.FC = () => {
  const pinned = usePinnedStory();
  return (
    <section
      id="interrogation"
      aria-labelledby="interrogation-title"
      className="relative overflow-x-clip border-b border-line"
    >
      {pinned ? <Pinned /> : <Static />}
    </section>
  );
};
