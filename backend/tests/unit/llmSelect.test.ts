import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config.js";
import { GeminiProvider } from "../../src/llm/gemini.js";
import { MockProvider } from "../../src/llm/mock.js";
import { createProvider } from "../../src/llm/select.js";
import { createLogger } from "../../src/logger.js";

const logger = createLogger("silent");

describe("choosing the model provider", () => {
  it("LLM_MODE=mock selects the deterministic mock and says so", () => {
    const p = createProvider(loadConfig({ LLM_MODE: "mock" }), logger);
    expect(p).toBeInstanceOf(MockProvider);
    expect(p.mode).toBe("mock");
  });

  it("LLM_MODE=live selects the real Gemini provider, never the mock", () => {
    const p = createProvider(loadConfig({ LLM_MODE: "live", GEMINI_API_KEY: "test-key-not-real", GEMINI_MODEL: "gemini-test-model" }), logger);
    expect(p).toBeInstanceOf(GeminiProvider);
    expect(p).not.toBeInstanceOf(MockProvider);
    expect(p.mode).toBe("live");
    expect(p.model).toBe("gemini-test-model");
  });

  it("the default mode is live: nothing falls back to the mock unless it is asked for", () => {
    expect(() => loadConfig({})).toThrow(/GEMINI_API_KEY is required/); // live is the default, and it needs a key
    expect(loadConfig({ GEMINI_API_KEY: "test-key-not-real" }).LLM_MODE).toBe("live");
  });
});
