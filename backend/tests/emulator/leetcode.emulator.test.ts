import { Firestore } from "@google-cloud/firestore";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FirestoreLeetCodeStore, type SnapshotRecord } from "../../src/leetcode/store.js";
import { LeetCodeService } from "../../src/leetcode/service.js";
import { silentLogger } from "../helpers.js";
import { NOW, good, json } from "../leetcode/fixtures.js";
import { PROJECT_ID, requireEmulators } from "./emulator.js";

/** The LeetCode link and imports on the Firestore EMULATOR. The emulator is not a live project, and nothing here contacts LeetCode. */
const run = randomUUID().slice(0, 8);
const names = { connections: `t_lc_connections_${run}`, snapshots: `t_lc_snapshots_${run}` };
let db: Firestore;
let store: FirestoreLeetCodeStore;

beforeAll(() => {
  requireEmulators();
  db = new Firestore({ projectId: PROJECT_ID, ignoreUndefinedProperties: true });
  store = new FirestoreLeetCodeStore(db, names);
});
afterAll(async () => {
  for (const c of Object.values(names)) {
    const snap = await db.collection(c).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }
  await db.terminate();
});

const id = (n: number) => n.toString(16).padStart(32, "0");
const rec = (owner: string, n: number, over: Partial<SnapshotRecord> = {}): SnapshotRecord => ({
  owner_uid: owner, id: id(n), captured_at: `2026-10-${String(10 + n).padStart(2, "0")}T08:00:00.000Z`, imported_at: NOW.toISOString(), source: { kind: "json_file", description: null }, linked_username: null,
  totals: { solved: 10 + n, easy: null, medium: null, hard: null }, available: null, topics: null, contest: null, activity: null, ...over,
});

describe("Firestore emulator: LeetCode store", () => {
  it("creates a snapshot once: the same id again returns false and changes nothing", async () => {
    expect(await store.createSnapshot(rec("la", 1))).toBe(true);
    expect(await store.createSnapshot(rec("la", 1, { totals: { solved: 999, easy: null, medium: null, hard: null } }))).toBe(false);
    expect((await store.getSnapshot("la", id(1)))!.totals.solved).toBe(11);
  });

  it("stores the same data separately for two students and never reads across owners", async () => {
    await store.createSnapshot(rec("la", 2));
    expect(await store.createSnapshot(rec("lb", 2))).toBe(true);
    expect((await store.listSnapshots("la", 10)).map((r) => r.id).sort()).toEqual([id(1), id(2)]);
    expect((await store.listSnapshots("lb", 10)).map((r) => r.id)).toEqual([id(2)]);
    expect(await store.getSnapshot("lb", id(1))).toBeNull();
    expect(await store.deleteSnapshot("lb", id(1))).toBe(false);
    expect(await store.getSnapshot("la", id(1))).not.toBeNull();
  });

  it("refuses unsafe ids and owners", async () => {
    await expect(store.createSnapshot(rec("../x", 3))).rejects.toThrow();
    await expect(store.createSnapshot(rec("la", 3, { id: "not-a-hash" }))).rejects.toThrow();
    expect(await store.getSnapshot("la", "../etc")).toBeNull();
    expect(await store.listSnapshots("../x", 5)).toEqual([]);
    expect(await store.getConnection("../x")).toBeNull();
  });

  it("keeps one connection per student and deletes snapshots only for the owner", async () => {
    const c = (u: string, name: string) => ({ owner_uid: u, username: name, username_key: name.toLowerCase(), profile_url: `https://leetcode.com/u/${name}/`, linked_at: "x", updated_at: "x" });
    await store.saveConnection(c("lc", "First"));
    await store.saveConnection(c("lc", "Second"));
    await store.saveConnection(c("ld", "Other"));
    expect((await store.getConnection("lc"))!.username).toBe("Second");
    await store.createSnapshot(rec("lc", 4));
    await store.createSnapshot(rec("ld", 4));
    expect(await store.deleteSnapshots("lc")).toBe(1);
    expect(await store.listSnapshots("lc", 5)).toEqual([]);
    expect(await store.listSnapshots("ld", 5)).toHaveLength(1);
    await store.deleteConnection("lc");
    expect(await store.getConnection("lc")).toBeNull();
    expect((await store.getConnection("ld"))!.username).toBe("Other");
  });

  it("runs the service end to end on it: import once, history, trend, unlink", async () => {
    const service = new LeetCodeService({ store, logger: silentLogger, now: () => NOW });
    const imp = async (o: Record<string, unknown>) => {
      const r = { format: "json" as const, origin: "file" as const, content: json(o) };
      const p = await service.preview("le", r);
      return service.confirm("le", { ...r, content_hash: p.content_hash! });
    };
    await service.link("le", "https://leetcode.com/u/lee215/");
    expect((await imp(good({ captured_at: "2026-09-10T08:00:00Z", totals: { solved: 80, easy: 40, medium: 32, hard: 8 }, topics: undefined, activity: undefined }))).status).toBe("imported");
    expect((await imp(good())).status).toBe("imported");
    expect((await imp(good())).status).toBe("already_imported");
    expect((await service.history("le")).total).toBe(2);
    const ins = await service.insights("le");
    expect(ins.trend).toMatchObject({ available: true, solved_change: 20, days: 30 });
    expect(ins.connection.states).toMatchObject({ profile_linked: true, imported_data_available: true, officially_connected: false, live_sync_unavailable: true });
    expect((await service.insights("lf")).available).toBe(false); // another student sees nothing
    await service.unlink("le", "all");
    expect((await service.history("le")).total).toBe(0);
  });
});
