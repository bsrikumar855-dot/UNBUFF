import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { Catalogue, parseCatalogueFile } from "../../src/dsa/catalogue.js";
import {
  buildCatalogue,
  canonicalUrl,
  ImportError,
  parseCsv,
  parseRecords,
  serializeCatalogue,
  slugify,
  type ImportSource,
  type RawRecord,
} from "../../src/dsa/importer.js";

const source: ImportSource = {
  name: "Approved test data",
  license_status: "permission_granted",
  license_note: "Permission recorded in test fixture",
  url: null,
  source_updated_at: "2026-01-01",
};
const t0 = () => new Date("2026-02-01T00:00:00Z");
const t1 = () => new Date("2026-03-01T00:00:00Z");

const rec = (company: string, title: string, path: string, difficulty = "Easy", topics = "Arrays;Hash Table"): RawRecord => ({
  company,
  title,
  url: `https://example.com/${path}`,
  difficulty,
  topics,
});

const rows = [rec("Acme", "Pair Sum", "pair-sum"), rec("Acme", "Window", "window", "medium", "Arrays"), rec("Globex Corp", "Window", "window", "medium", "Sliding Window")];

describe("CSV and JSON parsing", () => {
  it("parses quoted fields, escaped quotes, CRLF and a BOM", () => {
    const text = '﻿company,title,url,difficulty,topics\r\nAcme,"Sum, ""Pair""",https://example.com/a,easy,"Arrays,Hash Table"\r\n\r\n';
    expect(parseCsv(text)).toEqual([
      ["company", "title", "url", "difficulty", "topics"],
      ["Acme", 'Sum, "Pair"', "https://example.com/a", "easy", "Arrays,Hash Table"],
    ]);
    const records = parseRecords(text, "csv");
    expect(records[0]).toMatchObject({ company: "Acme", title: 'Sum, "Pair"', topics: "Arrays,Hash Table" });
  });

  it("rejects a CSV with missing columns or an unterminated quote", () => {
    expect(() => parseRecords("company,title\nA,B", "csv")).toThrow(/missing required column/);
    expect(() => parseCsv('a,"b')).toThrow(/unterminated/);
  });

  it("accepts a JSON array or a { records } object and rejects other shapes", () => {
    expect(parseRecords(JSON.stringify(rows), "json")).toHaveLength(3);
    expect(parseRecords(JSON.stringify({ records: rows }), "json")).toHaveLength(3);
    expect(() => parseRecords("{}", "json")).toThrow(ImportError);
    expect(() => parseRecords("not json", "json")).toThrow(/not valid JSON/);
  });
});

describe("URL and name normalization", () => {
  it("canonicalizes https URLs and rejects unsafe ones", () => {
    expect(canonicalUrl("https://Example.com/Problems/x/#frag")).toBe("https://example.com/Problems/x");
    expect(() => canonicalUrl("http://example.com/x")).toThrow(/https/);
    expect(() => canonicalUrl("javascript:alert(1)")).toThrow();
    expect(() => canonicalUrl("https://user:pw@example.com/x")).toThrow(/credentials/);
    expect(() => canonicalUrl("https://localhost/x")).toThrow(/public domain/);
    expect(() => canonicalUrl("https://10.0.0.1/x")).toThrow(/public domain/);
    expect(() => canonicalUrl("not a url")).toThrow(/invalid URL/);
    expect(() => canonicalUrl("https://evil.test/x", ["example.com"])).toThrow(/allowed hosts/);
    expect(canonicalUrl("https://www.example.com/x", ["example.com"])).toBe("https://www.example.com/x");
  });

  it("slugifies company names", () => {
    expect(slugify("Globex Corp")).toBe("globex-corp");
    expect(slugify("AT&T")).toBe("at-and-t");
    expect(slugify("Zoë Inc.")).toBe("zoe-inc");
    expect(slugify("***")).toBe("");
  });
});

describe("buildCatalogue", () => {
  it("builds companies, questions and many-to-many associations", () => {
    const { file, report } = buildCatalogue(rows, null, { source, now: t0 });
    expect(report).toMatchObject({ rows: 3, companies: 2, questions: 2, associations: 3, duplicate_rows_collapsed: 0, changed: true });
    const c = new Catalogue(file);
    expect(c.questionDetail(file.questions.find((q) => q.title === "Window")!.id)?.companies.map((x) => x.name)).toEqual(["Acme", "Globex Corp"]);
    // topics from both rows merge on the shared question
    expect(file.questions.find((q) => q.title === "Window")!.topics).toEqual(["Arrays", "Sliding Window"]);
    expect(file.source).toMatchObject({ license_status: "permission_granted", imported_at: "2026-02-01T00:00:00.000Z" });
  });

  it("collapses exact duplicate rows and reports them", () => {
    const { file, report } = buildCatalogue([...rows, rows[0]!], null, { source, now: t0 });
    expect(report.duplicate_rows_collapsed).toBe(1);
    expect(file.associations).toHaveLength(3);
  });

  it("is all-or-nothing and lists every bad row", () => {
    const bad = [rec("Acme", "", "a"), rec("", "T", "b"), rec("Acme", "T", "c", "wizard"), { ...rec("Acme", "T", "d"), url: "http://example.com/d" }, rec("Acme", "Ok", "ok")];
    try {
      buildCatalogue(bad, null, { source, now: t0 });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ImportError);
      const p = (e as ImportError).problems;
      expect(p).toHaveLength(4);
      expect(p.join("\n")).toMatch(/row 1: title is required/);
      expect(p.join("\n")).toMatch(/row 2: company is required/);
      expect(p.join("\n")).toMatch(/row 3: difficulty/);
      expect(p.join("\n")).toMatch(/row 4: URL must use https/);
    }
  });

  it("rejects conflicting duplicates and colliding company names", () => {
    expect(() => buildCatalogue([rec("A", "One", "x"), rec("B", "Two", "x")], null, { source, now: t0 })).toThrow(/conflicting/);
    expect(() => buildCatalogue([rec("A.B", "One", "x"), rec("A B", "Two", "y")], null, { source, now: t0 })).toThrow(/collides/);
    expect(() => buildCatalogue([], null, { source, now: t0 })).toThrow(/no records/);
  });

  it("requires an explicit licence/permission statement and blocks the unlicensed reference repo", () => {
    expect(() => buildCatalogue(rows, null, { source: { ...source, license_status: "unknown" as never }, now: t0 })).toThrow(/license_status/);
    expect(() => buildCatalogue(rows, null, { source: { ...source, license_note: " " }, now: t0 })).toThrow(/note are required/);
    const repo = "https://github.com/liquidslr/leetcode-company-wise-problems";
    expect(() => buildCatalogue(rows, null, { source: { ...source, url: repo, license_status: "public_domain" }, now: t0 })).toThrow(/declares no licence/);
    expect(() => buildCatalogue(rows, null, { source: { ...source, url: repo, license_status: "own_work" }, now: t0 })).toThrow(/declares no licence/);
    expect(() => buildCatalogue(rows, null, { source: { ...source, url: repo, license_status: "permission_granted" }, now: t0 })).not.toThrow();
  });

  it("is idempotent: importing the same input twice changes nothing, not even imported_at", () => {
    const first = buildCatalogue(rows, null, { source, now: t0 });
    const second = buildCatalogue(rows, first.file, { source, now: t1 });
    expect(second.report.changed).toBe(false);
    expect(serializeCatalogue(second.file)).toBe(serializeCatalogue(first.file));
    expect(second.report).toMatchObject({ questions: 2, associations: 3 });
    // and row order does not matter
    const shuffled = buildCatalogue([...rows].reverse(), first.file, { source, now: t1 });
    expect(shuffled.report.changed).toBe(false);
  });

  it("merges additively by default, keeping question ids stable, and refreshes changed metadata", () => {
    const first = buildCatalogue(rows, null, { source, now: t0 });
    const ids = new Map(first.file.questions.map((q) => [q.title, q.id]));
    const more = [rec("Initech", "Late Addition", "late", "hard", "Graphs"), rec("Acme", "Pair Sum", "pair-sum", "easy", "Arrays")];
    const merged = buildCatalogue(more, first.file, { source: { ...source, source_updated_at: "2026-02-15" }, now: t1 });
    expect(merged.report).toMatchObject({ questions: 3, companies: 3, changed: true });
    expect(merged.file.source.imported_at).toBe("2026-03-01T00:00:00.000Z");
    expect(merged.file.questions.find((q) => q.title === "Pair Sum")!.id).toBe(ids.get("Pair Sum"));
    expect(merged.file.questions.find((q) => q.title === "Pair Sum")!.topics).toEqual(["Arrays"]); // newest metadata wins
    expect(() => parseCatalogueFile(merged.file)).not.toThrow();
  });

  it("replace rebuilds from the input alone; a different source is refused when merging", () => {
    const first = buildCatalogue(rows, null, { source, now: t0 });
    const replaced = buildCatalogue([rec("Acme", "Only One", "one")], first.file, { source, replace: true, now: t1 });
    expect(replaced.file.questions.map((q) => q.title)).toEqual(["Only One"]);
    expect(() => buildCatalogue(rows, first.file, { source: { ...source, name: "Another provider" }, now: t1 })).toThrow(/blur provenance/);
    expect(() => buildCatalogue(rows, first.file, { source: { ...source, name: "Another provider" }, replace: true, now: t1 })).not.toThrow();
  });
});

describe("dsa:import command line", () => {
  const dir = mkdtempSync(join(tmpdir(), "dsa-import-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const tsx = join(import.meta.dirname, "..", "..", "node_modules", "tsx", "dist", "cli.mjs");
  const script = join(import.meta.dirname, "..", "..", "scripts", "dsa_import.ts");
  const run = (args: string[]) => {
    try {
      return { code: 0, out: execFileSync(process.execPath, [tsx, script, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) };
    } catch (e) {
      const err = e as { status: number; stderr: string };
      return { code: err.status, out: err.stderr };
    }
  };

  it("imports idempotently and refuses to run without a licence statement", () => {
    const input = join(dir, "approved.csv");
    const out = join(dir, "catalogue.json");
    writeFileSync(input, "company,title,url,difficulty,topics\nAcme,Pair Sum,https://example.com/pair-sum,easy,Arrays\nAcme,Window,https://example.com/window,medium,Arrays\n");
    const common = ["--input", input, "--out", out, "--source-name", "Approved test data", "--license-status", "permission_granted", "--license-note", "test permission"];

    const first = run(common);
    expect(first.code).toBe(0);
    const bytes = readFileSync(out, "utf8");
    expect(() => parseCatalogueFile(JSON.parse(bytes))).not.toThrow();

    const second = run(common);
    expect(second.code).toBe(0);
    expect(second.out).toMatch(/No changes/);
    expect(readFileSync(out, "utf8")).toBe(bytes);

    const refused = run(["--input", input, "--out", out, "--source-name", "x"]);
    expect(refused.code).toBe(1);
    expect(refused.out).toMatch(/--license-status is required/);

    const dry = run([...common.slice(0, 2), "--out", join(dir, "dry.json"), ...common.slice(4), "--dry-run"]);
    expect(dry.out).toMatch(/Dry run/);
  }, 60_000);
});
