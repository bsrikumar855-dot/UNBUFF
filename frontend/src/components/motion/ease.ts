/** The product's motion vocabulary: one easing curve and two springs, so everything moves the same way. */
export const EASE = [0.2, 0.7, 0.2, 1] as const;

/** A deliberate, slightly heavy settle: used for stamps and things that land. */
export const SPRING_LAND = {
  type: "spring",
  stiffness: 420,
  damping: 20,
  mass: 0.9,
} as const;
/** A soft glide: used for indicators that move between positions. */
export const SPRING_GLIDE = { type: "spring", stiffness: 380, damping: 36 } as const;

/** True in a real browser that can run scroll-linked and observer-based effects (false in jsdom and old browsers). */
export const canObserve = (): boolean =>
  typeof window !== "undefined" &&
  typeof window.IntersectionObserver !== "undefined" &&
  // The inert observer installed by the unit-test setup never fires, so it does not count as a working one.
  !("__unbluffStub" in window.IntersectionObserver);

/** The user's own request to reduce motion. */
export const prefersReducedMotion = (): boolean =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** True for a primary pointer that can hover (a mouse or trackpad), where magnetic and hover effects make sense. */
export const hasFinePointer = (): boolean =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(hover: hover) and (pointer: fine)").matches;
