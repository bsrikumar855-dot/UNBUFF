import { createHash } from "node:crypto";
import { getNamedType, isScalarType, parse, printType, visit, visitWithTypeInfo, TypeInfo, type GraphQLNamedType, type GraphQLSchema } from "graphql";
import { ApiError } from "../errors.js";
import type { Logger } from "../logger.js";
import type {
  LabAttempt,
  LabAttemptsResponse,
  LabExecuteRequest,
  LabExecuteResponse,
  LabExercise,
  LabExerciseStudent,
  LabHelpRequest,
  LabHelpResponse,
  LabHintResponse,
  LabModuleDetail,
  LabModuleStatus,
  LabModuleSummary,
  LabModulesResponse,
  LabProgressResponse,
  LabResetResponse,
  LabSchemaType,
  LabSubmitRequest,
  LabSubmitResponse,
  LabTrainingSchemaResponse,
  MentorSavedMemory,
} from "../types.js";
import { exerciseById, moduleById, moduleSummaryBase, MODULES, publicExercise, publicLesson } from "./curriculum.js";
import { LIMITS, runOperation } from "./engine.js";
import { gradeChoice, gradeExplanation, gradeQuery, type GradeResult } from "./grading.js";
import { isChoiceExercise, isQueryExercise, type ModuleDef } from "./model.js";
import type { AttemptRecord, ExerciseProgress, LabStore, ProgressRecord } from "./store.js";
import { SDL, seedState, trainingSchema, type LabContext, type StudentState } from "./trainingApi.js";

export interface TutorPort {
  tutorHelp(uid: string, input: { lab: string; message: string; topics: string[] }): Promise<{ reply: string; mock: boolean; memory_saved: MentorSavedMemory[] }>;
}

export interface LabDeps {
  store: LabStore;
  /** The Phase 6 mentor. Optional: the Lab (playground, grading, progress) works without it. */
  mentor?: TutorPort;
  logger: Logger;
  now?: () => Date;
}

const KEEP_ATTEMPTS_PER_EXERCISE = 20;
const MAX_ACTIVITY = 30;
const MAX_COUNTED = 50;
const MAX_CONTEXT_CHARS = 6000;

const DEFINITIONS = [
  { metric: "Modules started", meaning: "Modules where you have attempted an exercise, used a hint or passed something." },
  { metric: "Modules completed", meaning: "Modules where you have passed every exercise." },
  { metric: "Lessons completed", meaning: "Lessons whose exercises you have all passed." },
  { metric: "Exercises attempted", meaning: "Exercises you have submitted at least once. Running a query in the playground is not an attempt." },
  { metric: "Exercises passed", meaning: "Exercises whose configured check passed. A pass is never granted without the check passing." },
  { metric: "Needs another attempt", meaning: "Concepts of exercises you have attempted but not yet passed." },
  { metric: "Separate from DSA", meaning: "These numbers are about the GraphQL Lab only. They are not mixed into DSA analytics or any readiness score." },
];

const emptyExercise = (): ExerciseProgress => ({ attempts: 0, passed: false, passed_at: null, hints_used: 0, last_attempt_at: null, counted: [] });
const emptyProgress = (uid: string, at: string): ProgressRecord => ({ owner_uid: uid, created_at: at, updated_at: at, exercises: {}, activity: [] });
const studentView = (e: ExerciseProgress | undefined): LabExerciseStudent =>
  e ? { attempts: e.attempts, passed: e.passed, passed_at: e.passed_at, hints_used: e.hints_used, last_attempt_at: e.last_attempt_at } : { attempts: 0, passed: false, passed_at: null, hints_used: 0, last_attempt_at: null };

const attemptId = (uid: string, exerciseId: string, clientId: string) => `att_${createHash("sha1").update(`${uid}|${exerciseId}|${clientId}`).digest("hex").slice(0, 32)}`;
const toAttempt = (a: AttemptRecord): LabAttempt => ({ id: a.id, exercise_id: a.exercise_id, at: a.at, passed: a.passed, query: a.query, variables: a.variables, answer: a.answer, feedback: a.feedback, checks: a.checks });

function moduleStatus(m: ModuleDef, p: ProgressRecord | null): { status: LabModuleStatus; passed: number; lessonsDone: number } {
  const ex = p?.exercises ?? {};
  const passed = m.exercises.filter((e) => ex[e.id]?.passed).length;
  const lessonsDone = m.lessons.filter((l) => m.exercises.filter((e) => e.lessonId === l.id).every((e) => ex[e.id]?.passed)).length;
  const touched = m.exercises.some((e) => (ex[e.id]?.attempts ?? 0) > 0 || (ex[e.id]?.hints_used ?? 0) > 0);
  const status: LabModuleStatus = passed === m.exercises.length ? "completed" : touched || passed > 0 ? "in_progress" : "not_started";
  return { status, passed, lessonsDone };
}

export class LabService {
  private readonly now: () => Date;
  private readonly locks = new Map<string, Promise<unknown>>();

  constructor(private readonly deps: LabDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  // ---------------- storage helpers ----------------

  private async progressOf(uid: string): Promise<ProgressRecord | null> {
    try {
      return await this.deps.store.getProgress(uid);
    } catch (err) {
      this.deps.logger.error({ err: (err as Error).message }, "graphql lab: progress could not be read");
      throw new ApiError("GRAPHQL_LAB_UNAVAILABLE", "Your GraphQL Lab progress could not be loaded right now.");
    }
  }

  private async serialize<T>(uid: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(uid) ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(fn);
    this.locks.set(uid, run);
    try {
      return await run;
    } finally {
      if (this.locks.get(uid) === run) this.locks.delete(uid);
    }
  }

  // ---------------- curriculum views ----------------

  private summary(m: ModuleDef, p: ProgressRecord | null): LabModuleSummary {
    const s = moduleStatus(m, p);
    const recommended_first = m.prerequisites.filter((id) => {
      const pre = moduleById(id);
      return pre !== undefined && moduleStatus(pre, p).status !== "completed";
    });
    return { ...moduleSummaryBase(m), recommended_first, status: s.status, lessons_completed: s.lessonsDone, exercises_passed: s.passed };
  }

  private currentModule(p: ProgressRecord | null): string | null {
    const states = MODULES.map((m) => ({ m, s: this.summary(m, p) }));
    const inProgress = states.find((x) => x.s.status === "in_progress");
    if (inProgress) return inProgress.m.id;
    const next = states.find((x) => x.s.status === "not_started" && x.s.recommended_first.length === 0);
    return next ? next.m.id : null;
  }

  async modules(uid: string): Promise<LabModulesResponse> {
    const p = await this.progressOf(uid);
    return { modules: MODULES.map((m) => this.summary(m, p)), current_module_id: this.currentModule(p) };
  }

  async module(uid: string, id: string): Promise<LabModuleDetail> {
    const m = moduleById(id);
    if (!m) throw new ApiError("MODULE_NOT_FOUND", `Module ${id} not found`);
    const p = await this.progressOf(uid);
    const ex = p?.exercises ?? {};
    return {
      module: this.summary(m, p),
      objectives: m.objectives,
      completion_criteria: m.completionCriteria,
      lessons: m.lessons.map((l) => publicLesson(l, m, m.exercises.filter((e) => e.lessonId === l.id).every((e) => ex[e.id]?.passed))),
      exercises: m.exercises.map((e) => publicExercise(e, studentView(ex[e.id]))),
    };
  }

  async exercises(uid: string): Promise<LabExercise[]> {
    const p = await this.progressOf(uid);
    return MODULES.flatMap((m) => m.exercises.map((e) => publicExercise(e, studentView(p?.exercises[e.id]))));
  }

  async exercise(uid: string, id: string): Promise<LabExercise> {
    const found = exerciseById(id);
    if (!found) throw new ApiError("EXERCISE_NOT_FOUND", `Exercise ${id} not found`);
    const p = await this.progressOf(uid);
    return publicExercise(found.def, studentView(p?.exercises[id]));
  }

  // ---------------- the training schema, derived from the schema that actually runs ----------------

  trainingSchema(): LabTrainingSchemaResponse {
    const schema = trainingSchema();
    const types: LabSchemaType[] = [];
    for (const t of Object.values(schema.getTypeMap())) {
      if (t.name.startsWith("__") || (isScalarType(t) && ["String", "Int", "Float", "Boolean", "ID"].includes(t.name))) continue;
      types.push(describeType(t));
    }
    types.sort((a, b) => (a.name === "Query" ? -2 : a.name === "Mutation" ? -1 : 0) - (b.name === "Query" ? -2 : b.name === "Mutation" ? -1 : 0) || a.name.localeCompare(b.name));
    return {
      sdl: SDL.trim(),
      types,
      query_type: schema.getQueryType()?.name ?? "Query",
      mutation_type: schema.getMutationType()?.name ?? null,
      limits: { max_query_chars: LIMITS.maxQueryChars, max_variables_chars: LIMITS.maxVariablesChars, max_depth: LIMITS.maxDepth, max_fields: LIMITS.maxFields, max_result_bytes: LIMITS.maxResultBytes },
    };
  }

  // ---------------- playground ----------------

  private async loadContext(uid: string): Promise<LabContext> {
    try {
      const rec = await this.deps.store.getState(uid);
      return { state: rec ? rec.state : seedState(), readOnly: false, dirty: false };
    } catch (err) {
      this.deps.logger.warn({ err: (err as Error).message }, "graphql lab: training data could not be read; running read-only on the starting data");
      return { state: seedState(), readOnly: true, dirty: false };
    }
  }

  async execute(uid: string, req: LabExecuteRequest): Promise<LabExecuteResponse> {
    return this.serialize(uid, async () => {
      const ctx = await this.loadContext(uid);
      const res = await runOperation({ query: req.query, variables: req.variables, operationName: req.operation_name }, ctx);
      if (ctx.dirty) {
        try {
          await this.deps.store.saveState({ owner_uid: uid, updated_at: this.now().toISOString(), state: ctx.state });
        } catch (err) {
          this.deps.logger.error({ err: (err as Error).message }, "graphql lab: training data could not be saved");
          throw new ApiError("GRAPHQL_LAB_UNAVAILABLE", "Your training data could not be saved, so the mutation was not applied.");
        }
      }
      return res;
    });
  }

  async resetTrainingData(uid: string): Promise<LabResetResponse> {
    return this.serialize(uid, async () => {
      const state = seedState();
      try {
        await this.deps.store.saveState({ owner_uid: uid, updated_at: this.now().toISOString(), state });
      } catch {
        throw new ApiError("GRAPHQL_LAB_UNAVAILABLE", "Your training data could not be reset right now.");
      }
      return { application_count: state.applications.length };
    });
  }

  // ---------------- hints ----------------

  async hint(uid: string, exerciseId: string): Promise<LabHintResponse> {
    const found = exerciseById(exerciseId);
    if (!found) throw new ApiError("EXERCISE_NOT_FOUND", `Exercise ${exerciseId} not found`);
    const hints = found.def.hints;
    return this.serialize(uid, async () => {
      const at = this.now().toISOString();
      let number = 1;
      try {
        await this.deps.store.updateProgress(uid, (cur) => {
          const p = cur ?? emptyProgress(uid, at);
          const ex = p.exercises[exerciseId] ?? emptyExercise();
          if (ex.hints_used < hints.length) {
            ex.hints_used += 1;
            p.activity = [{ at, kind: "hint" as const, exercise_id: exerciseId }, ...p.activity].slice(0, MAX_ACTIVITY);
          }
          number = Math.max(1, ex.hints_used);
          p.exercises[exerciseId] = ex;
          p.updated_at = at;
          return p;
        });
      } catch (err) {
        this.deps.logger.error({ err: (err as Error).message }, "graphql lab: hint could not be recorded");
        throw new ApiError("GRAPHQL_LAB_UNAVAILABLE", "Your progress could not be saved right now.");
      }
      return { hint: hints[number - 1]!, hint_number: number, hints_total: hints.length };
    });
  }

  // ---------------- submissions ----------------

  async submit(uid: string, exerciseId: string, req: LabSubmitRequest): Promise<LabSubmitResponse> {
    const found = exerciseById(exerciseId);
    if (!found) throw new ApiError("EXERCISE_NOT_FOUND", `Exercise ${exerciseId} not found`);
    const { def, module, lesson } = found;
    const id = attemptId(uid, exerciseId, req.client_attempt_id);
    const lessonRef = { module_id: module.id, lesson_id: lesson.id, title: lesson.title };

    // Validate the payload for this exercise type before doing any work.
    let query: string | null = null;
    let answer: string | string[] | null = null;
    if (isQueryExercise(def)) {
      if (typeof req.query !== "string" || req.query.trim() === "") throw new ApiError("BAD_REQUEST", "Submit the query to check.");
      if (req.query.length > LIMITS.maxQueryChars) throw new ApiError("BAD_REQUEST", `The query is longer than ${LIMITS.maxQueryChars} characters.`);
      query = req.query;
    } else if (def.type === "explanation") {
      const text = typeof req.answer === "string" ? req.answer.trim() : "";
      if (text === "") throw new ApiError("BAD_REQUEST", "Write your explanation before submitting.");
      if (text.length > def.maxChars) throw new ApiError("BAD_REQUEST", `Keep the answer within ${def.maxChars} characters.`);
      answer = text;
    } else if (isChoiceExercise(def)) {
      const raw = Array.isArray(req.answer) ? req.answer : typeof req.answer === "string" ? [req.answer] : [];
      const valid = new Set(def.options.map((o) => o.id));
      if (raw.length === 0 || raw.some((a) => !valid.has(a))) throw new ApiError("BAD_REQUEST", "Choose one of the listed options.");
      if (!def.multi && raw.length > 1) throw new ApiError("BAD_REQUEST", "Choose a single option.");
      answer = [...new Set(raw)].sort();
    }

    return this.serialize(uid, async () => {
      const existing = await this.deps.store.getAttempt(id).catch((err: unknown) => {
        this.deps.logger.error({ err: (err as Error).message }, "graphql lab: attempt could not be read");
        throw new ApiError("GRAPHQL_LAB_UNAVAILABLE", "Your progress could not be loaded right now.");
      });
      const replay = existing && existing.owner_uid === uid && existing.exercise_id === exerciseId ? existing : null;

      let grade: GradeResult;
      let record: AttemptRecord;
      if (replay) {
        record = replay;
        grade = { passed: replay.passed, feedback: replay.feedback, checks: replay.checks, execution: null };
      } else {
        grade = isQueryExercise(def) ? await gradeQuery(def, query!) : isChoiceExercise(def) ? gradeChoice(def, answer as string[]) : gradeExplanation(def, answer as string);
        record = {
          id,
          owner_uid: uid,
          exercise_id: exerciseId,
          at: this.now().toISOString(),
          passed: grade.passed,
          query,
          variables: req.variables ?? null,
          answer,
          feedback: grade.feedback,
          checks: grade.checks,
        };
      }

      // The attempt is stored first; progress counts an attempt id at most once, so a retry after a partial failure is safe.
      let before = new Map<string, boolean>();
      let after = new Map<string, boolean>();
      let student: LabExerciseStudent;
      try {
        if (!replay) await this.deps.store.saveAttempt(record);
        const saved = await this.deps.store.updateProgress(uid, (cur) => {
          const p = cur ?? emptyProgress(uid, record.at);
          before = passedMap(p);
          const ex = p.exercises[exerciseId] ?? emptyExercise();
          if (!ex.counted.includes(id)) {
            ex.attempts += 1;
            ex.counted = [...ex.counted, id].slice(-MAX_COUNTED);
            if (!ex.last_attempt_at || record.at > ex.last_attempt_at) ex.last_attempt_at = record.at;
            const firstPass = record.passed && !ex.passed;
            if (firstPass) {
              ex.passed = true;
              ex.passed_at = record.at;
            }
            p.activity = [{ at: record.at, kind: firstPass ? ("passed" as const) : ("attempt" as const), exercise_id: exerciseId }, ...p.activity].slice(0, MAX_ACTIVITY);
          }
          p.exercises[exerciseId] = ex;
          p.updated_at = record.at;
          after = passedMap(p);
          return p;
        });
        student = studentView(saved.exercises[exerciseId]);
      } catch (err) {
        if (err instanceof ApiError) throw err;
        this.deps.logger.error({ err: (err as Error).message }, "graphql lab: attempt could not be saved");
        throw new ApiError("GRAPHQL_LAB_UNAVAILABLE", "Your attempt could not be saved, so it was not counted. Try again.");
      }
      if (!replay) void this.pruneAttempts(uid, exerciseId);

      const lessonDone = (m: ModuleDef, lessonId: string, map: Map<string, boolean>) => m.exercises.filter((e) => e.lessonId === lessonId).every((e) => map.get(e.id));
      const moduleDone = (m: ModuleDef, map: Map<string, boolean>) => m.exercises.every((e) => map.get(e.id));
      const nextHint = grade.passed ? null : def.failHint;
      return {
        attempt: toAttempt(record),
        outcome: grade.passed ? "passed" : "needs_improvement",
        feedback: grade.feedback,
        checks: grade.checks,
        hint: nextHint,
        explanation: grade.passed ? def.explanation : null,
        lesson: lessonRef,
        newly_completed: { lesson: !replay && !lessonDone(module, lesson.id, before) && lessonDone(module, lesson.id, after), module: !replay && !moduleDone(module, before) && moduleDone(module, after) },
        exercise: student,
        execution: grade.execution,
        replayed: replay !== null,
      };
    });
  }

  /** Keeps the newest attempts per exercise. Best effort: failing to prune never affects the student. */
  private async pruneAttempts(uid: string, exerciseId: string): Promise<void> {
    try {
      const all = await this.deps.store.listAttempts(uid, exerciseId, 200);
      const drop = all.slice(KEEP_ATTEMPTS_PER_EXERCISE).map((a) => a.id);
      if (drop.length > 0) await this.deps.store.deleteAttempts(drop);
    } catch {
      /* ignored */
    }
  }

  async attempts(uid: string, exerciseId: string | null): Promise<LabAttemptsResponse> {
    if (exerciseId !== null && !exerciseById(exerciseId)) throw new ApiError("EXERCISE_NOT_FOUND", `Exercise ${exerciseId} not found`);
    try {
      const list = await this.deps.store.listAttempts(uid, exerciseId, exerciseId === null ? 50 : KEEP_ATTEMPTS_PER_EXERCISE);
      return { attempts: list.filter((a) => a.owner_uid === uid).map(toAttempt) };
    } catch (err) {
      this.deps.logger.error({ err: (err as Error).message }, "graphql lab: attempts could not be read");
      throw new ApiError("GRAPHQL_LAB_UNAVAILABLE", "Your attempts could not be loaded right now.");
    }
  }

  // ---------------- progress summary ----------------

  async progress(uid: string): Promise<LabProgressResponse> {
    const p = await this.progressOf(uid);
    const ex = p?.exercises ?? {};
    const summaries = MODULES.map((m) => ({ m, s: this.summary(m, p) }));
    const all = MODULES.flatMap((m) => m.exercises);
    const lessonsTotal = MODULES.reduce((n, m) => n + m.lessons.length, 0);
    const attempted = all.filter((e) => (ex[e.id]?.attempts ?? 0) > 0);

    const byConcept = new Map<string, string[]>();
    for (const e of attempted) {
      if (ex[e.id]?.passed) continue;
      for (const c of e.concepts) byConcept.set(c, [...(byConcept.get(c) ?? []), e.id]);
    }
    const needs = [...byConcept.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0])).slice(0, 8).map(([concept, exercise_ids]) => ({ concept, exercise_ids }));

    return {
      has_started: attempted.length > 0 || Object.values(ex).some((e) => e.hints_used > 0),
      totals: {
        modules_started: summaries.filter((x) => x.s.status !== "not_started").length,
        modules_completed: summaries.filter((x) => x.s.status === "completed").length,
        modules_total: MODULES.length,
        lessons_completed: summaries.reduce((n, x) => n + x.s.lessons_completed, 0),
        lessons_total: lessonsTotal,
        exercises_attempted: attempted.length,
        exercises_passed: all.filter((e) => ex[e.id]?.passed).length,
        exercises_total: all.length,
        attempts: Object.values(ex).reduce((n, e) => n + e.attempts, 0),
      },
      current_module_id: this.currentModule(p),
      modules: summaries.map(({ m, s }) => ({ module_id: m.id, title: m.title, status: s.status, lessons_completed: s.lessons_completed, lessons_total: m.lessons.length, exercises_passed: s.exercises_passed, exercises_total: m.exercises.length })),
      recent_activity: (p?.activity ?? []).slice(0, 10).flatMap((a) => {
        const f = exerciseById(a.exercise_id);
        return f ? [{ at: a.at, kind: a.kind, exercise_id: a.exercise_id, exercise_title: f.def.title, module_id: f.module.id }] : [];
      }),
      needs_another_attempt: needs,
      definitions: DEFINITIONS,
    };
  }

  async deleteAll(uid: string): Promise<void> {
    await this.serialize(uid, async () => {
      try {
        await this.deps.store.deleteAll(uid);
      } catch (err) {
        this.deps.logger.error({ err: (err as Error).message }, "graphql lab: data could not be deleted");
        throw new ApiError("GRAPHQL_LAB_UNAVAILABLE", "Your GraphQL Lab data could not be deleted right now.");
      }
    });
  }

  // ---------------- mentor help ----------------

  async help(uid: string, req: LabHelpRequest): Promise<LabHelpResponse> {
    const mentor = this.deps.mentor;
    if (!mentor) throw new ApiError("LLM_INVALID_OUTPUT", "The mentor is not available.");
    const needsQuery = req.action === "explain_query" || req.action === "explain_error" || req.action === "explain_result";
    if (needsQuery && (typeof req.query !== "string" || req.query.trim() === "")) throw new ApiError("BAD_REQUEST", "Write or paste a query first.");
    const found = req.exercise_id ? exerciseById(req.exercise_id) : undefined;
    if (req.exercise_id && !found) throw new ApiError("EXERCISE_NOT_FOUND", `Exercise ${req.exercise_id} not found`);
    const query = typeof req.query === "string" ? req.query.slice(0, LIMITS.maxQueryChars) : "";

    // The server runs the query itself on a throw-away copy of the student's data: the model is only told what really happened.
    let execution: LabExecuteResponse | null = null;
    if (query.trim() !== "") {
      const rec = await this.deps.store.getState(uid).catch(() => null);
      const ctx: LabContext = { state: structuredClone<StudentState>(rec ? rec.state : seedState()), readOnly: false, dirty: false };
      execution = await runOperation({ query, variables: req.variables ?? {} }, ctx);
    }
    const progress = await this.progressOf(uid).catch(() => null);
    const lab = this.helpContext(req, found, query, execution, progress);
    const concepts = found ? found.def.concepts : [];
    const out = await mentor.tutorHelp(uid, { lab, message: req.message ?? "", topics: concepts });
    return { reply: out.reply, mock: out.mock, query_status: execution ? { phase: execution.phase, error_count: execution.result.errors?.length ?? 0 } : null, memory_saved: out.memory_saved };
  }

  private helpContext(req: LabHelpRequest, found: ReturnType<typeof exerciseById>, query: string, exec: LabExecuteResponse | null, progress: ProgressRecord | null): string {
    const lines: string[] = [`ACTION: ${req.action}`];
    if (found) {
      const { def, module, lesson } = found;
      const st = progress?.exercises[def.id];
      lines.push(
        `EXERCISE (the student is working on this; it is graded): ${def.title} [${def.type}, ${def.difficulty}]`,
        `Task: ${def.description}`,
        `Requirements: ${def.requirements.join("; ")}`,
        `Lesson: ${module.title} / ${lesson.title}. Objectives: ${lesson.objectives.join("; ")}`,
        `Progress on this exercise: ${st?.attempts ?? 0} attempts, ${st?.passed ? "passed" : "not passed yet"}, ${st?.hints_used ?? 0} hints used`,
      );
      if (def.schemaExcerpt) lines.push(`Schema excerpt given with the question:\n${def.schemaExcerpt}`);
    } else {
      lines.push("No exercise is selected: the student is exploring in the playground.");
    }
    lines.push(`SCHEMA EXCERPT (the real training schema, only the types involved):\n${schemaExcerpt(query)}`);
    lines.push(query ? `STUDENT QUERY:\n${query}` : "STUDENT QUERY: (none yet)");
    if (req.variables && Object.keys(req.variables).length > 0) lines.push(`STUDENT VARIABLES: ${JSON.stringify(req.variables).slice(0, 600)}`);
    if (exec) {
      const errs = (exec.result.errors ?? []).slice(0, 5).map((e) => `- [${e.category}${e.code ? `/${e.code}` : ""}] ${e.message}${e.path ? ` (at ${e.path.join(".")})` : ""}${e.locations?.[0] ? ` (line ${e.locations[0].line}, column ${e.locations[0].column})` : ""}`);
      lines.push(`ACTUAL RESULT FROM THE SERVER: phase=${exec.phase}; operation=${exec.operation ?? "none"}`);
      if (errs.length > 0) lines.push(`Errors:\n${errs.join("\n")}`);
      if (exec.result.data !== undefined) lines.push(`Data (truncated):\n${JSON.stringify(exec.result.data).slice(0, 1500)}`);
    } else {
      lines.push("ACTUAL RESULT FROM THE SERVER: nothing was run (there is no query).");
    }
    if (progress) {
      const done = MODULES.filter((m) => moduleStatus(m, progress).status === "completed").map((m) => m.title);
      lines.push(`LEARNING HISTORY: completed modules: ${done.join(", ") || "none"}.`);
    }
    return lines.join("\n\n").slice(0, MAX_CONTEXT_CHARS);
  }
}

function passedMap(p: ProgressRecord): Map<string, boolean> {
  return new Map(Object.entries(p.exercises).map(([id, e]) => [id, e.passed]));
}

function describeType(t: GraphQLNamedType): LabSchemaType {
  const base: LabSchemaType = { name: t.name, kind: "SCALAR", description: t.description ?? null, fields: [], enum_values: [], possible_types: [] };
  const anyT = t as unknown as { constructor: { name: string }; getFields?: () => Record<string, { name: string; type: unknown; description?: string | null; args?: { name: string; type: unknown; defaultValue?: unknown; description?: string | null }[] }>; getValues?: () => { name: string; description?: string | null }[]; getTypes?: () => { name: string }[] };
  const kind = anyT.constructor.name;
  if (kind === "GraphQLObjectType") base.kind = "OBJECT";
  else if (kind === "GraphQLInputObjectType") base.kind = "INPUT_OBJECT";
  else if (kind === "GraphQLEnumType") base.kind = "ENUM";
  else if (kind === "GraphQLUnionType") base.kind = "UNION";
  else if (kind === "GraphQLInterfaceType") base.kind = "INTERFACE";
  if (anyT.getFields) {
    base.fields = Object.values(anyT.getFields()).map((f) => ({
      name: f.name,
      type: String(f.type),
      description: f.description ?? null,
      args: (f.args ?? []).map((a) => ({ name: a.name, type: String(a.type), default: a.defaultValue === undefined ? null : JSON.stringify(a.defaultValue), description: a.description ?? null })),
    }));
  }
  if (anyT.getValues) base.enum_values = anyT.getValues().map((v) => ({ name: v.name, description: v.description ?? null }));
  if (anyT.getTypes) base.possible_types = anyT.getTypes().map((x) => x.name);
  return base;
}

/** Prints only the schema types a query touches (plus Query when nothing parses), so the model sees real definitions. */
export function schemaExcerpt(query: string, schema: GraphQLSchema = trainingSchema()): string {
  const names = new Set<string>();
  try {
    const doc = parse(query);
    const info = new TypeInfo(schema);
    visit(
      doc,
      visitWithTypeInfo(info, {
        Field() {
          const parent = info.getParentType();
          if (parent) names.add(parent.name);
          const out = info.getType();
          const named = out ? getNamedType(out) : null;
          if (named && !named.name.startsWith("__")) names.add(named.name);
        },
        OperationDefinition(n) {
          if (n.operation === "mutation") names.add("Mutation");
        },
        FragmentDefinition(n) {
          names.add(n.typeCondition.name.value);
        },
      }),
    );
  } catch {
    /* an unparsable query has no types to excerpt */
  }
  if (names.size === 0) names.add("Query");
  const parts: string[] = [];
  for (const n of [...names].slice(0, 8)) {
    const t = schema.getType(n);
    if (t && !isScalarType(t)) parts.push(printType(t));
  }
  return parts.join("\n\n").slice(0, 2500) || "(no types)";
}
