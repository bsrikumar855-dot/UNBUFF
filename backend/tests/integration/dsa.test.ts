import request from "supertest";
import { describe, expect, it } from "vitest";
import { Catalogue, parseCatalogueFile } from "../../src/dsa/catalogue.js";
import { MemoryProgressStore } from "../../src/dsa/progressStore.js";
import { bearer, testApp } from "./app.js";

const anon = () => testApp({ autoAuth: false });
const as = (uid: string) => ({ Authorization: bearer(uid) });

describe("public catalogue API", () => {
  const app = anon();

  it("is readable without a token and labels fixture data as sample data", async () => {
    const res = await request(app).get("/api/companies").expect(200);
    expect(res.body.source).toMatchObject({ license_status: "development_fixture", is_sample_data: true });
    expect(res.body.companies.map((c: { id: string }) => c.id)).toEqual(["fixture-company-a", "fixture-company-b", "fixture-company-c"]);
    expect(res.body.companies[0]).toMatchObject({ question_count: 16, catalogue_available: true });
  });

  it("reports companies without loaded questions as unavailable, not as zero-question successes", async () => {
    const list = await request(app).get("/api/companies?search=no%20questions").expect(200);
    expect(list.body.companies).toEqual([expect.objectContaining({ id: "fixture-company-c", question_count: 0, catalogue_available: false })]);
    const qs = await request(app).get("/api/companies/fixture-company-c/questions").expect(200);
    expect(qs.body).toMatchObject({ questions: [], total: 0 });
    const detail = await request(app).get("/api/companies/fixture-company-c").expect(200);
    expect(detail.body.company.catalogue_available).toBe(false);
  });

  it("paginates on the server", async () => {
    const p1 = await request(app).get("/api/questions?page_size=10&sort=title").expect(200);
    expect(p1.body).toMatchObject({ page: 1, page_size: 10, total: 24, total_pages: 3 });
    expect(p1.body.questions).toHaveLength(10);
    const p3 = await request(app).get("/api/questions?page_size=10&page=3&sort=title").expect(200);
    expect(p3.body.questions).toHaveLength(4);
    const seen = new Set([...p1.body.questions, ...p3.body.questions].map((q: { id: string }) => q.id));
    expect(seen.size).toBe(14);
    expect((await request(app).get("/api/questions")).body.questions).toHaveLength(20); // default page size
  });

  it("combines search, company, difficulty and topic filters", async () => {
    type Q = { id: string; company_ids: string[]; difficulty: string; topics: string[]; title: string };
    const all = (await request(app).get("/api/questions?page_size=100").expect(200)).body.questions as Q[];
    const seed = all.find((q) => q.company_ids.includes("fixture-company-b"))!; // derive a combination that must have a hit
    const word = seed.title.split(" ").at(-1)!.toUpperCase();
    const matches = (q: Q) =>
      q.company_ids.includes("fixture-company-b") && q.difficulty === seed.difficulty && q.topics.includes(seed.topics[0]!) && q.title.toUpperCase().includes(word);
    const expected = all.filter(matches).map((q) => q.id).sort();
    expect(expected.length).toBeGreaterThan(0);
    const url = `/api/questions?company=fixture-company-b&difficulty=${seed.difficulty.toUpperCase()}&topic=${encodeURIComponent(seed.topics[0]!.toLowerCase())}&search=${encodeURIComponent(word)}&page_size=100`;
    const res = await request(app).get(url).expect(200);
    expect(res.body.questions.map((q: Q) => q.id).sort()).toEqual(expected);
    expect(res.body.total).toBe(expected.length);
    expect(expected.length).toBeLessThan(all.length); // the filters actually narrowed the set
    // dropping any one filter widens the result (AND semantics)
    const noTopic = await request(app).get(url.replace(/&topic=[^&]*/, "")).expect(200);
    expect(noTopic.body.total).toBeGreaterThanOrEqual(res.body.total);
    const scoped = await request(app).get("/api/companies/fixture-company-a/questions?difficulty=hard").expect(200);
    for (const q of scoped.body.questions) {
      expect(q.difficulty).toBe("hard");
      expect(q.company_ids).toContain("fixture-company-a");
    }
    expect(scoped.body.facets.difficulties).toContain("hard");
  });

  it("returns question details with company associations and the original link only", async () => {
    const res = await request(app).get("/api/questions/q_fixture_12").expect(200);
    expect(res.body.question).toMatchObject({ id: "q_fixture_12", url: "https://example.com/dsa-fixture/problems/12" });
    expect(res.body.companies.map((c: { id: string }) => c.id)).toEqual(["fixture-company-a", "fixture-company-b"]);
    expect(Object.keys(res.body.question).sort()).toEqual(["company_ids", "difficulty", "id", "title", "topics", "url"]);
  });

  it("validates query parameters and unknown ids", async () => {
    for (const q of ["page=0", "page_size=1000", "difficulty=extreme", "sort=popularity", "order=up", "bogus=1", "topic=a&topic=b", "company=Bad%20Id"]) {
      const res = await request(app).get(`/api/questions?${q}`);
      expect(res.status, q).toBe(400);
      expect(res.body.error.code).toBe("BAD_REQUEST");
    }
    expect((await request(app).get("/api/questions?company=ghost")).body.error.code).toBe("COMPANY_NOT_FOUND");
    expect((await request(app).get("/api/companies/ghost")).status).toBe(404);
    expect((await request(app).get("/api/companies/ghost/questions")).body.error.code).toBe("COMPANY_NOT_FOUND");
    expect((await request(app).get("/api/questions/q_ghost")).body.error.code).toBe("QUESTION_NOT_FOUND");
  });

  it("serves an honest empty state when no catalogue is loaded", async () => {
    const empty = testApp({ autoAuth: false, catalogue: Catalogue.empty() });
    expect((await request(empty).get("/api/companies")).body).toMatchObject({ companies: [], total: 0, source: null });
    expect((await request(empty).get("/api/questions")).body).toMatchObject({ questions: [], total: 0, source: null });
    expect((await request(empty).get("/api/questions/q_fixture_01")).status).toBe(404);
  });
});

describe("personal DSA progress", () => {
  const q = "q_fixture_03";

  it("rejects missing or invalid tokens on every progress route", async () => {
    const app = anon();
    for (const res of [
      await request(app).get("/api/me/dsa-progress"),
      await request(app).put(`/api/me/dsa-progress/${q}`).send({ status: "solved" }),
      await request(app).delete(`/api/me/dsa-progress/${q}`),
      await request(app).get("/api/me/dsa-progress").set("Authorization", "Bearer nonsense"),
    ]) {
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("UNAUTHENTICATED");
    }
  });

  it("creates one record per question, updates it in place and keeps untouched fields", async () => {
    const app = anon();
    const first = await request(app).put(`/api/me/dsa-progress/${q}`).set(as("alice")).send({ status: "attempted" }).expect(200);
    expect(first.body).toMatchObject({ question_id: q, status: "attempted", bookmarked: false, notes: "" });
    expect(first.body.owner_uid).toBeUndefined();

    await request(app).put(`/api/me/dsa-progress/${q}`).set(as("alice")).send({ bookmarked: true }).expect(200);
    await request(app).put(`/api/me/dsa-progress/${q}`).set(as("alice")).send({ notes: "Use a hash map; revisit the edge case." }).expect(200);
    const last = await request(app).put(`/api/me/dsa-progress/${q}`).set(as("alice")).send({ status: "solved" }).expect(200);
    expect(last.body).toMatchObject({ status: "solved", bookmarked: true, notes: "Use a hash map; revisit the edge case." });
    expect(last.body.created_at).toBe(first.body.created_at);
    expect(Date.parse(last.body.updated_at)).toBeGreaterThanOrEqual(Date.parse(first.body.updated_at));

    const list = await request(app).get("/api/me/dsa-progress").set(as("alice")).expect(200);
    expect(list.body.progress).toHaveLength(1); // no duplicates
    expect(list.body.progress[0]).toMatchObject({ question_id: q, status: "solved", bookmarked: true });
  });

  it("supports every status and unbookmarking, and persists across requests", async () => {
    const app = anon();
    for (const status of ["not_started", "attempted", "solved", "needs_revision"]) {
      const res = await request(app).put(`/api/me/dsa-progress/${q}`).set(as("alice")).send({ status }).expect(200);
      expect(res.body.status).toBe(status);
    }
    await request(app).put(`/api/me/dsa-progress/${q}`).set(as("alice")).send({ bookmarked: true }).expect(200);
    await request(app).put(`/api/me/dsa-progress/${q}`).set(as("alice")).send({ bookmarked: false }).expect(200);
    const list = await request(app).get("/api/me/dsa-progress").set(as("alice")).expect(200);
    expect(list.body.progress[0]).toMatchObject({ status: "needs_revision", bookmarked: false });
  });

  it("isolates students: no endpoint can read, change or delete another student's records", async () => {
    const app = anon();
    await request(app).put(`/api/me/dsa-progress/${q}`).set(as("alice")).send({ status: "solved", notes: "alice private note", bookmarked: true }).expect(200);

    const bobList = await request(app).get("/api/me/dsa-progress").set(as("bob")).expect(200);
    expect(bobList.body.progress).toEqual([]);

    // Bob writing the same question creates Bob's own record and never touches Alice's.
    const bob = await request(app).put(`/api/me/dsa-progress/${q}`).set(as("bob")).send({ status: "attempted" }).expect(200);
    expect(bob.body).toMatchObject({ status: "attempted", notes: "", bookmarked: false });
    await request(app).delete(`/api/me/dsa-progress/${q}`).set(as("bob")).expect(204);

    const aliceList = await request(app).get("/api/me/dsa-progress").set(as("alice")).expect(200);
    expect(aliceList.body.progress).toEqual([expect.objectContaining({ status: "solved", notes: "alice private note", bookmarked: true })]);

    // A user id supplied by the client is rejected (body) or ignored (query/header).
    await request(app).put(`/api/me/dsa-progress/${q}`).set(as("bob")).send({ status: "solved", owner_uid: "alice" }).expect(400);
    await request(app).put(`/api/me/dsa-progress/${q}`).set(as("bob")).send({ status: "solved", uid: "alice" }).expect(400);
    const spoof = await request(app).get("/api/me/dsa-progress?uid=alice&owner_uid=alice").set({ ...as("bob"), "X-User-Id": "alice" }).expect(200);
    expect(spoof.body.progress).toEqual([]);
  });

  it("validates bodies and question ids", async () => {
    const app = anon();
    const put = (id: string, body: unknown) => request(app).put(`/api/me/dsa-progress/${id}`).set(as("alice")).send(body as object);
    expect((await put(q, {})).status).toBe(400);
    expect((await put(q, { status: "done" })).status).toBe(400);
    expect((await put(q, { bookmarked: "yes" })).status).toBe(400);
    expect((await put(q, { notes: "x".repeat(5001) })).status).toBe(400);
    expect((await put(q, { notes: "x".repeat(5000) })).status).toBe(200);
    const ghost = await put("q_ghost", { status: "solved" });
    expect(ghost.status).toBe(404);
    expect(ghost.body.error.code).toBe("QUESTION_NOT_FOUND");
    expect((await request(app).put("/api/me/dsa-progress/Bad%20Id").set(as("alice")).send({ status: "solved" })).status).toBe(400);
  });

  it("delete removes the record and is idempotent", async () => {
    const app = anon();
    await request(app).put(`/api/me/dsa-progress/${q}`).set(as("alice")).send({ notes: "temp" }).expect(200);
    await request(app).delete(`/api/me/dsa-progress/${q}`).set(as("alice")).expect(204);
    await request(app).delete(`/api/me/dsa-progress/${q}`).set(as("alice")).expect(204);
    expect((await request(app).get("/api/me/dsa-progress").set(as("alice"))).body.progress).toEqual([]);
  });
});

describe("catalogue refresh preserves personal progress", () => {
  it("keeps progress when a refreshed catalogue drops or keeps questions, and never silently rewrites it", async () => {
    const progressStore = new MemoryProgressStore();
    const before = testApp({ autoAuth: false, progressStore });
    await request(before).put("/api/me/dsa-progress/q_fixture_03").set(as("alice")).send({ status: "solved", notes: "keep me", bookmarked: true }).expect(200);
    await request(before).put("/api/me/dsa-progress/q_fixture_20").set(as("alice")).send({ status: "attempted" }).expect(200);
    const snapshot = (await request(before).get("/api/me/dsa-progress").set(as("alice"))).body.progress;

    // A refresh: same progress store, new catalogue that no longer contains q_fixture_20.
    const refreshedFile = (await loadFile()) as { questions: { id: string }[]; associations: { question_id: string }[]; source: { imported_at: string } };
    refreshedFile.questions = refreshedFile.questions.filter((x: { id: string }) => x.id !== "q_fixture_20");
    refreshedFile.associations = refreshedFile.associations.filter((a: { question_id: string }) => a.question_id !== "q_fixture_20");
    refreshedFile.source.imported_at = "2027-01-01T00:00:00.000Z";
    const after = testApp({ autoAuth: false, progressStore, catalogue: new Catalogue(parseCatalogueFile(refreshedFile)) });

    const list = await request(after).get("/api/me/dsa-progress").set(as("alice")).expect(200);
    expect(list.body.progress).toEqual(snapshot); // untouched, including the orphaned record
    expect((await request(after).get("/api/questions/q_fixture_20")).status).toBe(404);
    // An orphaned record can still be edited or removed by its owner...
    await request(after).put("/api/me/dsa-progress/q_fixture_20").set(as("alice")).send({ status: "needs_revision" }).expect(200);
    await request(after).delete("/api/me/dsa-progress/q_fixture_20").set(as("alice")).expect(204);
    // ...but nobody can create progress for a question that is not in the catalogue.
    await request(after).put("/api/me/dsa-progress/q_fixture_20").set(as("bob")).send({ status: "solved" }).expect(404);
  });
});

async function loadFile(): Promise<unknown> {
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  return JSON.parse(readFileSync(join(import.meta.dirname, "..", "..", "data", "dsa", "fixture.json"), "utf8")) as unknown;
}
