import { z } from "zod";

const EnvSchema = z
  .object({
    LLM_MODE: z.enum(["live", "mock"]).default("live"),
    GEMINI_API_KEY: z.string().optional(),
    GEMINI_MODEL: z
      .string()
      .optional()
      .transform((v) => (v && v.trim() !== "" ? v : "gemini-3.1-flash-lite")),
    GEMINI_FALLBACK_MODEL: z
      .string()
      .optional()
      .transform((v) => (v && v.trim() !== "" ? v : "gemini-3.6-flash")),
    GRADE_THINKING: z.enum(["MINIMAL", "LOW", "MEDIUM", "HIGH"]).default("LOW"),
    GOOGLE_GENAI_USE_VERTEXAI: z
      .enum(["true", "false", "1", "0"])
      .default("false")
      .transform((v) => v === "true" || v === "1"),
    GOOGLE_CLOUD_PROJECT: z.string().optional(),
    GOOGLE_CLOUD_LOCATION: z.string().optional(),
    PORT: z.coerce.number().int().positive().default(8080),
    CORS_ORIGIN: z.string().default("*"),
    STORE: z.enum(["memory", "firestore"]).default("memory"),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  })
  .superRefine((env, ctx) => {
    if (env.LLM_MODE !== "live") return;
    if (!env.GEMINI_MODEL) {
      ctx.addIssue({ code: "custom", path: ["GEMINI_MODEL"], message: "GEMINI_MODEL is required when LLM_MODE=live" });
    }
    if (!env.GEMINI_API_KEY && !env.GOOGLE_GENAI_USE_VERTEXAI) {
      ctx.addIssue({ code: "custom", path: ["GEMINI_API_KEY"], message: "GEMINI_API_KEY is required when LLM_MODE=live" });
    }
  });

export type Config = z.infer<typeof EnvSchema>;

/** Parses env once at startup and fails fast with a readable message (never prints values). */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid configuration: ${problems}`);
  }
  return parsed.data;
}
