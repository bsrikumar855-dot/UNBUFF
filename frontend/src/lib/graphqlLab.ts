import type {
  LabDifficulty,
  LabErrorCategory,
  LabExerciseType,
  LabHelpAction,
  LabModuleStatus,
  LabPhase,
} from "@/types/contract";

export const STATUS_LABEL: Record<LabModuleStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  completed: "Completed",
};

export const DIFFICULTY_LABEL: Record<LabDifficulty, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

export const TYPE_LABEL: Record<LabExerciseType, string> = {
  query: "Write a query",
  mutation: "Write a mutation",
  multiple_choice: "Multiple choice",
  schema_reading: "Read the schema",
  explanation: "Explain in words",
};

/** Where the request stopped, in plain words. */
export const PHASE_LABEL: Record<LabPhase, string> = {
  ok: "Ran successfully",
  syntax: "Syntax error: the text is not valid GraphQL, so nothing was checked or run",
  validation:
    "Validation error: the query does not fit the schema (or a limit), so nothing ran",
  variables: "Variables error: the variable values could not be used, so nothing ran",
  execution: "Ran, but the server reported errors",
};

export const CATEGORY_LABEL: Record<LabErrorCategory, string> = {
  syntax: "Syntax",
  validation: "Validation",
  variables: "Variables",
  execution: "Execution",
  authorization: "Authorization",
  limits: "Limit",
};

export const HELP_ACTIONS: {
  action: LabHelpAction;
  label: string;
  needsQuery: boolean;
}[] = [
  { action: "explain_query", label: "Explain this query", needsQuery: true },
  { action: "explain_error", label: "Why does it fail?", needsQuery: true },
  { action: "hint", label: "Give me a hint", needsQuery: false },
  { action: "explain_schema", label: "Explain the schema types", needsQuery: false },
  { action: "explain_result", label: "Explain the result", needsQuery: true },
  { action: "practice_question", label: "Make a practice question", needsQuery: false },
];

export const conceptLabel = (c: string): string => c.replace(/-/g, " ");

export type ParsedVariables =
  { ok: true; value: Record<string, unknown> | null } | { ok: false; message: string };

/** Variables are JSON. An empty box means no variables. */
export function parseVariables(text: string): ParsedVariables {
  if (text.trim() === "") return { ok: true, value: null };
  try {
    const v: unknown = JSON.parse(text);
    if (v === null || typeof v !== "object" || Array.isArray(v))
      return {
        ok: false,
        message: 'Variables must be a JSON object, like { "id": "c1" }.',
      };
    return { ok: true, value: v as Record<string, unknown> };
  } catch (e) {
    return {
      ok: false,
      message: `Variables are not valid JSON: ${e instanceof Error ? e.message : "parse error"}`,
    };
  }
}

export function formatVariables(v: Record<string, unknown> | null | undefined): string {
  return v && Object.keys(v).length > 0 ? JSON.stringify(v, null, 2) : "";
}

/** A fresh idempotency key for one submission. */
export function newAttemptId(): string {
  const c = globalThis.crypto;
  const raw =
    c && "randomUUID" in c
      ? c.randomUUID()
      : `${Date.now()}${Math.random().toString(36).slice(2)}`;
  return `at_${raw.replace(/[^A-Za-z0-9]/g, "")}`.slice(0, 64);
}
