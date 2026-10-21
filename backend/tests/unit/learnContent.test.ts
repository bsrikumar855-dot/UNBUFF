import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DBMS_TOPICS, PATTERNS } from "../../src/learn/content/index.js";

const root = join(import.meta.dirname, "..", "..");
const practice = new Set((JSON.parse(readFileSync(join(root, "data", "dsa", "practice-pack.json"), "utf8")) as { questions: { id: string }[] }).questions.map((q) => q.id));
const python = spawnSync("python3", ["--version"]).status === 0;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

describe("DSA pattern content", () => {
  it("has unique ids and names, and every related id exists", () => {
    const ids = PATTERNS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(PATTERNS.map((p) => p.name)).size).toBe(ids.length);
    for (const p of PATTERNS) {
      expect(p.id).toMatch(SLUG);
      for (const r of p.related) {
        expect(ids, `${p.id} relates to unknown ${r}`).toContain(r);
        expect(r).not.toBe(p.id);
      }
    }
  });

  it("is complete: every pattern teaches the cue, the idea, a template, its cost, its traps and has practice", () => {
    for (const p of PATTERNS) {
      expect(p.cues.length, p.id).toBeGreaterThanOrEqual(3);
      expect(p.summary.length, p.id).toBeGreaterThan(40);
      expect(p.idea.length, p.id).toBeGreaterThanOrEqual(3);
      expect(p.template.trim().length, p.id).toBeGreaterThan(80);
      expect(p.check.trim().length, p.id).toBeGreaterThan(20);
      expect(p.complexity.time && p.complexity.space, p.id).toBeTruthy();
      expect(p.pitfalls.length, p.id).toBeGreaterThanOrEqual(3);
      expect(p.variants.length, p.id).toBeGreaterThanOrEqual(2);
      expect(p.problems.length, p.id).toBeGreaterThanOrEqual(4);
    }
  });

  it("lists only real, well-formed problems: a public slug or one of UNBLUFF's own graded questions", () => {
    for (const p of PATTERNS) {
      const seen = new Set<string>();
      for (const q of p.problems) {
        expect(q.slug !== null || q.practice_id !== null, `${p.id}/${q.title}`).toBe(true);
        if (q.slug !== null) expect(q.slug, `${p.id}/${q.title}`).toMatch(SLUG);
        if (q.practice_id !== null) expect(practice.has(q.practice_id), `${p.id}: unknown practice id ${q.practice_id}`).toBe(true);
        expect(["easy", "medium", "hard"]).toContain(q.difficulty);
        expect(q.note.length, `${p.id}/${q.title}`).toBeGreaterThan(10);
        const key = q.slug ?? q.practice_id!;
        expect(seen.has(key), `${p.id}: duplicate ${key}`).toBe(false);
        seen.add(key);
      }
    }
  });

  it.skipIf(!python).each(PATTERNS.map((p) => [p.id, p] as const))("%s: its Python template passes its own assertions", (_id, p) => {
    const r = spawnSync("python3", ["-I", "-c", `${p.template}\n\n${p.check}\nprint("ok")`], { encoding: "utf8", timeout: 15_000 });
    expect(r.stderr, `${p.id}\n${r.stderr}`).toBe("");
    expect(r.stdout.trim()).toBe("ok");
  });
});

/** Runs an example's setup and query on SQLite (through Python's sqlite3) and returns what the query produced. */
const RUN_SQL = `
import json, sqlite3, sys
d = json.load(sys.stdin)
con = sqlite3.connect(":memory:")
con.executescript(d["setup"])
cur = con.execute(d["query"])
rows = [list(r) for r in cur.fetchall()]
cols = [c[0] for c in cur.description]
if d["query"].lstrip().upper().startswith("EXPLAIN"):
    cols, rows = ["detail"], [[r[-1]] for r in rows]     # keep only the human-readable plan text
print(json.dumps({"columns": cols, "rows": rows}))
`;

function runExample(setup: string, query: string): { columns: string[]; rows: unknown[][] } {
  const r = spawnSync("python3", ["-I", "-c", RUN_SQL], { input: JSON.stringify({ setup, query }), encoding: "utf8", timeout: 15_000 });
  if (r.status !== 0) throw new Error(r.stderr);
  return JSON.parse(r.stdout) as { columns: string[]; rows: unknown[][] };
}
const plan = (v: unknown) => (typeof v === "string" ? v.replace(/^SCAN TABLE /, "SCAN ") : v); // older SQLite says "SCAN TABLE"

describe("DBMS topic content", () => {
  it("has unique ids and names, valid relations, and enough substance in every topic", () => {
    const ids = DBMS_TOPICS.map((t) => t.id);
    expect(ids.length).toBeGreaterThanOrEqual(12);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(DBMS_TOPICS.map((t) => t.name)).size).toBe(ids.length);
    for (const t of DBMS_TOPICS) {
      expect(t.id).toMatch(SLUG);
      expect(t.summary.length, t.id).toBeGreaterThan(40);
      expect(t.minutes, t.id).toBeGreaterThan(0);
      expect(t.sections.length, t.id).toBeGreaterThanOrEqual(2);
      for (const s of t.sections) {
        expect(s.heading.length).toBeGreaterThan(3);
        expect(s.body.length, `${t.id}/${s.heading}`).toBeGreaterThanOrEqual(1);
      }
      expect(t.key_points.length, t.id).toBeGreaterThanOrEqual(4);
      expect(t.interview.length, t.id).toBeGreaterThanOrEqual(3);
      expect(t.related.length, t.id).toBeGreaterThanOrEqual(1);
      for (const r of t.related) {
        expect(ids, `${t.id} relates to unknown ${r}`).toContain(r);
        expect(r).not.toBe(t.id);
      }
    }
  });

  it("has a well-formed quiz in every topic: four options, a valid answer, and a reason, with unique question ids", () => {
    const seen = new Set<string>();
    for (const t of DBMS_TOPICS) {
      expect(t.quiz.length, t.id).toBeGreaterThanOrEqual(4);
      for (const q of t.quiz) {
        expect(seen.has(q.id), `duplicate quiz id ${q.id}`).toBe(false);
        seen.add(q.id);
        expect(q.options.length, q.id).toBe(4);
        expect(new Set(q.options).size, `${q.id}: duplicate options`).toBe(4);
        expect(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length, q.id).toBe(true);
        expect(q.why.length, q.id).toBeGreaterThan(20);
      }
    }
  });

  it("does not always put the right answer in the same place", () => {
    const counts = [0, 0, 0, 0];
    for (const t of DBMS_TOPICS) for (const q of t.quiz) counts[q.answer]!++;
    for (const c of counts) expect(c).toBeGreaterThanOrEqual(3);
  });

  it.skipIf(!python).each(DBMS_TOPICS.filter((t) => t.example !== null).map((t) => [t.id, t.example!] as const))("%s: its SQL example produces exactly the rows shown", (_id, ex) => {
    const got = runExample(ex.setup, ex.query);
    expect(got.columns).toEqual(ex.columns);
    expect(got.rows.map((r) => r.map(plan))).toEqual(ex.rows);
  });

  it("shows an example for the topics where one teaches something (design, SQL, normalization, transactions, indexing)", () => {
    const withExample = DBMS_TOPICS.filter((t) => t.example).map((t) => t.id);
    for (const id of ["er-model", "keys-constraints", "sql-basics", "joins", "group-by-window", "subqueries-cte", "normalization", "transactions-acid", "indexing"]) expect(withExample).toContain(id);
  });
});
