import React, { useRef } from "react";
import { m } from "motion/react";
import { canObserve } from "./ease";
import { RISE, DUR, settle, stepDelay } from "./tokens";
import { useSeen } from "./useSeen";

type Tag = "div" | "section" | "p" | "li" | "ul" | "ol" | "header" | "span";
const TAGS = { div: m.div, section: m.section, p: m.p, li: m.li, ul: m.ul, ol: m.ol, header: m.header, span: m.span } as const;

/**
 * A block rising into place when it enters the viewport (immediately, if it is already there). Content is in the page
 * from the first paint in tests, with reduced motion and in browsers that cannot observe, and is never made to wait for
 * the animation: opacity and a short rise only.
 *
 * `index` staggers siblings (capped, see MAX_STAGGER); give the group a `key` that changes with its data to replay it.
 */
export const Enter: React.FC<{
  children?: React.ReactNode;
  as?: Tag;
  index?: number;
  delay?: number;
  y?: number;
  duration?: number;
  className?: string;
  id?: string;
  role?: string;
  "aria-label"?: string;
  "aria-live"?: "polite" | "assertive" | "off";
  "data-slug"?: string;
}> = ({ children, as = "div", index = 0, delay = 0, y = RISE.md, duration = DUR.base, className, ...rest }) => {
  const ref = useRef<HTMLElement>(null);
  const animated = canObserve();
  const seen = useSeen(ref as React.RefObject<Element>, "0px 0px -6% 0px");
  const Tag = TAGS[as] as React.ElementType;
  return (
    <Tag
      ref={ref}
      className={className}
      initial={animated ? { opacity: 0, y } : false}
      animate={animated ? (seen ? { opacity: 1, y: 0 } : { opacity: 0, y }) : undefined}
      transition={settle(duration, delay + stepDelay(index))}
      {...rest}
    >
      {children}
    </Tag>
  );
};
