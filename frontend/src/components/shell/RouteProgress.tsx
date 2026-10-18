import React from "react";
import { useLocation } from "react-router-dom";
import { m } from "motion/react";
import { EASE, canObserve } from "@/components/motion/ease";

/**
 * A red hairline that sweeps across the top of the window every time the route changes, then fades. It confirms that
 * the navigation registered even when the next screen is already cached. Transform and opacity only; it never blocks
 * or delays the page, and it does not run under reduced motion (the animation library skips transforms there).
 */
export const RouteProgress: React.FC = () => {
  const { pathname } = useLocation();
  if (!canObserve()) return null;
  return (
    <m.div
      key={pathname}
      aria-hidden="true"
      initial={{ scaleX: 0, opacity: 1 }}
      animate={{ scaleX: 1, opacity: [1, 1, 0] }}
      transition={{ duration: 0.7, ease: EASE, opacity: { duration: 0.7, times: [0, 0.7, 1] } }}
      className="pointer-events-none fixed inset-x-0 top-0 z-[70] h-[3px] origin-left bg-redline"
    />
  );
};
