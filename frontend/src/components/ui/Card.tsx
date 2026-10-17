import React from "react";
import { cn } from "@/lib/cn";

export const Card: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className,
  ...props
}) => (
  <div
    className={cn("rounded-lg border border-line bg-white p-6", className)}
    {...props}
  />
);
