import { parse } from "graphql";
import { describe, expect, it } from "vitest";
import { allExercises, exerciseById, MODULES, publicExercise, publicLesson } from "../../src/graphqllab/curriculum.js";
import { runOperation } from "../../src/graphqllab/engine.js";
import { gradeChoice, gradeExplanation, gradeQuery } from "../../src/graphqllab/grading.js";
import type { ChoiceExercise, ExplanationExercise, QueryExercise } from "../../src/graphqllab/model.js";
import { seedState } from "../../src/graphqllab/trainingApi.js";

const fresh = () => ({ state: seedState(), readOnly: false, dirty: false });
const queries = () => allExercises().filter((e): e is QueryExercise => e.type === "query" || e.type === "mutation");
const choices = () => allExercises().filter((e): e is ChoiceExercise => e.type === "multiple_choice" || e.type === "schema_reading");
const explanations = () => allExercises().filter((e): e is ExplanationExercise => e.type === "explanation");
const norm = (s: string) => s.replace(/\s+/g, " ").trim();

describe("curriculum structure", () => {
  it("covers the ten modules in order, with prerequisites that come earlier", () => {
    expect(MODULES.map((m) => m.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(MODULES.map((m) => m.title)).toEqual([
      "GraphQL fundamentals",
      "Schemas, object types and scalars",
      "Queries and nested fields",
      "Arguments and variables",
      "Mutations",
      "Fragments and reusable selections",
      "Pagination",
      "GraphQL errors and validation",
      "Practical API design",
      "Interview practice",
    ]);
    for (const m of MODULES) {
      expect(m.objectives.length).toBeGreaterThan(0);
      expect(m.completionCriteria).toBeTruthy();
      for (const pre of m.prerequisites) expect(MODULES.find((x) => x.id === pre)!.order).toBeLessThan(m.order);
    }
  });

  it("gives every lesson objectives, explanation text and at least one exercise; every module several exercises", () => {
    for (const m of MODULES) {
      expect(m.exercises.length, m.id).toBeGreaterThanOrEqual(4);
      for (const l of m.lessons) {
        expect(l.objectives.length, l.id).toBeGreaterThan(0);
        expect(l.blocks.some((b) => b.kind === "p"), l.id).toBe(true);
        expect(m.exercises.some((e) => e.lessonId === l.id), l.id).toBe(true);
      }
    }
  });

  it("is not text only: every module has a query-writing exercise and a runnable example", () => {
    for (const m of MODULES) expect(m.exercises.some((e) => e.type === "query" || e.type === "mutation"), m.id).toBe(true);
    for (const m of MODULES.slice(0, 9)) expect(m.lessons.some((l) => l.blocks.some((b) => b.kind === "try")), m.id).toBe(true);
    expect(MODULES[4]!.exercises.filter((e) => e.type === "mutation").length).toBeGreaterThanOrEqual(3);
  });

  it("includes every interview-practice question type", () => {
    const types = new Set(MODULES[9]!.exercises.map((e) => e.type));
    expect(types).toEqual(new Set(["multiple_choice", "schema_reading", "query", "explanation"]));
  });

  it("has unique, stable ids and each exercise knows its lesson and module", () => {
    const ids = allExercises().map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of allExercises()) expect(exerciseById(e.id)!.lesson.id).toBe(e.lessonId);
  });
});

describe("every runnable example in the lessons", () => {
  it("is valid against the real schema, except the deliberate error demonstrations in module 8", async () => {
    for (const m of MODULES) {
      for (const l of m.lessons) {
        for (const b of l.blocks) {
          if (b.kind !== "try") continue;
          const r = await runOperation({ query: b.query, variables: b.variables }, fresh());
          if (m.id === "m8-errors-validation") continue; // asserted separately below
          expect(r.phase, `${l.id}: ${b.label}`).toBe("ok");
          expect(r.result.errors, `${l.id}: ${b.label}`).toBeUndefined();
        }
      }
    }
  });

  it("module 8 demonstrations fail in the stage the lesson says they fail in", async () => {
    const phases: Record<string, string> = {
      "A syntax error": "syntax",
      "A validation error": "validation",
      "A variable coercion error": "variables",
      "Partial data": "execution",
      "An authorization error": "execution",
    };
    for (const b of MODULES[7]!.lessons.flatMap((l) => l.blocks)) {
      if (b.kind !== "try") continue;
      const r = await runOperation({ query: b.query, variables: b.variables }, fresh());
      expect(r.phase, b.label).toBe(phases[b.label]);
    }
  });

  it("code blocks that show a query are syntactically valid GraphQL (schema snippets are skipped)", () => {
    for (const m of MODULES) {
      for (const b of m.lessons.flatMap((l) => l.blocks)) {
        if (b.kind !== "code" || b.language !== "graphql" || /^(type|input|union|enum)\b/.test(b.code)) continue;
        if (m.id === "m8-errors-validation") continue;
        expect(() => parse(b.code), b.code).not.toThrow();
      }
    }
  });
});

describe("query and mutation exercises are graded for real", () => {
  it("the trusted reference solution passes its own grader", async () => {
    for (const e of queries()) {
      const r = await gradeQuery(e, e.reference);
      expect(r.passed, `${e.id}: ${r.feedback} ${JSON.stringify(r.checks)}`).toBe(true);
    }
  });

  it("the starter code does not pass", async () => {
    for (const e of queries()) {
      const r = await gradeQuery(e, e.starter);
      expect(r.passed, e.id).toBe(false);
    }
  });

  it("hints never contain the solution text, and starters are not the solution", () => {
    for (const e of queries()) {
      for (const h of e.hints) expect(norm(h), e.id).not.toContain(norm(e.reference));
      expect(norm(e.starter)).not.toBe(norm(e.reference));
    }
  });

  it("each exercise has the pieces the model requires", () => {
    for (const e of allExercises()) {
      expect(e.hints.length, e.id).toBeGreaterThanOrEqual(1);
      expect(e.requirements.length, e.id).toBeGreaterThan(0);
      expect(e.explanation.length, e.id).toBeGreaterThan(20);
      expect(e.failHint.length, e.id).toBeGreaterThan(10);
      expect(e.concepts.length, e.id).toBeGreaterThan(0);
    }
  });
});

describe("choice and explanation exercises", () => {
  it("the answer key passes and a wrong answer does not", () => {
    for (const e of choices()) {
      expect(gradeChoice(e, e.correct).passed, e.id).toBe(true);
      expect(e.options.some((o) => !e.correct.includes(o.id)), e.id).toBe(true);
      const wrong = e.options.filter((o) => !e.correct.includes(o.id)).map((o) => o.id);
      expect(gradeChoice(e, [wrong[0]!]).passed, e.id).toBe(false);
      expect(gradeChoice(e, []).passed, e.id).toBe(false);
    }
  });

  it("multi-select needs every correct option and no extra ones", () => {
    const e = choices().find((c) => c.multi)!;
    expect(gradeChoice(e, e.correct.slice(0, 1)).passed).toBe(false);
    expect(gradeChoice(e, [...e.correct, e.options.find((o) => !e.correct.includes(o.id))!.id]).passed).toBe(false);
    expect(gradeChoice(e, e.correct.slice(0, 1)).feedback).toMatch(/not found every correct option/);
  });

  it("ignores unknown option ids and duplicates", () => {
    const e = choices()[0]!;
    expect(gradeChoice(e, [...e.correct, ...e.correct, "zzz"]).passed).toBe(true);
  });

  it("explanations are graded against the rubric and unrelated text fails", () => {
    for (const e of explanations()) {
      expect(gradeExplanation(e, "I like turtles and the weather today.").passed, e.id).toBe(false);
      expect(gradeExplanation(e, "").passed, e.id).toBe(false);
    }
    const q = explanations().find((e) => e.id === "m10-e8")!;
    const ok = gradeExplanation(q, "N+1 means one query for the list and then another query for each item. A DataLoader can batch those lookups into one query.");
    expect(ok.passed).toBe(true);
    expect(ok.checks.every((c) => c.passed)).toBe(true);
    const half = gradeExplanation(q, "It means one query for the list and then a query for each item.");
    expect(half.passed).toBe(false);
    expect(half.feedback).toMatch(/1 of the 2 key points/);
    expect(half.feedback).toMatch(/Think about this/);
  });
});

describe("the public view protects the answers", () => {
  it("never carries references, hidden variable sets, answer keys or rubrics", () => {
    const text = JSON.stringify(allExercises().map((e) => publicExercise(e)));
    for (const key of [ '"reference":', '"correct":', '"rubric":', '"runs":', '"passAt":', '"hints":', '"explanation":', '"failHint":', '"ast":']) expect(text).not.toContain(key);
    for (const e of queries()) expect(norm(text)).not.toContain(norm(e.reference));
    for (const e of explanations()) for (const r of e.rubric) expect(text).not.toContain(r.nudge);
  });

  it("exposes hint counts but not hint text, and options without any marker of the right one", () => {
    const pub = publicExercise(exerciseById("m1-e1")!.def);
    expect(pub.hints_total).toBe(2);
    expect(Object.keys(pub.options![0]!).sort()).toEqual(["id", "text"]);
  });

  it("lesson views contain only learning material", () => {
    const m = MODULES[0]!;
    const l = publicLesson(m.lessons[0]!, m, false);
    expect(Object.keys(l).sort()).toEqual(["blocks", "completed", "exercise_ids", "id", "objectives", "title"]);
  });
});
