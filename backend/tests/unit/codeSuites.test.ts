import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { mergeSuites, serializeSuites } from "../../src/code/suiteImport.js";
import { loadConfig, judge0UrlProblem } from "../../src/config.js";
import { parseSuiteFile, SuiteRegistry, type Suite } from "../../src/code/suites.js";
import { Catalogue, parseCatalogueFile } from "../../src/dsa/catalogue.js";

const fixturePath = join(import.meta.dirname, "..", "..", "data", "code", "fixture-suites.json");
const fixtureRaw = () => JSON.parse(readFileSync(fixturePath, "utf8")) as { schema_version: 1; suites: Suite[] };

const suite = (id: string, over: Partial<Suite> = {}): Suite => ({
  question_id: id,
  revision: "r1",
  is_demonstration: false,
  statement: null,
  source: { name: "Own tests", license_status: "own_work", license_note: "written by us" },
  samples: [{ input: "1\n", expected_output: "1\n" }],
  tests: [{ input: "2\n", expected_output: "2\n" }],
  limits: { cpu_time_seconds: 2, memory_mb: 128 },
  starter_code: {},
  eligibility: { analytics_eligible: false, reason: "test default" },
  ...over,
});
const file = (...suites: Suite[]) => ({ schema_version: 1 as const, suites });

describe("suite file validation", () => {
  it("accepts the bundled demonstration fixture and labels it as such", () => {
    const parsed = parseSuiteFile(fixtureRaw());
    expect(parsed.suites).toHaveLength(3);
    for (const s of parsed.suites) {
      expect(s.is_demonstration).toBe(true);
      expect(s.source.license_status).toBe("development_fixture");
      expect(s.tests.length).toBeGreaterThanOrEqual(5);
    }
  });

  it.each([
    ["duplicate suites", file(suite("q_a"), suite("q_a")), /duplicate suite/],
    ["no hidden tests", file(suite("q_a", { tests: [] })), /./],
    ["empty expected output", file(suite("q_a", { tests: [{ input: "1", expected_output: "" }] })), /./],
    ["hidden tests identical to the visible samples", file(suite("q_a", { tests: [{ input: "1\n", expected_output: "1\n" }] })), /also a visible sample/],
    ["a demonstration exercise with a licensed source", file(suite("q_a", { is_demonstration: true, source: { name: "x", license_status: "licensed", license_note: "y" } })), /demonstration exercise must be/],
    ["too many tests", file(suite("q_a", { tests: Array.from({ length: 51 }, (_v, i) => ({ input: String(i), expected_output: "1" })) })), /./],
    ["oversized test data", file(suite("q_a", { tests: [{ input: "x".repeat(20_001), expected_output: "1" }] })), /./],
    ["an unknown licence status", { schema_version: 1, suites: [{ ...suite("q_a"), source: { name: "x", license_status: "unknown", license_note: "y" } }] }, /./],
    ["a limit above the cap", file(suite("q_a", { limits: { cpu_time_seconds: 60, memory_mb: 128 } })), /./],
    ["unknown keys", { ...file(suite("q_a")), extra: true }, /./],
  ])("rejects %s", (_name, bad, message) => {
    expect(() => parseSuiteFile(bad)).toThrow(message);
  });
});

describe("SuiteRegistry public projection", () => {
  const registry = new SuiteRegistry(parseSuiteFile(fixtureRaw()));

  it("exposes samples and only the count of hidden tests", () => {
    const ex = registry.publicExercise("q_fixture_06");
    expect(ex).toMatchObject({ gradable: true, is_demonstration: true, hidden_test_count: 8, test_revision: "demo-1" });
    expect(ex.samples).toHaveLength(2);
    const hidden = registry.suite("q_fixture_06")!.tests;
    const serialized = JSON.stringify(ex);
    for (const t of hidden) expect(serialized).not.toContain(JSON.stringify(t.input).slice(1, -1));
    expect(Object.keys(ex)).not.toContain("tests");
  });

  it("reports questions without a suite as not gradable instead of inventing data", () => {
    expect(registry.publicExercise("q_fixture_02")).toMatchObject({ gradable: false, samples: [], hidden_test_count: 0, test_revision: null, statement: null });
    expect(SuiteRegistry.empty().suite("q_fixture_06")).toBeNull();
  });
});

describe("suite import", () => {
  const catalogue = new Catalogue(
    parseCatalogueFile({
      schema_version: 1,
      source: { name: "t", license_status: "own_work", license_note: "t", url: null, imported_at: "2026-01-01T00:00:00Z", source_updated_at: null },
      companies: [],
      questions: [{ id: "q_a", title: "A", url: "https://example.com/a", difficulty: "easy", topics: [] }],
      associations: [],
    }),
  );

  it("adds suites, is idempotent, and serialization is stable", () => {
    const first = mergeSuites(null, file(suite("q_a")), { catalogue });
    expect(first.report).toMatchObject({ added: ["q_a"], changed: true });
    const again = mergeSuites(first.file, file(suite("q_a")), { catalogue });
    expect(again.report).toMatchObject({ unchanged: ["q_a"], added: [], updated: [], changed: false });
    expect(serializeSuites(again.file)).toBe(serializeSuites(first.file));
  });

  it("requires a new revision when content changes, and accepts it with one", () => {
    const first = mergeSuites(null, file(suite("q_a")), {});
    const changed = suite("q_a", { tests: [{ input: "3\n", expected_output: "3\n" }] });
    expect(() => mergeSuites(first.file, file(changed), {})).toThrow(/bump the revision/);
    const bumped = mergeSuites(first.file, file({ ...changed, revision: "r2" }), {});
    expect(bumped.report.updated).toEqual(["q_a"]);
    expect(bumped.file.suites[0]!.revision).toBe("r2");
  });

  it("refuses fixture content as real data and questions missing from the catalogue", () => {
    const fx = suite("q_a", { source: { name: "x", license_status: "development_fixture", license_note: "y" } });
    expect(() => mergeSuites(null, file(fx), { catalogue })).toThrow(/development_fixture/);
    expect(() => mergeSuites(null, file(fx), { allowFixture: true })).not.toThrow();
    expect(() => mergeSuites(null, file(suite("q_missing")), { catalogue })).toThrow(/not in the catalogue/);
  });
});

describe("execution configuration", () => {
  it("defaults to no execution service, honestly", () => {
    expect(loadConfig({ LLM_MODE: "mock" })).toMatchObject({ EXECUTION_PROVIDER: "none", CODE_CPU_TIME_SECONDS: 2, CODE_MEMORY_MB: 128 });
  });

  it("never treats the execution service as verified unless the operator says so", () => {
    expect(loadConfig({ LLM_MODE: "mock" }).EXECUTION_PROVIDER_VERIFIED).toBe(false);
    expect(loadConfig({ LLM_MODE: "mock", EXECUTION_PROVIDER_VERIFIED: "true" }).EXECUTION_PROVIDER_VERIFIED).toBe(true);
    expect(() => loadConfig({ LLM_MODE: "mock", EXECUTION_PROVIDER_VERIFIED: "yes" })).toThrow(/EXECUTION_PROVIDER_VERIFIED/);
  });

  it("requires a valid JUDGE0_URL when judge0 is selected, over https (http only for localhost outside production)", () => {
    const base = { LLM_MODE: "mock", EXECUTION_PROVIDER: "judge0" };
    expect(() => loadConfig(base)).toThrow(/JUDGE0_URL is required/);
    expect(() => loadConfig({ ...base, JUDGE0_URL: "not a url" })).toThrow(/valid URL/);
    expect(() => loadConfig({ ...base, JUDGE0_URL: "http://judge.example.com" })).toThrow(/https/);
    expect(() => loadConfig({ ...base, JUDGE0_URL: "https://user:pw@judge.example.com" })).toThrow(/credentials/);
    expect(() => loadConfig({ ...base, JUDGE0_URL: "https://judge.example.com/?key=1" })).toThrow(/query/);
    expect(() => loadConfig({ ...base, JUDGE0_URL: "https://judge.example.com" })).not.toThrow();
    expect(() => loadConfig({ ...base, JUDGE0_URL: "http://localhost:2358" })).not.toThrow();
    expect(judge0UrlProblem("http://localhost:2358", true)).toMatch(/https in production/);
  });

  it("validates limits and the auth header name, and never echoes the token", () => {
    expect(() => loadConfig({ LLM_MODE: "mock", CODE_CPU_TIME_SECONDS: "99" })).toThrow(/CODE_CPU_TIME_SECONDS/);
    expect(() => loadConfig({ LLM_MODE: "mock", CODE_MEMORY_MB: "1" })).toThrow(/CODE_MEMORY_MB/);
    expect(() => loadConfig({ LLM_MODE: "mock", JUDGE0_AUTH_HEADER: "bad header\r\nX: y" })).toThrow(/header name/);
    let message = "";
    try {
      loadConfig({ LLM_MODE: "mock", EXECUTION_PROVIDER: "judge0", JUDGE0_URL: "nope", JUDGE0_AUTH_TOKEN: "TOP-SECRET-TOKEN" });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).not.toContain("TOP-SECRET-TOKEN");
  });
});
