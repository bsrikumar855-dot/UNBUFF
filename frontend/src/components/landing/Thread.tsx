import React, { useRef } from "react";
import { m, useScroll, useTransform } from "motion/react";
import { canObserve } from "@/components/motion/ease";

/**
 * A red thread that is drawn down the page between two sections as you scroll to it, ending in a node. It joins the
 * chapters of the landing page into one continuous argument. Decorative and `aria-hidden`; without motion it is a full
 * line. The scroll link uses transform only and costs one observer for the whole page section.
 */
export const Thread: React.FC<{ label?: string }> = ({ label }) => {
  const ref = useRef<HTMLDivElement>(null);
  const animated = canObserve();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 92%", "end 55%"] });
  const scaleY = useTransform(scrollYProgress, [0, 1], [0, 1]);
  const node = useTransform(scrollYProgress, [0.85, 1], [0, 1]);
  return (
    <div ref={ref} aria-hidden="true" className="relative mx-auto flex h-28 w-full max-w-[96rem] flex-col items-center sm:h-36">
      <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-line" />
      <m.span style={animated ? { scaleY, originY: 0 } : undefined} className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-redline" />
      <m.span style={animated ? { opacity: node } : undefined} className="absolute bottom-0 left-1/2 block h-2 w-2 -translate-x-1/2 translate-y-1/2 rounded-full bg-redline" />
      {label && <span className="eyebrow absolute left-1/2 top-1/2 ml-5 hidden -translate-y-1/2 text-ink-muted sm:block">{label}</span>}
    </div>
  );
};
