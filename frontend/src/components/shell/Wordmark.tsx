import React from "react";
import { Link } from "react-router-dom";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/cn";

/**
 * The UNBLUFF wordmark. The red pen underlines "BLUFF": the thing the product exists to catch.
 * Plain text (not an image) so it scales, prints and reads correctly for assistive technology.
 */
export const Wordmark: React.FC<{ className?: string; to?: string }> = ({
  className,
  to = routes.home,
}) => (
  <Link
    to={to}
    aria-label="UNBLUFF home"
    className={cn(
      "inline-flex items-baseline text-lg font-semibold uppercase tracking-[-0.04em] text-ink-primary",
      className
    )}
  >
    <span>Un</span>
    <span className="relative">
      bluff
      <span
        aria-hidden="true"
        className="absolute inset-x-0 -bottom-0.5 h-[3px] bg-redline"
      />
    </span>
  </Link>
);
