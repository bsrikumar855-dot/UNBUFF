import { useEffect, useState } from "react";

/**
 * True when a scroll-pinned, scroll-driven sequence is appropriate: a wide screen and no request to reduce motion.
 * Everywhere else (phones, reduced motion, tests) the same content is shown as an ordinary static section.
 */
export function usePinnedStory(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(
      "(min-width: 1024px) and (prefers-reduced-motion: no-preference)"
    );
    const update = () => setOn(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return on;
}
