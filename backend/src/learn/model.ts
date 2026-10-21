/**
 * Learning content, written for UNBLUFF. Everything here is original text and code, checked by tests: each pattern's
 * Python template is executed against its own assertions, and each DBMS SQL example is run on SQLite and compared with
 * the result shown. Problem titles and slugs are facts that point at the problems' public pages; no problem statement
 * or editorial is copied.
 */

export type PatternLevel = "core" | "intermediate" | "advanced";
export type ProblemDifficulty = "easy" | "medium" | "hard";

export interface PatternProblemContent {
  title: string;
  /** leetcode.com/problems/<slug>; null for UNBLUFF's own problems. */
  slug: string | null;
  difficulty: ProblemDifficulty;
  /** Why this problem belongs to the pattern: what the cue looks like in it. */
  note: string;
  /** An UNBLUFF graded practice problem (a first-party question id), or null. */
  practice_id: string | null;
}

export interface PatternContent {
  id: string;
  name: string;
  /** The data-structure or technique family it is filed under. */
  topic: string;
  level: PatternLevel;
  /** Phrases in a problem statement that point to this pattern. */
  cues: string[];
  summary: string;
  /** How it works, in short paragraphs. */
  idea: string[];
  /** A correct Python template. */
  template: string;
  /** Python that asserts the template's behaviour. Run by the tests, never shown. */
  check: string;
  complexity: { time: string; space: string };
  pitfalls: string[];
  variants: { name: string; when: string }[];
  problems: PatternProblemContent[];
  /** Ids of patterns that are close cousins. */
  related: string[];
}

export interface DbmsExample {
  title: string;
  /** SQLite-compatible statements that create and fill the tables. */
  setup: string;
  query: string;
  explanation: string;
  /** What the query returns, so the page can show it and a test can prove it. */
  columns: string[];
  rows: (string | number | null)[][];
}

export interface DbmsQuizQuestion {
  id: string;
  question: string;
  options: string[];
  /** Index into `options`. Never sent to the browser with the question. */
  answer: number;
  /** Shown after answering, right or wrong. */
  why: string;
}

export interface DbmsTopicContent {
  id: string;
  name: string;
  group: string;
  summary: string;
  minutes: number;
  sections: { heading: string; body: string[] }[];
  key_points: string[];
  example: DbmsExample | null;
  interview: { q: string; a: string }[];
  quiz: DbmsQuizQuestion[];
  related: string[];
}
