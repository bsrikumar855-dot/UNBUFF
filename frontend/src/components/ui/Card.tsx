import React from "react";
import { cn } from "@/lib/cn";

/**
 * A bounded region of related content. Use it for a real unit (a task, a result, a form), not as a default wrapper:
 * lists, tables and prose should sit on the page directly. One hairline, no shadow, no nesting.
 */
export const Card: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className,
  ...props
}) => (
  <div
    className={cn("rounded-lg border border-line bg-surface p-5 sm:p-6", className)}
    {...props}
  />
);
