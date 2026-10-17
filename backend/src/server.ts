import "dotenv/config";
import type { ThinkingLevel } from "@google/genai";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { FirebaseTokenVerifier } from "./auth/verifier.js";
import { AnalyticsService } from "./analytics/service.js";
import { FirestoreRevisionStore, FirestoreStatsStore, MemoryRevisionStore, MemoryStatsStore, type RevisionStore, type StatsStore } from "./analytics/stores.js";
import { Judge0Provider } from "./code/judge0.js";
import { UnavailableProvider, type ExecutionProvider } from "./code/provider.js";
import { CodeService } from "./code/service.js";
import { FirestoreSubmissionStore, MemorySubmissionStore, type SubmissionStore } from "./code/submissionStore.js";
import { SuiteRegistry } from "./code/suites.js";
import { Catalogue } from "./dsa/catalogue.js";
import { DsaProgressService } from "./dsa/progressService.js";
import { FirestoreProgressStore, MemoryProgressStore, type ProgressStore } from "./dsa/progressStore.js";
import { loadConfig, parseServiceAccount, type Config } from "./config.js";
import { createLogger } from "./logger.js";
import { GeminiProvider } from "./llm/gemini.js";
import { MockProvider } from "./llm/mock.js";
import type { LLMProvider } from "./llm/provider.js";
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

function createProvider(config: Config, logger: ReturnType<typeof createLogger>): LLMProvider {
  if (config.LLM_MODE === "mock") return new MockProvider();
  return new GeminiProvider({
    apiKey: config.GEMINI_API_KEY,
    model: config.GEMINI_MODEL as string, // required by loadConfig in live mode
    fallbackModel: config.GEMINI_FALLBACK_MODEL,
    gradeThinking: config.GRADE_THINKING as ThinkingLevel,
    vertexai: config.GOOGLE_GENAI_USE_VERTEXAI,
    project: config.GOOGLE_CLOUD_PROJECT,
    location: config.GOOGLE_CLOUD_LOCATION,
    logger,
  });
}

function createStores(config: Config): { sessions: SessionStore; progress: ProgressStore; submissions: SubmissionStore; stats: StatsStore; revisions: RevisionStore } {
  if (config.STORE !== "firestore") return { sessions: new MemoryStore(), progress: new MemoryProgressStore(), submissions: new MemorySubmissionStore(), stats: new MemoryStatsStore(), revisions: new MemoryRevisionStore() };
  const account = config.FIREBASE_SERVICE_ACCOUNT_JSON ? parseServiceAccount(config.FIREBASE_SERVICE_ACCOUNT_JSON) : null;
  const projectId = config.GOOGLE_CLOUD_PROJECT ?? account?.project_id ?? config.FIREBASE_PROJECT_ID;
  // Without a service-account secret, Application Default Credentials apply (Cloud Run identity, gcloud login, emulator).
  const db = new Firestore({
    projectId,
    ignoreUndefinedProperties: true,
    ...(account ? { credentials: { client_email: account.client_email, private_key: account.private_key } } : {}),
  });
  return { sessions: new FirestoreStore(undefined, db), progress: new FirestoreProgressStore(undefined, db), submissions: new FirestoreSubmissionStore(undefined, db), stats: new FirestoreStatsStore(undefined, db), revisions: new FirestoreRevisionStore(undefined, db) };
}

/**
 * An explicit approved file wins. Otherwise: the labelled dev fixture locally, and in production the first-party practice
 * pack (original exercises, no company data). Set DSA_CATALOGUE_PATH and CODE_SUITES_PATH together.
 */
function loadCatalogue(config: Config, root: string, logger: ReturnType<typeof createLogger>): Catalogue {
  const path = config.DSA_CATALOGUE_PATH ?? join(root, "data", "dsa", config.NODE_ENV === "production" ? "practice-pack.json" : "fixture.json");
  if (!config.DSA_CATALOGUE_PATH) logger.info({ path }, "DSA_CATALOGUE_PATH is not set: using the bundled default for this environment");
  const catalogue = Catalogue.fromPath(path); // validates; throws (fail fast) on a malformed file
  logger.info({ source: catalogue.source?.name, license_status: catalogue.source?.license_status }, "DSA catalogue loaded");
  return catalogue;
}

function createExecutionProvider(config: Config, logger: ReturnType<typeof createLogger>): ExecutionProvider {
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

function main(): void {
  const config = loadConfig();
  const logger = createLogger(config.LOG_LEVEL);
  const root = backendRoot();

  const roles = RoleRegistry.fromDirectory(join(root, "data", "roles")); // asserts weights sum to 1
  const demoReportJson = JSON.stringify(JSON.parse(readFileSync(join(root, "data", "demo_report.json"), "utf8")));
  const stores = createStores(config);
  const catalogue = loadCatalogue(config, root, logger);
  const dsaProgress = new DsaProgressService(stores.progress, () => catalogue);
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
  const code = new CodeService({
    provider: createExecutionProvider(config, logger),
    suites: loadSuites(config, root, logger),
    catalogue: () => catalogue,
    progress: dsaProgress,
    submissions: stores.submissions,
    logger,
    limits: { cpuTimeSeconds: config.CODE_CPU_TIME_SECONDS, memoryMb: config.CODE_MEMORY_MB },
    judgeDeadlineMs: config.CODE_JUDGE_DEADLINE_MS,
    providerVerified: config.EXECUTION_PROVIDER_VERIFIED,
    onJudged: (record) => analytics.recordSubmission(record),
  });
  const verifier = new FirebaseTokenVerifier(config.FIREBASE_PROJECT_ID);
  if (config.NODE_ENV === "production" && config.STORE === "memory") {
    logger.warn("ALLOW_EPHEMERAL_STORE is set: sessions are lost on restart/redeploy and are not shared between instances");
  }
  const llm = createProvider(config, logger);
  const service = new AssessmentService({ store: stores.sessions, llm, roles, logger });

  const app = createApp({
    service,
    roles,
    verifier,
    catalogue,
    dsaProgress,
    code,
    analytics,
    llm, logger, demoReportJson, corsOrigin: config.CORS_ORIGIN, trustProxy: config.TRUST_PROXY });
  const server = app.listen(config.PORT, "0.0.0.0", (err?: Error) => {
    if (err) {
      // Express 5 reports bind errors (e.g. EADDRINUSE) here instead of throwing.
      logger.fatal({ port: config.PORT, error: err.message }, "failed to start server");
      process.exit(1);
    }
    logger.info({ port: config.PORT, llm_mode: llm.mode, model: llm.model, store: config.STORE }, "UNBLUFF backend listening");
  });

  const shutdown = (signal: string) => {
    logger.info({ signal }, "shutting down");
    server.close(() => process.exit(0));
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main();
