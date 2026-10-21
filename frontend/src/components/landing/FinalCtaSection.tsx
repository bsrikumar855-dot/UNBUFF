import React, { useRef } from "react";
import { Link } from "react-router-dom";
import { m } from "motion/react";
import { DemoReportButton } from "@/components/common/DemoReportButton";
import { Magnetic } from "@/components/motion/Magnetic";
import { MaskedText } from "@/components/motion/MaskedText";
import { EASE, canObserve } from "@/components/motion/ease";
import { useSeen } from "@/components/motion/useSeen";
import { buttonClasses } from "@/lib/buttonClasses";

/** The closing: a question, the two ways in, and the wordmark set enormous, rising letter by letter. */
export const FinalCtaSection: React.FC = () => {
  const animated = canObserve();
  const markRef = useRef<HTMLDivElement>(null);
  const seen = useSeen(markRef, "0px 0px -5% 0px");
  const letters = "UNBLUFF".split("");
  return (
    <section
      aria-labelledby="cta-title"
      className="relative overflow-hidden bg-foreground text-background"
    >
      <div className="mx-auto max-w-384 px-6 pt-20 sm:px-14 sm:pt-32">
        <h2
          id="cta-title"
          className="serif max-w-5xl text-[clamp(2.6rem,7.4vw,7rem)] font-medium leading-[0.98] tracking-[-0.035em]"
        >
          <MaskedText text="Find out what you can actually" inView />{" "}
          <MaskedText text="defend." inView delay={0.45} className="italic font-normal" />
        </h2>
        <div className="mt-12 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Magnetic>
            <Link
              to="/setup"
              className={buttonClasses(
                "primary",
                "lg",
                "bg-background text-foreground hover:bg-card"
              )}
            >
              Audit My Readiness
            </Link>
          </Magnetic>
          <DemoReportButton
            variant="secondary"
            size="lg"
            className="[&_button]:border-background/40 [&_button]:bg-transparent [&_button]:text-background [&_button:hover]:border-background [&_button:hover]:bg-background/10"
          />
        </div>
      </div>
      <div ref={markRef} aria-hidden="true" className="mt-16 select-none overflow-hidden pb-0 sm:mt-24">
        <div className="mx-auto flex max-w-384 justify-between px-4 sm:px-10">
          {letters.map((l, i) => (
            <span
              key={`${l}-${i}`}
              className="inline-block overflow-hidden leading-[0.82]"
            >
              <m.span
                className="serif relative inline-block text-[clamp(4rem,19.5vw,19rem)] font-medium tracking-[-0.06em] will-change-transform"
                initial={animated ? { y: "105%" } : false}
                animate={{ y: seen || !animated ? "0%" : "105%" }}
                transition={{ duration: 0.9, ease: EASE, delay: 0.06 * i }}
              >
                {l}
                {i >= 2 && (
                  <span className="absolute inset-x-[6%] bottom-[14%] h-[0.045em] bg-redline" />
                )}
              </m.span>
            </span>
          ))}
        </div>
      </div>
      <p className="sr-only">UNBLUFF</p>
    </section>
  );
};
