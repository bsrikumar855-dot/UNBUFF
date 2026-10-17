import type { Firestore } from "@google-cloud/firestore";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AnalyticsService } from "../../src/analytics/service.js";
import { MemoryRevisionStore, MemoryStatsStore } from "../../src/analytics/stores.js";
import { checkSubmissionIndex, indexFileProblems, REQUIRED_COMPOSITE_INDEXES, SUBMISSIONS_COLLECTION } from "../../src/code/indexes.js";
import { FirestoreSubmissionStore, MemorySubmissionStore } from "../../src/code/submissionStore.js";
import { DsaProgressService } from "../../src/dsa/progressService.js";
import { MemoryProgressStore } from "../../src/dsa/progressStore.js";
import { silentLogger } from "../helpers.js";
import { fixtureCatalogue } from "../integration/app.js";

const repo = join(import.meta.dirname, "..", "..", "..");
const read = (f: string) => JSON.parse(readFileSync(join(repo, f), "utf8")) as Record<string, unknown>;

describe("Firestore index configuration", () => {
  it("is wired into firebase.json and covers every required composite index", () => {
    expect((read("firebase.json").firestore as { indexes?: string }).indexes).toBe("firestore.indexes.json");
    expect(indexFileProblems(read("firestore.indexes.json"))).toEqual([]);
  });

  it("flags a missing, mis-ordered or wrongly scoped index", () => {
    expect(indexFileProblems({ indexes: [] })).toHaveLength(1);
    expect(indexFileProblems({})).toHaveLength(1);
    const wrongOrder = { indexes: [{ collectionGroup: SUBMISSIONS_COLLECTION, queryScope: "COLLECTION", fields: [{ fieldPath: "owner_uid", order: "ASCENDING" }, { fieldPath: "created_at", order: "ASCENDING" }] }] };
    expect(indexFileProblems(wrongOrder)[0]).toMatch(/missing composite index on unbluff_code_submissions/);
    const wrongScope = { indexes: [{ collectionGroup: SUBMISSIONS_COLLECTION, queryScope: "COLLECTION_GROUP", fields: [{ fieldPath: "owner_uid", order: "ASCENDING" }, { fieldPath: "created_at", order: "DESCENDING" }] }] };
    expect(indexFileProblems(wrongScope)).toHaveLength(1);
  });

  it("the required list matches what the store's queries actually do (so the index file cannot silently drift from the code)", async () => {
    const calls: unknown[][] = [];
    const query = {
      where: (...a: unknown[]) => (calls.push(["where", ...a]), query),
      orderBy: (...a: unknown[]) => (calls.push(["orderBy", ...a]), query),
      limit: (...a: unknown[]) => (calls.push(["limit", ...a]), query),
      get: async () => ({ docs: [] }),
    };
    const db = { collection: () => ({ ...query }) } as unknown as Firestore;
    await new FirestoreSubmissionStore(SUBMISSIONS_COLLECTION, db).listRecentByOwner("u", 5);
    expect(calls.filter((c) => c[0] === "where" || c[0] === "orderBy")).toEqual([
      ["where", "owner_uid", "==", "u"],
      ["orderBy", "created_at", "desc"],
    ]);
    expect(REQUIRED_COMPOSITE_INDEXES[0]!.fields).toEqual([["owner_uid", "ASCENDING"], ["created_at", "DESCENDING"]]);

    // The other Firestore queries are equality-only (served by automatic indexes): no orderBy anywhere else.
    calls.length = 0;
    await new FirestoreSubmissionStore(SUBMISSIONS_COLLECTION, db).listCountedByOwner("u", 5);
    expect(calls.map((c) => c[0])).toEqual(["where", "where", "limit"]);
  });
});

describe("checkSubmissionIndex", () => {
  const dbThatFailsWith = (error: unknown) =>
    ({ collection: () => ({ where: () => ({ orderBy: () => ({ limit: () => ({ get: async () => Promise.reject(error) }) }) }) }) }) as unknown as Firestore;

  it("passes when the query succeeds", async () => {
    const ok = { collection: () => ({ where: () => ({ orderBy: () => ({ limit: () => ({ get: async () => ({ docs: [] }) }) }) }) }) } as unknown as Firestore;
    expect(await checkSubmissionIndex(ok)).toMatchObject({ ok: true });
  });

  it("reports a missing or building index (FAILED_PRECONDITION, code 9) distinctly", async () => {
    const r = await checkSubmissionIndex(dbThatFailsWith(Object.assign(new Error("9 FAILED_PRECONDITION: The query requires an index."), { code: 9 })));
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/missing or still building/);
  });

  it("does not mistake permission or credential errors for index problems", async () => {
    const r = await checkSubmissionIndex(dbThatFailsWith(Object.assign(new Error("denied"), { code: 7 })));
    expect(r).toMatchObject({ ok: false, detail: expect.stringMatching(/not an index problem/) });
    const other = await checkSubmissionIndex(dbThatFailsWith(Object.assign(new Error("boom"), { code: 13 })));
    expect(other.detail).toMatch(/unexpected error 13: boom/);
  });
});

describe("analytics when the index is missing", () => {
  it("keeps working and reports the excluded-submission counts as unavailable", async () => {
    const submissions = new MemorySubmissionStore();
    submissions.listRecentByOwner = async () => {
      throw Object.assign(new Error("9 FAILED_PRECONDITION: The query requires an index. You can create it here: https://console.firebase.google.com/..."), { code: 9 });
    };
    const catalogue = fixtureCatalogue();
    const analytics = new AnalyticsService({
      stats: new MemoryStatsStore(),
      revisions: new MemoryRevisionStore(),
      submissions,
      progress: new DsaProgressService(new MemoryProgressStore(), () => catalogue),
      catalogue: () => catalogue,
      logger: silentLogger,
    });
    const o = await analytics.overview("alice");
    expect(o.exclusions).toMatchObject({ available: false, sampled_submissions: 0 });
    expect(o.totals).toEqual({ solved_unique: 0, attempted_unique: 0, eligible_attempts: 0, accepted_attempts: 0 });
    expect(JSON.stringify(o)).not.toMatch(/console\.firebase|FAILED_PRECONDITION/); // the provider's error text never reaches the client
  });
});
