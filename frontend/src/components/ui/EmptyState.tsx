import React from "react";
import { cn } from "@/lib/cn";

/**
 * An honest empty or unavailable state: what is missing, why, and the one thing to do about it.
 * Never styled as a success, and never filled with sample data.
 */
export const EmptyState: React.FC<{
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  /** "status" announces itself to screen readers when it appears after loading. */
  live?: boolean;
}> = ({ title, children, action, className, live }) => (
  <div
    role={live ? "status" : undefined}
    className={cn("border border-dashed border-line-strong px-5 py-6 sm:px-6", className)}
  >
    <p className="font-semibold text-ink-primary">{title}</p>
    {children && (
      <div className="mt-1 max-w-xl text-sm leading-relaxed text-ink-secondary">
        {children}
      </div>
    )}
    {action && <div className="mt-4">{action}</div>}
  </div>
);
