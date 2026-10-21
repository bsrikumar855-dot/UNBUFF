import { ApiError } from "../errors.js";
import type {
  DbmsProgress,
  DbmsQuizResult,
  DbmsTopicDetail,
  DbmsTopicsResponse,
  LearnProgress,
  LearnProgressResponse,
  PatternDetail,
  PatternProblem,
  PatternProgressRequest,
  PatternsResponse,
} from "../types.js";
import { DBMS_TOPICS, PATTERNS } from "./content/index.js";
import type { DbmsTopicContent, PatternContent } from "./model.js";
import type { LearnRecord, LearnStore } from "./store.js";

/** The score needed on a topic's quiz to count it as passed: three out of four questions. */
export const PASS_FRACTION = 0.75;
const MAX_PROBLEM_MARKS = 64;

const TOPIC_ORDER = ["Arrays and Strings", "Searching", "Stacks and Queues", "Heaps", "Linked Lists", "Trees", "Graphs", "Recursion and Backtracking", "Dynamic Programming"];
const GROUP_ORDER = ["Design", "SQL", "Transactions", "Performance", "Landscape"];

const leetcodeUrl = (slug: string) => `https://leetcode.com/problems/${slug}/`;
const problemOf = (p: PatternContent["problems"][number]): PatternProblem => ({
  key: p.slug ?? p.practice_id!,
  title: p.title,
  difficulty: p.difficulty,
  note: p.note,
  url: p.slug ? leetcodeUrl(p.slug) : null,
  practice_id: p.practice_id,
});
const nameOfPattern = (id: string) => PATTERNS.find((p) => p.id === id)!.name;
const nameOfTopic = (id: string) => DBMS_TOPICS.find((t) => t.id === id)!.name;

const patternSummary = (p: PatternContent) => ({ id: p.id, name: p.name, topic: p.topic, level: p.level, cues: p.cues, summary: p.summary, problem_count: p.problems.length });
const topicSummary = (t: DbmsTopicContent) => ({ id: t.id, name: t.name, group: t.group, summary: t.summary, minutes: t.minutes, has_example: t.example !== null, quiz_questions: t.quiz.length });

export interface LearnDeps {
  store: LearnStore;
  now?: () => Date;
}

/**
 * DSA patterns and DBMS topics, and each student's progress through them. The content is static and public.
 * Progress on patterns and problems is self-reported and labelled as such; DBMS progress is earned by passing a quiz
 * that this server grades, so the answers are never sent to the browser with the questions.
 */
export class LearnService {
  constructor(private readonly deps: LearnDeps) {}

  private now(): Date {
    return this.deps.now ? this.deps.now() : new Date();
  }

  // ---------------- content ----------------

  patterns(): PatternsResponse {
    const topics = [...new Set(PATTERNS.map((p) => p.topic))].sort((a, b) => (TOPIC_ORDER.indexOf(a) + 1 || 99) - (TOPIC_ORDER.indexOf(b) + 1 || 99));
    return { patterns: PATTERNS.map(patternSummary), topics };
  }

  pattern(id: string): PatternDetail {
    const p = PATTERNS.find((x) => x.id === id);
    if (!p) throw new ApiError("LEARN_NOT_FOUND", `Pattern ${id} not found`);
    return {
      ...patternSummary(p),
      idea: p.idea,
      template: p.template,
      complexity: p.complexity,
      pitfalls: p.pitfalls,
      variants: p.variants,
      problems: p.problems.map(problemOf),
      related: p.related.map((r) => ({ id: r, name: nameOfPattern(r) })),
    };
  }

  dbmsTopics(): DbmsTopicsResponse {
    const groups = [...new Set(DBMS_TOPICS.map((t) => t.group))].sort((a, b) => (GROUP_ORDER.indexOf(a) + 1 || 99) - (GROUP_ORDER.indexOf(b) + 1 || 99));
    return { topics: DBMS_TOPICS.map(topicSummary), groups };
  }

  dbmsTopic(id: string): DbmsTopicDetail {
    const t = DBMS_TOPICS.find((x) => x.id === id);
    if (!t) throw new ApiError("LEARN_NOT_FOUND", `DBMS topic ${id} not found`);
    return {
      ...topicSummary(t),
      sections: t.sections,
      key_points: t.key_points,
      example: t.example,
      interview: t.interview,
      quiz: t.quiz.map((q) => ({ id: q.id, question: q.question, options: q.options })), // never the answer
      related: t.related.map((r) => ({ id: r, name: nameOfTopic(r) })),
    };
  }

  // ---------------- progress ----------------

  private blank(uid: string): LearnRecord {
    return { owner_uid: uid, patterns: {}, dbms: {}, updated_at: this.now().toISOString() };
  }

  private view(rec: LearnRecord | null): LearnProgressResponse {
    const progress: LearnProgress = rec ? { patterns: rec.patterns, dbms: rec.dbms, updated_at: rec.updated_at } : { patterns: {}, dbms: {}, updated_at: null };
    return {
      progress,
      patterns_done: Object.values(progress.patterns).filter((p) => p.done).length,
      patterns_total: PATTERNS.length,
      dbms_passed: Object.values(progress.dbms).filter((d) => d.passed_at !== null).length,
      dbms_total: DBMS_TOPICS.length,
    };
  }

  async progress(uid: string): Promise<LearnProgressResponse> {
    return this.view(await this.deps.store.get(uid));
  }

  /** Records which patterns and problems the student says they have finished. Self-reported, never verified. */
  async setPatternProgress(uid: string, id: string, req: PatternProgressRequest): Promise<LearnProgressResponse> {
    const pattern = PATTERNS.find((p) => p.id === id);
    if (!pattern) throw new ApiError("LEARN_NOT_FOUND", `Pattern ${id} not found`);
    if (req.done === undefined && !req.problems?.length) throw new ApiError("BAD_REQUEST", "Nothing to update.");
    const valid = new Set(pattern.problems.map((p) => p.slug ?? p.practice_id!));
    for (const m of req.problems ?? []) if (!valid.has(m.key)) throw new ApiError("BAD_REQUEST", `"${m.key}" is not one of this pattern's problems.`);
    if ((req.problems?.length ?? 0) > MAX_PROBLEM_MARKS) throw new ApiError("BAD_REQUEST", "Too many problems in one request.");

    const rec = (await this.deps.store.get(uid)) ?? this.blank(uid);
    const cur = rec.patterns[id] ?? { done: false, problems_done: [] };
    const done = new Set(cur.problems_done);
    for (const m of req.problems ?? []) {
      if (m.done) done.add(m.key);
      else done.delete(m.key);
    }
    rec.patterns[id] = { done: req.done ?? cur.done, problems_done: pattern.problems.map((p) => p.slug ?? p.practice_id!).filter((k) => done.has(k)) };
    rec.updated_at = this.now().toISOString();
    await this.deps.store.put(rec);
    return this.view(rec);
  }

  /** Grades a topic's quiz on the server and records the attempt. */
  async gradeQuiz(uid: string, topicId: string, answers: number[]): Promise<DbmsQuizResult> {
    const topic = DBMS_TOPICS.find((t) => t.id === topicId);
    if (!topic) throw new ApiError("LEARN_NOT_FOUND", `DBMS topic ${topicId} not found`);
    const total = topic.quiz.length;
    if (answers.length !== total) throw new ApiError("BAD_REQUEST", `Answer all ${total} questions.`);
    for (const a of answers) if (!Number.isInteger(a) || a < 0 || a > 3) throw new ApiError("BAD_REQUEST", "Each answer must be the number of one of the options.");

    const results = topic.quiz.map((q, i) => ({ question_id: q.id, chosen: answers[i]!, answer: q.answer, correct: answers[i] === q.answer, why: q.why }));
    const score = results.filter((r) => r.correct).length;
    const pass_mark = Math.ceil(total * PASS_FRACTION);
    const passed = score >= pass_mark;

    const now = this.now().toISOString();
    const rec = (await this.deps.store.get(uid)) ?? this.blank(uid);
    const prev = rec.dbms[topicId];
    const progress: DbmsProgress = {
      best_score: Math.max(prev?.best_score ?? 0, score),
      total,
      attempts: (prev?.attempts ?? 0) + 1,
      passed_at: prev?.passed_at ?? (passed ? now : null), // the first time it was passed; a later weaker attempt never un-passes it
      last_attempt_at: now,
    };
    rec.dbms[topicId] = progress;
    rec.updated_at = now;
    await this.deps.store.put(rec);
    return { topic_id: topicId, score, total, pass_mark, passed, results, progress };
  }

  /** Everything this student has under Learn, for deletion. */
  async deleteAll(uid: string): Promise<void> {
    await this.deps.store.delete(uid);
  }

  /** What the placement planner may read: each DBMS topic with its quiz record. */
  async dbmsEvidence(uid: string): Promise<{ id: string; title: string; group: string; minutes: number; passed: boolean; attempts: number; best_score: number; total: number; last_attempt_at: string | null }[]> {
    const rec = await this.deps.store.get(uid);
    return DBMS_TOPICS.map((t) => {
      const d = rec?.dbms[t.id];
      return { id: t.id, title: t.name, group: t.group, minutes: t.minutes, passed: d?.passed_at !== undefined && d.passed_at !== null, attempts: d?.attempts ?? 0, best_score: d?.best_score ?? 0, total: t.quiz.length, last_attempt_at: d?.last_attempt_at ?? null };
    });
  }
}
