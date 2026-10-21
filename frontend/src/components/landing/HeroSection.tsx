import React from "react";
import { Link } from "react-router-dom";
import { m, useScroll, useTransform } from "motion/react";
import { DemoReportButton } from "@/components/common/DemoReportButton";
import { Magnetic } from "@/components/motion/Magnetic";
import { MaskedText } from "@/components/motion/MaskedText";
import { EASE, canObserve } from "@/components/motion/ease";
import { buttonClasses } from "@/lib/buttonClasses";
import { CropMarks, Ruler } from "./Decor";
import { VerdictKey } from "./VerdictKey";

/**
 * The entrance. One enormous sentence is the whole argument; it is revealed word by word out of masks, the red pen
 * underlines the phrase that matters once the words have landed, and the headline drifts and thins as you scroll
 * away. Crop marks and a ruler frame the page like a proof being checked.
 */
export const HeroSection: React.FC = () => {
  const ref = React.useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });
  const y = useTransform(scrollYProgress, [0, 1], ["0%", "-14%"]);
  const fade = useTransform(scrollYProgress, [0, 0.8], [1, 0.2]);
  const keyY = useTransform(scrollYProgress, [0, 1], ["0px", "-56px"]);
  const animated = canObserve();

  return (
    <section
      ref={ref}
      aria-labelledby="hero-title"
      className="relative isolate overflow-hidden border-b border-line"
    >
      <CropMarks className="inset-3 sm:inset-6" />
      <Ruler className="left-3 text-foreground sm:left-6" />
      <div className="mx-auto flex min-h-[calc(100svh-3.6rem)] max-w-384 flex-col justify-between px-6 pb-10 pt-12 sm:px-14 sm:pt-16">
        <div className="eyebrow flex flex-wrap items-center justify-between gap-x-6 gap-y-1 text-ink-secondary">
          <span>Audit № 001</span>
          <span className="text-redline">Placement preparation · evidence only</span>
        </div>

        <m.div
          style={animated ? { y, opacity: fade } : undefined}
          className="py-10 sm:py-14"
        >
          <h1
            id="hero-title"
            className="serif text-[clamp(3.1rem,10.6vw,10.5rem)] font-medium leading-[0.92] tracking-[-0.045em] text-foreground"
          >
            <MaskedText text="Your resume says you're ready." delay={0.15} />
            <br />
            <span className="redline-late inline-block">
              <MaskedText
                text="Let's prove it."
                delay={0.75}
                className="italic font-normal"
              />
            </span>
          </h1>
        </m.div>

        <div className="grid items-end gap-8 sm:grid-cols-[minmax(0,32rem)_1fr]">
          <m.div
            initial={animated ? { opacity: 0, y: 18 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: EASE, delay: 1.35 }}
          >
            <p className="text-lg leading-relaxed text-ink-secondary">
              UNBLUFF questions every claim on your resume, judges your code against
              hidden tests, and builds your study plan only from what those records show.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Magnetic>
                <Link to="/setup" className={buttonClasses("primary", "lg")}>
                  Audit My Readiness
                </Link>
              </Magnetic>
              <DemoReportButton variant="secondary" size="lg" />
            </div>
            <p className="mt-4 max-w-md text-sm text-ink-muted">
              The demo report uses synthetic data and is labelled as such. Nothing is
              saved until you sign in.
            </p>
          </m.div>
          <div className="justify-self-end lg:w-[min(100%,26rem)]">
            <m.div style={animated ? { y: keyY } : undefined} className="hidden lg:block">
              <VerdictKey />
            </m.div>
            <m.a
              href="#interrogation"
              aria-label="Scroll to how a claim is tested"
              initial={animated ? { opacity: 0 } : false}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8, delay: 1.7 }}
              className="eyebrow group mt-5 hidden items-center justify-end gap-3 text-ink-secondary sm:flex"
            >
              Scroll: the audit begins
              <span
                aria-hidden="true"
                className="relative block h-10 w-px overflow-hidden bg-line-strong"
              >
                <span className="absolute inset-x-0 top-0 h-1/2 animate-scroll-cue bg-foreground" />
              </span>
            </m.a>
          </div>
        </div>
      </div>
    </section>
  );
};
