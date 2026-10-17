import React from "react";
import { Lightbulb } from "lucide-react";
import type { FixTask } from "@/types/contract";
import { InlineMarkdown } from "./InlineMarkdown";

interface FixTaskCardProps {
  task: FixTask;
  headingLevel?: "h2" | "h3";
  children?: React.ReactNode;
}

/** Fix task: root cause first, then a short explanation and one hands-on exercise. */
export const FixTaskCard: React.FC<FixTaskCardProps> = ({ task, headingLevel = "h3", children }) => {
  const Heading = headingLevel;
  return (
    <section
      aria-label="Fix task"
      className="rounded-lg border border-primary/30 bg-primary-soft p-5 text-sm text-ink-secondary"
    >
      <Heading className="mb-3 flex items-center gap-2 text-base font-semibold text-ink-primary">
        <Lightbulb size={18} aria-hidden="true" className="text-primary" />
        Fix task
      </Heading>
      {task.root_cause && (
        <p className="mb-3 rounded-md border border-primary/30 bg-white px-3 py-2 text-ink-primary">
          <span className="font-semibold">Root cause:</span> {task.root_cause}
        </p>
      )}
      <InlineMarkdown text={task.explanation} className="mb-3" />
      <p className="mb-1 font-semibold text-ink-primary">Exercise</p>
      <InlineMarkdown text={task.exercise} />
      {children}
    </section>
  );
};
