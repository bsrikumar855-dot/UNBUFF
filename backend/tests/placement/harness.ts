import request from "supertest";
import type { Express } from "express";
import { AnalyticsService } from "../../src/analytics/service.js";
import type { StatsRecord } from "../../src/analytics/stats.js";
import { emptyFailures } from "../../src/analytics/stats.js";
import { MemoryRevisionStore, MemoryStatsStore } from "../../src/analytics/stores.js";
import { CodeService } from "../../src/code/service.js";
import { MemorySubmissionStore } from "../../src/code/submissionStore.js";
import { FakeProvider } from "../code/fakeProvider.js";
import { parseSuiteFile, SuiteRegistry } from "../../src/code/suites.js";
import { newClaim } from "../../src/core/claims.js";
import { DsaProgressService } from "../../src/dsa/progressService.js";
import { MemoryProgressStore } from "../../src/dsa/progressStore.js";
import type { GithubService } from "../../src/github/service.js";
import { LabService } from "../../src/graphqllab/service.js";
import { MemoryLabStore } from "../../src/graphqllab/store.js";
import { MockProvider } from "../../src/llm/mock.js";
import type { LLMProvider } from "../../src/llm/provider.js";
import { MentorService } from "../../src/mentor/service.js";
import { MemoryMentorStore } from "../../src/mentor/store.js";
import { EvidenceService } from "../../src/placement/evidence.js";
import { PlacementService } from "../../src/placement/service.js";
import { MemoryPlacementStore, type PlacementStore } from "../../src/placement/store.js";
import type { Session } from "../../src/store/SessionStore.js";
import { MemoryStore } from "../../src/store/memoryStore.js";
import type { Claim, PlacementDashboard, PlacementProfile, SubmissionVerdict, Verdict } from "../../src/types.js";
import { bearer, fixtureCatalogue, testApp } from "../integration/app.js";
import { roles, silentLogger } from "../helpers.js";

export const A = "student-a";
export const B = "student-b";
export const START = new Date("2026-06-15T09:00:00.000Z"); // a Monday

export const QUESTION_IDS = Array.from({ length: 12 }, (_v, i) => `q_fixture_${String(i + 1).padStart(2, "0")}`);

export function suitesFor(ids: string[], eligible: boolean): SuiteRegistry {
  return new SuiteRegistry(
    parseSuiteFile({
      schema_version: 1,
      suites: ids.map((question_id) => ({
        question_id,
        revision: "t1",
        is_demonstration: !eligible,
        statement: null,
        source: { name: "test suite", license_status: eligible ? "own_work" : "development_fixture", license_note: "written for tests" },
        samples: [{ input: "s\n", expected_output: "s\n" }],
        tests: ["1", "2", "3", "4", "5"].map((n) => ({ input: `${n}\n`, expected_output: `${n}\n` })),
        limits: { cpu_time_seconds: 2, memory_mb: 128 },
        starter_code: {},
        eligibility: { analytics_eligible: eligible, reason: eligible ? "test suite declared eligible" : "demonstration suite" },
      })),
    }),
  );
}

export interface GithubFake {
  status: "disconnected" | "connected" | "not_configured" | "reauthorization_required";
  cached: null | { stale?: boolean; gaps?: { repository: string; check: string; label: string }[] };
}

export function fakeGithub(f: GithubFake): GithubService {
  return {
    async connection() {
      return { status: f.status, login: f.status === "connected" ? "alice" : null };
    },
    async cachedForMentor() {
      if (!f.cached) return null;
      return {
        login: "alice",
        syncedAt: "2026-06-14T08:00:00.000Z",
        stale: f.cached.stale ?? false,
        repositories: {
          total_public: 3,
          truncated: false,
          repositories: [],
          checklist: (f.cached.gaps ?? []).map((g) => ({ repository: g.repository, check: g.check, status: "fail", label: g.label, evidence: "observed" })),
        },
      };
    },
  } as unknown as GithubService;
}

export const standardProfile = (over: Partial<PlacementProfile> = {}): PlacementProfile => ({
  role_ids: ["frontend_developer"],
  target_companies: [],
  placement_date: "2026-07-15",
  available_weekdays: [1, 2, 3, 4, 5],
  daily_minutes: 90,
  preferred_language: "python",
  experience_level: "intermediate",
  strengths: [],
  weak_areas: [],
  priorities: ["dsa", "interview"],
  ...over,
});

export interface HarnessOptions {
  execution?: { configured: boolean; verified: boolean };
  eligibleSuites?: boolean;
  github?: GithubFake;
  llm?: LLMProvider;
  llmMode?: "live" | "mock";
  placementStore?: PlacementStore;
  /**
   * Wire a real CodeService (with a stand-in execution provider whose result is chosen by a marker word in the source)
   * into the same analytics the planner reads. `allowMockToCount` is the TEST-ONLY switch that lets that stand-in's
   * results count; leave it false to see the production policy, which excludes them.
   */
  code?: { verified: boolean; allowMockToCount: boolean };
}

export function harness(opts: HarnessOptions = {}) {
  const clock = { now: new Date(START) };
  const now = () => clock.now;
  const llm = opts.llm ?? new MockProvider();
  const catalogue = fixtureCatalogue();
  const execution = opts.execution ?? { configured: true, verified: true };
  const suites = suitesFor(QUESTION_IDS, opts.eligibleSuites ?? true);
  const statsStore = new MemoryStatsStore();
  const revisionStore = new MemoryRevisionStore();
  const sessionStore = new MemoryStore();
  const dsaProgress = new DsaProgressService(new MemoryProgressStore(), () => catalogue);
  const submissionStore = new MemorySubmissionStore();
  const analytics = new AnalyticsService({ stats: statsStore, revisions: revisionStore, submissions: submissionStore, progress: dsaProgress, catalogue: () => catalogue, logger: silentLogger, now });
  const mentor = new MentorService({ store: new MemoryMentorStore(), llm, stats: statsStore, revisions: revisionStore, analytics, progress: dsaProgress, catalogue: () => catalogue, sessions: sessionStore, roles, logger: silentLogger, now });
  const lab = new LabService({ store: new MemoryLabStore(), mentor, logger: silentLogger, now });
  const github = fakeGithub(opts.github ?? { status: "disconnected", cached: null });
  const store = opts.placementStore ?? new MemoryPlacementStore();
  const placement = new PlacementService({
    store,
    evidence: new EvidenceService({ analytics, sessions: sessionStore, roles, lab, github, mentor, catalogue: () => catalogue, suites, execution, llmMode: opts.llmMode ?? "live", logger: silentLogger, now }),
    roles,
    topics: () => catalogue.allTopics(),
    mentor,
    logger: silentLogger,
    now,
    suggestions: async (uid) => {
      const p = (await mentor.getProfile(uid)).profile;
      return { preferred_language: p.preferred_languages[0] ?? null, daily_minutes: p.daily_study_minutes };
    },
  });
  const code = opts.code
    ? new CodeService({
        provider: new FakeProvider(),
        suites,
        catalogue: () => catalogue,
        progress: dsaProgress,
        submissions: submissionStore,
        logger: silentLogger,
        providerVerified: opts.code.verified,
        allowMockToCount: opts.code.allowMockToCount,
        onJudged: (r) => analytics.recordSubmission(r),
        now,
      })
    : undefined;
  const app: Express = testApp({ autoAuth: false, llm, analytics, statsStore, revisionStore, store: sessionStore, lab, mentor, github, placement, catalogue, submissionStore, progressStore: undefined, ...(code ? { code } : {}) });
  const auth = (uid: string) => ({ Authorization: bearer(uid) });

  const api = {
    get: (path: string, uid = A) => request(app).get(`/api/placement${path}`).set(auth(uid)),
    post: (path: string, body: object = {}, uid = A) => request(app).post(`/api/placement${path}`).set(auth(uid)).send(body),
    put: (path: string, body: object, uid = A) => request(app).put(`/api/placement${path}`).set(auth(uid)).send(body),
    del: (path: string, uid = A) => request(app).delete(`/api/placement${path}`).set(auth(uid)),
  };

  /** Judged results as the analytics engine stores them (counted submissions only). */
  async function setStats(uid: string, questionId: string, o: { attempts: number; accepted: number; at?: string; consecutive?: number; failuresAfterSolved?: number }) {
    const q = catalogue.summary(questionId)!;
    const verdict: SubmissionVerdict = o.accepted > 0 ? "accepted" : "wrong_answer";
    const at = o.at ?? clock.now.toISOString();
    const rec: StatsRecord = {
      owner_uid: uid,
      question_id: questionId,
      topics: q.topics,
      difficulty: q.difficulty,
      attempts: o.attempts,
      accepted: o.accepted,
      first_attempt: { verdict: o.attempts > 0 && o.accepted === 0 ? "wrong_answer" : verdict, at },
      first_accepted_at: o.accepted > 0 ? at : null,
      last_attempt_at: at,
      last_verdict: verdict,
      failures: { ...emptyFailures(), wrong_answer: o.attempts - o.accepted },
      consecutive_failures: o.consecutive ?? (o.accepted > 0 ? 0 : o.attempts),
      failures_after_solved: o.failuresAfterSolved ?? 0,
      events: Array.from({ length: Math.min(o.attempts, 5) }, (_v, i) => ({ id: `${uid}-${questionId}-${i}`, at, verdict: i < o.attempts - o.accepted ? ("wrong_answer" as const) : ("accepted" as const) })),
      updated_at: at,
    };
    await statsStore.put(rec);
  }

  /** An interview session as the interview module stores it. */
  async function addSession(uid: string, o: { id: string; role_id?: string; at?: string; claims: { skill_id: string; verdict: Verdict; proficiency: number; missing?: string[] }[] }) {
    const created = o.at ?? clock.now.toISOString();
    const claims: Claim[] = o.claims.map((c, i) => ({ ...newClaim(`CL-00${i + 1}`, { text: `claim ${i}`, resume_line: null, skill_id: c.skill_id, source: "declared" }), verdict: c.verdict, proficiency: c.proficiency, missing_concepts: c.missing ?? [], levels_passed: c.verdict === "defended" ? 3 : 1 }));
    const session: Session = {
      id: o.id,
      owner_uid: uid,
      role_id: o.role_id ?? "frontend_developer",
      mode: "defense",
      created_at: created,
      resume_text: null,
      declared_skills: [],
      claims,
      next_seq: claims.length + 1,
      cursors: {},
      history: claims.map((c) => ({ at: created, mode: "assess" as const, claim_id: c.id, proficiency: c.proficiency, skill_id: c.skill_id! })),
      guard_flips: 0,
      completions: 1,
      schedule: {},
    };
    await sessionStore.save(session);
  }

  const advance = (days: number, hour?: number) => {
    const t = new Date(clock.now.getTime() + days * 86_400_000);
    if (hour !== undefined) t.setUTCHours(hour, 0, 0, 0);
    clock.now = t;
  };

  return { app, api, clock, advance, analytics, lab, mentor, placement, store, statsStore, revisionStore, sessionStore, catalogue, auth, setStats, addSession };
}

export type Harness = ReturnType<typeof harness>;

export async function ready(h: Harness, profile: Partial<PlacementProfile> = {}, uid = A): Promise<PlacementDashboard> {
  const r = await h.api.put("/profile", standardProfile(profile), uid);
  if (r.status !== 200) throw new Error(`profile failed: ${JSON.stringify(r.body)}`);
  const g = await h.api.post("/plan/generate", {}, uid);
  if (g.status !== 200) throw new Error(`generate failed: ${JSON.stringify(g.body)}`);
  return g.body as PlacementDashboard;
}

export { roles };
