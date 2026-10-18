import React, { useState } from "react";
import { api } from "@/api/endpoints";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { HELP_ACTIONS, PHASE_LABEL, parseVariables } from "@/lib/graphqlLab";
import type { LabHelpAction, LabHelpResponse } from "@/types/contract";

/**
 * Contextual help from the AI mentor. The server runs your query itself and tells the mentor what really happened, so
 * explanations are based on the real result. The mentor never sees the answer to an exercise. If it is unavailable,
 * everything else in the Lab keeps working.
 */
export const HelpPanel: React.FC<{
  query: string;
  variablesText: string;
  exerciseId?: string;
}> = ({ query, variablesText, exerciseId }) => {
  const [busy, setBusy] = useState<LabHelpAction | null>(null);
  const [message, setMessage] = useState("");
  const [answer, setAnswer] = useState<LabHelpResponse | null>(null);
  const [error, setError] = useState<unknown>(null);
  const vars = parseVariables(variablesText);

  const ask = async (action: LabHelpAction) => {
    setBusy(action);
    setError(null);
    try {
      setAnswer(
        await api.labHelp({
          action,
          ...(exerciseId ? { exercise_id: exerciseId } : {}),
          ...(query.trim() ? { query } : {}),
          ...(vars.ok && vars.value ? { variables: vars.value } : {}),
          ...(message.trim() ? { message: message.trim() } : {}),
        })
      );
    } catch (e) {
      setAnswer(null);
      setError(e);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section
      aria-labelledby="lab-help-h"
      className="rounded-lg border border-line bg-surface p-4"
    >
      <h3 id="lab-help-h" className="text-sm font-semibold text-ink-primary">
        Ask the AI mentor
      </h3>
      <p className="mt-1 text-xs text-ink-muted">
        The mentor sees your query, the real result and the schema types involved. It does
        not see the answer to the exercise, so it will give hints rather than the
        solution.
      </p>
      <label
        htmlFor="lab-help-message"
        className="mt-3 block text-sm font-medium text-ink-primary"
      >
        Your question (optional)
      </label>
      <input
        id="lab-help-message"
        maxLength={500}
        className="mt-1 w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
      />
      <div className="mt-3 flex flex-wrap gap-2">
        {HELP_ACTIONS.map((a) => (
          <Button
            key={a.action}
            variant="outline"
            size="sm"
            disabled={busy !== null || (a.needsQuery && query.trim() === "")}
            onClick={() => void ask(a.action)}
          >
            {a.label}
          </Button>
        ))}
      </div>
      {busy && <LoadingState className="mt-3" message="The mentor is thinking…" />}
      {error !== null && <ErrorState className="mt-3" error={error} />}
      {answer && !busy && (
        <div
          className="mt-3 rounded-md border border-line bg-surface-50 p-3 text-sm"
          aria-label="Mentor answer"
        >
          {answer.mock && (
            <p className="mb-2 text-xs font-medium text-ink-muted">
              Mock mentor: this is a built-in stand-in, not a live model.
            </p>
          )}
          <p className="whitespace-pre-wrap text-ink-primary">{answer.reply}</p>
          {answer.query_status && (
            <p className="mt-2 text-xs text-ink-muted">
              Based on what the server really did with your query:{" "}
              {PHASE_LABEL[answer.query_status.phase]}
              {answer.query_status.error_count > 0
                ? ` (${answer.query_status.error_count} error${answer.query_status.error_count === 1 ? "" : "s"})`
                : ""}
              .
            </p>
          )}
          {answer.memory_saved.length > 0 && (
            <p className="mt-2 text-xs text-ink-muted">
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
