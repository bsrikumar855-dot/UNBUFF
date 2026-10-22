import "dotenv/config";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AccountService } from "./account/service.js";
import { budgetedProvider, LlmBudget } from "./security/budget.js";
import { RevocationGuard } from "./security/revocation.js";
import { FirestoreUsageStore, MemoryUsageStore, type UsageStore } from "./security/usageStore.js";
import { sweepInactiveSessions } from "./services/retention.js";
import { FirestoreAccountStore, MemoryAccountStore, type AccountStore } from "./account/store.js";
import { createApp } from "./app.js";
import { FirebaseTokenVerifier } from "./auth/verifier.js";
import { EvidenceService } from "./placement/evidence.js";
import { PlacementService } from "./placement/service.js";
import { FirestorePlacementStore, MemoryPlacementStore, type PlacementStore } from "./placement/store.js";
import { CareerService } from "./careers/service.js";
import { FirestoreCareerStore, MemoryCareerStore, type CareerStore } from "./careers/store.js";
import { FreehireClient } from "./careers/freehire.js";
import { HttpLeetCodeLookup } from "./leetcode/lookup.js";
import { LeetCodeService } from "./leetcode/service.js";
import { DockerLatexCompiler, UnavailableLatex } from "./resume/latex.js";
import { LearnService } from "./learn/service.js";
import { FirestoreLearnStore, MemoryLearnStore, type LearnStore } from "./learn/store.js";
import { ResumeService } from "./resume/service.js";
import { FirestoreResumeStore, MemoryResumeStore, type ResumeStore } from "./resume/store.js";
import { FirestoreLeetCodeStore, MemoryLeetCodeStore, type LeetCodeStore } from "./leetcode/store.js";
import { GithubGraphQL } from "./github/client.js";
import { GithubOAuth } from "./github/oauth.js";
import { GithubService } from "./github/service.js";
import { FirestoreGithubStore, MemoryGithubStore, type GithubStore } from "./github/store.js";
import { TokenVault } from "./github/vault.js";
import { MentorService } from "./mentor/service.js";
import { FirestoreMentorStore, MemoryMentorStore, type MentorStore } from "./mentor/store.js";
import { AnalyticsService } from "./analytics/service.js";
import { FirestoreRevisionStore, FirestoreStatsStore, MemoryRevisionStore, MemoryStatsStore, type RevisionStore, type StatsStore } from "./analytics/stores.js";
import { DockerProvider } from "./code/docker.js";
import { Judge0Provider } from "./code/judge0.js";
import { UnavailableProvider, type ExecutionProvider } from "./code/provider.js";
import { CodeService } from "./code/service.js";
import { FirestoreSubmissionStore, MemorySubmissionStore, type SubmissionStore } from "./code/submissionStore.js";
import { SuiteRegistry } from "./code/suites.js";
import { Catalogue, assertCatalogueServable } from "./dsa/catalogue.js";
import { DsaProgressService } from "./dsa/progressService.js";
import { FirestoreProgressStore, MemoryProgressStore, type ProgressStore } from "./dsa/progressStore.js";
import { loadConfig, parseServiceAccount, type Config } from "./config.js";
import { createLogger } from "./logger.js";
import { createProvider } from "./llm/select.js";
import { AssessmentService } from "./services/assessment.js";
import { RoleRegistry } from "./services/roles.js";
import { Firestore } from "@google-cloud/firestore";
import { FirestoreStore } from "./store/firestoreStore.js";
import { MemoryStore } from "./store/memoryStore.js";
import type { SessionStore } from "./store/SessionStore.js";

/** backend/ root, whether running from src/ (tsx) or dist/src/ (node). */
function backendRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return here.includes(`${join("dist", "src")}`) ? join(here, "..", "..") : join(here, "..");
}

function createStores(config: Config): { sessions: SessionStore; progress: ProgressStore; submissions: SubmissionStore; stats: StatsStore; revisions: RevisionStore; mentor: MentorStore; github: GithubStore; placement: PlacementStore; career: CareerStore; leetcode: LeetCodeStore; resume: ResumeStore; learn: LearnStore; account: AccountStore; usage: UsageStore } {
  if (config.STORE !== "firestore") return { sessions: new MemoryStore(), progress: new MemoryProgressStore(), submissions: new MemorySubmissionStore(), stats: new MemoryStatsStore(), revisions: new MemoryRevisionStore(), mentor: new MemoryMentorStore(), github: new MemoryGithubStore(), placement: new MemoryPlacementStore(), career: new MemoryCareerStore(), leetcode: new MemoryLeetCodeStore(), resume: new MemoryResumeStore(), learn: new MemoryLearnStore(), account: new MemoryAccountStore(), usage: new MemoryUsageStore() };
  const account = config.FIREBASE_SERVICE_ACCOUNT_JSON ? parseServiceAccount(config.FIREBASE_SERVICE_ACCOUNT_JSON) : null;
  const projectId = config.GOOGLE_CLOUD_PROJECT ?? account?.project_id ?? config.FIREBASE_PROJECT_ID;
  // Without a service-account secret, Application Default Credentials apply (Cloud Run identity, gcloud login, emulator).
  const db = new Firestore({
    projectId,
    ignoreUndefinedProperties: true,
    ...(account ? { credentials: { client_email: account.client_email, private_key: account.private_key } } : {}),
  });
  return { sessions: new FirestoreStore(undefined, db), progress: new FirestoreProgressStore(undefined, db), submissions: new FirestoreSubmissionStore(undefined, db), stats: new FirestoreStatsStore(undefined, db), revisions: new FirestoreRevisionStore(undefined, db), mentor: new FirestoreMentorStore(undefined, db), github: new FirestoreGithubStore(db), placement: new FirestorePlacementStore(db), career: new FirestoreCareerStore(db), leetcode: new FirestoreLeetCodeStore(db), resume: new FirestoreResumeStore(db), learn: new FirestoreLearnStore(db), account: new FirestoreAccountStore(db), usage: new FirestoreUsageStore(db) };
}

/**
 * An explicit approved file wins. Otherwise: the labelled dev fixture locally, and in production the first-party practice
 * pack (original exercises, no company data). Set DSA_CATALOGUE_PATH and CODE_SUITES_PATH together.
 */
function loadCatalogue(config: Config, root: string, logger: ReturnType<typeof createLogger>): Catalogue {
  const path = config.DSA_CATALOGUE_PATH ?? join(root, "data", "dsa", config.NODE_ENV === "production" ? "practice-pack.json" : "fixture.json");
  if (!config.DSA_CATALOGUE_PATH) logger.info({ path }, "DSA_CATALOGUE_PATH is not set: using the bundled default for this environment");
  const catalogue = Catalogue.fromPath(path); // validates; throws (fail fast) on a malformed file
  assertCatalogueServable(config.NODE_ENV, catalogue.source);
  logger.info({ source: catalogue.source?.name, license_status: catalogue.source?.license_status }, "DSA catalogue loaded");
  return catalogue;
}

function createExecutionProvider(config: Config, logger: ReturnType<typeof createLogger>): ExecutionProvider {
  if (config.EXECUTION_PROVIDER === "docker") {
    logger.warn("EXECUTION_PROVIDER=docker: running code in local Docker containers (development only)");
    return new DockerProvider();
  }
  if (config.EXECUTION_PROVIDER !== "judge0") {
    logger.warn("EXECUTION_PROVIDER is not set: running and submitting code is reported as unavailable");
    return new UnavailableProvider();
  }
  return new Judge0Provider({
    baseUrl: config.JUDGE0_URL as string, // required and validated by loadConfig
    authToken: config.JUDGE0_AUTH_TOKEN,
    authHeader: config.JUDGE0_AUTH_HEADER,
    logger,
    executionDeadlineMs: Math.min(30_000, config.CODE_JUDGE_DEADLINE_MS),
  });
}

/** Hidden test suites are server-only data. Unset: the labelled dev fixture locally, the practice pack's suites in production. */
function loadSuites(config: Config, root: string, logger: ReturnType<typeof createLogger>): SuiteRegistry {
  const path = config.CODE_SUITES_PATH ?? join(root, "data", "code", config.NODE_ENV === "production" ? "practice-suites.json" : "fixture-suites.json");
  if (!config.CODE_SUITES_PATH) logger.info({ path }, "CODE_SUITES_PATH is not set: using the bundled default for this environment");
  const suites = SuiteRegistry.fromPath(path); // validates; throws on a malformed file
  logger.info({ suites: suites.size() }, "code test suites loaded");
  return suites;
}

/** GitHub is optional: without its OAuth app and encryption key the service exists but reports itself as not configured. */
function createGithub(config: Config, store: GithubStore, logger: ReturnType<typeof createLogger>): GithubService {
  const timeoutMs = config.GITHUB_TIMEOUT_MS;
  const configured = config.GITHUB_CLIENT_ID && config.GITHUB_CLIENT_SECRET && config.GITHUB_REDIRECT_URI && config.GITHUB_TOKEN_ENCRYPTION_KEY;
  if (!configured) logger.warn("GitHub OAuth is not configured: GitHub insights are disabled (set GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, GITHUB_REDIRECT_URI and GITHUB_TOKEN_ENCRYPTION_KEY)");
  return new GithubService({
    store,
    gql: new GithubGraphQL({ timeoutMs }),
    oauth: configured ? new GithubOAuth({ clientId: config.GITHUB_CLIENT_ID as string, clientSecret: config.GITHUB_CLIENT_SECRET as string, redirectUri: config.GITHUB_REDIRECT_URI as string, timeoutMs }) : null,
    vault: configured
      ? new TokenVault(
          config.GITHUB_TOKEN_ENCRYPTION_KEY as string,
          (config.GITHUB_TOKEN_ENCRYPTION_KEY_RETIRED ?? "").split(",").map((k) => k.trim()).filter((k) => k !== ""),
        )
      : null,
    logger,
    frontendUrl: config.GITHUB_FRONTEND_URL || (config.CORS_ORIGIN.split(",")[0] ?? "http://localhost:5173").trim(),
    freshMinutes: config.GITHUB_FRESH_MINUTES,
    minSyncIntervalMinutes: config.GITHUB_MIN_SYNC_INTERVAL_MINUTES,
  });
}

function main(): void {
  const config = loadConfig();
  const logger = createLogger(config.LOG_LEVEL);
  const root = backendRoot();

  const roles = RoleRegistry.fromDirectory(join(root, "data", "roles")); // asserts weights sum to 1
  const demoReportJson = JSON.stringify(JSON.parse(readFileSync(join(root, "data", "demo_report.json"), "utf8")));
  const stores = createStores(config);
  const catalogue = loadCatalogue(config, root, logger);
  const dsaProgress = new DsaProgressService(stores.progress, () => catalogue);
  // Every model call made while serving a student is charged to that student's daily budget, whichever service makes it.
  const budget = new LlmBudget({ store: stores.usage, limit: config.LLM_DAILY_BUDGET, logger });
  const llm = budgetedProvider(createProvider(config, logger), budget, logger);
  const analytics = new AnalyticsService({
    stats: stores.stats,
    revisions: stores.revisions,
    submissions: stores.submissions,
    progress: dsaProgress,
    catalogue: () => catalogue,
    logger,
  });
  if (config.EXECUTION_PROVIDER === "judge0" && !config.EXECUTION_PROVIDER_VERIFIED) {
    logger.warn("EXECUTION_PROVIDER_VERIFIED is not true: judged submissions will not count toward analytics until the operator confirms the service is a real deployment");
  }
  const github = createGithub(config, stores.github, logger);
  // LeetCode has no official API and forbids scraping: this service only holds a saved username and numbers the student imports.
  const leetcode = new LeetCodeService({
    store: stores.leetcode,
    lookup: config.LEETCODE_PUBLIC_LOOKUP ? new HttpLeetCodeLookup() : undefined,
    logger,
    judged: async (uid) => {
      const o = await analytics.overview(uid);
      return { solved_unique: o.totals.solved_unique, available: o.has_eligible_activity };
    },
  });
  // The résumé builder: the ATS score is deterministic and computed on demand; PDFs come from a sandboxed TeX container.
  const resume = new ResumeService({
    store: stores.resume,
    compiler: config.LATEX_COMPILER === "docker" ? new DockerLatexCompiler() : new UnavailableLatex(),
    role: (id) => roles.get(id) ?? null,
    logger,
  });
  if (config.LATEX_COMPILER === "docker") logger.warn("LATEX_COMPILER=docker: building PDFs in local Docker containers (development only)");
  const learn = new LearnService({ store: stores.learn }); // DSA patterns and DBMS topics
  const careerHolder: { current?: CareerService } = {}; // the Career service is built after the placement service, which needs the mentor
  const mentor = new MentorService({
    store: stores.mentor,
    llm,
    stats: stores.stats,
    revisions: stores.revisions,
    analytics,
    progress: dsaProgress,
    catalogue: () => catalogue,
    sessions: stores.sessions,
    roles,
    logger,
    github,
    leetcode,
    resume,
    career: () => careerHolder.current,
    retention: { conversationDays: config.MENTOR_CONVERSATION_RETENTION_DAYS, summaryDays: config.MENTOR_SUMMARY_RETENTION_DAYS, learningDays: config.MENTOR_LEARNING_RETENTION_DAYS },
  });
  const suites = loadSuites(config, root, logger);
  const code = new CodeService({
    provider: createExecutionProvider(config, logger),
    suites,
    catalogue: () => catalogue,
    progress: dsaProgress,
    submissions: stores.submissions,
    logger,
    limits: { cpuTimeSeconds: config.CODE_CPU_TIME_SECONDS, memoryMb: config.CODE_MEMORY_MB },
    judgeDeadlineMs: config.CODE_JUDGE_DEADLINE_MS,
    providerVerified: config.EXECUTION_PROVIDER_VERIFIED,
    onJudged: (record) => analytics.recordSubmission(record),
  });
  const executionStatus = { configured: config.EXECUTION_PROVIDER !== "none", verified: config.EXECUTION_PROVIDER === "judge0" && config.EXECUTION_PROVIDER_VERIFIED };
  const placement = new PlacementService({
    store: stores.placement,
    evidence: new EvidenceService({ analytics, sessions: stores.sessions, roles, learn, github, leetcode, mentor, catalogue: () => catalogue, suites, execution: executionStatus, llmMode: llm.mode, logger }),
    roles,
    topics: () => catalogue.allTopics(),
    mentor,
    logger,
    suggestions: async (uid) => {
      const p = (await mentor.getProfile(uid)).profile;
      return { preferred_language: p.preferred_languages[0] ?? null, daily_minutes: p.daily_study_minutes };
    },
  });
  const career = new CareerService({ freehire: new FreehireClient(), store: stores.career, placement, logger });
  careerHolder.current = career;
  const serviceAccount = config.FIREBASE_SERVICE_ACCOUNT_JSON ? parseServiceAccount(config.FIREBASE_SERVICE_ACCOUNT_JSON) : null;
  const verifier = new FirebaseTokenVerifier(config.FIREBASE_PROJECT_ID ?? serviceAccount?.project_id ?? "", undefined, serviceAccount);
  const admin = verifier.admin();
  const revocation = admin ? new RevocationGuard({ admin, logger }) : null;
  if (!config.REQUIRE_EMAIL_VERIFICATION) logger.warn("REQUIRE_EMAIL_VERIFICATION is off: unverified accounts can use every feature, including the language model");
  if (config.NODE_ENV === "production" && config.STORE === "memory") {
    logger.warn("ALLOW_EPHEMERAL_STORE is set: sessions are lost on restart/redeploy and are not shared between instances");
  }
  const service = new AssessmentService({ store: stores.sessions, llm, roles, logger, maxSessionsPerStudent: config.MAX_SESSIONS_PER_STUDENT });
  const account = new AccountService({
    profiles: stores.account,
    roles,
    sessions: stores.sessions,
    progress: stores.progress,
    submissions: stores.submissions,
    stats: stores.stats,
    revisions: stores.revisions,
    mentorStore: stores.mentor,
    mentor,
    githubStore: stores.github,
    github,
    placementStore: stores.placement,
    placement,
    careerStore: stores.career,
    career,
    leetcodeStore: stores.leetcode,
    leetcode,
    resumeStore: stores.resume,
    learnStore: stores.learn,
    learn,
    revokeSessions: revocation ? (uid) => revocation.revokeAll(uid) : undefined,
    logger,
  });

  const app = createApp({
    service,
    roles,
    verifier,
    catalogue,
    dsaProgress,
    code,
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
    revocation,
    requireEmailVerification: config.REQUIRE_EMAIL_VERIFICATION,
    exposeModel: config.NODE_ENV !== "production",
    llm, logger, demoReportJson, corsOrigin: config.CORS_ORIGIN, trustProxy: config.TRUST_PROXY });
  const server = app.listen(config.PORT, "0.0.0.0", (err?: Error) => {
    if (err) {
      // Express 5 reports bind errors (e.g. EADDRINUSE) here instead of throwing.
      logger.fatal({ port: config.PORT, error: err.message }, "failed to start server");
      process.exit(1);
    }
    logger.info({ port: config.PORT, llm_mode: llm.mode, model: llm.model, store: config.STORE }, "UNBLUFF backend listening");
  });

  // Platform load balancers (Render, Cloud Run) keep idle connections open for about a minute. Node's default of 5 s would
  // close them first and surface as sporadic 502s, so stay open longer than the proxy does.
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;

  const shutdown = (signal: string) => {
    logger.info({ signal }, "shutting down");
    // Stop taking new connections and let in-flight requests finish, but never hang a deploy: leave after 10 s regardless.
    setTimeout(() => process.exit(1), 10_000).unref();
    server.close(() => process.exit(0));
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  // Retention: audits untouched for SESSION_RETENTION_DAYS are deleted, shortly after start and then twice a day.
  const sweep = () =>
    void sweepInactiveSessions(stores.sessions, config.SESSION_RETENTION_DAYS, logger).catch((err: unknown) =>
      logger.error({ err: (err as Error).message }, "session retention sweep failed"),
    );
  setTimeout(sweep, 60_000).unref();
  setInterval(sweep, 12 * 3_600_000).unref();
  process.on("SIGINT", () => shutdown("SIGINT"));

  // A bug that slips through must be logged (with the same redaction as everything else) and then restart the process
  // cleanly rather than leave it half-working.
  process.on("unhandledRejection", (reason) => {
    logger.fatal({ err: reason instanceof Error ? reason : new Error(String(reason)) }, "unhandled promise rejection");
    process.exit(1);
  });
  process.on("uncaughtException", (err) => {
    logger.fatal({ err }, "uncaught exception");
    process.exit(1);
  });
}

main();
