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
    <section aria-labelledby="cta-title" className="p-3 sm:p-6">
      <div className="relative isolate overflow-hidden rounded-[2.5rem] bg-[linear-gradient(165deg,#ffb4a6_0%,#f4705e_38%,#d8402f_72%,#b3291a_100%)] text-white shadow-[0_30px_70px_-30px_rgba(179,41,26,0.75),inset_0_0_0_1px_rgba(255,255,255,0.5),inset_0_1px_0_rgba(255,255,255,0.8)]">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -left-20 -top-24 -z-10 size-[34rem] rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.7),rgba(255,255,255,0)_66%)] blur-2xl motion-safe:animate-[liquid-drift-a_16s_ease-in-out_infinite]"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-32 -right-16 -z-10 size-[40rem] rounded-full bg-[radial-gradient(circle,rgba(120,16,8,0.6),rgba(120,16,8,0)_66%)] blur-2xl motion-safe:animate-[liquid-drift-b_20s_ease-in-out_infinite]"
        />
        <div className="mx-auto max-w-384 px-6 pt-16 sm:px-14 sm:pt-24">
          <h2
            id="cta-title"
            className="serif max-w-5xl text-[clamp(2.6rem,7.4vw,7rem)] font-medium leading-[0.98] tracking-[-0.035em]"
          >
            <MaskedText text="Find out what you can actually" inView />{" "}
            <MaskedText
              text="defend."
              inView
              delay={0.45}
              className="italic font-normal"
            />
          </h2>
          <div className="mt-12 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Magnetic>
              <Link
                to="/setup"
                className={buttonClasses(
                  "primary",
                  "lg",
                  "rounded-full bg-white text-redline shadow-[0_14px_28px_-12px_rgba(90,10,4,0.6)] hover:bg-white/90"
                )}
              >
                Audit My Readiness
              </Link>
            </Magnetic>
            <DemoReportButton
              variant="secondary"
              size="lg"
              className="[&_button]:rounded-full [&_button]:border-white/60 [&_button]:bg-white/15 [&_button]:text-white [&_button]:backdrop-blur-md [&_button:hover]:border-white [&_button:hover]:bg-white/25"
            />
          </div>
        </div>
        <div
          ref={markRef}
          aria-hidden="true"
          className="mt-16 select-none overflow-hidden pb-0 sm:mt-24"
        >
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
                    <span className="absolute inset-x-[6%] bottom-[14%] h-[0.045em] bg-white/90" />
                  )}
                </m.span>
              </span>
            ))}
          </div>
        </div>
        <p className="sr-only">UNBLUFF</p>
      </div>
    </section>
  );
};
