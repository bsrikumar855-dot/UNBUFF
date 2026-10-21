import React, { useState } from "react";
import { api } from "@/api/endpoints";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import type {
  PlacementAssistantResponse,
  PlacementDashboard,
  PlacementProposedChange,
} from "@/types/contract";

const QUICK = [
  "What should I study today?",
  "Why did you prioritize this?",
  "What changed since last week?",
  "Can I finish the remaining tasks before my placement date?",
  "Explain my weakest verified skill",
  "Give me a lighter plan for today",
  "Help me revise the topic I failed yesterday",
];

/**
 * Ask about the plan. The answer in the first box is built by the application from your stored plan and results and is
 * always available. The AI mentor adds an explanation when it can. Proposed changes do nothing until you press Apply.
 */
export const AssistantPanel: React.FC<{
  onDashboard: (d: PlacementDashboard) => void;
}> = ({ onDashboard }) => {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<PlacementAssistantResponse | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [applied, setApplied] = useState<string | null>(null);
  const [applying, setApplying] = useState<number | null>(null);

  const ask = async (text: string) => {
    const t = text.trim();
    if (t === "") return;
    setBusy(true);
    setError(null);
    setApplied(null);
    try {
      setAnswer(await api.placementAssistant(t));
    } catch (e) {
      setAnswer(null);
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const apply = async (c: PlacementProposedChange, i: number) => {
    setApplying(i);
    setError(null);
    try {
      const { description: _d, ...change } = c;
      const r = await api.applyPlacementChange(change);
      setApplied(r.summary);
      setAnswer((a) =>
        a ? { ...a, proposed_changes: a.proposed_changes.filter((_x, j) => j !== i) } : a
      );
      onDashboard(r.dashboard);
    } catch (e) {
      setError(e);
    } finally {
      setApplying(null);
    }
  };

  return (
    <section aria-labelledby="assistant-h" className="border-t border-ink-primary pt-4">
      <h2 id="assistant-h" className="text-heading font-semibold text-ink-primary">
        Ask about your plan
      </h2>
      <p className="mt-1 text-sm text-ink-secondary">
        Answers use your stored plan and results. Nothing changes unless you apply a
        proposed change.
      </p>
      <div className="mt-3 flex flex-col items-start gap-0.5">
        {QUICK.map((q) => (
          <Button
            key={q}
            variant="ghost"
            size="sm"
            className="h-auto min-h-9 justify-start whitespace-normal px-2 text-left font-normal underline decoration-line-strong underline-offset-4 hover:decoration-ink-primary"
            disabled={busy}
            onClick={() => void ask(q)}
          >
            {q}
          </Button>
        ))}
      </div>
      <form
        className="mt-3 flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(message);
        }}
      >
        <label htmlFor="assistant-q" className="sr-only">
          Your question about the plan
        </label>
        <input
          id="assistant-q"
          className="min-h-10 min-w-40 flex-1 rounded-md border border-line-strong bg-surface px-3 py-2 text-sm"
          maxLength={500}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="For example: I can only study 45 minutes a day"
        />
        <Button type="submit" disabled={busy || message.trim() === ""}>
          Ask
        </Button>
      </form>
      {busy && <LoadingState className="mt-3" message="Looking at your plan…" />}
      {error !== null && <ErrorState className="mt-3" error={error} />}
      {applied && (
        <p role="status" className="mt-3 text-sm text-ink-primary">
          {applied}
        </p>
      )}
      {answer && !busy && (
        <div className="mt-3 flex flex-col gap-3">
          <div
            aria-label="Answer from your plan"
            className="whitespace-pre-wrap border-l-2 border-ink-primary bg-surface-100/60 p-3 text-sm text-ink-primary"
          >
            {answer.answer}
          </div>
          {answer.mentor_reply && (
            <div
              aria-label="AI mentor explanation"
              className="border-l-2 border-line-strong p-3 text-sm"
            >
              {answer.mentor.mock && (
                <p className="mb-1 text-xs font-medium text-ink-muted">
                  Mock mentor: a built-in stand-in, not a live model.
                </p>
              )}
              <p className="whitespace-pre-wrap text-ink-primary">
                {answer.mentor_reply}
              </p>
            </div>
          )}
          {!answer.mentor.available && (
            <p role="note" className="text-xs text-ink-muted">
              The AI mentor could not add an explanation (
              {answer.mentor.error ?? "unavailable"}). The answer above is complete
              without it.
            </p>
          )}
          {answer.proposed_changes.length > 0 && (
            <ul aria-label="Proposed changes" className="flex flex-col gap-2">
              {answer.proposed_changes.map((c, i) => (
                <li
                  key={`${c.kind}-${i}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line p-2 text-sm"
                >
                  <span className="text-ink-primary">{c.description}</span>
                  <Button
                    size="sm"
                    disabled={applying !== null}
                    onClick={() => void apply(c, i)}
                  >
                    {applying === i ? "Applying…" : "Apply this change"}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {answer.memory_saved.length > 0 && (
            <p className="text-xs text-ink-muted">
              Remembered from your message:{" "}
              {answer.memory_saved.map((m) => m.content).join("; ")}. You can review or
              delete this in AI mentor memory.
            </p>
          )}
        </div>
      )}
    </section>
  );
};
