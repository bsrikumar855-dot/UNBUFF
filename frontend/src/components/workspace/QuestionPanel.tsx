import React, { useEffect, useId, useRef, useState } from "react";
import type { TurnResponse } from "@/types/contract";
import { Button } from "@/components/ui/button";

interface QuestionPanelProps {
  turn: TurnResponse;
  busy: boolean;
  onSubmit: (answer: string) => void;
}

export const IDK = "I don't know";

/** The open question and the answer form. Focus moves to each new question. */
export const QuestionPanel: React.FC<QuestionPanelProps> = ({ turn, busy, onSubmit }) => {
  const [answer, setAnswer] = useState("");
  const headingRef = useRef<HTMLHeadingElement>(null);
  const answerId = useId();

  // New question → clear the textarea and move focus to the question.
  useEffect(() => {
    setAnswer("");
    headingRef.current?.focus();
  }, [turn.question, turn.level, turn.turn]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (answer.trim()) onSubmit(answer.trim());
  };

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
        <span>Level {turn.level}</span>
        {turn.turn === "clarify" && (
          <span className="rounded-full bg-verdict-shaky-bg px-2.5 py-0.5 normal-case text-verdict-shaky-fg">
            Follow-up — be more specific
          </span>
        )}
        {turn.mode === "retest" && (
          <span className="rounded-full bg-redline-soft px-2.5 py-0.5 normal-case text-redline-dark">Retest</span>
        )}
      </div>
      <h2 ref={headingRef} tabIndex={-1} className="mb-4 text-lg font-semibold text-ink-primary">
        {turn.question}
      </h2>
      <form onSubmit={submit} className="grid gap-3">
        <label htmlFor={answerId} className="text-sm font-medium text-ink-secondary">
          Your answer
        </label>
        <textarea
          id={answerId}
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          rows={7}
          maxLength={4000}
          disabled={busy}
          className="w-full rounded-2xl border border-line-strong bg-white/70 p-3.5 text-sm"
        />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" className="rounded-full" disabled={busy || !answer.trim()}>
            Submit answer
          </Button>
          <Button type="button" variant="outline" className="rounded-full bg-white/70" disabled={busy} onClick={() => onSubmit(IDK)}>
            I don&apos;t know
          </Button>
        </div>
      </form>
    </div>
  );
};
