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

/** Returns why a Judge0 base URL is unacceptable, or null. Only ever read from the environment, never from a request. */
export function judge0UrlProblem(raw: string | undefined, production: boolean): string | null {
  if (!raw?.trim()) return "JUDGE0_URL is required when EXECUTION_PROVIDER=judge0";
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return "JUDGE0_URL must be a valid URL";
  }
  if (u.username || u.password || u.search || u.hash) return "JUDGE0_URL must not contain credentials, a query or a fragment";
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
  if (u.protocol !== "https:" && !(u.protocol === "http:" && local && !production)) {
    return production ? "JUDGE0_URL must use https in production" : "JUDGE0_URL must use https (http is allowed only for localhost outside production)";
  }
  return null;
}

/** Returns why a GitHub OAuth callback URL is unacceptable, or null. Read only from the environment. */
export function githubRedirectProblem(raw: string | undefined, production: boolean): string | null {
  let u: URL;
  try {
    u = new URL((raw ?? "").trim());
  } catch {
    return "GITHUB_REDIRECT_URI must be a valid URL";
  }
  if (u.username || u.password || u.search || u.hash) return "GITHUB_REDIRECT_URI must not contain credentials, a query or a fragment";
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
  if (u.protocol !== "https:" && !(u.protocol === "http:" && local && !production)) return "GITHUB_REDIRECT_URI must use https (http is allowed only for localhost outside production)";
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
    /** none: running code is reported as unavailable. judge0: use the Judge0 service at JUDGE0_URL. */
    EXECUTION_PROVIDER: z.enum(["none", "judge0"]).default("none"),
    JUDGE0_URL: z.string().optional(),
    /**
     * GitHub contribution insights. All four of CLIENT_ID, CLIENT_SECRET, REDIRECT_URI and TOKEN_ENCRYPTION_KEY, or none:
     * with none the feature stays off and reports itself as not configured. CLIENT_SECRET and the key are secrets.
     */
    GITHUB_CLIENT_ID: z.string().trim().optional(),
    GITHUB_CLIENT_SECRET: z.string().optional(),
    GITHUB_REDIRECT_URI: z.string().trim().optional(),
    /** 32 random bytes, base64. Kept apart from the database: it encrypts the stored GitHub tokens. */
    GITHUB_TOKEN_ENCRYPTION_KEY: z.string().optional(),
    /** Comma-separated earlier keys, accepted for decryption only (key rotation). */
    GITHUB_TOKEN_ENCRYPTION_KEY_RETIRED: z.string().optional(),
    /** Where the browser returns after GitHub redirects back. Defaults to the first CORS origin. */
    GITHUB_FRONTEND_URL: z.string().trim().optional(),
    GITHUB_FRESH_MINUTES: z.coerce.number().int().min(15).max(1440).default(360),
    GITHUB_MIN_SYNC_INTERVAL_MINUTES: z.coerce.number().int().min(1).max(60).default(5),
    GITHUB_TIMEOUT_MS: z.coerce.number().int().min(2_000).max(30_000).default(10_000),
    /** AI mentor model settings (the same Gemini provider and key as the interview features). */
    MENTOR_MODEL: z.string().trim().min(1).optional(),
    MENTOR_TEMPERATURE: z.coerce.number().min(0).max(1).default(0.5),
    MENTOR_TIMEOUT_MS: z.coerce.number().int().min(5_000).max(60_000).default(30_000),
    /** Retention: conversations are deleted this many days after their last message. */
    MENTOR_CONVERSATION_RETENTION_DAYS: z.coerce.number().int().min(7).max(365).default(90),
    MENTOR_SUMMARY_RETENTION_DAYS: z.coerce.number().int().min(30).max(730).default(365),
    MENTOR_LEARNING_RETENTION_DAYS: z.coerce.number().int().min(30).max(730).default(180),
    /**
     * Operator's declaration that EXECUTION_PROVIDER points at a real, verified deployment. Until it is "true",
     * judged submissions are excluded from analytics: the code cannot tell a real service from a stand-in.
     */
    EXECUTION_PROVIDER_VERIFIED: z
      .enum(["true", "false", "1", "0"])
      .default("false")
      .transform((v) => v === "true" || v === "1"),
    /** Secret. Sent only from the server, in a header. */
    JUDGE0_AUTH_TOKEN: z.string().optional(),
    JUDGE0_AUTH_HEADER: z.string().regex(/^[A-Za-z0-9-]{1,60}$/, "must be a plain header name").default("X-Auth-Token"),
    CODE_CPU_TIME_SECONDS: z.coerce.number().min(0.5).max(15).default(2),
    CODE_MEMORY_MB: z.coerce.number().min(16).max(512).default(128),
    CODE_JUDGE_DEADLINE_MS: z.coerce.number().int().min(5_000).max(300_000).default(60_000),
    /** Server-only hidden test suites (see npm run code:import-suite). Unset: the dev fixture locally, none in production. */
    CODE_SUITES_PATH: z.string().optional(),
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
    const gh = { id: env.GITHUB_CLIENT_ID, secret: env.GITHUB_CLIENT_SECRET?.trim(), uri: env.GITHUB_REDIRECT_URI, key: env.GITHUB_TOKEN_ENCRYPTION_KEY?.trim() };
    if (gh.id || gh.secret || gh.uri || gh.key) {
      const missing = [!gh.id && "GITHUB_CLIENT_ID", !gh.secret && "GITHUB_CLIENT_SECRET", !gh.uri && "GITHUB_REDIRECT_URI", !gh.key && "GITHUB_TOKEN_ENCRYPTION_KEY"].filter(Boolean);
      if (missing.length > 0) ctx.addIssue({ code: "custom", path: ["GITHUB_CLIENT_ID"], message: `GitHub is partly configured; also set ${missing.join(", ")} (or unset them all)` });
      if (gh.uri) {
        const problem = githubRedirectProblem(gh.uri, env.NODE_ENV === "production");
        if (problem) ctx.addIssue({ code: "custom", path: ["GITHUB_REDIRECT_URI"], message: problem });
      }
      if (gh.key && Buffer.from(gh.key, "base64").length !== 32) {
        ctx.addIssue({ code: "custom", path: ["GITHUB_TOKEN_ENCRYPTION_KEY"], message: "GITHUB_TOKEN_ENCRYPTION_KEY must be 32 random bytes encoded as base64" });
      }
      for (const r of (env.GITHUB_TOKEN_ENCRYPTION_KEY_RETIRED ?? "").split(",").map((k) => k.trim()).filter((k) => k !== "")) {
        if (Buffer.from(r, "base64").length !== 32) ctx.addIssue({ code: "custom", path: ["GITHUB_TOKEN_ENCRYPTION_KEY_RETIRED"], message: "every retired key must be 32 random bytes encoded as base64" });
      }
      if (env.GITHUB_FRONTEND_URL) {
        const o = parseCorsOrigins(env.GITHUB_FRONTEND_URL);
        if (o.invalid.length > 0 || o.origins.length !== 1 || o.wildcard) ctx.addIssue({ code: "custom", path: ["GITHUB_FRONTEND_URL"], message: "GITHUB_FRONTEND_URL must be one bare origin like https://app.example.com" });
      }
    }
    if (env.EXECUTION_PROVIDER === "judge0") {
      const problem = judge0UrlProblem(env.JUDGE0_URL, env.NODE_ENV === "production");
      if (problem) ctx.addIssue({ code: "custom", path: ["JUDGE0_URL"], message: problem });
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
