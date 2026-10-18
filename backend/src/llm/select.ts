import type { ThinkingLevel } from "@google/genai";
import type { Config } from "../config.js";
import type { Logger } from "../logger.js";
import { GeminiProvider } from "./gemini.js";
import { MockProvider } from "./mock.js";
import type { LLMProvider } from "./provider.js";

/**
 * The one place that chooses the model provider from configuration. `LLM_MODE=mock` is the only way to get the canned
 * mock; everything else is the real Gemini provider (the key stays on the server). Production refuses the mock unless
 * ALLOW_MOCK_LLM is set (see config.ts), so a deployment cannot present canned answers as a real AI mentor by accident.
 */
export function createProvider(config: Config, logger: Logger): LLMProvider {
  if (config.LLM_MODE === "mock") return new MockProvider();
  return new GeminiProvider({
    apiKey: config.GEMINI_API_KEY,
    model: config.GEMINI_MODEL as string, // required by loadConfig in live mode
    fallbackModel: config.GEMINI_FALLBACK_MODEL,
    gradeThinking: config.GRADE_THINKING as ThinkingLevel,
    vertexai: config.GOOGLE_GENAI_USE_VERTEXAI,
    project: config.GOOGLE_CLOUD_PROJECT,
    location: config.GOOGLE_CLOUD_LOCATION,
    mentorModel: config.MENTOR_MODEL,
    mentorTemperature: config.MENTOR_TEMPERATURE,
    mentorTimeoutMs: config.MENTOR_TIMEOUT_MS,
    logger,
  });
}
