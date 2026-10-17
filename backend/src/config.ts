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

/** Returns the parsed service-account object, or null if it is not valid JSON with the required fields. */
export function parseServiceAccount(raw: string): { client_email: string; private_key: string; project_id?: string } | null {
  try {
    const v = JSON.parse(raw) as Record<string, unknown>;
    if (typeof v.client_email === "string" && typeof v.private_key === "string") {
      return { client_email: v.client_email, private_key: v.private_key, ...(typeof v.project_id === "string" ? { project_id: v.project_id } : {}) };
    }
  } catch {
    // fall through
  }
  return null;
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
    /** Path to an approved DSA catalogue JSON (see npm run dsa:import). Unset: the dev fixture locally, an empty catalogue in production. */
    DSA_CATALOGUE_PATH: z.string().optional(),
    /** Comma-separated allowed origins. Required (and never "*") when NODE_ENV=production. */
    CORS_ORIGIN: z.string().optional(),
    /** Number of reverse-proxy hops in front of the app (drives req.ip for rate limits). 0 disables. */
    TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(1),
    STORE: z.enum(["memory", "firestore"]).default("memory"),
    /** Production refuses STORE=memory unless this is "true" (sessions would vanish on restart). */
    ALLOW_EPHEMERAL_STORE: z
      .enum(["true", "false", "1", "0"])
      .default("false")
      .transform((v) => v === "true" || v === "1"),
    /** Firebase project whose ID tokens are accepted. Required in production. */
    FIREBASE_PROJECT_ID: z.string().optional(),
    /** Optional service-account JSON (secret) for Firestore on hosts without a cloud identity, e.g. Render. */
    FIREBASE_SERVICE_ACCOUNT_JSON: z.string().optional(),
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
      if (!env.FIREBASE_PROJECT_ID?.trim()) {
        ctx.addIssue({ code: "custom", path: ["FIREBASE_PROJECT_ID"], message: "FIREBASE_PROJECT_ID is required when NODE_ENV=production" });
      }
      if (env.STORE === "memory" && !env.ALLOW_EPHEMERAL_STORE) {
        ctx.addIssue({
          code: "custom",
          path: ["STORE"],
          message: "STORE=firestore is required when NODE_ENV=production (set ALLOW_EPHEMERAL_STORE=true only to accept losing all sessions on restart)",
        });
      }
      if (cors.origins.length === 0) {
        ctx.addIssue({ code: "custom", path: ["CORS_ORIGIN"], message: "CORS_ORIGIN is required when NODE_ENV=production" });
      } else if (cors.wildcard) {
        ctx.addIssue({ code: "custom", path: ["CORS_ORIGIN"], message: 'CORS_ORIGIN must not be "*" when NODE_ENV=production' });
      }
    }
    if (env.FIREBASE_SERVICE_ACCOUNT_JSON && !parseServiceAccount(env.FIREBASE_SERVICE_ACCOUNT_JSON)) {
      ctx.addIssue({
        code: "custom",
        path: ["FIREBASE_SERVICE_ACCOUNT_JSON"],
        message: "FIREBASE_SERVICE_ACCOUNT_JSON must be a service-account JSON object (client_email + private_key)",
      });
    }
    if (env.LLM_MODE !== "live") return;
    if (!env.GEMINI_MODEL) {
      ctx.addIssue({ code: "custom", path: ["GEMINI_MODEL"], message: "GEMINI_MODEL is required when LLM_MODE=live" });
    }
    if (!env.GEMINI_API_KEY && !env.GOOGLE_GENAI_USE_VERTEXAI) {
      ctx.addIssue({ code: "custom", path: ["GEMINI_API_KEY"], message: "GEMINI_API_KEY is required when LLM_MODE=live" });
    }
  })
  .transform((env) => ({
    ...env,
    CORS_ORIGIN: env.CORS_ORIGIN?.trim() || DEV_CORS_ORIGINS,
    // "demo-*" ids are the Firebase emulator convention; real tokens never verify against it.
    FIREBASE_PROJECT_ID: env.FIREBASE_PROJECT_ID?.trim() || "demo-unbluff",
  }));

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
