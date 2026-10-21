import React, { Suspense, lazy } from "react";
import { m } from "motion/react";
import { EASE, canObserve } from "@/components/motion/ease";

// The WebGL halftone is code-split: it loads after first paint and never blocks the headline.
const HalftoneReveal = lazy(() => import("@/components/reactbits/HalftoneReveal"));

const ART = "/landing/proof.png";
const ALT =
  "A résumé page under review. The claim “Expert in everything” is circled and struck out in red pen; the line “Judged: 14 of 14 tests” carries a green check.";

/**
 * A graphic that makes the argument without words: a printed halftone of a résumé that swells into full colour under
 * the cursor (or a finger). Red marks the claim that was struck out, green the result that was judged. Under reduced
 * motion the effect is static, and if WebGL is unavailable the plain picture is shown instead.
 */
export const ProofSection: React.FC = () => {
  const animated = canObserve();
  return (
    <section aria-labelledby="proof-title" className="border-b border-line">
      <div className="mx-auto grid max-w-384 items-center gap-10 px-6 py-16 sm:px-14 sm:py-24 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <m.div
          initial={animated ? { opacity: 0, y: 24 } : false}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.8, ease: EASE }}
        >
          <p className="eyebrow">00 · The mark</p>
          <h2
            id="proof-title"
            className="serif mt-4 text-[clamp(2rem,4.2vw,3.5rem)] font-medium leading-[1.04] tracking-[-0.03em]"
          >
            Ink is a claim. A judged result is proof.
          </h2>
          <p className="mt-5 max-w-md leading-relaxed text-ink-secondary">
            Move your cursor over the page. Under the dots is the résumé as it looks once
            it has been checked: one line struck out in red pen, one confirmed by hidden
            tests.
          </p>
        </m.div>
        <m.div
          role="img"
          aria-label={ALT}
          initial={animated ? { opacity: 0, scale: 0.97 } : false}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 1, ease: EASE }}
          style={{ backgroundImage: `url(${ART})` }}
          className="relative aspect-[16/11] w-full overflow-hidden rounded-[2rem] border border-line bg-surface-50 bg-contain bg-center bg-no-repeat shadow-float"
        >
          <Suspense fallback={null}>
            <HalftoneReveal
              src={ART}
              fit="contain"
              mode="duotone"
              shape="dot"
              cellSize={7}
              inkColor="#15130f"
              accentColor="#b3291a"
              paperColor="#f4f1ea"
              revealRadius={190}
              softness={0.7}
              linger={1.4}
              clickBurst
            />
          </Suspense>
        </m.div>
      </div>
    </section>
  );
};
