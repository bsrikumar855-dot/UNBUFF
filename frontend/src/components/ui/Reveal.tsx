import React, { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

/**
 * Reveals its content once as it scrolls into view (opacity and a small rise; transform and opacity only, so it never
 * shifts layout). Content is fully visible with no JavaScript, with IntersectionObserver unavailable, or when the user
 * prefers reduced motion. Use it for a few important blocks, not for everything.
 */
export const Reveal: React.FC<{
  children: React.ReactNode;
  className?: string;
  /** Milliseconds, for staggering siblings that enter together. */
  delay?: number;
  as?: "div" | "section" | "li";
}> = ({ children, className, delay = 0, as: Tag = "div" }) => {
  const ref = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    const reduce =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!el || reduce || typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <Tag
      ref={ref as React.RefObject<never>}
      style={{ transitionDelay: shown ? `${delay}ms` : undefined }}
      className={cn(
        "transition-[opacity,transform] duration-500 ease-out motion-reduce:transition-none",
        shown
          ? "translate-y-0 opacity-100"
          : "translate-y-3 opacity-0 motion-reduce:translate-y-0 motion-reduce:opacity-100",
        className
      )}
    >
      {children}
    </Tag>
  );
};
