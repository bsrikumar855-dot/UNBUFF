import type { LabExercise, LabExerciseStudent, LabLesson, LabModuleSummary } from "../types.js";
import { MODULE_1, MODULE_2, MODULE_3 } from "./content/modules1to3.js";
import { MODULE_4, MODULE_5, MODULE_6 } from "./content/modules4to6.js";
import { MODULE_7, MODULE_8, MODULE_9, MODULE_10 } from "./content/modules7to10.js";
import { GRADING_TEXT, type ExerciseDef, type LessonDef, type ModuleDef } from "./model.js";

export const MODULES: readonly ModuleDef[] = [MODULE_1, MODULE_2, MODULE_3, MODULE_4, MODULE_5, MODULE_6, MODULE_7, MODULE_8, MODULE_9, MODULE_10];
export const EXERCISE_VERSION = 1;

const exerciseIndex = new Map<string, { def: ExerciseDef; module: ModuleDef; lesson: LessonDef; order: number }>();
const moduleIndex = new Map<string, ModuleDef>();

/** Fails at startup (and in tests) if the curriculum is inconsistent. */
function build(): void {
  const lessonIds = new Set<string>();
  for (const m of MODULES) {
    if (moduleIndex.has(m.id)) throw new Error(`duplicate module ${m.id}`);
    moduleIndex.set(m.id, m);
    for (const l of m.lessons) {
      if (lessonIds.has(l.id)) throw new Error(`duplicate lesson ${l.id}`);
      lessonIds.add(l.id);
    }
    m.exercises.forEach((e, i) => {
      if (exerciseIndex.has(e.id)) throw new Error(`duplicate exercise ${e.id}`);
      const lesson = m.lessons.find((l) => l.id === e.lessonId);
      if (!lesson) throw new Error(`exercise ${e.id} points at an unknown lesson`);
      exerciseIndex.set(e.id, { def: e, module: m, lesson, order: i + 1 });
    });
    for (const l of m.lessons) if (!m.exercises.some((e) => e.lessonId === l.id)) throw new Error(`lesson ${l.id} has no exercise`);
  }
  for (const m of MODULES) for (const pre of m.prerequisites) if (!moduleIndex.has(pre) || moduleIndex.get(pre)!.order >= m.order) throw new Error(`module ${m.id} has an invalid prerequisite ${pre}`);
}
build();

export const moduleById = (id: string): ModuleDef | undefined => moduleIndex.get(id);
export const exerciseById = (id: string): { def: ExerciseDef; module: ModuleDef; lesson: LessonDef; order: number } | undefined => exerciseIndex.get(id);
export const allExercises = (): ExerciseDef[] => MODULES.flatMap((m) => m.exercises);

export const NO_STUDENT: LabExerciseStudent = { attempts: 0, passed: false, passed_at: null, hints_used: 0, last_attempt_at: null };

/** The view sent to browsers. References, hidden variable sets, answer keys and rubrics are never included. */
export function publicExercise(def: ExerciseDef, student: LabExerciseStudent = NO_STUDENT): LabExercise {
  const { module, order } = exerciseById(def.id)!;
  const isQuery = def.type === "query" || def.type === "mutation";
  return {
    id: def.id,
    module_id: module.id,
    lesson_id: def.lessonId,
    order,
    title: def.title,
    type: def.type,
    difficulty: def.difficulty,
    description: def.description,
    objectives: def.objectives,
    concepts: def.concepts,
    requirements: def.requirements,
    starter_query: isQuery ? def.starter : null,
    starter_variables: isQuery ? (def.starterVariables ?? null) : null,
    example: def.example ?? null,
    options: def.type === "multiple_choice" || def.type === "schema_reading" ? def.options.map((o) => ({ id: o.id, text: o.text })) : null,
    multi_select: (def.type === "multiple_choice" || def.type === "schema_reading") && def.multi === true,
    schema_excerpt: def.schemaExcerpt ?? null,
    hints_total: def.hints.length,
    max_answer_chars: def.type === "explanation" ? def.maxChars : null,
    grading: GRADING_TEXT[def.type],
    version: EXERCISE_VERSION,
    provenance: "authored_original",
    student,
  };
}

export function publicLesson(l: LessonDef, m: ModuleDef, completed: boolean): LabLesson {
  return { id: l.id, title: l.title, objectives: l.objectives, blocks: l.blocks, exercise_ids: m.exercises.filter((e) => e.lessonId === l.id).map((e) => e.id), completed };
}

export function moduleSummaryBase(m: ModuleDef): Pick<LabModuleSummary, "id" | "order" | "title" | "summary" | "difficulty" | "prerequisites" | "lesson_count" | "exercise_count"> {
  return { id: m.id, order: m.order, title: m.title, summary: m.summary, difficulty: m.difficulty, prerequisites: m.prerequisites, lesson_count: m.lessons.length, exercise_count: m.exercises.length };
}
