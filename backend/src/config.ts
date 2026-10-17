import { z } from "zod";

/** Local-development origins used when CORS_ORIGIN is unset outside production (Vite dev + preview). */
export const DEV_CORS_ORIGINS = "http://localhost:5173,http://127.0.0.1:5173";

/** Splits a comma-separated CORS_ORIGIN value; `invalid` lists entries that are not bare http(s) origins. */
export function parseCorsOrigins(raw: string): { origins: string[]; wildcard: boolean; invalid: string[] } {
  const origins = raw.split(",").map((o) => o.trim()).filter((o) => o !== "");
  const wildcard = origins.includes("*");
  const invalid = origins.filter((o) => {
    if (o === "*") return false;
    try {
      const u = new URL(o);
      return !(u.protocol === "https:" || u.protocol === "http:") || u.origin !== o;
    } catch {
      return true;
    }
  });
  return { origins, wildcard, invalid };
}

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
    NODE_ENV: z.string().optional(),
    /** Comma-separated allowed origins. Required (and never "*") when NODE_ENV=production. */
    CORS_ORIGIN: z.string().optional(),
    /** Number of reverse-proxy hops in front of the app (drives req.ip for rate limits). 0 disables. */
    TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(1),
    STORE: z.enum(["memory", "firestore"]).default("memory"),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  })
  .superRefine((env, ctx) => {
    const cors = parseCorsOrigins(env.CORS_ORIGIN ?? "");
    if (cors.invalid.length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["CORS_ORIGIN"],
        message: "CORS_ORIGIN entries must be bare origins like https://app.example.com (no path or trailing slash)",
      });
    }
    if (env.NODE_ENV === "production") {
      if (cors.origins.length === 0) {
        ctx.addIssue({ code: "custom", path: ["CORS_ORIGIN"], message: "CORS_ORIGIN is required when NODE_ENV=production" });
      } else if (cors.wildcard) {
        ctx.addIssue({ code: "custom", path: ["CORS_ORIGIN"], message: 'CORS_ORIGIN must not be "*" when NODE_ENV=production' });
      }
    }
    if (env.LLM_MODE !== "live") return;
    if (!env.GEMINI_MODEL) {
      ctx.addIssue({ code: "custom", path: ["GEMINI_MODEL"], message: "GEMINI_MODEL is required when LLM_MODE=live" });
    }
    if (!env.GEMINI_API_KEY && !env.GOOGLE_GENAI_USE_VERTEXAI) {
      ctx.addIssue({ code: "custom", path: ["GEMINI_API_KEY"], message: "GEMINI_API_KEY is required when LLM_MODE=live" });
    }
  })
  .transform((env) => ({ ...env, CORS_ORIGIN: env.CORS_ORIGIN?.trim() || DEV_CORS_ORIGINS }));

export type Config = z.output<typeof EnvSchema>;

/** Parses env once at startup and fails fast with a readable message (never prints values). */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid configuration: ${problems}`);
  }
  return parsed.data;
}
