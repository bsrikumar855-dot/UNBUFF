import { parse } from "graphql";
import type { LabCheck, LabExecuteResponse } from "../types.js";
import { runOperation } from "./engine.js";
import type { ChoiceExercise, ExplanationExercise, QueryExercise } from "./model.js";
import { seedState, type LabContext } from "./trainingApi.js";

export interface GradeResult {
  passed: boolean;
  feedback: string;
  checks: LabCheck[];
  /** The result of running the student's own query once, for display. */
  execution: LabExecuteResponse | null;
}

/** A fresh context over the fixed starting data: grading never touches a student's real training state. */
const scratch = (): LabContext => ({ state: seedState(), readOnly: false, dirty: false });

// ---------------- structural comparison ----------------

function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === "object") return Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, canonical((v as Record<string, unknown>)[k])]));
  return v;
}
const same = (a: unknown, b: unknown) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));

/** True when everything in `a` also appears, with the same values, in `b` (b may have more fields). */
function within(a: unknown, b: unknown): boolean {
  if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((x, i) => within(x, b[i]));
  if (a && typeof a === "object") {
    if (!b || typeof b !== "object" || Array.isArray(b)) return false;
    return Object.entries(a as Record<string, unknown>).every(([k, v]) => k in (b as object) && within(v, (b as Record<string, unknown>)[k]));
  }
  return a === b;
}

const errorShape = (r: LabExecuteResponse) =>
  (r.result.errors ?? []).map((e) => `${e.category}|${e.code ?? ""}|${(e.path ?? []).join(".")}`).sort();

// ---------------- query and mutation exercises ----------------

const MAX_ERROR_LINES = 3;

export async function gradeQuery(def: QueryExercise, query: string): Promise<GradeResult> {
  const checks: LabCheck[] = [];
  const add = (label: string, passed: boolean) => checks.push({ label, passed });
  const pending = (labels: string[]) => labels.forEach((l) => add(l, false));
  const rest = ["Has the required structure", "Returns exactly the requested response"];
  const astLabels = (def.ast ?? []).map((r) => r.label);
  const kind = def.type === "mutation" ? "mutation" : "query";

  // The student's variables are not used: hidden runs (or none) make grading repeatable and unforgeable.
  const runs = def.runs ?? [def.referenceVariables ?? {}];
  const first = await runOperation({ query, variables: runs[0] ?? {} }, scratch());

  if (first.phase === "syntax" || first.phase === "validation") {
    add("Is valid GraphQL for the training schema", false);
    pending([`Is a ${kind}`, ...astLabels, ...rest]);
    const lines = (first.result.errors ?? []).slice(0, MAX_ERROR_LINES).map((e) => e.message);
    return { passed: false, feedback: `Your document was rejected before it could run (${first.phase} error): ${lines.join(" | ")}`, checks, execution: first };
  }
  add("Is valid GraphQL for the training schema", true);

  const doc = parse(query);
  const op = doc.definitions.find((d) => d.kind === "OperationDefinition");
  const isRight = op !== undefined && op.kind === "OperationDefinition" && op.operation === kind;
  add(`Is a ${kind}`, isRight);
  let structure = isRight;
  for (const rule of def.ast ?? []) {
    const ok = rule.test(doc);
    add(rule.label, ok);
    structure &&= ok;
  }
  if (!isRight) {
    pending(rest);
    return { passed: false, feedback: `This exercise needs a ${kind}.`, checks, execution: first };
  }

  // Run the student's document and the trusted reference on identical fresh data, once per hidden variable set.
  let matches = true;
  let overFetch = false;
  let underFetch = false;
  let coercion = false;
  for (const vars of runs) {
    const sCtx = scratch();
    const rCtx = scratch();
    const s = await runOperation({ query, variables: vars }, sCtx);
    const r = await runOperation({ query: def.reference, variables: vars }, rCtx);
    if (def.type === "mutation" && !same(sCtx.state, rCtx.state)) matches = false;
    if (s.phase === "variables") coercion = true;
    const dataOk = same(s.result.data, r.result.data);
    const errorsOk = same(errorShape(s), errorShape(r));
    if (!dataOk || !errorsOk) {
      matches = false;
      if (!dataOk && within(r.result.data, s.result.data)) overFetch = true;
      if (!dataOk && within(s.result.data, r.result.data)) underFetch = true;
    }
  }
  add("Has the required structure", structure);
  add("Returns exactly the requested response", matches && structure);
  const passed = structure && matches;

  let feedback: string;
  if (passed) feedback = "Your query returned exactly what the task asked for.";
  else if (coercion) feedback = "The variables could not be applied. Check each variable's name and type against the task: the checker supplies the values.";
  else if (!structure) feedback = "The response may be right, but the document does not meet every structural requirement listed below.";
  else if (overFetch) feedback = "Your response contains the requested data plus extra. The task asks for exactly what is listed and nothing more.";
  else if (underFetch) feedback = "Your response is missing some of the requested data.";
  else feedback = "The response does not match what the task asks for.";
  return { passed, feedback, checks, execution: first };
}

// ---------------- choice exercises ----------------

export function gradeChoice(def: ChoiceExercise, answer: string[]): GradeResult {
  const ids = new Set(def.options.map((o) => o.id));
  const chosen = [...new Set(answer)].filter((a) => ids.has(a)).sort();
  const correct = [...def.correct].sort();
  const passed = chosen.length === correct.length && chosen.every((c, i) => c === correct[i]);
  const label = def.multi ? "Selected exactly the correct options" : "Selected the correct option";
  return {
    passed,
    feedback: passed ? "Correct." : def.multi && chosen.length > 0 && chosen.every((c) => correct.includes(c)) ? "Not quite: your choices are all correct, but you have not found every correct option." : "Not quite. Re-read the question and the lesson, then try again.",
    checks: [{ label, passed }],
    execution: null,
  };
}

// ---------------- written explanations ----------------

export function gradeExplanation(def: ExplanationExercise, text: string): GradeResult {
  const covered = def.rubric.map((area) => area.any.some((re) => re.test(text)));
  const count = covered.filter(Boolean).length;
  const passed = count >= def.passAt;
  const firstMissing = def.rubric.find((_a, i) => !covered[i]);
  return {
    passed,
    feedback: passed ? `Good: your answer covers ${count} of the ${def.rubric.length} key points.` : `Your answer covers ${count} of the ${def.rubric.length} key points and ${def.passAt} are needed. ${firstMissing ? `Think about this: ${firstMissing.nudge}` : ""}`.trim(),
    checks: def.rubric.map((_a, i) => ({ label: `Key point ${i + 1} of ${def.rubric.length}`, passed: covered[i]! })),
    execution: null,
  };
}
