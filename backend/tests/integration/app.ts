import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createApp } from "../../src/app.js";
import { MockProvider } from "../../src/llm/mock.js";
import type { LLMProvider } from "../../src/llm/provider.js";
import type { RateLimitOptions } from "../../src/middleware/rateLimit.js";
import { AssessmentService } from "../../src/services/assessment.js";
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

export function testApp(opts: { llm?: LLMProvider; rateLimits?: RateLimitOptions } = {}) {
  const llm = opts.llm ?? new MockProvider();
  const service = new AssessmentService({ store: new MemoryStore(), llm, roles, logger: silentLogger });
  return createApp({
    service,
    roles,
    llm,
    logger: silentLogger,
    demoReportJson,
    rateLimits: opts.rateLimits ?? { globalPerMinute: 10_000, llmPerMinute: 10_000 },
  });
}
