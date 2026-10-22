import { Firestore } from "@google-cloud/firestore";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FirestoreAccountStore, type AccountProfileRecord } from "../../src/account/store.js";
import { FirestoreStore } from "../../src/store/firestoreStore.js";
import type { Session } from "../../src/store/SessionStore.js";
import { PROJECT_ID, requireEmulators } from "./emulator.js";

/** Account profiles and the session `confirmed_at` field on the Firestore EMULATOR (never a live project). */
const run = randomUUID().slice(0, 8);
const names = { profiles: `t_acct_prof_${run}`, sessions: `t_acct_sess_${run}` };
let db: Firestore;
let store: FirestoreAccountStore;

beforeAll(() => {
  requireEmulators();
  db = new Firestore({ projectId: PROJECT_ID, ignoreUndefinedProperties: true });
  store = new FirestoreAccountStore(db, names.profiles);
});
afterAll(async () => {
  for (const c of Object.values(names)) {
    const snap = await db.collection(c).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }
  await db.terminate();
});

const profile = (owner: string, name: string): AccountProfileRecord => ({
  owner_uid: owner,
  display_name: name,
  college: null,
  graduation_year: 2027,
  target_role_id: "frontend_developer",
  updated_at: "2026-10-22T10:00:00.000Z",
});

describe("Firestore emulator: account profile store", () => {
  it("keeps one profile per student, keyed and checked by uid, and deletes only the owner's", async () => {
    expect(await store.get("acct-a")).toBeNull();
    await store.put(profile("acct-a", "Asha"));
    await store.put(profile("acct-b", "Bilal"));
    expect(await store.get("acct-a")).toEqual(profile("acct-a", "Asha"));
    await store.put({ ...profile("acct-a", "Asha Rao"), college: null });
    expect((await store.get("acct-a"))?.display_name).toBe("Asha Rao");

    await db.collection(names.profiles).doc("acct-c").set(profile("acct-a", "misfiled")); // filed under the wrong key
    expect(await store.get("acct-c")).toBeNull();

    await store.delete("acct-a");
    expect(await store.get("acct-a")).toBeNull();
    expect((await store.get("acct-b"))?.display_name).toBe("Bilal");
  });

  it("refuses unsafe ids instead of touching another path", async () => {
    await expect(store.put(profile("a/b", "x"))).rejects.toThrow(/invalid id/);
    expect(await store.get("../acct-b")).toBeNull();
    await store.delete("../acct-b"); // no-op
    expect((await store.get("acct-b"))?.display_name).toBe("Bilal");
  });
});

describe("Firestore emulator: session confirmed_at", () => {
  it("survives a save and reload, and is absent on sessions saved without it", async () => {
    const sessions = new FirestoreStore(names.sessions, db);
    const base: Session = {
      id: `s_${randomUUID()}`, owner_uid: "acct-a", role_id: "frontend_developer", mode: "prepare", created_at: "2026-10-22T10:00:00.000Z",
      resume_text: null, declared_skills: ["React"], claims: [], next_seq: 1, cursors: {}, history: [], guard_flips: 0, completions: 0, schedule: {},
    };
    await sessions.save(base);
    expect((await sessions.get(base.id))?.confirmed_at).toBeUndefined();
    await sessions.save({ ...base, confirmed_at: "2026-10-22T10:05:00.000Z" });
    expect((await sessions.get(base.id))?.confirmed_at).toBe("2026-10-22T10:05:00.000Z");
  });
});
