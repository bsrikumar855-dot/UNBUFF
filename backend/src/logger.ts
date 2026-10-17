import { pino, type Logger } from "pino";

/** Maps pino levels to Cloud Logging `severity` so Cloud Run shows the right level. */
const SEVERITY: Record<string, string> = {
  trace: "DEBUG",
  debug: "DEBUG",
  info: "INFO",
  warn: "WARNING",
  error: "ERROR",
  fatal: "CRITICAL",
};

export function createLogger(level = process.env.LOG_LEVEL ?? "info"): Logger {
  return pino({
    level,
    messageKey: "message",
    base: undefined,
    formatters: {
      level: (label) => ({ severity: SEVERITY[label] ?? "DEFAULT", level: label }),
    },
    // Defense in depth: never let a key reach the logs even if someone logs a config object.
    redact: {
      paths: [
        "apiKey", "*.apiKey", "GEMINI_API_KEY", "*.GEMINI_API_KEY", "req.headers.authorization",
        "access_token", "*.access_token", "token", "*.token", "code", "*.code", "state", "*.state", "code_verifier", "*.code_verifier",
        "client_secret", "*.client_secret", "GITHUB_CLIENT_SECRET", "*.GITHUB_CLIENT_SECRET", "GITHUB_TOKEN_ENCRYPTION_KEY", "*.GITHUB_TOKEN_ENCRYPTION_KEY",
      ],
      censor: "[redacted]",
    },
  });
}

export type { Logger };
