import { useEffect } from "react";
import Lenis from "lenis";
import { hasFinePointer, prefersReducedMotion } from "./ease";

/**
 * Smooth, inertial scrolling for the marketing page only, with a mouse or trackpad. Native scrolling is untouched for
 * touch devices, for the signed-in app, and whenever the user asks for reduced motion. Keyboard scrolling, find in page
 * and anchor links keep working because Lenis drives the real window scroll.
 */
export function useLenis(enabled: boolean): void {
  useEffect(() => {
    if (!enabled || prefersReducedMotion() || !hasFinePointer()) return;
    const lenis = new Lenis({ lerp: 0.1, wheelMultiplier: 0.95, smoothWheel: true });
    let frame = 0;
    const raf = (time: number) => {
      lenis.raf(time);
      frame = requestAnimationFrame(raf);
    };
    frame = requestAnimationFrame(raf);
    return () => {
      cancelAnimationFrame(frame);
      lenis.destroy();
    };
  }, [enabled]);
}
