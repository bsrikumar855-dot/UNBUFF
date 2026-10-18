import React from "react";
import { LazyMotion, MotionConfig } from "motion/react";

/**
 * Loads the animation engine on demand (the full feature set, including layout animations, arrives in its own chunk
 * after first paint) and makes every motion component respect the user's reduced-motion setting: transform and layout
 * animations are skipped and opacity changes are kept.
 */
const loadFeatures = () => import("./features").then((m) => m.default);

export const MotionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <MotionConfig reducedMotion="user">
    <LazyMotion features={loadFeatures} strict>
      {children}
    </LazyMotion>
  </MotionConfig>
);
