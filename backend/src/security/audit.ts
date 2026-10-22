import type { Logger } from "../logger.js";

/**
 * Security-relevant events, logged in one recognisable shape (`audit: "<event>"`) so a log-based alert or export can
 * select them. Only the uid (a random Firebase id) and non-sensitive details are recorded: never tokens, passwords,
 * email addresses or student content.
 */
export type AuditEvent =
  | "account.profile_updated"
  | "account.exported"
  | "account.deleted"
  | "account.sessions_revoked"
  | "auth.revoked_token_refused"
  | "auth.unverified_email_refused"
  | "llm.daily_limit_reached"
  | "sessions.limit_reached"
  | "retention.sessions_deleted"
  | "appcheck.failed"
  | "startup.admin_check_failed";

export function audit(logger: Logger, event: AuditEvent, uid: string | null, details: Record<string, unknown> = {}): void {
  logger.info({ audit: event, uid, ...details }, `audit: ${event}`);
}
