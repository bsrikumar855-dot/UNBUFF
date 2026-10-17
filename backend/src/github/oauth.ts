import { createHash, randomBytes } from "node:crypto";

/** Fixed GitHub endpoints. Clients can never supply a URL; only tests inject a different fetch. */
export const GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const TOKEN_URL = "https://github.com/login/oauth/access_token";
const API = "https://api.github.com";

/**
 * Scopes this app accepts. We ask for none (public, read-only data). `read:user` is tolerated because a student may have
 * granted it earlier; anything wider (repo, write:*, admin:*, workflow, delete_repo ...) is rejected and revoked.
 */
export const ACCEPTED_SCOPES: readonly string[] = ["read:user"];

export interface GithubOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export type OAuthFailure = "exchange_failed" | "github_unavailable";

export class GithubOAuthError extends Error {
  constructor(readonly reason: OAuthFailure) {
    super(reason);
    this.name = "GithubOAuthError";
  }
}

export interface PkcePair {
  verifier: string;
  challenge: string;
}

export const b64url = (b: Buffer) => b.toString("base64url");
export const newState = () => b64url(randomBytes(32));
export function newPkce(): PkcePair {
  const verifier = b64url(randomBytes(32));
  return { verifier, challenge: b64url(createHash("sha256").update(verifier).digest()) };
}

export class GithubOAuth {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(private readonly cfg: GithubOAuthConfig) {
    this.fetchImpl = cfg.fetchImpl ?? fetch;
    this.timeoutMs = cfg.timeoutMs ?? 10_000;
  }

  authorizeUrl(state: string, challenge: string): string {
    const u = new URL(GITHUB_AUTHORIZE_URL);
    u.searchParams.set("client_id", this.cfg.clientId);
    u.searchParams.set("redirect_uri", this.cfg.redirectUri);
    u.searchParams.set("state", state);
    u.searchParams.set("code_challenge", challenge);
    u.searchParams.set("code_challenge_method", "S256");
    u.searchParams.set("allow_signup", "false");
    // No `scope`: GitHub then grants read access to public information only.
    return u.toString();
  }

  /** Exchanges the one-time code for a token. The token and the secret exist only in this server's memory. */
  async exchange(code: string, verifier: string): Promise<{ token: string; scopes: string[] }> {
    let res: Response;
    try {
      res = await this.fetchImpl(TOKEN_URL, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json", "User-Agent": "unbluff-placement-os" },
        body: JSON.stringify({
          client_id: this.cfg.clientId,
          client_secret: this.cfg.clientSecret,
          code,
          redirect_uri: this.cfg.redirectUri,
          code_verifier: verifier,
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
        redirect: "error",
      });
    } catch {
      throw new GithubOAuthError("github_unavailable");
    }
    if (res.status >= 500) throw new GithubOAuthError("github_unavailable");
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new GithubOAuthError("exchange_failed");
    }
    const o = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    if (!res.ok || typeof o.access_token !== "string" || o.access_token === "" || typeof o.error === "string") throw new GithubOAuthError("exchange_failed");
    const scopes = typeof o.scope === "string" ? o.scope.split(/[,\s]+/).filter((s) => s !== "") : [];
    return { token: o.access_token, scopes };
  }

  /** Revokes the student's whole authorization of this app (all its tokens). Safe because one GitHub account maps to one student. */
  revokeGrant(token: string): Promise<boolean> {
    return this.revoke("grant", token);
  }

  /** Revokes just this token (used when the account turns out to belong to another student). */
  revokeToken(token: string): Promise<boolean> {
    return this.revoke("token", token);
  }

  /** True when GitHub confirmed (204) or says it is already gone (404). False when GitHub could not be reached. */
  private async revoke(kind: "grant" | "token", token: string): Promise<boolean> {
    try {
      const res = await this.fetchImpl(`${API}/applications/${encodeURIComponent(this.cfg.clientId)}/${kind}`, {
        method: "DELETE",
        headers: {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
          "User-Agent": "unbluff-placement-os",
          Authorization: `Basic ${Buffer.from(`${this.cfg.clientId}:${this.cfg.clientSecret}`).toString("base64")}`,
        },
        body: JSON.stringify({ access_token: token }),
        signal: AbortSignal.timeout(this.timeoutMs),
        redirect: "error",
      });
      return res.status === 204 || res.status === 404;
    } catch {
      return false;
    }
  }
}
