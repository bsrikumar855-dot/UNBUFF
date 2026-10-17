import type { Firestore } from "@google-cloud/firestore";
import { describe, expect, it } from "vitest";
import { Catalogue, parseCatalogueFile } from "../../src/dsa/catalogue.js";
import { DsaProgressService } from "../../src/dsa/progressService.js";
import { FirestoreProgressStore, MemoryProgressStore, type ProgressRecord, type ProgressStore } from "../../src/dsa/progressStore.js";

/** In-memory stand-in for the Firestore calls the store makes. */
function fakeFirestore() {
  const docs = new Map<string, Record<string, unknown>>();
  const db = {
    collection: (name: string) => ({
      doc: (id: string) => ({
        get: async () => ({ exists: docs.has(`${name}/${id}`), data: () => docs.get(`${name}/${id}`) }),
        set: async (data: Record<string, unknown>) => void docs.set(`${name}/${id}`, data),
        delete: async () => void docs.delete(`${name}/${id}`),
      }),
      where: (field: string, _op: string, value: unknown) => ({
        get: async () => ({
          docs: [...docs.entries()].filter(([k, d]) => k.startsWith(`${name}/`) && d[field] === value).map(([, d]) => ({ data: () => d })),
        }),
      }),
    }),
  };
  return { db: db as unknown as Firestore, docs };
}

const rec = (uid: string, q: string, over: Partial<ProgressRecord> = {}): ProgressRecord => ({
  owner_uid: uid,
  question_id: q,
  status: "attempted",
  bookmarked: true,
  notes: "n",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  ...over,
});

const catalogue = new Catalogue(
  parseCatalogueFile({
    schema_version: 1,
    source: { name: "t", license_status: "own_work", license_note: "t", url: null, imported_at: "2026-01-01T00:00:00Z", source_updated_at: null },
    companies: [{ id: "acme", name: "Acme" }],
    questions: [{ id: "q_1", title: "One", url: "https://example.com/1", difficulty: "easy", topics: [] }],
    associations: [{ company_id: "acme", question_id: "q_1" }],
  }),
);

describe.each<[string, () => { store: ProgressStore; docs?: Map<string, Record<string, unknown>> }]>([
  ["MemoryProgressStore", () => ({ store: new MemoryProgressStore() })],
  [
    "FirestoreProgressStore (mocked client)",
    () => {
      const f = fakeFirestore();
      return { store: new FirestoreProgressStore("progress", f.db), docs: f.docs };
    },
  ],
])("%s", (_name, make) => {
  it("round-trips, overwrites in place (one record per student and question) and deletes", async () => {
    const { store } = make();
    expect(await store.get("alice", "q_1")).toBeNull();
    await store.put(rec("alice", "q_1"));
    await store.put(rec("alice", "q_1", { status: "solved", notes: "second" }));
    expect(await store.get("alice", "q_1")).toMatchObject({ status: "solved", notes: "second" });
    expect(await store.listByOwner("alice")).toHaveLength(1);
    await store.delete("alice", "q_1");
    expect(await store.get("alice", "q_1")).toBeNull();
    await expect(store.delete("alice", "q_1")).resolves.toBeUndefined();
  });

  it("lists only the owner's records", async () => {
    const { store } = make();
    await store.put(rec("alice", "q_1"));
    await store.put(rec("bob", "q_1"));
    await store.put(rec("bob", "q_2"));
    expect((await store.listByOwner("alice")).map((r) => r.question_id)).toEqual(["q_1"]);
    expect(await store.listByOwner("bob")).toHaveLength(2);
    expect(await store.listByOwner("carol")).toEqual([]);
  });

  it("refuses keys that could collide or escape the composite id", async () => {
    const { store } = make();
    await expect(store.put(rec("a/b", "q_1"))).rejects.toThrow(/invalid progress key/);
    await expect(store.get("alice", "q/1")).rejects.toThrow(/invalid progress key/);
    await expect(store.delete("", "q_1")).rejects.toThrow(/invalid progress key/);
  });

  it("DsaProgressService creates once and updates in place through this store", async () => {
    const { store } = make();
    let t = Date.parse("2026-05-01T00:00:00Z");
    const svc = new DsaProgressService(store, () => catalogue, () => new Date((t += 1000)));
    const first = await svc.put("alice", "q_1", { status: "attempted" });
    const second = await svc.put("alice", "q_1", { bookmarked: true, notes: "hello" });
    expect(second).toMatchObject({ status: "attempted", bookmarked: true, notes: "hello", created_at: first.created_at });
    expect(second.updated_at > first.updated_at).toBe(true);
    expect((await svc.list("alice")).progress).toHaveLength(1);
    expect((await svc.list("bob")).progress).toEqual([]);
  });

  it("concurrent writes to one record never create a second record", async () => {
    const { store } = make();
    const svc = new DsaProgressService(store, () => catalogue);
    await Promise.all([svc.put("alice", "q_1", { status: "solved" }), svc.put("alice", "q_1", { notes: "x" }), svc.put("alice", "q_1", { bookmarked: true })]);
    const list = (await svc.list("alice")).progress;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ status: "solved", notes: "x", bookmarked: true }); // serialized, so no write was lost
  });
});

describe("FirestoreProgressStore specifics", () => {
  it("stores the owner as a top-level field under a composite document id", async () => {
    const f = fakeFirestore();
    await new FirestoreProgressStore("progress", f.db).put(rec("alice", "q_1"));
    expect([...f.docs.keys()]).toEqual(["progress/alice~q_1"]);
    expect(f.docs.get("progress/alice~q_1")).toMatchObject({ owner_uid: "alice", question_id: "q_1" });
  });

  it("never returns a document whose stored owner is not the requester", async () => {
    const f = fakeFirestore();
    f.docs.set("progress/alice~q_1", { owner_uid: "mallory", question_id: "q_1", status: "solved" });
    const store = new FirestoreProgressStore("progress", f.db);
    expect(await store.get("alice", "q_1")).toBeNull();
    expect(await store.listByOwner("alice")).toEqual([]);
  });
});
