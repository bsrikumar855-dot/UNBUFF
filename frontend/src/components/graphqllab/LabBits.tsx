import React, { useMemo, useState } from "react";
import { CATEGORY_LABEL, PHASE_LABEL } from "@/lib/graphqlLab";
import { cn } from "@/lib/cn";
import type {
  LabBlock,
  LabExecuteResponse,
  LabSchemaType,
  LabTrainingSchemaResponse,
} from "@/types/contract";

/** Renders lesson blocks. "Try it" blocks load the example into the workbench; they are never run automatically. */
export const LessonBlocks: React.FC<{
  blocks: LabBlock[];
  onTry?: (b: Extract<LabBlock, { kind: "try" }>) => void;
}> = ({ blocks, onTry }) => (
  <div className="flex flex-col gap-3 text-sm text-ink-secondary">
    {blocks.map((b, i) => {
      if (b.kind === "p") return <p key={i}>{b.text}</p>;
      if (b.kind === "list")
        return (
          <ul key={i} className="list-disc pl-5">
            {b.items.map((it, j) => (
              <li key={j}>{it}</li>
            ))}
          </ul>
        );
      if (b.kind === "code")
        return (
          <pre
            key={i}
            aria-label={b.language === "json" ? "Example JSON" : "Example GraphQL"}
            className="overflow-x-auto rounded-md border border-line bg-surface-50 p-3 font-mono text-xs text-ink-primary"
          >
            {b.code}
          </pre>
        );
      return (
        <div key={i}>
          <button
            type="button"
            onClick={() => onTry?.(b)}
            disabled={!onTry}
            className="rounded-md border border-line-strong bg-surface px-3 py-1.5 text-sm font-medium text-redline hover:bg-surface-100 disabled:text-ink-subtle"
          >
            Try it: {b.label}
          </button>
        </div>
      );
    })}
  </div>
);

/** The server's answer to a run. The stage that stopped the request is always stated in words. */
export const ResultPanel: React.FC<{ response: LabExecuteResponse }> = ({ response }) => {
  const { result } = response;
  const bad = response.phase !== "ok";
  return (
    <div className="flex flex-col gap-3" aria-label="Result">
      <p
        role="status"
        className={cn(
          "rounded-md border p-2 text-sm",
          bad
            ? "border-line-strong bg-surface-50 text-ink-primary"
            : "border-line bg-surface text-ink-secondary"
        )}
      >
        <strong>{PHASE_LABEL[response.phase]}.</strong>
        {response.operation ? ` Operation: ${response.operation}.` : ""}
        {response.state_changed ? " Your training data was changed." : ""}
        {response.training_data === "read_only"
          ? " Training data storage is unavailable, so mutations are turned off right now."
          : ""}
      </p>
      {result.errors && result.errors.length > 0 && (
        <ul aria-label="Errors" className="flex flex-col gap-2">
          {result.errors.map((e, i) => (
            <li key={i} className="rounded-md border border-line bg-surface p-2 text-sm">
              <span className="mr-2 rounded bg-surface-100 px-1.5 py-0.5 text-xs font-semibold text-ink-primary">
                {CATEGORY_LABEL[e.category]}
              </span>
              <span className="text-ink-primary">{e.message}</span>
              <span className="block text-xs text-ink-muted">
                {e.locations && e.locations.length > 0
                  ? `line ${e.locations[0]!.line}, column ${e.locations[0]!.column}`
                  : ""}
                {e.path
                  ? `${e.locations?.length ? " · " : ""}at ${e.path.join(".")}`
                  : ""}
                {e.code ? ` · code ${e.code}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
      {"data" in result && (
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-muted">
            data
          </p>
          <pre
            aria-label="Response data"
            className="max-h-80 overflow-auto rounded-md border border-line bg-surface-50 p-3 font-mono text-xs text-ink-primary"
          >
            {JSON.stringify(result.data, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
};

const field = "w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm";

/** The schema reference, built from the server's actual schema. Insert buttons add a field at the cursor. */
export const SchemaExplorer: React.FC<{
  schema: LabTrainingSchemaResponse;
  onInsert?: (text: string) => void;
}> = ({ schema, onInsert }) => {
  const [filter, setFilter] = useState("");
  const [open, setOpen] = useState<string>(schema.query_type);
  const types = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return f === ""
      ? schema.types
      : schema.types.filter(
          (t) =>
            t.name.toLowerCase().includes(f) ||
            t.fields.some((x) => x.name.toLowerCase().includes(f))
        );
  }, [schema, filter]);
  const current: LabSchemaType | undefined = schema.types.find((t) => t.name === open);

  return (
    <section aria-label="Schema explorer" className="flex flex-col gap-3">
      <p className="text-xs text-ink-muted">
        This is the real schema the server runs your queries against.
      </p>
      <label className="text-sm font-medium text-ink-primary" htmlFor="schema-filter">
        Find a type or field
      </label>
      <input
        id="schema-filter"
        className={field}
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="for example: Role"
      />
      <ul className="flex flex-wrap gap-1.5" aria-label="Types">
        {types.map((t) => (
          <li key={t.name}>
            <button
              type="button"
              aria-pressed={open === t.name}
              onClick={() => setOpen(t.name)}
              className={cn(
                "rounded-md border px-2 py-1 text-xs",
                open === t.name
                  ? "border-redline bg-redline-soft text-redline-dark"
                  : "border-line-strong bg-surface text-ink-secondary hover:bg-surface-100"
              )}
            >
              {t.name}
            </button>
          </li>
        ))}
        {types.length === 0 && (
          <li className="text-sm text-ink-muted">No types match.</li>
        )}
      </ul>
      {current && (
        <div className="rounded-md border border-line bg-surface p-3 text-sm">
          <h3 className="font-semibold text-ink-primary">
            {current.name}{" "}
            <span className="text-xs font-normal text-ink-muted">
              {current.kind.toLowerCase().replace("_", " ")}
            </span>
          </h3>
          {current.description && (
            <p className="mt-1 text-ink-secondary">{current.description}</p>
          )}
          {current.possible_types.length > 0 && (
            <p className="mt-1 text-ink-secondary">
              One of: {current.possible_types.join(", ")}
            </p>
          )}
          {current.enum_values.length > 0 && (
            <p className="mt-1 text-ink-secondary">
              Values: {current.enum_values.map((v) => v.name).join(", ")}
            </p>
          )}
          <ul className="mt-2 flex flex-col gap-2">
            {current.fields.map((f) => (
              <li key={f.name}>
                <code className="text-xs text-ink-primary">
                  {f.name}
                  {f.args.length > 0
                    ? `(${f.args.map((a) => `${a.name}: ${a.type}${a.default ? ` = ${a.default}` : ""}`).join(", ")})`
                    : ""}
                  : {f.type}
                </code>
                {onInsert && current.kind === "OBJECT" && (
                  <button
                    type="button"
                    className="ml-2 text-xs text-redline underline"
                    onClick={() => onInsert(f.name)}
                    aria-label={`Insert ${f.name} at the cursor`}
                  >
                    insert
                  </button>
                )}
                {f.description && (
                  <span className="block text-xs text-ink-muted">{f.description}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      <details className="text-xs text-ink-muted">
        <summary className="cursor-pointer">Limits that apply to every query</summary>
        <ul className="mt-1 list-disc pl-5">
          <li>
            At most {schema.limits.max_query_chars} characters and{" "}
            {schema.limits.max_variables_chars} characters of variables.
          </li>
          <li>
            At most {schema.limits.max_depth} levels deep and {schema.limits.max_fields}{" "}
            fields (fragments expanded).
          </li>
          <li>
            Responses larger than {schema.limits.max_result_bytes} bytes are refused.
          </li>
        </ul>
      </details>
    </section>
  );
};
