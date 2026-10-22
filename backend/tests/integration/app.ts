import express, { type Express } from "express";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createApp } from "../../src/app.js";
import type { TokenVerifier } from "../../src/auth/verifier.js";
import { MockProvider } from "../../src/llm/mock.js";
import type { LLMProvider } from "../../src/llm/provider.js";
import type { RateLimitOptions } from "../../src/middleware/rateLimit.js";
import { GithubGraphQL } from "../../src/github/client.js";
import { EvidenceService } from "../../src/placement/evidence.js";
import { PlacementService } from "../../src/placement/service.js";
import { MemoryPlacementStore, type PlacementStore } from "../../src/placement/store.js";
import { GithubService } from "../../src/github/service.js";
import { MemoryGithubStore, type GithubStore } from "../../src/github/store.js";
import { MentorService } from "../../src/mentor/service.js";
import { MemoryMentorStore, type MentorStore } from "../../src/mentor/store.js";
import { AnalyticsService } from "../../src/analytics/service.js";
import { MemoryRevisionStore, MemoryStatsStore, type RevisionStore, type StatsStore } from "../../src/analytics/stores.js";
import { CodeService } from "../../src/code/service.js";
import { MemorySubmissionStore, type SubmissionStore } from "../../src/code/submissionStore.js";
import { SuiteRegistry, parseSuiteFile } from "../../src/code/suites.js";
import { ExecutionError, UnavailableProvider, type ExecutionProvider } from "../../src/code/provider.js";
import { Catalogue, parseCatalogueFile } from "../../src/dsa/catalogue.js";
import { DsaProgressService } from "../../src/dsa/progressService.js";
import { MemoryProgressStore, type ProgressStore } from "../../src/dsa/progressStore.js";
import { CareerService } from "../../src/careers/service.js";
import { FreehireError, type FreehireClient } from "../../src/careers/freehire.js";
import { MemoryCareerStore, type CareerStore } from "../../src/careers/store.js";
import { LeetCodeService } from "../../src/leetcode/service.js";
import { MemoryLeetCodeStore, type LeetCodeStore } from "../../src/leetcode/store.js";
import { UnavailableLatex, type LatexCompiler } from "../../src/resume/latex.js";
import { LearnService } from "../../src/learn/service.js";
import { MemoryLearnStore, type LearnStore } from "../../src/learn/store.js";
import { ResumeService } from "../../src/resume/service.js";
import { MemoryResumeStore, type ResumeStore } from "../../src/resume/store.js";
import { AccountService } from "../../src/account/service.js";
import { MemoryAccountStore, type AccountStore } from "../../src/account/store.js";
import { AssessmentService } from "../../src/services/assessment.js";
import { budgetedProvider, LlmBudget } from "../../src/security/budget.js";
import type { AppCheckMode, AppCheckVerifier } from "../../src/security/appCheck.js";
import type { RevocationGuard } from "../../src/security/revocation.js";
import { MemoryUsageStore, type UsageStore } from "../../src/security/usageStore.js";
import type { SessionStore } from "../../src/store/SessionStore.js";
import { MemoryStore } from "../../src/store/memoryStore.js";
import { roles, silentLogger } from "../helpers.js";

export const demoReportJson = readFileSync(join(import.meta.dirname, "..", "..", "data", "demo_report.json"), "utf8");
export const sampleResume = readFileSync(join(import.meta.dirname, "..", "fixtures", "sampleResume.txt"), "utf8");

/** Wraps a provider and counts every language-layer call (for efficiency assertions). */
export function countingProvider(inner: LLMProvider = new MockProvider()) {
  const counts: Record<string, number> = {};
  const handler: ProxyHandler<LLMProvider> = {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver) as unknown;
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => {
        counts[String(prop)] = (counts[String(prop)] ?? 0) + 1;
        return (value as (...a: unknown[]) => unknown).apply(target, args);
      };
    },
  };
  const total = () => Object.values(counts).reduce((a, b) => a + b, 0);
  return { llm: new Proxy(inner, handler), counts, total };
}

export const fixtureCatalogue = () =>
  new Catalogue(parseCatalogueFile(JSON.parse(readFileSync(join(import.meta.dirname, "..", "..", "data", "dsa", "fixture.json"), "utf8"))));

export const fixtureSuites = () =>
  new SuiteRegistry(parseSuiteFile(JSON.parse(readFileSync(join(import.meta.dirname, "..", "..", "data", "code", "fixture-suites.json"), "utf8"))));

export { ExecutionError };

/**
 * Test verifier: "test:<uid>" is a valid token for a verified email, "unverified:<uid>" one whose email is not verified
 * yet, and "test:<uid>@<auth_time>" one signed in at that time (seconds). Anything else (including "expired") is rejected.
 */
export const fakeVerifier: TokenVerifier = {
  async verify(token) {
    const m = /^(test|unverified):([\w-]+)(?:@(\d+))?$/.exec(token);
    if (!m) throw new Error("invalid token");
    return { uid: m[2]!, email_verified: m[1] === "test", ...(m[3] ? { auth_time: Number(m[3]) } : {}) };
  },
};
export const unverifiedBearer = (uid: string) => `Bearer unverified:${uid}`;

export const bearer = (uid: string) => `Bearer test:${uid}`;
export const DEFAULT_TEST_UID = "student-a";

/**
 * Builds the app. By default requests without an Authorization header are sent as DEFAULT_TEST_UID so
 * the pre-auth flow tests keep exercising the full interview. Pass `autoAuth: false` to test the real
 * 401 behaviour. The wrapper only touches headers; the app under test is unchanged.
 */
export function testApp(
  opts: { llm?: LLMProvider; rateLimits?: RateLimitOptions; corsOrigin?: string; store?: SessionStore; autoAuth?: boolean; catalogue?: Catalogue; progressStore?: ProgressStore; verifier?: TokenVerifier; provider?: ExecutionProvider; suites?: SuiteRegistry; submissionStore?: SubmissionStore; code?: CodeService; statsStore?: StatsStore; revisionStore?: RevisionStore; analytics?: AnalyticsService; mentorStore?: MentorStore; mentor?: MentorService; github?: GithubService; placement?: PlacementService; placementStore?: PlacementStore; career?: CareerService; careerStore?: CareerStore; leetcode?: LeetCodeService; leetcodeStore?: LeetCodeStore; resume?: ResumeService; resumeStore?: ResumeStore; learn?: LearnService; learnStore?: LearnStore; latex?: LatexCompiler; accountStore?: AccountStore; githubStore?: GithubStore; usageStore?: UsageStore; llmDailyBudget?: number; maxSessionsPerStudent?: number; requireEmailVerification?: boolean; revocation?: RevocationGuard; revokeSessions?: (uid: string) => Promise<void>; appCheck?: { mode: AppCheckMode; verifier: AppCheckVerifier | null }; freehire?: Pick<FreehireClient, "search" | "getJob" | "facets">; execution?: { configured: boolean; verified: boolean }; llmMode?: "live" | "mock"; now?: () => Date } = {},
): Express {
  // Like production, every model call is charged to the student's daily budget (generous by default so flow tests never hit it).
  const budget = new LlmBudget({ store: opts.usageStore ?? new MemoryUsageStore(), limit: opts.llmDailyBudget ?? 100_000, logger: silentLogger, now: opts.now });
  const llm = budgetedProvider(opts.llm ?? new MockProvider(), budget, silentLogger);
  const catalogue = opts.catalogue ?? fixtureCatalogue();
  const progressStore = opts.progressStore ?? new MemoryProgressStore();
  const dsaProgress = new DsaProgressService(progressStore, () => catalogue);
  const githubStore = opts.githubStore ?? new MemoryGithubStore();
  const mentorStore = opts.mentorStore ?? new MemoryMentorStore();
  const placementStore = opts.placementStore ?? new MemoryPlacementStore();
  const careerStore = opts.careerStore ?? new MemoryCareerStore();
  const leetcodeStore = opts.leetcodeStore ?? new MemoryLeetCodeStore();
  const resumeStore = opts.resumeStore ?? new MemoryResumeStore();
  const learnStore = opts.learnStore ?? new MemoryLearnStore();
  const submissions = opts.submissionStore ?? new MemorySubmissionStore();
  const statsStore = opts.statsStore ?? new MemoryStatsStore();
  const revisionStore = opts.revisionStore ?? new MemoryRevisionStore();
  const sessionStore = opts.store ?? new MemoryStore();
  const analytics =
    opts.analytics ??
    new AnalyticsService({
      stats: statsStore,
      revisions: revisionStore,
      submissions,
      progress: dsaProgress,
      catalogue: () => catalogue,
      logger: silentLogger,
    });
  // Default: GitHub is not configured (no OAuth app, no key), which is also how a fresh deployment starts.
  const github =
    opts.github ??
    new GithubService({ store: githubStore, gql: new GithubGraphQL(), oauth: null, vault: null, logger: silentLogger, frontendUrl: "http://localhost:5173" });
  // LeetCode: only a saved username and numbers the student imports. It never contacts LeetCode.
  const leetcode =
    opts.leetcode ??
    new LeetCodeService({
      store: leetcodeStore,
      logger: silentLogger,
      judged: async (uid) => {
        const o = await analytics.overview(uid);
        return { solved_unique: o.totals.solved_unique, available: o.has_eligible_activity };
      },
      now: opts.now,
    });
  const resume =
    opts.resume ??
    new ResumeService({ store: resumeStore, compiler: opts.latex ?? new UnavailableLatex(), role: (id) => roles.get(id) ?? null, logger: silentLogger, now: opts.now });
  const learn = opts.learn ?? new LearnService({ store: learnStore, now: opts.now });
  const careerHolder: { current?: CareerService } = {}; // the Career service needs the placement service, which needs the mentor
  const mentor =
    opts.mentor ??
    new MentorService({
      store: mentorStore,
      llm,
      stats: statsStore,
      revisions: revisionStore,
      analytics,
      progress: dsaProgress,
      catalogue: () => catalogue,
      sessions: sessionStore,
      roles,
      logger: silentLogger,
      github,
      leetcode,
      resume,
      career: () => careerHolder.current,
    });
  const placement =
    opts.placement ??
    new PlacementService({
      store: placementStore,
      evidence: new EvidenceService({
        analytics,
        sessions: sessionStore,
        roles,
        learn,
        github,
        leetcode,
        mentor,
        catalogue: () => catalogue,
        suites: opts.suites ?? fixtureSuites(),
        execution: opts.execution ?? { configured: false, verified: false },
        llmMode: opts.llmMode ?? llm.mode,
        logger: silentLogger,
        now: opts.now,
      }),
      roles,
      topics: () => catalogue.allTopics(),
      mentor,
      logger: silentLogger,
      now: opts.now,
    });
  // Default: the job source is unreachable, so no test can pass because of a listing that was never fetched.
  const unreachable = async (): Promise<never> => {
    throw new FreehireError("unavailable", "The job source could not be reached.");
  };
  const career =
    opts.career ??
    new CareerService({
      freehire: opts.freehire ?? { search: unreachable, getJob: unreachable, facets: unreachable },
      store: careerStore,
      placement,
      logger: silentLogger,
      now: opts.now,
    });
  careerHolder.current = career;
  const service = new AssessmentService({ store: sessionStore, llm, roles, logger: silentLogger, maxSessionsPerStudent: opts.maxSessionsPerStudent });
  const account = new AccountService({
    profiles: opts.accountStore ?? new MemoryAccountStore(),
    roles,
    sessions: sessionStore,
    progress: progressStore,
    submissions,
    stats: statsStore,
    revisions: revisionStore,
    mentorStore,
    mentor,
    githubStore,
    github,
    placementStore,
    placement,
    careerStore,
    career,
    leetcodeStore,
    leetcode,
    resumeStore,
    learnStore,
    learn,
    revokeSessions: opts.revokeSessions,
    logger: silentLogger,
    now: opts.now,
  });
  const app = createApp({
    service,
    roles,
    verifier: opts.verifier ?? fakeVerifier,
    catalogue,
    dsaProgress,
    code: opts.code ?? new CodeService({
      provider: opts.provider ?? new UnavailableProvider(),
      suites: opts.suites ?? fixtureSuites(),
      catalogue: () => catalogue,
      progress: dsaProgress,
      submissions,
      logger: silentLogger,
      onJudged: (r) => analytics.recordSubmission(r),
    }),
    analytics,
    mentor,
    github,
    placement,
    career,
    leetcode,
    resume,
    learn,
    account,
    budget,
    revocation: opts.revocation ?? null,
    requireEmailVerification: opts.requireEmailVerification ?? true,
    appCheck: opts.appCheck,
    exposeModel: true,
    llm,
    logger: silentLogger,
    demoReportJson,
    corsOrigin: opts.corsOrigin,
    rateLimits: opts.rateLimits ?? { globalPerMinute: 10_000, llmPerMinute: 10_000, llmUserPerMinute: 10_000 },
  });
  if (opts.autoAuth === false) return app;
  const wrapper = express();
  wrapper.use((req, _res, next) => {
    req.headers.authorization ??= bearer(DEFAULT_TEST_UID);
    next();
  });
  wrapper.use(app);
  return wrapper;
}
