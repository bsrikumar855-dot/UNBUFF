import React from "react";
import { cn } from "@/lib/cn";

/**
 * "Waiting for the backend" indicator for the mentor: three dots that breathe in turn. It is shown only while a real
 * request is in flight, never as a staged typing effect, and it carries its message as text for screen readers. Under
 * reduced motion the dots are still, which keeps the same meaning.
 */
export const Thinking: React.FC<{ message: string; className?: string }> = ({ message, className }) => (
  <div role="status" aria-live="polite" className={cn("flex items-center gap-3 text-sm text-ink-secondary", className)}>
    <span aria-hidden="true" className="flex items-end gap-1">
      {[0, 1, 2].map((i) => (
        <span key={i} className="think-dot block h-1.5 w-1.5 rounded-full bg-ink-secondary" style={{ animationDelay: `${i * 160}ms` }} />
      ))}
    </span>
    {message}
  </div>
);
