import {
  execute,
  GraphQLError,
  Kind,
  parse,
  validate,
  type DocumentNode,
  type FragmentDefinitionNode,
  type OperationDefinitionNode,
  type SelectionSetNode,
} from "graphql";
import type { LabError, LabErrorCategory, LabExecuteResponse, LabPhase } from "../types.js";
import { rootValue, trainingSchema, type LabContext } from "./trainingApi.js";

/** Hard limits on what a student's document may ask for. Reported to the student with the schema. */
export const LIMITS = {
  maxQueryChars: 4000,
  maxVariablesChars: 2000,
  maxTokens: 1500,
  maxDepth: 7,
  maxFields: 120,
  maxIntrospectionDepth: 20,
  maxIntrospectionFields: 450,
  maxResultBytes: 60_000,
  timeoutMs: 1500,
};

export interface ExecuteInput {
  query: string;
  variables?: Record<string, unknown> | null;
  operationName?: string | null;
}

const err = (message: string, category: LabErrorCategory, code: string | null, extra: Partial<LabError> = {}): LabError => ({ message, category, code, ...extra });
const fail = (phase: LabPhase, errors: LabError[], ctx: LabContext): LabExecuteResponse => ({
  phase,
  operation: null,
  result: { errors },
  state_changed: false,
  training_data: ctx.readOnly ? "read_only" : "per_student",
});

function toLabError(e: GraphQLError, category: LabErrorCategory): LabError {
  const code = typeof e.extensions?.code === "string" ? e.extensions.code : null;
  const wrapped = e.originalError !== undefined && e.originalError !== null && !(e.originalError instanceof GraphQLError);
  const cat: LabErrorCategory = code === "FORBIDDEN" ? "authorization" : category;
  return {
    // An unexpected exception is never shown to the student; only errors this API raised on purpose are.
    message: wrapped ? "The training API hit an unexpected problem. This is not caused by your query." : e.message,
    ...(e.locations && e.locations.length > 0 ? { locations: e.locations.map((l) => ({ line: l.line, column: l.column })) } : {}),
    ...(e.path && e.path.length > 0 ? { path: [...e.path] } : {}),
    category: cat,
    code: wrapped ? "INTERNAL" : code,
  };
}

// ---------------- structural limits (depth and size), computed with fragments expanded ----------------

interface Measure {
  depth: number;
  fields: number;
}
const CAP = 1_000_000;

function measureSelection(set: SelectionSetNode, fragments: Map<string, FragmentDefinitionNode>, memo: Map<string, Measure>): Measure {
  let depth = 0;
  let fields = 0;
  for (const sel of set.selections) {
    if (sel.kind === Kind.FIELD) {
      const sub = sel.selectionSet ? measureSelection(sel.selectionSet, fragments, memo) : { depth: 0, fields: 0 };
      depth = Math.max(depth, 1 + sub.depth);
      fields = Math.min(CAP, fields + 1 + sub.fields);
    } else if (sel.kind === Kind.INLINE_FRAGMENT) {
      const sub = measureSelection(sel.selectionSet, fragments, memo);
      depth = Math.max(depth, sub.depth);
      fields = Math.min(CAP, fields + sub.fields);
    } else {
      const name = sel.name.value;
      let m = memo.get(name);
      if (!m) {
        const def = fragments.get(name);
        m = def ? measureSelection(def.selectionSet, fragments, memo) : { depth: 0, fields: 0 };
        memo.set(name, m); // memoised, so a fragment that spreads itself many times cannot blow up the cost
      }
      depth = Math.max(depth, m.depth);
      fields = Math.min(CAP, fields + m.fields);
    }
  }
  return { depth, fields };
}

/** Returns the first limit this operation breaks, or null. Fragment cycles are rejected by validation before this runs. */
export function limitProblem(doc: DocumentNode, op: OperationDefinitionNode): LabError | null {
  const fragments = new Map<string, FragmentDefinitionNode>();
  for (const d of doc.definitions) if (d.kind === Kind.FRAGMENT_DEFINITION) fragments.set(d.name.value, d);
  const memo = new Map<string, Measure>();
  let normal: Measure = { depth: 0, fields: 0 };
  let intro: Measure = { depth: 0, fields: 0 };
  const expand = (set: SelectionSetNode): void => {
    for (const sel of set.selections) {
      if (sel.kind === Kind.FIELD) {
        const m = measureSelection({ kind: Kind.SELECTION_SET, selections: [sel] }, fragments, memo);
        if (sel.name.value.startsWith("__")) intro = { depth: Math.max(intro.depth, m.depth), fields: intro.fields + m.fields };
        else normal = { depth: Math.max(normal.depth, m.depth), fields: normal.fields + m.fields };
      } else if (sel.kind === Kind.INLINE_FRAGMENT) expand(sel.selectionSet);
      else {
        const def = fragments.get(sel.name.value);
        if (def) expand(def.selectionSet);
      }
    }
  };
  expand(op.selectionSet);
  if (normal.depth > LIMITS.maxDepth) return err(`This query is nested ${normal.depth} levels deep. The training API allows at most ${LIMITS.maxDepth}.`, "limits", "QUERY_TOO_DEEP");
  if (normal.fields > LIMITS.maxFields) return err(`This query selects ${normal.fields >= CAP ? "an enormous number of" : normal.fields} fields once fragments are expanded. The training API allows at most ${LIMITS.maxFields}.`, "limits", "QUERY_TOO_COMPLEX");
  if (intro.depth > LIMITS.maxIntrospectionDepth) return err(`This introspection query is nested too deeply (limit ${LIMITS.maxIntrospectionDepth}).`, "limits", "QUERY_TOO_DEEP");
  if (intro.fields > LIMITS.maxIntrospectionFields) return err(`This introspection query selects too many fields (limit ${LIMITS.maxIntrospectionFields}).`, "limits", "QUERY_TOO_COMPLEX");
  return null;
}

/** Which operation will run, or a student-facing error explaining why none can. */
export function pickOperation(doc: DocumentNode, name: string | null | undefined): { op: OperationDefinitionNode } | { error: LabError } {
  const ops = doc.definitions.filter((d): d is OperationDefinitionNode => d.kind === Kind.OPERATION_DEFINITION);
  if (ops.length === 0) return { error: err("The document contains no operation to run. Write a query or a mutation.", "validation", "NO_OPERATION") };
  if (name) {
    const op = ops.find((o) => o.name?.value === name);
    return op ? { op } : { error: err(`There is no operation named "${name}" in the document.`, "validation", "UNKNOWN_OPERATION") };
  }
  if (ops.length > 1) return { error: err("The document has several operations. Give the operation_name of the one to run.", "validation", "OPERATION_NAME_REQUIRED") };
  return { op: ops[0]! };
}

/**
 * Parses, validates against the actual training schema, applies limits and executes. Never throws for a bad student
 * document: every failure comes back as a structured GraphQL-style response that says which phase rejected it.
 */
export async function runOperation(input: ExecuteInput, ctx: LabContext): Promise<LabExecuteResponse> {
  const schema = trainingSchema();
  if (input.query.length > LIMITS.maxQueryChars) {
    return fail("validation", [err(`The query is ${input.query.length} characters long. The training API allows at most ${LIMITS.maxQueryChars}.`, "limits", "QUERY_TOO_LARGE")], ctx);
  }
  const variables = input.variables ?? {};
  if (JSON.stringify(variables).length > LIMITS.maxVariablesChars) {
    return fail("validation", [err(`The variables are larger than ${LIMITS.maxVariablesChars} characters.`, "limits", "VARIABLES_TOO_LARGE")], ctx);
  }

  let doc: DocumentNode;
  try {
    doc = parse(input.query, { maxTokens: LIMITS.maxTokens });
  } catch (e) {
    if (e instanceof GraphQLError) return fail("syntax", [toLabError(e, "syntax")], ctx);
    throw e;
  }

  const invalid = validate(schema, doc);
  if (invalid.length > 0) return fail("validation", invalid.slice(0, 10).map((e) => toLabError(e, "validation")), ctx);

  const picked = pickOperation(doc, input.operationName);
  if ("error" in picked) return fail("validation", [picked.error], ctx);
  if (picked.op.operation === "subscription") return fail("validation", [err("The training API does not support subscriptions. Use a query or a mutation.", "validation", "SUBSCRIPTIONS_NOT_SUPPORTED")], ctx);
  const tooBig = limitProblem(doc, picked.op);
  if (tooBig) return fail("validation", [tooBig], ctx);

  let timer: NodeJS.Timeout | undefined;
  let result;
  try {
    const run = Promise.resolve(execute({ schema, document: doc, rootValue, contextValue: ctx, variableValues: variables, operationName: input.operationName ?? undefined }));
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("timeout")), LIMITS.timeoutMs);
    });
    result = await Promise.race([run, timeout]);
  } catch (e) {
    if (e instanceof Error && e.message === "timeout") {
      return { ...fail("execution", [err(`The query took longer than ${LIMITS.timeoutMs} ms and was stopped.`, "limits", "EXECUTION_TIMEOUT")], ctx), operation: picked.op.operation };
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }

  // No `data` key at all means the variables could not be coerced (nothing was executed).
  const coercion = !("data" in result) && (result.errors?.length ?? 0) > 0;
  const phase: LabPhase = coercion ? "variables" : "execution";
  const errors = result.errors?.map((e) => toLabError(e, coercion ? "variables" : "execution"));
  const body: LabExecuteResponse["result"] = { ...("data" in result ? { data: result.data ?? null } : {}), ...(errors && errors.length > 0 ? { errors } : {}) };

  if (JSON.stringify(body).length > LIMITS.maxResultBytes) {
    return { ...fail("execution", [err(`The response is larger than ${LIMITS.maxResultBytes} bytes. Select fewer fields.`, "limits", "RESULT_TOO_LARGE")], ctx), operation: picked.op.operation };
  }
  return {
    phase: errors && errors.length > 0 ? phase : "ok",
    operation: picked.op.operation,
    result: body,
    state_changed: ctx.dirty,
    training_data: ctx.readOnly ? "read_only" : "per_student",
  };
}
