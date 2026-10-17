import express, { type Express } from "express";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createApp } from "../../src/app.js";
import type { TokenVerifier } from "../../src/auth/verifier.js";
import { MockProvider } from "../../src/llm/mock.js";
import type { LLMProvider } from "../../src/llm/provider.js";
import type { RateLimitOptions } from "../../src/middleware/rateLimit.js";
import { Catalogue, parseCatalogueFile } from "../../src/dsa/catalogue.js";
import { DsaProgressService } from "../../src/dsa/progressService.js";
import { MemoryProgressStore, type ProgressStore } from "../../src/dsa/progressStore.js";
import { AssessmentService } from "../../src/services/assessment.js";
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

/** Test verifier: "test:<uid>" is a valid token; anything else (including "expired") is rejected. */
export const fakeVerifier: TokenVerifier = {
  async verify(token) {
    const m = /^test:([\w-]+)$/.exec(token);
    if (!m) throw new Error("invalid token");
    return { uid: m[1]! };
  },
};

export const bearer = (uid: string) => `Bearer test:${uid}`;
export const DEFAULT_TEST_UID = "student-a";

/**
 * Builds the app. By default requests without an Authorization header are sent as DEFAULT_TEST_UID so
 * the pre-auth flow tests keep exercising the full interview. Pass `autoAuth: false` to test the real
 * 401 behaviour. The wrapper only touches headers; the app under test is unchanged.
 */
export function testApp(
  opts: { llm?: LLMProvider; rateLimits?: RateLimitOptions; corsOrigin?: string; store?: SessionStore; autoAuth?: boolean; catalogue?: Catalogue; progressStore?: ProgressStore; verifier?: TokenVerifier } = {},
): Express {
  const llm = opts.llm ?? new MockProvider();
  const catalogue = opts.catalogue ?? fixtureCatalogue();
  const service = new AssessmentService({ store: opts.store ?? new MemoryStore(), llm, roles, logger: silentLogger });
  const app = createApp({
    service,
    roles,
    verifier: opts.verifier ?? fakeVerifier,
    catalogue,
    dsaProgress: new DsaProgressService(opts.progressStore ?? new MemoryProgressStore(), () => catalogue),
    llm,
    logger: silentLogger,
    demoReportJson,
    corsOrigin: opts.corsOrigin,
    rateLimits: opts.rateLimits ?? { globalPerMinute: 10_000, llmPerMinute: 10_000 },
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
