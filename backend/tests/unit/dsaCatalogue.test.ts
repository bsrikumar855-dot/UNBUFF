import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Catalogue, parseCatalogueFile, type CatalogueFile } from "../../src/dsa/catalogue.js";

const base = (): CatalogueFile => ({
  schema_version: 1,
  source: {
    name: "Test source",
    license_status: "own_work",
    license_note: "written for tests",
    url: null,
    imported_at: "2026-01-01T00:00:00.000Z",
    source_updated_at: "2026-01-01",
  },
  companies: [
    { id: "acme", name: "Acme" },
    { id: "globex", name: "Globex" },
    { id: "initech", name: "Initech" },
  ],
  questions: [
    { id: "q_a", title: "Alpha Pair Sum", url: "https://example.com/a", difficulty: "easy", topics: ["Arrays", "Hash Table"] },
    { id: "q_b", title: "Beta Window", url: "https://example.com/b", difficulty: "medium", topics: ["Arrays"] },
    { id: "q_c", title: "Gamma Paths", url: "https://example.com/c", difficulty: "hard", topics: ["Graphs"] },
    { id: "q_d", title: "Delta Pair Count", url: "https://example.com/d", difficulty: "medium", topics: ["Hash Table"] },
  ],
  associations: [
    { company_id: "acme", question_id: "q_a" },
    { company_id: "acme", question_id: "q_b" },
    { company_id: "acme", question_id: "q_c" },
    { company_id: "globex", question_id: "q_b" },
    { company_id: "globex", question_id: "q_d" },
  ],
});

describe("catalogue file validation", () => {
  it("accepts a consistent file and the bundled dev fixture", () => {
    expect(() => parseCatalogueFile(base())).not.toThrow();
    const fixture = JSON.parse(readFileSync(join(import.meta.dirname, "..", "..", "data", "dsa", "fixture.json"), "utf8"));
    expect(parseCatalogueFile(fixture).source.license_status).toBe("development_fixture");
  });

  it.each([
    ["duplicate company id", (f: CatalogueFile) => f.companies.push({ id: "acme", name: "Acme 2" }), /duplicate company id/],
    ["duplicate question id", (f: CatalogueFile) => f.questions.push({ ...f.questions[0]!, url: "https://example.com/zz" }), /duplicate question id/],
    ["duplicate question url", (f: CatalogueFile) => f.questions.push({ ...f.questions[0]!, id: "q_z" }), /duplicate question url/],
    ["duplicate association", (f: CatalogueFile) => f.associations.push({ ...f.associations[0]! }), /duplicate association/],
    ["dangling company", (f: CatalogueFile) => f.associations.push({ company_id: "ghost", question_id: "q_a" }), /unknown company/],
    ["dangling question", (f: CatalogueFile) => f.associations.push({ company_id: "acme", question_id: "q_ghost" }), /unknown question/],
  ])("rejects %s", (_name, mutate, message) => {
    const f = base();
    mutate(f);
    expect(() => parseCatalogueFile(f)).toThrow(message);
  });

  it("rejects non-https URLs, bad difficulty, unknown keys and unknown licence statuses", () => {
    const http = base();
    http.questions[0]!.url = "http://example.com/a";
    expect(() => parseCatalogueFile(http)).toThrow();
    const diff = base();
    (diff.questions[0] as { difficulty: string }).difficulty = "extreme";
    expect(() => parseCatalogueFile(diff)).toThrow();
    expect(() => parseCatalogueFile({ ...base(), extra: 1 })).toThrow();
    const lic = base();
    (lic.source as { license_status: string }).license_status = "unknown";
    expect(() => parseCatalogueFile(lic)).toThrow();
  });
});

describe("Catalogue queries", () => {
  const c = new Catalogue(parseCatalogueFile(base()));

  it("derives company counts from real associations and flags companies without questions", () => {
    const { companies } = c.listCompanies({});
    expect(companies.map((x) => [x.id, x.question_count, x.catalogue_available])).toEqual([
      ["acme", 3, true],
      ["globex", 2, true],
      ["initech", 0, false],
    ]);
  });

  it("searches companies case-insensitively and paginates them", () => {
    expect(c.listCompanies({ search: "GLO" }).companies.map((x) => x.id)).toEqual(["globex"]);
    const p = c.listCompanies({ page: 2, page_size: 2 });
    expect(p.companies.map((x) => x.id)).toEqual(["initech"]);
    expect(p).toMatchObject({ total: 3, total_pages: 2, page: 2 });
  });

  it("links one question to several companies (many-to-many)", () => {
    expect(c.questionDetail("q_b")?.companies.map((x) => x.id)).toEqual(["acme", "globex"]);
    expect(c.queryQuestions({ company: "acme" }).questions.map((q) => q.id).sort()).toEqual(["q_a", "q_b", "q_c"]);
    expect(c.queryQuestions({ company: "globex" }).questions.map((q) => q.id).sort()).toEqual(["q_b", "q_d"]);
  });

  it("filters by title search, difficulty and topic, and combines them with AND", () => {
    const ids = (q: Parameters<Catalogue["queryQuestions"]>[0]) => c.queryQuestions(q).questions.map((x) => x.id);
    expect(ids({ search: "pair" })).toEqual(["q_a", "q_d"]);
    expect(ids({ difficulty: "medium" })).toEqual(["q_b", "q_d"]);
    expect(ids({ topic: "hash table" })).toEqual(["q_a", "q_d"]);
    expect(ids({ search: "pair", difficulty: "medium" })).toEqual(["q_d"]);
    expect(ids({ company: "acme", topic: "Arrays", difficulty: "medium" })).toEqual(["q_b"]);
    expect(ids({ company: "globex", search: "paths" })).toEqual([]);
  });

  it("sorts by title or difficulty in either order", () => {
    const ids = (q: Parameters<Catalogue["queryQuestions"]>[0]) => c.queryQuestions(q).questions.map((x) => x.id);
    expect(ids({ sort: "title" })).toEqual(["q_a", "q_b", "q_d", "q_c"]);
    expect(ids({ sort: "title", order: "desc" })).toEqual(["q_c", "q_d", "q_b", "q_a"]);
    expect(ids({ sort: "difficulty" })).toEqual(["q_a", "q_b", "q_d", "q_c"]);
    expect(ids({ sort: "difficulty", order: "desc" })).toEqual(["q_c", "q_b", "q_d", "q_a"]);
  });

  it("paginates questions on the server and reports totals", () => {
    const first = c.queryQuestions({ page: 1, page_size: 3, sort: "title" });
    expect(first.questions).toHaveLength(3);
    expect(first).toMatchObject({ total: 4, total_pages: 2, page: 1, page_size: 3 });
    const second = c.queryQuestions({ page: 2, page_size: 3, sort: "title" });
    expect(second.questions).toHaveLength(1);
    expect(new Set([...first.questions, ...second.questions].map((q) => q.id)).size).toBe(4);
    expect(c.queryQuestions({ page: 9, page_size: 3 }).questions).toEqual([]);
  });

  it("scopes facets to the company and reports provenance", () => {
    const f = c.queryQuestions({ company: "globex" }).facets;
    expect(f.topics).toEqual(["Arrays", "Hash Table"]);
    expect(f.difficulties).toEqual(["medium"]);
    expect(c.queryQuestions({}).source).toMatchObject({ name: "Test source", license_status: "own_work", is_sample_data: false });
  });

  it("company detail summarizes difficulty and topics from loaded data", () => {
    const d = c.companyDetail("acme")!;
    expect(d.difficulties).toEqual({ easy: 1, medium: 1, hard: 1 });
    expect(d.topics).toEqual(["Arrays", "Graphs", "Hash Table"]);
    expect(c.companyDetail("initech")!.company.catalogue_available).toBe(false);
    expect(c.companyDetail("nope")).toBeNull();
    expect(c.questionDetail("nope")).toBeNull();
  });

  it("marks development fixtures as sample data", () => {
    const f = base();
    f.source.license_status = "development_fixture";
    expect(new Catalogue(parseCatalogueFile(f)).source?.is_sample_data).toBe(true);
  });

  it("an empty catalogue answers honestly instead of inventing data", () => {
    const e = Catalogue.empty();
    expect(e.source).toBeNull();
    expect(e.listCompanies({})).toMatchObject({ companies: [], total: 0, source: null });
    expect(e.queryQuestions({})).toMatchObject({ questions: [], total: 0, total_pages: 1, source: null });
    expect(e.companyDetail("acme")).toBeNull();
  });
});

describe("a larger catalogue is paged on the server, not capped at ten", () => {
  // Synthetic, generated here for the test only. It is not catalogue data and is never written anywhere.
  const big = (): Catalogue => {
    const f = base();
    f.companies = [{ id: "acme", name: "Acme" }, { id: "globex", name: "Globex" }];
    f.questions = Array.from({ length: 250 }, (_, i) => ({
      id: `syn_${String(i).padStart(3, "0")}`,
      title: `Synthetic ${String(i).padStart(3, "0")}`,
      url: `https://example.com/syn/${i}`,
      difficulty: (["easy", "medium", "hard"] as const)[i % 3]!,
      topics: [i % 2 === 0 ? "Arrays" : "Graphs"],
    }));
    f.associations = f.questions.filter((_, i) => i % 5 === 0).map((q) => ({ company_id: "acme", question_id: q.id }));
    return new Catalogue(parseCatalogueFile(f));
  };

  it("reports the true total and walks every page exactly once", () => {
    const c = big();
    const seen = new Set<string>();
    let pages = 0;
    for (let page = 1; ; page++) {
      const r = c.queryQuestions({ page, page_size: 20, sort: "title" });
      expect(r.total).toBe(250);
      expect(r.total_pages).toBe(13);
      if (r.questions.length === 0) break;
      pages += 1;
      for (const q of r.questions) seen.add(q.id);
    }
    expect(pages).toBe(13);
    expect(seen.size).toBe(250);
    expect(c.queryQuestions({ page: 13, page_size: 20 }).questions).toHaveLength(10);
  });

  it("honours the largest allowed page size and keeps company counts exact", () => {
    const c = big();
    expect(c.queryQuestions({ page_size: 100 }).questions).toHaveLength(100);
    expect(c.queryQuestions({ company: "acme", page_size: 100 })).toMatchObject({ total: 50, total_pages: 1 });
    expect(c.queryQuestions({ company: "globex" })).toMatchObject({ total: 0, questions: [] });
    expect(c.queryQuestions({ difficulty: "hard", topic: "Graphs", page_size: 100 })).toMatchObject({ total: 41 }); // i = 5, 11, ... 245
    expect(c.listCompanies({}).companies.find((x) => x.id === "acme")?.question_count).toBe(50);
  });
});

describe("the production default catalogue is labelled honestly", () => {
  it("is the first-party practice pack: real count, own_work, no company links, not sample data", () => {
    const file = parseCatalogueFile(JSON.parse(readFileSync(join(import.meta.dirname, "..", "..", "data", "dsa", "practice-pack.json"), "utf8")));
    const c = new Catalogue(file);
    const r = c.queryQuestions({ page_size: 100 });
    expect(r.total).toBe(file.questions.length);
    expect(r.questions).toHaveLength(file.questions.length);
    expect(r.source).toMatchObject({ license_status: "own_work", is_sample_data: false });
    expect(c.listCompanies({})).toMatchObject({ companies: [], total: 0 });
    expect(file.associations).toEqual([]);
  });

  it("the development fixture is flagged as sample data and says its company links are invented", () => {
    const file = parseCatalogueFile(JSON.parse(readFileSync(join(import.meta.dirname, "..", "..", "data", "dsa", "fixture.json"), "utf8")));
    const c = new Catalogue(file);
    expect(c.source).toMatchObject({ license_status: "development_fixture", is_sample_data: true });
    expect(c.source?.license_note).toMatch(/invented/i);
  });
});
