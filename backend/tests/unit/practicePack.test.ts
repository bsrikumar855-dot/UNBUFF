import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { mergeSuites, serializeSuites } from "../../src/code/suiteImport.js";
import { isAnalyticsEligible, parseSuiteFile, SuiteRegistry, type Suite } from "../../src/code/suites.js";
import { Catalogue, parseCatalogueFile } from "../../src/dsa/catalogue.js";
import { buildPracticePack, exercises, PACK_REVISION, serialize } from "../../scripts/lib/practicePack.js";
import { crossChecks } from "../../scripts/lib/practicePackMore.js";

const backend = join(import.meta.dirname, "..", "..");
const packCatalogue = JSON.parse(readFileSync(join(backend, "data", "dsa", "practice-pack.json"), "utf8")) as unknown;
const packSuites = JSON.parse(readFileSync(join(backend, "data", "code", "practice-suites.json"), "utf8")) as unknown;
const all = exercises();

describe("practice pack data files", () => {
  it("are exactly what the generator produces (run `npm run practice:build` after editing exercises)", () => {
    const built = buildPracticePack();
    expect(readFileSync(join(backend, "data", "dsa", "practice-pack.json"), "utf8")).toBe(serialize(built.catalogue));
    expect(readFileSync(join(backend, "data", "code", "practice-suites.json"), "utf8")).toBe(serialize(built.suites));
  });

  it("validate against the catalogue and suite schemas", () => {
    expect(() => parseCatalogueFile(packCatalogue)).not.toThrow();
    expect(() => parseSuiteFile(packSuites)).not.toThrow();
  });
});

describe("first-party provenance and eligibility", () => {
  const catalogue = new Catalogue(parseCatalogueFile(packCatalogue));
  const suites = parseSuiteFile(packSuites).suites;

  it("is labelled first-party, original and company-free", () => {
    expect(catalogue.source).toMatchObject({ license_status: "own_work", is_sample_data: false, name: expect.stringMatching(/first-party/i) });
    expect(catalogue.source?.license_note).toMatch(/not a company interview question/i);
    const file = parseCatalogueFile(packCatalogue);
    expect(file.companies).toEqual([]);
    expect(file.associations).toEqual([]);
    for (const q of file.questions) expect(q.url).toBeNull(); // no external page, no copied statement
    const text = JSON.stringify(packCatalogue) + JSON.stringify(packSuites);
    expect(text).not.toMatch(/leetcode|hackerrank|codeforces|geeksforgeeks/i);
  });

  it("gives every exercise a stable id, a revision, own_work provenance and a documented eligible status", () => {
    expect(suites).toHaveLength(30);
    expect(new Set(suites.map((s) => s.question_id)).size).toBe(30);
    for (const s of suites) {
      expect(s.question_id).toMatch(/^fp_\d{3}_[a-z_]+$/);
      expect(s.revision).toBe(PACK_REVISION);
      expect(s.is_demonstration).toBe(false);
      expect(s.source.license_status).toBe("own_work");
      expect(s.eligibility.analytics_eligible).toBe(true);
      expect(s.eligibility.reason).toMatch(/hidden tests/);
      expect(isAnalyticsEligible(s)).toBe(true);
      expect(s.statement).toBeTruthy();
      expect(catalogue.hasQuestion(s.question_id)).toBe(true);
    }
  });

  it("spans several topics and all three difficulties", () => {
    const file = parseCatalogueFile(packCatalogue);
    expect(new Set(file.questions.map((q) => q.difficulty))).toEqual(new Set(["easy", "medium", "hard"]));
    expect(new Set(file.questions.flatMap((q) => q.topics)).size).toBeGreaterThanOrEqual(8);
  });

  it("is kept apart from the demonstration fixtures, which can never count", () => {
    const fixture = parseSuiteFile(JSON.parse(readFileSync(join(backend, "data", "code", "fixture-suites.json"), "utf8")));
    for (const s of fixture.suites) {
      expect(s.eligibility.analytics_eligible).toBe(false);
      expect(isAnalyticsEligible(s)).toBe(false);
      expect(suites.some((p) => p.question_id === s.question_id)).toBe(false);
    }
  });
});

describe("hidden suite quality", () => {
  const suites = parseSuiteFile(packSuites).suites;

  it("has samples, enough hidden tests, and hidden inputs distinct from the samples and from each other", () => {
    for (const s of suites) {
      expect(s.samples.length, s.question_id).toBeGreaterThanOrEqual(1);
      expect(s.tests.length, s.question_id).toBeGreaterThanOrEqual(8);
      const visible = new Set(s.samples.map((x) => x.input));
      expect(s.tests.some((t) => visible.has(t.input)), s.question_id).toBe(false);
      expect(new Set(s.tests.map((t) => t.input)).size, s.question_id).toBe(s.tests.length);
    }
  });

  it("covers varied outcomes, including both answers for yes/no problems, and not just one repeated output", () => {
    for (const s of suites) {
      const outputs = new Set(s.tests.map((t) => t.expected_output));
      expect(outputs.size, s.question_id).toBeGreaterThanOrEqual(2);
    }
    const brackets = suites.find((s) => s.question_id === "fp_001_balanced_brackets")!;
    expect(new Set(brackets.tests.map((t) => t.expected_output))).toEqual(new Set(["YES\n", "NO\n"]));
  });

  it("uses one consistent text contract: every input and output ends with a single newline and has no carriage returns", () => {
    for (const s of suites) {
      for (const t of [...s.samples, ...s.tests]) {
        expect(t.input.endsWith("\n") && !t.input.endsWith("\n\n"), s.question_id).toBe(true);
        expect(t.expected_output.endsWith("\n") && !t.expected_output.endsWith("\n\n"), s.question_id).toBe(true);
        expect(`${t.input}${t.expected_output}`.includes("\r"), s.question_id).toBe(false);
      }
    }
  });

  it("every expected output is reproduced by a second, independent implementation", () => {
    const byId = new Map(suites.map((s) => [s.question_id, s]));
    const check = (id: string, brute: (input: string) => string) => {
      const s = byId.get(id)!;
      for (const t of [...s.samples, ...s.tests]) expect(`${brute(t.input)}\n`, `${id}\n${t.input.slice(0, 60)}`).toBe(t.expected_output);
    };
    const rows = (input: string) => input.split("\n").filter((l, i, a) => !(i === a.length - 1 && l === ""));
    const nums = (l: string) => l.split(" ").map(Number);

    check("fp_001_balanced_brackets", (i) => {
      let s = rows(i)[0]!;
      for (let prev = ""; prev !== s; ) {
        prev = s;
        s = s.replace("()", "").replace("[]", "").replace("{}", "");
      }
      return s === "" ? "YES" : "NO";
    });
    check("fp_002_pair_count", (i) => {
      const [h, a] = rows(i);
      const t = nums(h!)[1]!;
      const v = nums(a!);
      let c = 0;
      for (let x = 0; x < v.length; x++) for (let y = x + 1; y < v.length; y++) if (v[x]! + v[y]! === t) c++;
      return String(c);
    });
    check("fp_003_longest_run", (i) => String(Math.max(...(rows(i)[0]!.match(/(.)\1*/g) ?? [""]).map((m) => m.length))));
    check("fp_004_first_not_less", (i) => {
      const r = rows(i);
      const [n, q] = nums(r[0]!) as [number, number];
      const a = nums(r[1]!);
      return Array.from({ length: q }, (_v, k) => {
        const x = Number(r[2 + k]);
        const idx = a.findIndex((y) => y >= x);
        return idx === -1 ? n : idx;
      }).join("\n");
    });
    check("fp_005_coin_ways", (i) => {
      const r = rows(i);
      const amount = nums(r[0]!)[1]!;
      const coins = nums(r[1]!);
      const M = 1_000_000_007n;
      let ways = new Array<bigint>(amount + 1).fill(0n); // ways[v] using the first k coins only
      ways[0] = 1n;
      for (const c of coins) {
        const next = ways.slice();
        for (let v = c; v <= amount; v++) next[v] = (next[v]! + next[v - c]!) % M;
        ways = next;
      }
      return ways[amount]!.toString();
    });
    check("fp_006_shortest_hops", (i) => {
      const r = rows(i);
      const [n, m, s, t] = nums(r[0]!) as [number, number, number, number];
      const INF = 1e9;
      const d: number[][] = Array.from({ length: n + 1 }, (_v, x) => Array.from({ length: n + 1 }, (_w, y) => (x === y ? 0 : INF)));
      for (let k = 0; k < m; k++) {
        const [u, v] = nums(r[1 + k]!) as [number, number];
        if (u !== v) d[u]![v] = d[v]![u] = 1;
      }
      for (let k = 1; k <= n; k++) for (let x = 1; x <= n; x++) for (let y = 1; y <= n; y++) if (d[x]![k]! + d[k]![y]! < d[x]![y]!) d[x]![y] = d[x]![k]! + d[k]![y]!;
      return String(d[s]![t]! >= INF ? -1 : d[s]![t]);
    });
    check("fp_007_covered_time", (i) => {
      const r = rows(i);
      const iv = Array.from({ length: Number(r[0]) }, (_v, k) => nums(r[1 + k]!) as [number, number]);
      const pts = [...new Set(iv.flat())].sort((a, b) => a - b);
      let total = 0;
      for (let k = 0; k + 1 < pts.length; k++) if (iv.some(([a, b]) => a <= pts[k]! && pts[k + 1]! <= b)) total += pts[k + 1]! - pts[k]!;
      return String(total);
    });
    check("fp_008_window_distinct", (i) => {
      const r = rows(i);
      const k = nums(r[0]!)[1]!;
      const a = nums(r[1]!);
      const out: number[] = [];
      for (let s = 0; s + k <= a.length; s++) out.push(new Set(a.slice(s, s + k)).size);
      return out.join(" ");
    });
    check("fp_009_island_count", (i) => {
      const r = rows(i);
      const [h, w] = nums(r[0]!) as [number, number];
      const parent = Array.from({ length: h * w }, (_v, x) => x);
      const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x]!)));
      const land = (x: number, y: number) => x >= 0 && y >= 0 && x < h && y < w && r[1 + x]![y] === "#";
      for (let x = 0; x < h; x++) for (let y = 0; y < w; y++) if (land(x, y)) for (const [dx, dy] of [[1, 0], [0, 1]] as const) if (land(x + dx, y + dy)) parent[find(x * w + y)] = find((x + dx) * w + y + dy);
      const roots = new Set<number>();
      for (let x = 0; x < h; x++) for (let y = 0; y < w; y++) if (land(x, y)) roots.add(find(x * w + y));
      return String(roots.size);
    });
    check("fp_010_edit_cost", (i) => {
      const [a, b] = rows(i) as [string, string];
      const memo = new Map<string, number>();
      const f = (x: number, y: number): number => {
        if (x === a.length) return b.length - y;
        if (y === b.length) return a.length - x;
        const k = `${x},${y}`;
        if (!memo.has(k)) memo.set(k, a[x] === b[y] ? f(x + 1, y + 1) : 1 + Math.min(f(x + 1, y), f(x, y + 1), f(x + 1, y + 1)));
        return memo.get(k)!;
      };
      return String(f(0, 0));
    });
  }, 60_000);

  it("exercises 11 to 30 are each reproduced by a different, brute-force style implementation", () => {
    const byId = new Map(suites.map((s) => [s.question_id, s]));
    expect(Object.keys(crossChecks)).toHaveLength(20);
    for (const [id, check] of Object.entries(crossChecks)) {
      const s = byId.get(id)!;
      for (const t of [...s.samples, ...s.tests]) expect(`${check(t.input)}\n`, `${id}\n${t.input.slice(0, 60)}`).toBe(t.expected_output);
    }
  }, 120_000);

  it("the generator's own reference solutions agree with the committed data", () => {
    expect(all).toHaveLength(30);
    const suitesById = new Map(suites.map((s) => [s.question_id, s]));
    for (const e of all) for (const t of suitesById.get(e.id)!.tests) expect(t.expected_output).toBe(`${e.solve(t.input)}\n`);
  });
});

describe("bundled defaults are internally consistent", () => {
  it("every suite belongs to a question in the catalogue shipped with it, for the pack and for the demonstration fixture", () => {
    const pairs: [string, string][] = [
      ["dsa/practice-pack.json", "code/practice-suites.json"],
      ["dsa/fixture.json", "code/fixture-suites.json"],
    ];
    for (const [cat, suite] of pairs) {
      const catalogue = new Catalogue(parseCatalogueFile(JSON.parse(readFileSync(join(backend, "data", cat), "utf8"))));
      for (const s of parseSuiteFile(JSON.parse(readFileSync(join(backend, "data", suite), "utf8"))).suites) expect(catalogue.hasQuestion(s.question_id), `${suite}: ${s.question_id}`).toBe(true);
    }
  });
});

describe("seeding is idempotent and safe", () => {
  it("merging the pack twice changes nothing, and serialization is stable", () => {
    const catalogue = new Catalogue(parseCatalogueFile(packCatalogue));
    const first = mergeSuites(null, packSuites, { catalogue });
    expect(first.report.added).toHaveLength(30);
    const again = mergeSuites(first.file, packSuites, { catalogue });
    expect(again.report).toMatchObject({ added: [], updated: [], changed: false });
    expect(again.report.unchanged).toHaveLength(30);
    expect(serializeSuites(again.file)).toBe(serializeSuites(first.file));
  });

  it("re-seeding never touches student progress, which lives in a separate store keyed by question id", async () => {
    const { MemoryProgressStore } = await import("../../src/dsa/progressStore.js");
    const { DsaProgressService } = await import("../../src/dsa/progressService.js");
    const store = new MemoryProgressStore();
    const first = new DsaProgressService(store, () => new Catalogue(parseCatalogueFile(packCatalogue)));
    await first.put("alice", "fp_001_balanced_brackets", { status: "solved", notes: "mine", bookmarked: true });
    mergeSuites(mergeSuites(null, packSuites, {}).file, packSuites, {}); // a seed run, twice
    const second = new DsaProgressService(store, () => new Catalogue(parseCatalogueFile(packCatalogue))); // catalogue reloaded
    expect((await second.list("alice")).progress).toEqual([expect.objectContaining({ question_id: "fp_001_balanced_brackets", status: "solved", notes: "mine", bookmarked: true })]);
  });

  it("changing a suite without a new revision is refused, so graded history keeps a stable meaning", () => {
    const first = mergeSuites(null, packSuites, {});
    const edited = JSON.parse(JSON.stringify(packSuites)) as { suites: Suite[] };
    edited.suites[0]!.tests[0]!.expected_output = "NO-CHANGE-OF-REVISION\n";
    expect(() => mergeSuites(first.file, edited, {})).toThrow(/bump the revision/);
  });
});

describe("suite metadata validation", () => {
  const base = (over: Partial<Suite> = {}): unknown => ({
    schema_version: 1,
    suites: [
      {
        question_id: "fp_999_demo",
        revision: "r1",
        is_demonstration: false,
        statement: "x",
        source: { name: "n", license_status: "own_work", license_note: "n" },
        samples: [{ input: "s\n", expected_output: "s\n" }],
        tests: ["1", "2", "3", "4", "5"].map((n) => ({ input: `${n}\n`, expected_output: `${n}\n` })),
        limits: { cpu_time_seconds: 2, memory_mb: 128 },
        starter_code: {},
        eligibility: { analytics_eligible: true, reason: "r" },
        ...over,
      },
    ],
  });

  it("accepts a well-formed eligible suite", () => {
    expect(() => parseSuiteFile(base())).not.toThrow();
  });

  it.each([
    ["too few hidden tests", { tests: [{ input: "1\n", expected_output: "1\n" }] }, /at least 5 hidden tests/],
    ["no visible sample", { samples: [] }, /at least one visible sample/],
    ["a demonstration marked eligible", { is_demonstration: true }, /cannot be analytics-eligible/],
    ["a fixture licence marked eligible", { source: { name: "n", license_status: "development_fixture", license_note: "n" } }, /cannot be analytics-eligible/],
    ["a missing eligibility reason", { eligibility: { analytics_eligible: true, reason: "" } }, /./],
    ["an unknown eligibility key", { eligibility: { analytics_eligible: true, reason: "r", extra: 1 } }, /./],
  ])("rejects %s", (_name, over, message) => {
    expect(() => parseSuiteFile(base(over as Partial<Suite>))).toThrow(message);
  });

  it("treats a suite with no eligibility declaration as NOT eligible", () => {
    const raw = base() as { suites: Record<string, unknown>[] };
    delete raw.suites[0]!.eligibility;
    const parsed = parseSuiteFile(raw);
    expect(parsed.suites[0]!.eligibility.analytics_eligible).toBe(false);
    expect(new SuiteRegistry(parsed).isEligible("fp_999_demo")).toBe(false);
  });
});

describe("browser bundle", () => {
  it("never contains hidden test inputs (checked against the built frontend when it exists)", () => {
    const dist = join(backend, "..", "frontend", "dist");
    if (!existsSync(dist)) return; // the build runs in the full check; this guard keeps unit runs independent of it
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(js|css|html|json|map)$/.test(name)) files.push(p);
      }
    };
    walk(dist);
    const suites = parseSuiteFile(packSuites).suites.concat(parseSuiteFile(JSON.parse(readFileSync(join(backend, "data", "code", "fixture-suites.json"), "utf8"))).suites);
    const secrets = suites.flatMap((s) => s.tests.map((t) => t.input).filter((i) => i.length >= 30 && !s.samples.some((x) => x.input === i)));
    expect(secrets.length).toBeGreaterThan(10);
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      for (const secret of secrets) expect(text.includes(JSON.stringify(secret).slice(1, -1)), `${f} contains a hidden test input`).toBe(false);
    }
  });
});
