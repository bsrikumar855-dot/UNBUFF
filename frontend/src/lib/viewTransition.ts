import { flushSync } from "react-dom";
import { useCallback } from "react";
import { useNavigate } from "react-router-dom";

type WithTransition = Document & { startViewTransition?: (update: () => void) => unknown };

/**
 * Runs a navigation inside a View Transition where the browser has one, so the old page content cross-fades out while
 * the new route is already live (see the `route-content` rules in index.css). The destination is never delayed: the
 * update is applied synchronously inside the transition. Where the API is missing, or the student asked for reduced
 * motion, the navigation simply happens and the page's own entrance animation is all there is.
 */
export function startRouteTransition(run: () => void): void {
  const doc = typeof document === "undefined" ? null : (document as WithTransition);
  const reduce = typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!doc || typeof doc.startViewTransition !== "function" || reduce) {
    run();
    return;
  }
  doc.startViewTransition(() => {
    flushSync(run);
  });
}

/** `go(path)` navigates with the route transition. */
export function useRouteNavigate(): (to: string) => void {
  const navigate = useNavigate();
  return useCallback((to: string) => startRouteTransition(() => navigate(to)), [navigate]);
}

/** True for a plain left click that should be handled in-app (not a new-tab or download gesture). */
export const isPlainClick = (e: React.MouseEvent): boolean => !e.defaultPrevented && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
