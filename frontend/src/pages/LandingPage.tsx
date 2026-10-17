import React from "react";
import { HeroSection } from "@/components/landing/HeroSection";
import { CoreLoopSection } from "@/components/landing/CoreLoopSection";
import { InterrogationLevelsSection } from "@/components/landing/InterrogationLevelsSection";
import { EvidenceSection } from "@/components/landing/EvidenceSection";
import { FinalCtaSection } from "@/components/landing/FinalCtaSection";

export const LandingPage: React.FC = () => {
  return (
    <>
      <HeroSection />
      <CoreLoopSection />
      <InterrogationLevelsSection />
      <EvidenceSection />
      <FinalCtaSection />
    </>
  );
};
