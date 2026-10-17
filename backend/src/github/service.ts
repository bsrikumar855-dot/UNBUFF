import { ApiError } from "../errors.js";
import type { Logger } from "../logger.js";
import type {
  GithubActivityResponse,
  GithubCallbackReason,
  GithubConnectResponse,
  GithubConnection,
  GithubContributionsResponse,
  GithubDisconnectResponse,
  GithubFreshness,
  GithubRepositoriesResponse,
  GithubSection,
  GithubSourceInfo,
  GithubSyncFailure,
  GithubSyncResponse,
} from "../types.js";
import { GithubApiError, type GithubGraphQL } from "./client.js";
import type { StoredActivity, StoredContributions, StoredRepositories } from "./normalize.js";
import { summarizeCalendar } from "./normalize.js";
import { ACCEPTED_SCOPES, GithubOAuthError, newPkce, newState, type GithubOAuth } from "./oauth.js";
import { VIEWER_QUERY, ViewerData } from "./queries.js";
import { runSync } from "./sync.js";
import type { ConnectionRecord, GithubStore, InsightsRecord } from "./store.js";
import { sha256Hex, type TokenVault } from "./vault.js";

export interface GithubDeps {
  store: GithubStore;
  gql: GithubGraphQL;
  /** Null when the operator has not configured the GitHub OAuth app: the feature then stays in a safe, disconnected state. */
  oauth: GithubOAuth | null;
  vault: TokenVault | null;
  logger: Logger;
  /** Where the browser is sent after GitHub redirects back (the app's origin). */
  frontendUrl: string;
  now?: () => Date;
  freshMinutes?: number;
  minSyncIntervalMinutes?: number;
}

const STATE_TTL_MS = 10 * 60_000;
const MAX_PENDING_STATES = 4;
const SYNC_LOCK_MS = 90_000;
const FAILURE_RETRY_MS = 60_000;
const NOTICE =
  "Contribution counts are partial evidence of development work, not a measure of skill. Private work, work on other platforms and time spent learning do not appear here.";

export class GithubService {
  private readonly now: () => Date;
  private readonly freshMs: number;
  private readonly minSyncMs: number;
  private readonly running = new Map<string, Promise<GithubSyncResponse>>();

  constructor(private readonly deps: GithubDeps) {
    this.now = deps.now ?? (() => new Date());
    this.freshMs = (deps.freshMinutes ?? 360) * 60_000;
    this.minSyncMs = (deps.minSyncIntervalMinutes ?? 5) * 60_000;
  }

  get configured(): boolean {
    return this.deps.oauth !== null && this.deps.vault !== null;
  }

  private requireConfigured(): { oauth: NonNullable<GithubDeps["oauth"]>; vault: NonNullable<GithubDeps["vault"]> } {
    const { oauth, vault } = this.deps;
    if (!oauth || !vault) throw new ApiError("GITHUB_NOT_CONFIGURED", "GitHub connection is not set up on this server.");
    return { oauth, vault };
  }

  // ---------------- connection status ----------------

  async connection(uid: string): Promise<GithubConnection> {
    return this.toConnection(await this.deps.store.getConnection(uid));
  }

  private toConnection(c: ConnectionRecord | null): GithubConnection {
    const now = this.now();
    const freshness = this.freshness(c?.last_synced_at ?? null, now);
    const status = !this.configured && !c ? "not_configured" : !c ? "disconnected" : c.status;
    const allowed = c?.next_sync_allowed_at && Date.parse(c.next_sync_allowed_at) > now.getTime() ? c.next_sync_allowed_at : null;
    return {
      status,
      login: c?.login ?? null,
      profile_url: c?.profile_url ?? null,
      access: "public_only",
      permissions: c?.permissions ?? [],
      connected_at: c?.connected_at ?? null,
      last_synced_at: c?.last_synced_at ?? null,
      freshness,
      fresh_for_minutes: Math.round(this.freshMs / 60_000),
      last_sync_error: c?.last_error ?? null,
      last_sync_error_at: c?.last_error_at ?? null,
      sync_in_progress: this.syncing(c, now),
      next_sync_allowed_at: allowed,
    };
  }

  private syncing(c: ConnectionRecord | null, now: Date): boolean {
    return (c !== null && c.sync_lock_until !== null && Date.parse(c.sync_lock_until) > now.getTime()) || (c !== null && this.running.has(c.owner_uid));
  }

  private freshness(syncedAt: string | null, now: Date): GithubFreshness {
    if (!syncedAt) return "never_synced";
    return now.getTime() - Date.parse(syncedAt) <= this.freshMs ? "fresh" : "stale";
  }

  // ---------------- connect (step 1: authenticated) ----------------

  /** Creates a one-time state bound to this student on the server and returns GitHub's authorization URL. */
  async startConnect(uid: string): Promise<GithubConnectResponse> {
    const { oauth } = this.requireConfigured();
    const existing = await this.deps.store.getConnection(uid);
    if (existing?.status === "connected") throw new ApiError("BAD_REQUEST", "A GitHub account is already connected. Disconnect it first to link a different one.");
    const now = this.now();
    const state = newState();
    const pkce = newPkce();
    const expires = new Date(now.getTime() + STATE_TTL_MS).toISOString();
    await this.deps.store.pruneStates(uid, now.toISOString(), MAX_PENDING_STATES - 1);
    await this.deps.store.saveState(sha256Hex(state), { owner_uid: uid, code_verifier: pkce.verifier, created_at: now.toISOString(), expires_at: expires });
    return { authorize_url: oauth.authorizeUrl(state, pkce.challenge), expires_at: expires };
  }

  // ---------------- connect (step 2: GitHub redirects the browser here) ----------------

  /**
   * Handles GitHub's redirect. There is no bearer token on this request, so the student is identified ONLY by the
   * server-side record the one-time `state` points to. Returns the URL to send the browser to; never throws.
   */
  async completeCallback(params: { code?: string; state?: string; error?: string }): Promise<string> {
    try {
      await this.callbackInner(params);
      return this.redirect(null);
    } catch (err) {
      const reason: GithubCallbackReason = err instanceof CallbackFailure ? err.reason : "exchange_failed";
      if (!(err instanceof CallbackFailure)) this.deps.logger.error({ error: err instanceof Error ? err.name : "unknown" }, "github callback failed unexpectedly");
      else this.deps.logger.info({ reason }, "github connection not completed");
      return this.redirect(reason);
    }
  }

  private redirect(reason: GithubCallbackReason | null): string {
    const u = new URL("/settings", this.deps.frontendUrl);
    u.searchParams.set("github", reason ? "error" : "connected");
    if (reason) u.searchParams.set("reason", reason);
    return u.toString();
  }

  private async callbackInner(p: { code?: string; state?: string; error?: string }): Promise<void> {
    if (!this.deps.oauth || !this.deps.vault) throw new CallbackFailure("not_configured");
    const { oauth, vault } = { oauth: this.deps.oauth, vault: this.deps.vault };
    const { store } = this.deps;
    if (!p.state) throw new CallbackFailure("invalid_state");
    const rec = await store.consumeState(sha256Hex(p.state)); // single use: gone whatever happens next
    if (!rec) throw new CallbackFailure("invalid_state");
    const now = this.now();
    if (Date.parse(rec.expires_at) <= now.getTime()) throw new CallbackFailure("expired_state");
    const uid = rec.owner_uid;

    if (p.error) throw new CallbackFailure(p.error === "access_denied" ? "access_denied" : "exchange_failed");
    if (!p.code) throw new CallbackFailure("exchange_failed");

    let granted: { token: string; scopes: string[] };
    try {
      granted = await oauth.exchange(p.code, rec.code_verifier);
    } catch (err) {
      throw new CallbackFailure(err instanceof GithubOAuthError ? err.reason : "exchange_failed");
    }

    // Least privilege is enforced, not assumed: a token with any scope beyond read-only profile access is refused.
    if (granted.scopes.some((s) => !ACCEPTED_SCOPES.includes(s))) {
      await oauth.revokeToken(granted.token);
      throw new CallbackFailure("excessive_permissions");
    }

    let viewer: { databaseId: number; login: string; url: string };
    try {
      viewer = (await this.deps.gql.query(granted.token, VIEWER_QUERY, {}, ViewerData)).data.viewer;
    } catch (err) {
      await oauth.revokeToken(granted.token);
      throw new CallbackFailure(err instanceof GithubApiError && err.kind !== "invalid_response" ? "github_unavailable" : "exchange_failed");
    }
    const githubId = String(viewer.databaseId);

    // One GitHub account belongs to at most one student.
    if (!(await store.claimIdentity(githubId, uid, now.toISOString()))) {
      await oauth.revokeToken(granted.token); // token only: the grant also backs the other student's connection
      throw new CallbackFailure("already_linked");
    }

    // Switching accounts: remove everything about the previous one first.
    const previous = await store.getConnection(uid);
    if (previous && previous.github_user_id !== githubId) await this.removeLocal(uid, previous);

    await store.saveCredential({ owner_uid: uid, github_user_id: githubId, sealed: vault.seal(granted.token, uid, githubId), created_at: now.toISOString() });
    await store.saveConnection({
      owner_uid: uid,
      github_user_id: githubId,
      login: viewer.login,
      profile_url: viewer.url,
      permissions: granted.scopes,
      status: "connected",
      connected_at: now.toISOString(),
      last_synced_at: previous?.github_user_id === githubId ? previous.last_synced_at : null,
      last_attempt_at: null,
      next_sync_allowed_at: null,
      last_error: null,
      last_error_at: null,
      sync_lock_until: null,
    });
    this.deps.logger.info({ github_user_id_set: true }, "github account connected");
  }

  // ---------------- disconnect ----------------

  async disconnect(uid: string): Promise<GithubDisconnectResponse> {
    const { store, oauth, vault } = this.deps;
    const conn = await store.getConnection(uid);
    let token: string | null = null;
    if (conn && vault) {
      try {
        const cred = await store.getCredential(uid);
        if (cred) token = vault.open(cred.sealed, uid, conn.github_user_id);
      } catch {
        token = null; // unreadable credential: it is deleted below anyway
      }
    }
    // Local data goes first, so no synchronisation can run again whatever happens at GitHub.
    await this.removeLocal(uid, conn);
    await store.pruneStates(uid, this.now().toISOString(), 0);
    let revoked = false;
    if (token && oauth) revoked = await oauth.revokeGrant(token);
    this.deps.logger.info({ had_connection: conn !== null, revoked }, "github disconnected");
    return { connection: this.toConnection(null), revoked_at_github: revoked, data_removed: true };
  }

  private async removeLocal(uid: string, conn: ConnectionRecord | null): Promise<void> {
    const { store } = this.deps;
    await store.deleteConnection(uid);
    await store.deleteCredential(uid);
    await store.deleteInsights(uid);
    if (conn) await store.releaseIdentity(conn.github_user_id, uid);
  }

  // ---------------- synchronisation ----------------

  /** Concurrent calls for one student share a single run; the stored lock extends that across server instances. */
  sync(uid: string): Promise<GithubSyncResponse> {
    const existing = this.running.get(uid);
    if (existing) return existing;
    const run = this.syncOnce(uid).finally(() => this.running.delete(uid));
    this.running.set(uid, run);
    return run;
  }

  private async syncOnce(uid: string): Promise<GithubSyncResponse> {
    const { vault } = this.requireConfigured();
    const { store, gql, logger } = this.deps;
    const conn = await this.requireConnection(uid);
    if (conn.status === "reauthorization_required") throw reauth();
    const now = this.now();
    const nowIso = now.toISOString();

    if (conn.next_sync_allowed_at && Date.parse(conn.next_sync_allowed_at) > now.getTime()) {
      return { outcome: "cached", connection: this.toConnection(conn), unavailable_sections: [], rate_limit_remaining: null };
    }
    if (!(await store.acquireSyncLock(uid, nowIso, new Date(now.getTime() + SYNC_LOCK_MS).toISOString()))) {
      return { outcome: "in_progress", connection: this.toConnection({ ...conn, sync_lock_until: new Date(now.getTime() + SYNC_LOCK_MS).toISOString() }), unavailable_sections: [], rate_limit_remaining: null };
    }

    try {
      // The token must still decrypt for THIS student and THIS GitHub account.
      let token: string;
      try {
        const cred = await store.getCredential(uid);
        if (!cred || cred.github_user_id !== conn.github_user_id) throw new Error("no credential");
        token = vault.open(cred.sealed, uid, conn.github_user_id);
      } catch {
        await this.markReauth(uid, conn, nowIso);
        throw reauth();
      }

      let result;
      try {
        result = await runSync(gql, token, conn.github_user_id, now);
      } catch (err) {
        if (!(err instanceof GithubApiError)) throw err;
        if (err.kind === "unauthorized") {
          await this.markReauth(uid, conn, nowIso);
          throw reauth();
        }
        const failure: GithubSyncFailure = err.kind === "rate_limited" ? "rate_limited" : err.kind === "timeout" ? "timeout" : err.kind === "invalid_response" ? "invalid_response" : err.kind === "forbidden" ? "unauthorized" : "unavailable";
        await this.recordFailure(uid, failure, nowIso, err.resetAt);
        logger.warn({ failure }, "github sync failed");
        throw this.apiError(failure, err.resetAt);
      }

      // A disconnect while we were fetching wins: do not resurrect anything.
      const current = await store.getConnection(uid);
      if (!current || current.github_user_id !== conn.github_user_id) {
        return { outcome: "cached", connection: this.toConnection(current), unavailable_sections: [], rate_limit_remaining: null };
      }

      const fetched = (["contributions", "repositories", "activity"] as GithubSection[]).filter((s) => result[s] !== undefined);
      if (fetched.length === 0) {
        const failure = result.failure ?? "unavailable";
        await this.recordFailure(uid, failure, nowIso, result.resetAt);
        throw this.apiError(failure, result.resetAt);
      }

      const prev = await store.getInsights(uid);
      const next: InsightsRecord = {
        owner_uid: uid,
        login: conn.login,
        github_user_id: conn.github_user_id,
        updated_at: nowIso,
        unavailable: result.unavailable,
      };
      for (const s of ["contributions", "repositories", "activity"] as const) {
        const fresh = result[s];
        const old = prev && prev.github_user_id === conn.github_user_id ? prev[s] : undefined;
        if (fresh !== undefined) next[s] = { synced_at: nowIso, data: fresh };
        else if (old) next[s] = old;
      }
      await store.saveInsights(next);
      if (!(await store.getConnection(uid))) await store.deleteInsights(uid); // disconnected during the write

      const partial = result.unavailable.length > 0 || result.partial.length > 0;
      await store.saveConnection({
        ...current,
        last_synced_at: nowIso,
        last_attempt_at: nowIso,
        next_sync_allowed_at: new Date(now.getTime() + (result.failure === "rate_limited" && result.resetAt ? Math.max(this.minSyncMs, Date.parse(result.resetAt) - now.getTime()) : this.minSyncMs)).toISOString(),
        last_error: result.failure,
        last_error_at: result.failure ? nowIso : null,
        status: "connected",
      });
      logger.info({ sections: fetched.length, unavailable: result.unavailable.length, remaining: result.remaining }, "github sync complete");
      return {
        outcome: partial ? "partial" : "synced",
        connection: this.toConnection(await store.getConnection(uid)),
        unavailable_sections: result.unavailable,
        rate_limit_remaining: result.remaining,
      };
    } finally {
      await store.releaseSyncLock(uid).catch(() => undefined);
    }
  }

  private async markReauth(uid: string, conn: ConnectionRecord, nowIso: string): Promise<void> {
    const { store } = this.deps;
    // Only if this very connection still exists: a disconnect (or a reconnect) that happened meanwhile must win.
    const cur = await store.getConnection(uid);
    if (!cur || cur.github_user_id !== conn.github_user_id) return;
    await store.deleteCredential(uid); // a dead token has no use, so it is not kept
    await store.saveConnection({ ...cur, status: "reauthorization_required", last_attempt_at: nowIso, last_error: "unauthorized", last_error_at: nowIso, sync_lock_until: null });
  }

  private async recordFailure(uid: string, failure: GithubSyncFailure, nowIso: string, resetAt: string | null): Promise<void> {
    const { store } = this.deps;
    const c = await store.getConnection(uid);
    if (!c || c.status !== "connected") return;
    const wait = resetAt ? Math.min(60 * 60_000, Math.max(FAILURE_RETRY_MS, Date.parse(resetAt) - Date.parse(nowIso))) : FAILURE_RETRY_MS;
    await store.saveConnection({ ...c, last_attempt_at: nowIso, last_error: failure, last_error_at: nowIso, next_sync_allowed_at: new Date(Date.parse(nowIso) + wait).toISOString() });
  }

  private apiError(failure: GithubSyncFailure, resetAt: string | null): ApiError {
    if (failure === "rate_limited") return new ApiError("GITHUB_RATE_LIMITED", `GitHub's rate limit is used up${resetAt ? `; it resets at ${resetAt}` : ""}. Your saved data is unchanged.`);
    if (failure === "unauthorized") return new ApiError("GITHUB_UNAVAILABLE", "GitHub did not allow access to some of this data. Your saved data is unchanged.");
    return new ApiError("GITHUB_UNAVAILABLE", "GitHub could not be reached or answered unexpectedly. Your saved data is unchanged; try again later.");
  }

  // ---------------- reads (always from the cache) ----------------

  private async requireConnection(uid: string): Promise<ConnectionRecord> {
    this.requireConfigured();
    const conn = await this.deps.store.getConnection(uid);
    if (!conn || conn.owner_uid !== uid) throw new ApiError("GITHUB_NOT_CONNECTED", "Connect your GitHub account first.");
    return conn;
  }

  private async loadInsights(uid: string): Promise<{ conn: ConnectionRecord; insights: InsightsRecord | null }> {
    const conn = await this.requireConnection(uid);
    const insights = await this.deps.store.getInsights(uid);
    // Never serve a cache that belongs to another account or student.
    const own = insights && insights.owner_uid === uid && insights.github_user_id === conn.github_user_id ? insights : null;
    return { conn, insights: own };
  }

  private source(conn: ConnectionRecord, syncedAt: string | null, from: string | null, to: string | null): GithubSourceInfo {
    return { login: conn.login, synced_at: syncedAt, from, to, freshness: this.freshness(syncedAt, this.now()), cached: true };
  }

  async contributions(uid: string): Promise<GithubContributionsResponse> {
    const { conn, insights } = await this.loadInsights(uid);
    const snap = insights?.contributions;
    const data = snap?.data as StoredContributions | undefined;
    if (!snap || !data) {
      return { source: this.source(conn, null, null, null), available: false, total: null, weeks: [], weekly: [], monthly: [], breakdown: null, restricted_count: null, active_days: null, longest_streak_days: null, notice: NOTICE };
    }
    const s = summarizeCalendar(data.weeks);
    return {
      source: this.source(conn, snap.synced_at, data.from, data.to),
      available: true,
      total: data.total,
      weeks: data.weeks,
      weekly: s.weekly,
      monthly: s.monthly,
      breakdown: data.breakdown,
      restricted_count: data.restricted_count,
      active_days: s.active_days,
      longest_streak_days: s.longest_streak_days,
      notice: NOTICE,
    };
  }

  async repositories(uid: string): Promise<GithubRepositoriesResponse> {
    const { conn, insights } = await this.loadInsights(uid);
    const snap = insights?.repositories;
    const data = snap?.data as StoredRepositories | undefined;
    if (!snap || !data) return { source: this.source(conn, null, null, null), available: false, repositories: [], total_public_repositories: null, truncated: false, checklist: [] };
    return { source: this.source(conn, snap.synced_at, null, null), available: true, repositories: data.repositories, total_public_repositories: data.total_public, truncated: data.truncated, checklist: data.checklist };
  }

  async activity(uid: string): Promise<GithubActivityResponse> {
    const { conn, insights } = await this.loadInsights(uid);
    const snap = insights?.activity;
    const data = snap?.data as StoredActivity | undefined;
    if (!snap || !data) return { source: this.source(conn, null, null, null), available: false, pull_requests_total: null, issues_total: null, items: [] };
    return { source: this.source(conn, snap.synced_at, null, null), available: true, pull_requests_total: data.pull_requests_total, issues_total: data.issues_total, items: data.items };
  }

  /** The cached sections the mentor may summarise. Null when GitHub is not connected or nothing was ever synchronised. */
  async cachedForMentor(uid: string): Promise<{ login: string; syncedAt: string; stale: boolean; contributions?: StoredContributions; repositories?: StoredRepositories; activity?: StoredActivity } | null> {
    if (!this.configured) return null;
    try {
      const { conn, insights } = await this.loadInsights(uid);
      if (!insights || !conn.last_synced_at) return null;
      return {
        login: conn.login,
        syncedAt: conn.last_synced_at,
        stale: this.freshness(conn.last_synced_at, this.now()) !== "fresh",
        contributions: insights.contributions?.data as StoredContributions | undefined,
        repositories: insights.repositories?.data as StoredRepositories | undefined,
        activity: insights.activity?.data as StoredActivity | undefined,
      };
    } catch {
      return null; // the mentor works without GitHub
    }
  }
}

class CallbackFailure extends Error {
  constructor(readonly reason: GithubCallbackReason) {
    super(reason);
  }
}

const reauth = () => new ApiError("GITHUB_REAUTH_REQUIRED", "GitHub no longer accepts the saved connection. Connect your account again.");
