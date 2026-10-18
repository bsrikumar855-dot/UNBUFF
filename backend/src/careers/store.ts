import { Firestore } from "@google-cloud/firestore";
import type { CareerApplicationStatus, CareerPreferences } from "../types.js";

/**
 * Storage for the Career feature. Everything is owned by one student (owner_uid, from the verified token) and the
 * browser never reads it directly. Third-party job data is NOT copied here: a tracked job keeps only what is needed to
 * recognise it and reopen the original posting (title, company name, apply link, slug), never the description.
 *
 *   unbluff_career_prefs   one per student (id = uid): career preferences
 *   unbluff_career_jobs    one per student and job (id = "<uid>__freehire__<slug>"): bookmark, status, dates, notes
 *   unbluff_career_resume_skills  one per student (id = uid): the skills they confirmed from their resume (never the resume)
 */

export interface PrefsRecord {
  owner_uid: string;
  preferences: CareerPreferences;
  created_at: string;
  updated_at: string;
}

/** The skills a student confirmed from their resume. The resume text itself is never stored. */
export interface ResumeSkillsRecord {
  owner_uid: string;
  skills: { slug: string; label: string }[];
  saved_at: string;
}

export interface TrackedRecord {
  owner_uid: string;
  source: "freehire";
  slug: string;
  title: string;
  company: string | null;
  apply_url: string | null;
  saved: boolean;
  status: CareerApplicationStatus | null;
  applied_on: string | null; // YYYY-MM-DD
  follow_up_on: string | null;
  notes: string;
  posting_state: "unknown" | "possibly_unavailable";
  created_at: string;
  updated_at: string;
}

export interface CareerStore {
  getPrefs(uid: string): Promise<PrefsRecord | null>;
  savePrefs(rec: PrefsRecord): Promise<void>;
  getResume(uid: string): Promise<ResumeSkillsRecord | null>;
  saveResume(rec: ResumeSkillsRecord): Promise<void>;
  deleteResume(uid: string): Promise<void>;
  getTracked(uid: string, slug: string): Promise<TrackedRecord | null>;
  /** Creates or replaces the one record for (uid, slug): saving twice never makes a duplicate. */
  saveTracked(rec: TrackedRecord): Promise<void>;
  deleteTracked(uid: string, slug: string): Promise<void>;
  /** At most `limit` of this student's tracked jobs. */
  listTracked(uid: string, limit: number): Promise<TrackedRecord[]>;
  /** Removes everything this student has in Career. */
  deleteAll(uid: string): Promise<void>;
}

const SAFE_UID = /^[A-Za-z0-9_-]{1,128}$/;
export const SAFE_SLUG = /^[A-Za-z0-9._-]{1,300}$/;
const assert = (ok: boolean) => {
  if (!ok) throw new Error("invalid id");
};
const keyOf = (uid: string, slug: string) => `${uid}__freehire__${slug}`;
const validSlug = (slug: string) => SAFE_SLUG.test(slug) && slug !== "." && slug !== "..";

export class MemoryCareerStore implements CareerStore {
  private readonly prefs = new Map<string, PrefsRecord>();
  private readonly tracked = new Map<string, TrackedRecord>();
  private readonly resumes = new Map<string, ResumeSkillsRecord>();

  async getPrefs(uid: string) {
    const r = this.prefs.get(uid);
    return r ? structuredClone(r) : null;
  }
  async savePrefs(rec: PrefsRecord) {
    assert(SAFE_UID.test(rec.owner_uid));
    this.prefs.set(rec.owner_uid, structuredClone(rec));
  }
  async getResume(uid: string) {
    const r = SAFE_UID.test(uid) ? this.resumes.get(uid) : undefined;
    return r && r.owner_uid === uid ? structuredClone(r) : null;
  }
  async saveResume(rec: ResumeSkillsRecord) {
    assert(SAFE_UID.test(rec.owner_uid));
    this.resumes.set(rec.owner_uid, structuredClone(rec));
  }
  async deleteResume(uid: string) {
    if (SAFE_UID.test(uid)) this.resumes.delete(uid);
  }
  async getTracked(uid: string, slug: string) {
    if (!SAFE_UID.test(uid) || !validSlug(slug)) return null;
    const r = this.tracked.get(keyOf(uid, slug));
    return r && r.owner_uid === uid ? structuredClone(r) : null;
  }
  async saveTracked(rec: TrackedRecord) {
    assert(SAFE_UID.test(rec.owner_uid) && validSlug(rec.slug));
    this.tracked.set(keyOf(rec.owner_uid, rec.slug), structuredClone(rec));
  }
  async deleteTracked(uid: string, slug: string) {
    if (!SAFE_UID.test(uid) || !validSlug(slug)) return;
    this.tracked.delete(keyOf(uid, slug));
  }
  async listTracked(uid: string, limit: number) {
    if (!SAFE_UID.test(uid)) return [];
    return [...this.tracked.values()]
      .filter((r) => r.owner_uid === uid)
      .slice(0, limit)
      .map((r) => structuredClone(r));
  }
  async deleteAll(uid: string) {
    if (!SAFE_UID.test(uid)) return;
    this.prefs.delete(uid);
    this.resumes.delete(uid);
    for (const [k, r] of this.tracked) if (r.owner_uid === uid) this.tracked.delete(k);
  }
}

export class FirestoreCareerStore implements CareerStore {
  private readonly prefs;
  private readonly tracked;
  private readonly resumes;

  constructor(
    private readonly db: Firestore = new Firestore({ ignoreUndefinedProperties: true }),
    names = { prefs: "unbluff_career_prefs", tracked: "unbluff_career_jobs", resumes: "unbluff_career_resume_skills" },
  ) {
    this.prefs = db.collection(names.prefs);
    this.tracked = db.collection(names.tracked);
    this.resumes = db.collection(names.resumes);
  }

  async getPrefs(uid: string) {
    if (!SAFE_UID.test(uid)) return null;
    const snap = await this.prefs.doc(uid).get();
    const r = snap.exists ? (snap.data() as PrefsRecord) : null;
    return r && r.owner_uid === uid ? r : null;
  }
  async savePrefs(rec: PrefsRecord) {
    assert(SAFE_UID.test(rec.owner_uid));
    await this.prefs.doc(rec.owner_uid).set({ ...rec });
  }
  async getResume(uid: string) {
    if (!SAFE_UID.test(uid)) return null;
    const snap = await this.resumes.doc(uid).get();
    const r = snap.exists ? (snap.data() as ResumeSkillsRecord) : null;
    return r && r.owner_uid === uid ? r : null;
  }
  async saveResume(rec: ResumeSkillsRecord) {
    assert(SAFE_UID.test(rec.owner_uid));
    await this.resumes.doc(rec.owner_uid).set({ ...rec });
  }
  async deleteResume(uid: string) {
    if (!SAFE_UID.test(uid)) return;
    await this.resumes.doc(uid).delete();
  }
  async getTracked(uid: string, slug: string) {
    if (!SAFE_UID.test(uid) || !validSlug(slug)) return null;
    const snap = await this.tracked.doc(keyOf(uid, slug)).get();
    const r = snap.exists ? (snap.data() as TrackedRecord) : null;
    return r && r.owner_uid === uid ? r : null;
  }
  async saveTracked(rec: TrackedRecord) {
    assert(SAFE_UID.test(rec.owner_uid) && validSlug(rec.slug));
    await this.tracked.doc(keyOf(rec.owner_uid, rec.slug)).set({ ...rec });
  }
  async deleteTracked(uid: string, slug: string) {
    if (!SAFE_UID.test(uid) || !validSlug(slug)) return;
    await this.tracked.doc(keyOf(uid, slug)).delete();
  }
  async listTracked(uid: string, limit: number) {
    if (!SAFE_UID.test(uid)) return [];
    const snap = await this.tracked.where("owner_uid", "==", uid).limit(limit).get();
    return snap.docs.map((d) => d.data() as TrackedRecord).filter((r) => r.owner_uid === uid);
  }
  async deleteAll(uid: string) {
    if (!SAFE_UID.test(uid)) return;
    await this.prefs.doc(uid).delete();
    await this.resumes.doc(uid).delete();
    const snap = await this.tracked.where("owner_uid", "==", uid).get();
    for (let i = 0; i < snap.docs.length; i += 400) {
      const batch = this.db.batch();
      for (const d of snap.docs.slice(i, i + 400)) batch.delete(d.ref);
      await batch.commit();
    }
  }
}
