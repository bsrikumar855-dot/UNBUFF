import { Firestore } from "@google-cloud/firestore";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FirestoreGithubStore, type ConnectionRecord } from "../../src/github/store.js";
import { TokenVault } from "../../src/github/vault.js";
import { alice, harness, TEST_KEY } from "../github/harness.js";
import { sampleRepos } from "../github/fakeGithub.js";
import { PROJECT_ID, requireEmulators } from "./emulator.js";

/**
 * The GitHub integration's storage and flow on the real Firestore EMULATOR (GitHub itself is the scripted fake: no
 * network, no real OAuth app). The emulator is not a live Firebase project.
 */
const run = randomUUID().slice(0, 8);
const names = {
  states: `t_gh_states_${run}`,
  connections: `t_gh_conn_${run}`,
  credentials: `t_gh_cred_${run}`,
  identities: `t_gh_ident_${run}`,
  insights: `t_gh_ins_${run}`,
};
let db: Firestore;
let store: FirestoreGithubStore;

beforeAll(() => {
  requireEmulators();
  db = new Firestore({ projectId: PROJECT_ID, ignoreUndefinedProperties: true });
  store = new FirestoreGithubStore(db, names);
});

afterAll(async () => {
  for (const c of Object.values(names)) {
    const snap = await db.collection(c).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }
  await db.terminate();
});

const NOW = "2026-06-15T12:00:00.000Z";
const later = (s: number) => new Date(Date.parse(NOW) + s * 1000).toISOString();
const conn = (uid: string): ConnectionRecord => ({
  owner_uid: uid, github_user_id: "1001", login: "alice", profile_url: "https://github.com/alice", permissions: [], status: "connected", connected_at: NOW, last_synced_at: null, last_attempt_at: null,
  next_sync_allowed_at: null, last_error: null, last_error_at: null, sync_lock_until: null,
});
const hash = (c: string) => c.repeat(64).slice(0, 64);

describe("Firestore emulator: GitHub store", () => {
  it("consumes a one-time state exactly once, even when requested concurrently", async () => {
    await store.saveState(hash("a"), { owner_uid: "u1", code_verifier: "v", created_at: NOW, expires_at: later(600) });
    const results = await Promise.all(Array.from({ length: 6 }, () => store.consumeState(hash("a"))));
    expect(results.filter((r) => r !== null)).toHaveLength(1);
    expect(await store.consumeState(hash("a"))).toBeNull();
    expect(await store.consumeState("not-a-hash")).toBeNull();
  });

  it("lets only one student claim a GitHub account, under a race", async () => {
    const outcomes = await Promise.all(["race-u1", "race-u2", "race-u3", "race-u4"].map((u) => store.claimIdentity("777001", u, NOW)));
    expect(outcomes.filter(Boolean)).toHaveLength(1);
    const owner = (await db.collection(names.identities).doc("777001").get()).data()!.owner_uid as string;
    expect(await store.claimIdentity("777001", owner, NOW)).toBe(true); // the owner can re-claim
    const other = ["race-u1", "race-u2", "race-u3", "race-u4"].find((u) => u !== owner)!;
    await store.releaseIdentity("777001", other); // not theirs: no effect
    expect(await store.claimIdentity("777001", other, NOW)).toBe(false);
    await store.releaseIdentity("777001", owner);
    expect(await store.claimIdentity("777001", other, NOW)).toBe(true);
  });

  it("grants the sync lock to one caller at a time, and it expires", async () => {
    await store.saveConnection(conn("lock-u"));
    const got = await Promise.all(Array.from({ length: 5 }, () => store.acquireSyncLock("lock-u", NOW, later(90))));
    expect(got.filter(Boolean)).toHaveLength(1);
    expect(await store.acquireSyncLock("lock-u", later(30), later(120))).toBe(false);
    expect(await store.acquireSyncLock("lock-u", later(91), later(180))).toBe(true); // a crashed holder cannot block forever
    await store.releaseSyncLock("lock-u");
    expect(await store.acquireSyncLock("lock-u", later(92), later(180))).toBe(true);
    expect(await store.acquireSyncLock("nobody", NOW, later(90))).toBe(false);
  });

  it("never returns another student's records and rejects unsafe ids", async () => {
    await store.saveConnection(conn("own-u"));
    await db.collection(names.connections).doc("steal-u").set({ ...conn("someone-else") }); // a record filed under the wrong key
    expect((await store.getConnection("own-u"))?.owner_uid).toBe("own-u");
    expect(await store.getConnection("steal-u")).toBeNull();
    expect(await store.getCredential("steal-u")).toBeNull();
    expect(await store.getConnection("../etc")).toBeNull();
    await expect(store.saveConnection({ ...conn("a/b") })).rejects.toThrow(/invalid id/);
  });

  it("prunes a student's old and expired states and nobody else's", async () => {
    for (let i = 0; i < 5; i++) await store.saveState(hash(String(i)), { owner_uid: "prune-u", code_verifier: "v", created_at: later(i), expires_at: later(600 + i) });
    await store.saveState(hash("f"), { owner_uid: "other-u", code_verifier: "v", created_at: NOW, expires_at: later(600) });
    expect(await store.pruneStates("prune-u", later(10), 3)).toBe(2);
    expect(await store.consumeState(hash("0"))).toBeNull();
    expect(await store.consumeState(hash("4"))).not.toBeNull();
    expect(await store.consumeState(hash("f"))).not.toBeNull();
  });
});

describe("Firestore emulator: GitHub flow end to end (GitHub itself is scripted)", () => {
  it("connects, synchronises, serves cached reads and leaves nothing behind after disconnect", async () => {
    const fresh = new FirestoreGithubStore(db, names);
    const h = harness({ store: fresh });
    const uid = `flow-${run}`;
    expect(await h.connect(uid, alice({ id: 555001, repos: sampleRepos("alice") }))).toContain("github=connected");
    expect((await request(h.app).post("/api/github/sync").set(h.auth(uid)).send({})).body.outcome).toBe("synced");
    const repos = await request(h.app).get("/api/github/repositories").set(h.auth(uid));
    expect(repos.body.repositories[0].name_with_owner).toBe("alice/todo-app");
    expect((await request(h.app).get("/api/github/contributions").set(h.auth(uid))).body.available).toBe(true);

    // what is physically stored: the token only encrypted, bound to this student and account
    const cred = (await db.collection(names.credentials).doc(uid).get()).data()!;
    expect(JSON.stringify(cred)).not.toContain(h.gh.tokenIssued[0]!);
    expect(new TokenVault(TEST_KEY).open(cred.sealed, uid, "555001")).toBe(h.gh.tokenIssued[0]);
    for (const c of Object.values(names)) {
      for (const d of (await db.collection(c).get()).docs) if (JSON.stringify(d.data()).includes(h.gh.tokenIssued[0]!)) throw new Error(`token found in plain text in ${c}`);
    }

    const del = await request(h.app).delete("/api/github/connection").set(h.auth(uid));
    expect(del.body).toMatchObject({ revoked_at_github: true, data_removed: true });
    for (const c of [names.connections, names.credentials, names.insights]) expect((await db.collection(c).doc(uid).get()).exists).toBe(false);
    expect((await db.collection(names.identities).doc("555001").get()).exists).toBe(false);
    expect((await request(h.app).get("/api/github/repositories").set(h.auth(uid))).body.error.code).toBe("GITHUB_NOT_CONNECTED");
  });

  it("keeps two students' data apart in Firestore and refuses to link one GitHub account twice", async () => {
    const h = harness({ store: new FirestoreGithubStore(db, names) });
    const a = `iso-a-${run}`;
    const b = `iso-b-${run}`;
    await h.connect(a, alice({ id: 555101, repos: sampleRepos("alice") }));
    expect(await h.connect(b, alice({ id: 555101, repos: sampleRepos("alice") }))).toContain("reason=already_linked");
    await h.connect(b, { id: 555102, login: "bob", repos: [{ nameWithOwner: "bob/lib", tree: ["README.md"], readme: { text: "# lib" }, pushedAt: "2026-06-01T00:00:00Z" }] });
    await request(h.app).post("/api/github/sync").set(h.auth(a)).send({});
    await request(h.app).post("/api/github/sync").set(h.auth(b)).send({});
    const ra = await request(h.app).get("/api/github/repositories").set(h.auth(a));
    const rb = await request(h.app).get("/api/github/repositories").set(h.auth(b));
    expect(JSON.stringify(ra.body)).not.toContain("bob/lib");
    expect(JSON.stringify(rb.body)).not.toContain("alice/todo-app");
    await request(h.app).delete("/api/github/connection").set(h.auth(a));
    await request(h.app).delete("/api/github/connection").set(h.auth(b));
  });
});
