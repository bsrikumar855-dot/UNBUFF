import React, { Suspense, lazy, useCallback, useRef, useState } from "react";
import { api } from "@/api/endpoints";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { parseVariables } from "@/lib/graphqlLab";
import type { LabExecuteResponse, LabTrainingSchemaResponse } from "@/types/contract";
import { ResultPanel, SchemaExplorer } from "./LabBits";

const GraphqlEditor = lazy(() => import("./GraphqlEditor"));
const field =
  "w-full rounded-md border border-line-strong bg-white px-3 py-2 text-sm font-mono";

export interface QueryWorkbenchProps {
  query: string;
  onQueryChange: (q: string) => void;
  variablesText: string;
  onVariablesChange: (v: string) => void;
  /** Used by "Reset to starter code". */
  starter: { query: string; variables: string };
  schema: LabTrainingSchemaResponse | null;
  schemaError: unknown;
  onRetrySchema: () => void;
  /** Extra controls next to Run (for example "Check my answer"). */
  actions?: React.ReactNode;
}

/**
 * Edit a GraphQL document, supply variables as JSON, run it against the training API and read the answer. Running is
 * always a real request: nothing here decides whether a query is valid or correct.
 */
export const QueryWorkbench: React.FC<QueryWorkbenchProps> = ({
  query,
  onQueryChange,
  variablesText,
  onVariablesChange,
  starter,
  schema,
  schemaError,
  onRetrySchema,
  actions,
}) => {
  const [response, setResponse] = useState<LabExecuteResponse | null>(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<unknown>(null);
  const [plain, setPlain] = useState(false);
  const [resetNote, setResetNote] = useState<string | null>(null);
  const insertRef = useRef<((t: string) => void) | null>(null);
  const parsed = parseVariables(variablesText);

  const run = useCallback(async () => {
    if (!parsed.ok) return;
    setRunning(true);
    setRunError(null);
    setResetNote(null);
    try {
      setResponse(await api.executeLab({ query, variables: parsed.value }));
    } catch (e) {
      setRunError(e);
    } finally {
      setRunning(false);
    }
  }, [parsed.ok, parsed.ok ? parsed.value : null, query]); // eslint-disable-line react-hooks/exhaustive-deps

  const resetData = async () => {
    setResetNote(null);
    try {
      const r = await api.resetLabTrainingData();
      setResetNote(
        `Your training data is back to its starting state (${r.application_count} applications).`
      );
    } catch (e) {
      setRunError(e);
    }
  };

  const insert = (text: string) => {
    if (plain || !insertRef.current)
      onQueryChange(`${query}${query.endsWith("\n") || query === "" ? "" : "\n"}${text}`);
    else insertRef.current(text);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-ink-primary">Query</h3>
          <div className="flex flex-wrap gap-2">
            <label className="flex items-center gap-1.5 text-xs text-ink-secondary">
              <input
                type="checkbox"
                checked={plain}
                onChange={(e) => setPlain(e.target.checked)}
              />
              Plain text editor
            </label>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                onQueryChange(starter.query);
                onVariablesChange(starter.variables);
                setResponse(null);
              }}
            >
              Reset to starter code
            </Button>
          </div>
        </div>
        {plain ? (
          <textarea
            aria-label="GraphQL query"
            className={`${field} h-64 resize-y`}
            spellCheck={false}
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
          />
        ) : (
          <Suspense fallback={<LoadingState message="Loading editor…" />}>
            <div className="overflow-hidden rounded-md border border-line-strong">
              <GraphqlEditor
                value={query}
                onChange={onQueryChange}
                ariaLabel="GraphQL query"
                onReady={(fn) => (insertRef.current = fn)}
              />
            </div>
          </Suspense>
        )}

        <div>
          <label
            htmlFor="lab-variables"
            className="mb-1 block text-sm font-medium text-ink-primary"
          >
            Variables (JSON, optional)
          </label>
          <textarea
            id="lab-variables"
            rows={3}
            className={field}
            spellCheck={false}
            value={variablesText}
            onChange={(e) => onVariablesChange(e.target.value)}
            aria-invalid={!parsed.ok}
            aria-describedby={parsed.ok ? undefined : "lab-variables-error"}
          />
          {!parsed.ok && (
            <p
              id="lab-variables-error"
              role="alert"
              className="mt-1 text-sm text-ink-primary"
            >
              {parsed.message}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => void run()}
            disabled={running || !parsed.ok || query.trim() === ""}
          >
            {running ? "Running…" : "Run query"}
          </Button>
          {actions}
          <Button variant="ghost" size="sm" onClick={() => void resetData()}>
            Reset my training data
          </Button>
        </div>
        {resetNote && (
          <p role="status" className="text-sm text-ink-secondary">
            {resetNote}
          </p>
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        <div>
          <h3 className="mb-2 text-sm font-semibold text-ink-primary">Response</h3>
          {running && <LoadingState message="Running your query…" />}
          {runError !== null && (
            <ErrorState error={runError} onRetry={() => void run()} />
          )}
          {!running && runError === null && response === null && (
            <p className="rounded-md border border-dashed border-line-strong p-4 text-sm text-ink-muted">
              Run a query to see the server's response here.
            </p>
          )}
          {response && !running && <ResultPanel response={response} />}
        </div>
        <details open className="rounded-md border border-line p-3">
          <summary className="cursor-pointer text-sm font-semibold text-ink-primary">
            Schema reference
          </summary>
          <div className="mt-3">
            {schemaError !== null && (
              <ErrorState error={schemaError} onRetry={onRetrySchema} />
            )}
            {schemaError === null && schema === null && (
              <LoadingState message="Loading the schema…" />
            )}
            {schema && <SchemaExplorer schema={schema} onInsert={insert} />}
          </div>
        </details>
      </div>
    </div>
  );
};
