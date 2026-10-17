import { Kind, visit, type DocumentNode, type ValueNode } from "graphql";
import type { LabBlock, LabChoiceOption, LabDifficulty, LabExerciseType } from "../types.js";

/**
 * Curriculum model. Everything in this file and in content/ is TRUSTED, server-side code. The public exercise view
 * (curriculum.ts) never includes references, hidden variables, correct answers or rubrics.
 */

/** A structural requirement checked on the student's parsed document (not on its text). */
export interface AstRule {
  /** Shown to the student as a requirement. */
  label: string;
  test: (doc: DocumentNode) => boolean;
}

interface Counts {
  variableUses: number;
  variableDefs: number;
  literalArgs: number;
  aliases: number;
  fragmentDefs: number;
  fragmentSpreads: number;
  inlineFragments: number;
  typenames: number;
  directives: number;
}

function hasLiteral(v: ValueNode): boolean {
  switch (v.kind) {
    case Kind.VARIABLE:
    case Kind.NULL:
      return false;
    case Kind.OBJECT:
      return v.fields.some((f) => hasLiteral(f.value));
    case Kind.LIST:
      return v.values.some(hasLiteral);
    default:
      return true;
  }
}

function count(doc: DocumentNode): Counts {
  const c: Counts = { variableUses: 0, variableDefs: 0, literalArgs: 0, aliases: 0, fragmentDefs: 0, fragmentSpreads: 0, inlineFragments: 0, typenames: 0, directives: 0 };
  visit(doc, {
    VariableDefinition: () => void c.variableDefs++,
    Variable: (_n, _k, parent) => {
      if ((parent as { kind?: string } | undefined)?.kind !== Kind.VARIABLE_DEFINITION) c.variableUses++;
    },
    Argument: (n) => {
      if (hasLiteral(n.value)) c.literalArgs++;
    },
    Field: (n) => {
      if (n.alias) c.aliases++;
      if (n.name.value === "__typename") c.typenames++;
    },
    FragmentDefinition: () => void c.fragmentDefs++,
    FragmentSpread: () => void c.fragmentSpreads++,
    InlineFragment: () => void c.inlineFragments++,
    Directive: () => void c.directives++,
  });
  return c;
}

export const rules = {
  usesVariables: (label = "Declares and uses at least one variable"): AstRule => ({ label, test: (d) => count(d).variableDefs > 0 && count(d).variableUses > 0 }),
  noLiteralArguments: (label = "Passes values through variables instead of writing them into the query"): AstRule => ({ label, test: (d) => count(d).literalArgs === 0 }),
  usesAlias: (label = "Uses at least one alias"): AstRule => ({ label, test: (d) => count(d).aliases > 0 }),
  definesFragment: (label = "Defines a named fragment"): AstRule => ({ label, test: (d) => count(d).fragmentDefs > 0 }),
  spreadsFragment: (min = 1, label = `Spreads a fragment${min > 1 ? ` at least ${min} times` : ""}`): AstRule => ({ label, test: (d) => count(d).fragmentSpreads >= min }),
  usesInlineFragment: (label = "Uses an inline fragment (... on Type)"): AstRule => ({ label, test: (d) => count(d).inlineFragments > 0 }),
  asksTypename: (label = "Selects __typename"): AstRule => ({ label, test: (d) => count(d).typenames > 0 }),
};

// ---------------- definitions ----------------

export interface LessonDef {
  id: string;
  title: string;
  objectives: string[];
  blocks: LabBlock[];
}

interface BaseExercise {
  id: string;
  lessonId: string;
  title: string;
  difficulty: LabDifficulty;
  description: string;
  objectives: string[];
  concepts: string[];
  /** Public: what a correct solution does. Every requirement is also checked. */
  requirements: string[];
  /** Shown one at a time on request. Hints must never contain the solution. */
  hints: string[];
  /** Shown only after the exercise is passed. */
  explanation: string;
  /** A generic nudge shown when an attempt does not pass. Must not reveal the answer. */
  failHint: string;
  schemaExcerpt?: string;
  example?: { query: string; variables?: Record<string, unknown> };
}

export interface QueryExercise extends BaseExercise {
  type: "query" | "mutation";
  starter: string;
  starterVariables?: Record<string, unknown>;
  /** Trusted solution: executed to produce the expected response. Never sent to a browser or to the model. */
  reference: string;
  referenceVariables?: Record<string, unknown>;
  /** Hidden variable sets. When present the student's query is run once per set, and so is the reference. */
  runs?: Record<string, unknown>[];
  compare?: "data" | "data+errors";
  ast?: AstRule[];
}

export interface ChoiceExercise extends BaseExercise {
  type: "multiple_choice" | "schema_reading";
  options: LabChoiceOption[];
  correct: string[];
  multi?: boolean;
}

export interface RubricArea {
  /** Any one of these patterns covers the point. */
  any: RegExp[];
  /** A question that nudges toward the point without stating it. */
  nudge: string;
}
export interface ExplanationExercise extends BaseExercise {
  type: "explanation";
  maxChars: number;
  rubric: RubricArea[];
  passAt: number;
}

export type ExerciseDef = QueryExercise | ChoiceExercise | ExplanationExercise;

export interface ModuleDef {
  id: string;
  order: number;
  title: string;
  summary: string;
  difficulty: LabDifficulty;
  prerequisites: string[];
  objectives: string[];
  completionCriteria: string;
  lessons: LessonDef[];
  exercises: ExerciseDef[];
}

export const GRADING_TEXT: Record<LabExerciseType, string> = {
  query: "Your query is validated against the training schema, run on fresh training data, and its response is compared with the expected response. Equivalent queries (different order, aliases, fragments) are accepted.",
  mutation: "Your mutation is validated against the training schema and run on a scratch copy of the training data (your real data is not touched). Both its response and the resulting data must match.",
  multiple_choice: "Graded by comparing your choice with the answer key.",
  schema_reading: "Graded by comparing your choice with the answer key.",
  explanation: "Graded by a fixed rubric of key points looked for in your written answer.",
};

export const p = (text: string): LabBlock => ({ kind: "p", text });
export const list = (...items: string[]): LabBlock => ({ kind: "list", items });
export const gql = (code: string): LabBlock => ({ kind: "code", code: code.trim(), language: "graphql" });
export const json = (code: string): LabBlock => ({ kind: "code", code: code.trim(), language: "json" });
export const tryIt = (label: string, query: string, variables?: Record<string, unknown>): LabBlock => ({ kind: "try", label, query: query.trim(), ...(variables ? { variables } : {}) });

export const isQueryExercise = (e: ExerciseDef): e is QueryExercise => e.type === "query" || e.type === "mutation";
export const isChoiceExercise = (e: ExerciseDef): e is ChoiceExercise => e.type === "multiple_choice" || e.type === "schema_reading";
