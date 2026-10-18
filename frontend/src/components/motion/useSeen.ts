import { useEffect, useState, type RefObject } from "react";
import { canObserve } from "./ease";

/**
 * True once the element has scrolled into view (and stays true). Where IntersectionObserver does not exist (jsdom,
 * very old browsers) it is true immediately, so content is never left waiting for an observer that cannot fire.
 */
export function useSeen(ref: RefObject<Element>, rootMargin = "0px 0px -8% 0px"): boolean {
  const [seen, setSeen] = useState(!canObserve());
  useEffect(() => {
    const el = ref.current;
    if (seen || !el || !canObserve()) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, rootMargin, seen]);
  return seen;
}
