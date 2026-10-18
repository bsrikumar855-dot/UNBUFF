import { Firestore } from "@google-cloud/firestore";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FirestoreCareerStore, type TrackedRecord } from "../../src/careers/store.js";
import { CareerService } from "../../src/careers/service.js";
import { fakeFreehire, fakePlacement, rawJob } from "../careers/fakes.js";
import { silentLogger } from "../helpers.js";
import { PROJECT_ID, requireEmulators } from "./emulator.js";

/** The Career store and tracker on the Firestore EMULATOR (listings are mocked). The emulator is not a live project. */
const run = randomUUID().slice(0, 8);
const names = { prefs: `t_career_prefs_${run}`, tracked: `t_career_jobs_${run}`, resumes: `t_career_resume_${run}` };
let db: Firestore;
let store: FirestoreCareerStore;

beforeAll(() => {
  requireEmulators();
  db = new Firestore({ projectId: PROJECT_ID, ignoreUndefinedProperties: true });
  store = new FirestoreCareerStore(db, names);
});
afterAll(async () => {
  for (const c of Object.values(names)) {
    const snap = await db.collection(c).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }
  await db.terminate();
});

const rec = (owner: string, slug: string, over: Partial<TrackedRecord> = {}): TrackedRecord => ({
  owner_uid: owner, source: "freehire", slug, title: "T", company: "C", apply_url: "https://example.com/x", saved: true, status: "saved", applied_on: null, follow_up_on: null, notes: "", posting_state: "unknown", created_at: "x", updated_at: "x", ...over,
});

describe("Firestore emulator: career store", () => {
  it("keeps one record per student and job, owned and bounded", async () => {
    await store.saveTracked(rec("ca", "job-1"));
    await store.saveTracked(rec("ca", "job-1", { notes: "second write replaces, never duplicates" }));
    await store.saveTracked(rec("ca", "job-2"));
    await store.saveTracked(rec("cb", "job-1", { notes: "bob" }));
    expect((await store.listTracked("ca", 10)).map((r) => r.slug).sort()).toEqual(["job-1", "job-2"]);
    expect((await store.listTracked("ca", 1)).length).toBe(1);
    expect((await store.getTracked("ca", "job-1"))!.notes).toBe("second write replaces, never duplicates");
    expect((await store.getTracked("cb", "job-1"))!.notes).toBe("bob");
    expect(await store.getTracked("cb", "job-2")).toBeNull();
    await store.deleteTracked("ca", "job-2");
    expect(await store.getTracked("ca", "job-2")).toBeNull();
  });

  it("refuses unsafe ids and never reads another student's record", async () => {
    await expect(store.saveTracked(rec("ca", "a/b"))).rejects.toThrow();
    await expect(store.saveTracked(rec("../x", "ok"))).rejects.toThrow();
    expect(await store.getTracked("ca", "../etc")).toBeNull();
    expect(await store.listTracked("../x", 5)).toEqual([]);
  });

  it("keeps one resume-skills record per student and removes it with the rest", async () => {
    await store.saveResume({ owner_uid: "cr1", skills: [{ slug: "react", label: "React" }], saved_at: "x" });
    await store.saveResume({ owner_uid: "cr1", skills: [{ slug: "css", label: "CSS" }], saved_at: "y" });
    await store.saveResume({ owner_uid: "cr2", skills: [{ slug: "git", label: "Git" }], saved_at: "z" });
    expect((await store.getResume("cr1"))!.skills).toEqual([{ slug: "css", label: "CSS" }]);
    expect(await store.getResume("../x")).toBeNull();
    await store.deleteAll("cr1");
    expect(await store.getResume("cr1")).toBeNull();
    expect((await store.getResume("cr2"))!.skills[0]!.slug).toBe("git");
    await store.deleteResume("cr2");
    expect(await store.getResume("cr2")).toBeNull();
  });

  it("deletes everything one student has, and only that student's", async () => {
    await store.savePrefs({ owner_uid: "cc", preferences: { categories: [], skills: [], countries: [], cities: [], work_modes: [], employment_types: [], must_match_location: false, must_match_work_mode: false, must_match_employment: false }, created_at: "x", updated_at: "x" });
    await store.saveTracked(rec("cc", "job-9"));
    await store.deleteAll("cc");
    expect(await store.getPrefs("cc")).toBeNull();
    expect(await store.listTracked("cc", 5)).toEqual([]);
    expect((await store.getTracked("cb", "job-1"))!.notes).toBe("bob");
  });

  it("runs the tracker on it end to end", async () => {
    const freehire = fakeFreehire();
    freehire.jobs.set("react-intern-acme-abc123", rawJob());
    const career = new CareerService({ freehire, store, placement: fakePlacement(), logger: silentLogger, now: () => new Date("2026-10-18T10:00:00Z") });
    await career.updateTracker("cd", "react-intern-acme-abc123", { saved: true });
    await career.updateTracker("cd", "react-intern-acme-abc123", { saved: true });
    await career.updateTracker("cd", "react-intern-acme-abc123", { status: "applied", applied_on: "2026-10-15" });
    expect((await career.tracked("cd", "all")).items).toHaveLength(1);
    expect((await career.tracked("ce", "all")).items).toHaveLength(0);
    await career.unsave("cd", "react-intern-acme-abc123");
    expect((await career.tracked("cd", "applications")).items[0]!.tracker).toMatchObject({ saved: false, status: "applied" });
  });
});
