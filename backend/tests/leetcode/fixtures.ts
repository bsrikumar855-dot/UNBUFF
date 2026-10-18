import { SCHEMA_VERSION } from "../../src/leetcode/importer.js";

/** Every number here is fictitious test data. None of it is, or stands in for, a real student's LeetCode statistics. */
export const NOW = new Date("2026-10-18T10:00:00.000Z");

export type Obj = Record<string, unknown>;

/** A complete, valid import (all optional parts present). Override anything, or pass `undefined` to drop a key. */
export function good(over: Obj = {}): Obj {
  const base: Obj = {
    schema_version: SCHEMA_VERSION,
    source_description: "Typed from my own profile page in a unit test",
    captured_at: "2026-10-10T08:00:00Z",
    totals: { solved: 100, easy: 50, medium: 40, hard: 10 },
    available: { easy: 900, medium: 1900, hard: 850 },
    topics: [
      { topic: "Array", solved: 45 },
      { topic: "Hash Table", solved: 30 },
      { topic: "Dynamic Programming", solved: 6 },
      { topic: "Graph", solved: 4 },
    ],
    contest: { rating: 1650.456, global_rank: 120000, attended: 12 },
    activity: [
      { date: "2026-10-08", problems_solved: 2 },
      { date: "2026-10-06", problems_solved: 1 },
    ],
  };
  const out = { ...base, ...over };
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
  return out;
}

/** The smallest valid import: a capture time and one total. */
export const minimal = (over: Obj = {}): Obj => ({ schema_version: SCHEMA_VERSION, captured_at: "2026-10-10T08:00:00Z", totals: { solved: 12 }, ...over });

export const json = (o: unknown) => JSON.stringify(o);
