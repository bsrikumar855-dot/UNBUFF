import "dotenv/config";
import type { ThinkingLevel } from "@google/genai";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { FirebaseTokenVerifier } from "./auth/verifier.js";
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

function createStore(config: Config): SessionStore {
  if (config.STORE !== "firestore") return new MemoryStore();
  const account = config.FIREBASE_SERVICE_ACCOUNT_JSON ? parseServiceAccount(config.FIREBASE_SERVICE_ACCOUNT_JSON) : null;
  const projectId = config.GOOGLE_CLOUD_PROJECT ?? account?.project_id ?? config.FIREBASE_PROJECT_ID;
  // Without a service-account secret, Application Default Credentials apply (Cloud Run identity, gcloud login, emulator).
  const db = new Firestore({
    projectId,
    ignoreUndefinedProperties: true,
    ...(account ? { credentials: { client_email: account.client_email, private_key: account.private_key } } : {}),
  });
  return new FirestoreStore(undefined, db);
}

function main(): void {
  const config = loadConfig();
  const logger = createLogger(config.LOG_LEVEL);
  const root = backendRoot();

  const roles = RoleRegistry.fromDirectory(join(root, "data", "roles")); // asserts weights sum to 1
  const demoReportJson = JSON.stringify(JSON.parse(readFileSync(join(root, "data", "demo_report.json"), "utf8")));
  const store = createStore(config);
  const verifier = new FirebaseTokenVerifier(config.FIREBASE_PROJECT_ID);
  if (config.NODE_ENV === "production" && config.STORE === "memory") {
    logger.warn("ALLOW_EPHEMERAL_STORE is set: sessions are lost on restart/redeploy and are not shared between instances");
  }
  const llm = createProvider(config, logger);
  const service = new AssessmentService({ store, llm, roles, logger });

  const app = createApp({ service, roles, verifier, llm, logger, demoReportJson, corsOrigin: config.CORS_ORIGIN, trustProxy: config.TRUST_PROXY });
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
