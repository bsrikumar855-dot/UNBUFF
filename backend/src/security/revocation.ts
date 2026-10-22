import type { AccountAdmin } from "../auth/verifier.js";
import type { Logger } from "../logger.js";

const TTL_MS = 60_000;
const MAX_ENTRIES = 10_000;
const ERROR_LOG_EVERY_MS = 5 * 60_000;

interface Entry {
  /** Tokens from a sign-in before this time (ms) are refused. */
  validAfterMs: number;
  disabled: boolean;
  deleted: boolean;
  at: number;
}

/**
 * Refuses ID tokens that Firebase still considers signed but that were revoked: the account was deleted or disabled,
 * "sign out of all devices" was used, or the password changed. A plain signature check would accept such a token until it
 * expires (up to an hour). Each student's state is cached for a minute, so revocation takes effect within a minute
 * without a Firebase lookup on every request.
 *
 * If the lookup itself fails (Firebase unreachable, missing credentials) the token is allowed and an error is logged: the
 * signature and expiry were already verified, and one unreachable dependency must not sign every student out.
 */
export class RevocationGuard {
  private readonly cache = new Map<string, Entry>();
  private lastErrorLogAt = -Infinity;
  private readonly now: () => number;

  constructor(private readonly deps: { admin: AccountAdmin; logger: Logger; now?: () => number }) {
    this.now = deps.now ?? (() => Date.now());
  }

  /** True when a token for `uid` whose sign-in happened at `authTimeSec` is still acceptable. */
  async isValid(uid: string, authTimeSec: number | undefined): Promise<boolean> {
    const entry = await this.lookup(uid);
    if (!entry) return true; // lookup failed: fail open (logged)
    if (entry.deleted || entry.disabled) return false;
    if (authTimeSec === undefined) return true;
    return authTimeSec * 1000 >= entry.validAfterMs;
  }

  /** Revokes every session of this student (all devices) and forgets the cached state. */
  async revokeAll(uid: string): Promise<void> {
    await this.deps.admin.revokeRefreshTokens(uid);
    this.cache.delete(uid);
  }

  forget(uid: string): void {
    this.cache.delete(uid);
  }

  private async lookup(uid: string): Promise<Entry | null> {
    const now = this.now();
    const hit = this.cache.get(uid);
    if (hit && now - hit.at < TTL_MS) return hit;
    let entry: Entry;
    try {
      const u = await this.deps.admin.getUser(uid);
      const validAfter = u.tokensValidAfterTime ? Date.parse(u.tokensValidAfterTime) : 0;
      entry = { validAfterMs: Number.isFinite(validAfter) ? validAfter : 0, disabled: u.disabled, deleted: false, at: now };
    } catch (err) {
      const code = typeof err === "object" && err !== null && "code" in err ? String((err as { code: unknown }).code) : "";
      if (code === "auth/user-not-found") {
        entry = { validAfterMs: 0, disabled: false, deleted: true, at: now };
      } else {
        if (now - this.lastErrorLogAt >= ERROR_LOG_EVERY_MS) {
          this.lastErrorLogAt = now;
          this.deps.logger.error({ error_code: code || "unknown" }, "revocation check unavailable: allowing verified tokens without it (logged at most every 5 minutes)");
        }
        return null;
      }
    }
    if (this.cache.size >= MAX_ENTRIES) this.cache.delete(this.cache.keys().next().value as string);
    this.cache.set(uid, entry);
    return entry;
  }
}
