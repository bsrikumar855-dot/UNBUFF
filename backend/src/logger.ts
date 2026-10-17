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
    redact: { paths: ["apiKey", "*.apiKey", "GEMINI_API_KEY", "*.GEMINI_API_KEY", "req.headers.authorization"], censor: "[redacted]" },
  });
}

export type { Logger };
