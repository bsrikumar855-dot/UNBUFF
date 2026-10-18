import React, { useRef } from "react";
import { m, useMotionValue, useSpring } from "motion/react";
import { SPRING_GLIDE, hasFinePointer, prefersReducedMotion } from "./ease";

/**
 * Pulls its child a few pixels toward the pointer while it is near, then lets go. Only for large call-to-action
 * buttons, only with a mouse or trackpad, never under reduced motion; the child stays a normal focusable element and
 * its hit area does not move away from the pointer (the pull is small relative to the control).
 */
export const Magnetic: React.FC<{
  children: React.ReactNode;
  strength?: number;
  className?: string;
}> = ({ children, strength = 0.28, className }) => {
  const ref = useRef<HTMLDivElement>(null);
  const x = useSpring(useMotionValue(0), SPRING_GLIDE);
  const y = useSpring(useMotionValue(0), SPRING_GLIDE);
  const on = () => hasFinePointer() && !prefersReducedMotion();

  return (
    <m.div
      ref={ref}
      style={{ x, y }}
      className={className}
      onPointerMove={(e) => {
        if (!on() || !ref.current) return;
        const r = ref.current.getBoundingClientRect();
        x.set((e.clientX - (r.left + r.width / 2)) * strength);
        y.set((e.clientY - (r.top + r.height / 2)) * strength);
      }}
      onPointerLeave={() => {
        x.set(0);
        y.set(0);
      }}
    >
      {children}
    </m.div>
  );
};
