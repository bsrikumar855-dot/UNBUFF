import { ApiError as GenAiApiError, GoogleGenAI, ThinkingLevel } from "@google/genai";
import { z } from "zod";
import type { Logger } from "../logger.js";
import type { RawGrade } from "../core/rules.js";
import { LlmError, type LLMProvider } from "./provider.js";
import { ExtractOutput, FixTaskOutput, GradeOutput, QuestionOutput, RewriteOutput } from "./schemas.js";
import { clarifyPrompt } from "./prompts/clarify.js";
import { extractPrompt } from "./prompts/extract.js";
import { fixTaskPrompt } from "./prompts/fixTask.js";
import { gradePrompt } from "./prompts/grade.js";
import { questionPrompt } from "./prompts/question.js";
import { retestPrompt } from "./prompts/retest.js";
import { rewritePrompt } from "./prompts/rewrite.js";
import { SYSTEM_RULES } from "./prompts/shared.js";

export const LLM_TIMEOUT_MS = 25_000;
const RETRY_NOTE = "\n\nYour previous output was invalid JSON for the schema. Return only valid JSON.";

const TEMPERATURE = { precise: 0.2, creative: 0.7 } as const;
const TRANSIENT_BACKOFF_MS = 800;

interface CallOptions {
  temperature: number;
  thinking: ThinkingLevel;
}

/** A retryable API failure (429 / 5xx): uses the single retry without the invalid-JSON note. */
class TransientError extends Error {
  constructor(
    name: string,
    readonly retryAfterMs: number | null,
  ) {
    super(name);
  }
}

const MAX_COOLDOWN_MS = 60_000;

export interface GeminiOptions {
  apiKey?: string;
  model: string;
  /** Used for the retry when the primary model returns 429/5xx (optional). */
  fallbackModel?: string;
  vertexai?: boolean;
  project?: string;
  location?: string;
  logger: Logger;
  timeoutMs?: number;
  /** Thinking level for GRADE/EXTRACT/FIXTASK/REWRITE (default LOW). */
  gradeThinking?: ThinkingLevel;
  /** Injected client (tests). Defaults to a real GoogleGenAI. */
  client?: Pick<GoogleGenAI, "models">;
}

/** zod → JSON Schema for Gemini structured output (strip keywords the API doesn't accept). */
function jsonSchema(schema: z.ZodType): unknown {
  const { $schema: _ignored, ...rest } = z.toJSONSchema(schema, { target: "draft-7" }) as Record<string, unknown>;
  return rest;
}

/** Live provider: structured JSON output, 25 s timeout, one retry on invalid JSON / schema mismatch. */
export class GeminiProvider implements LLMProvider {
  readonly mode = "live" as const;
  readonly model: string;
  private readonly fallbackModel: string | undefined;
  /** After a quota 429 the primary is skipped until this time (only when a fallback exists). */
  private primaryCooldownUntil = 0;
  private readonly ai: Pick<GoogleGenAI, "models">;
  private readonly logger: Logger;
  private readonly timeoutMs: number;

  constructor(opts: GeminiOptions) {
    this.model = opts.model;
    this.fallbackModel = opts.fallbackModel;
    this.logger = opts.logger;
    this.timeoutMs = opts.timeoutMs ?? LLM_TIMEOUT_MS;
    this.ai = opts.client ?? (opts.vertexai
      ? new GoogleGenAI({ vertexai: true, apiKey: opts.apiKey, project: opts.project, location: opts.location })
      : new GoogleGenAI({ apiKey: opts.apiKey }));
    this.precise = { temperature: TEMPERATURE.precise, thinking: opts.gradeThinking ?? ThinkingLevel.LOW };
  }

  private readonly precise: CallOptions;
  private readonly creative: CallOptions = { temperature: TEMPERATURE.creative, thinking: ThinkingLevel.LOW };

  async extractClaims({ role, resumeText }: Parameters<LLMProvider["extractClaims"]>[0]) {
    const out = await this.call("extract", extractPrompt(role, resumeText), ExtractOutput, this.precise);
    return out.claims;
  }

  async question(ctx: Parameters<LLMProvider["question"]>[0]) {
    return (await this.call("question", questionPrompt(ctx), QuestionOutput, this.creative)).question;
  }

  async clarify(ctx: Parameters<LLMProvider["clarify"]>[0]) {
    return (await this.call("clarify", clarifyPrompt(ctx), QuestionOutput, this.creative)).question;
  }

  async retestQuestion(ctx: Parameters<LLMProvider["retestQuestion"]>[0]) {
    return (await this.call("retest", retestPrompt(ctx), QuestionOutput, this.creative)).question;
  }

  async grade(ctx: Parameters<LLMProvider["grade"]>[0]): Promise<RawGrade> {
    return this.call("grade", gradePrompt(ctx), GradeOutput, this.precise);
  }

  async fixTask({ role, claim, missingConcepts, rootCause }: Parameters<LLMProvider["fixTask"]>[0]) {
    return this.call("fixtask", fixTaskPrompt(role, claim, missingConcepts, rootCause), FixTaskOutput, this.precise);
  }

  async rewrite({ claim, evidenceSummary }: Parameters<LLMProvider["rewrite"]>[0]) {
    return (await this.call("rewrite", rewritePrompt(claim, evidenceSummary), RewriteOutput, this.precise)).rewrite;
  }

  private async call<T>(name: string, prompt: string, schema: z.ZodType<T>, opts: CallOptions): Promise<T> {
    const responseJsonSchema = jsonSchema(schema);
    let invalidBefore = false;
    let model = this.fallbackModel && Date.now() < this.primaryCooldownUntil ? this.fallbackModel : this.model;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const started = performance.now();
      let text: string;
      try {
        text = await this.generate(name, model, invalidBefore ? prompt + RETRY_NOTE : prompt, responseJsonSchema, opts, started);
      } catch (err) {
        if (err instanceof TransientError && attempt === 1) {
          if (err.retryAfterMs !== null && model === this.model) {
            this.primaryCooldownUntil = Date.now() + Math.min(err.retryAfterMs, MAX_COOLDOWN_MS);
          }
          model = this.fallbackModel ?? this.model;
          await new Promise((r) => setTimeout(r, TRANSIENT_BACKOFF_MS));
          continue;
        }
        if (err instanceof TransientError) throw new LlmError("LLM_INVALID_OUTPUT", `${name}: service unavailable after retry`);
        throw err;
      }
      const parsed = safeJson(text);
      const result = parsed === undefined ? null : schema.safeParse(parsed);
      const ms = Math.round(performance.now() - started);
      if (result?.success) {
        this.logger.info({ prompt: name, model, attempt, ms, valid: true }, "llm call");
        return result.data;
      }
      invalidBefore = true;
      this.logger.warn({ prompt: name, model, attempt, ms, valid: false }, "llm call returned invalid output");
    }
    throw new LlmError("LLM_INVALID_OUTPUT", `${name}: invalid output after retry`);
  }

  private async generate(name: string, model: string, prompt: string, responseJsonSchema: unknown, opts: CallOptions, started: number): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction: SYSTEM_RULES,
          temperature: opts.temperature,
          thinkingConfig: { thinkingLevel: opts.thinking },
          responseMimeType: "application/json",
          responseJsonSchema,
          abortSignal: controller.signal,
          httpOptions: { timeout: this.timeoutMs },
        },
      });
      return res.text ?? "";
    } catch (err) {
      const ms = Math.round(performance.now() - started);
      if (controller.signal.aborted || isTimeout(err)) {
        this.logger.warn({ prompt: name, ms }, "llm call timed out");
        throw new LlmError("LLM_TIMEOUT", `${name}: timed out after ${this.timeoutMs} ms`);
      }
      this.logger.warn({ prompt: name, model, ms, error: errorMessage(err) }, "llm call failed");
      if (isTransient(err)) throw new TransientError(name, retryAfterMs(err));
      // Other API errors (auth, bad request) are treated as invalid output: the caller degrades gracefully.
      throw new LlmError("LLM_INVALID_OUTPUT", `${name}: request failed`);
    } finally {
      clearTimeout(timer);
    }
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function isTransient(err: unknown): boolean {
  return err instanceof GenAiApiError && (err.status === 429 || err.status >= 500);
}

/** Parses "Please retry in 41.3s" from a 429 so we can route to the fallback meanwhile. */
function retryAfterMs(err: unknown): number | null {
  if (!(err instanceof GenAiApiError) || err.status !== 429) return null;
  const m = /retry in ([d.]+)s/i.exec(err.message);
  return m ? Math.ceil(Number(m[1]) * 1000) : 30_000;
}

function isTimeout(err: unknown): boolean {
  return err instanceof Error && /abort|timed? ?out/i.test(`${err.name} ${err.message}`);
}

/** Error text for logs, with anything key-like scrubbed. */
function errorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.replace(/(key=|AIza|AQ\.)[A-Za-z0-9._-]+/g, "$1[redacted]").slice(0, 600);
}
