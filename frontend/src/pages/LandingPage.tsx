import React from "react";
import { m, useScroll, useSpring } from "motion/react";
import { HeroSection } from "@/components/landing/HeroSection";
import { Interrogation } from "@/components/landing/Interrogation";
import { CountsSection } from "@/components/landing/CountsSection";
import { IndexSection } from "@/components/landing/IndexSection";
import { FinalCtaSection } from "@/components/landing/FinalCtaSection";
import { useLenis } from "@/components/motion/useLenis";

/** A hairline of red along the top edge that fills as you read the page. */
const ReadingProgress: React.FC = () => {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 220, damping: 32, mass: 0.4 });
  return (
    <m.div
      aria-hidden="true"
      style={{ scaleX }}
      className="fixed inset-x-0 top-0 z-[60] h-[3px] origin-left bg-redline"
    />
  );
};

export const LandingPage: React.FC = () => {
  useLenis(true);
  return (
    <>
      <ReadingProgress />
      <HeroSection />
      <Interrogation />
      <CountsSection />
      <IndexSection />
      <FinalCtaSection />
    </>
  );
};
