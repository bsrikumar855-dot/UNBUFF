import type { ZodType } from "zod";

/** The only GraphQL endpoint this server ever calls. */
export const GITHUB_GRAPHQL_URL = "https://api.github.com/graphql";

export type GithubErrorKind = "unauthorized" | "forbidden" | "rate_limited" | "unavailable" | "timeout" | "invalid_response";

export class GithubApiError extends Error {
  constructor(
    readonly kind: GithubErrorKind,
    /** ISO time when the rate limit resets (rate_limited only). */
    readonly resetAt: string | null = null,
  ) {
    super(kind);
    this.name = "GithubApiError";
  }
}

export interface RateInfo {
  cost: number;
  remaining: number;
  resetAt: string;
}

/** A GraphQL error that did not stop the query. Only the type and path are kept; GitHub's message text is dropped. */
export interface PartialError {
  type: string;
  path: string;
}

export interface GraphQLResult<T> {
  data: T;
  partial: PartialError[];
  rate: RateInfo | null;
}

export interface ClientOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Extra attempts after a transient failure (network error, timeout, 502/503/504). */
  retries?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
}

const TRANSIENT = new Set([502, 503, 504]);

export class GithubGraphQL {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => Date;

  constructor(opts: ClientOptions = {}) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 10_000;
    this.retries = opts.retries ?? 2;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.now = opts.now ?? (() => new Date());
  }

  /**
   * Runs one of this server's own query documents. `query` must be a constant from queries.ts, never client input, and
   * `variables` are passed as GraphQL variables (never interpolated). The response is validated against `schema`.
   */
  async query<T>(token: string, query: string, variables: Record<string, unknown>, schema: ZodType<T>): Promise<GraphQLResult<T>> {
    let lastTransient: GithubApiError | null = null;
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      if (attempt > 0) await this.sleep(300 * 2 ** (attempt - 1));
      try {
        return await this.once(token, query, variables, schema);
      } catch (err) {
        if (err instanceof GithubApiError && (err.kind === "unavailable" || err.kind === "timeout")) {
          lastTransient = err;
          continue;
        }
        throw err;
      }
    }
    throw lastTransient ?? new GithubApiError("unavailable");
  }

  private async once<T>(token: string, query: string, variables: Record<string, unknown>, schema: ZodType<T>): Promise<GraphQLResult<T>> {
    let res: Response;
    try {
      res = await this.fetchImpl(GITHUB_GRAPHQL_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
          "User-Agent": "unbluff-placement-os",
        },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(this.timeoutMs),
        redirect: "error",
      });
    } catch (err) {
      const name = (err as { name?: string } | null)?.name;
      throw new GithubApiError(name === "TimeoutError" || name === "AbortError" ? "timeout" : "unavailable");
    }

    if (res.status === 401) throw new GithubApiError("unauthorized");
    if (res.status === 403 || res.status === 429) {
      if (this.isRateLimited(res)) throw new GithubApiError("rate_limited", this.resetFrom(res));
      throw new GithubApiError("forbidden");
    }
    if (TRANSIENT.has(res.status) || res.status >= 500) throw new GithubApiError("unavailable");
    if (!res.ok) throw new GithubApiError("invalid_response");

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new GithubApiError("invalid_response");
    }
    if (!body || typeof body !== "object") throw new GithubApiError("invalid_response");
    const { data, errors } = body as { data?: unknown; errors?: unknown };
    const errs = Array.isArray(errors) ? (errors as Record<string, unknown>[]) : [];
    const types = errs.map((e) => (typeof e.type === "string" ? e.type : "UNKNOWN"));

    if (types.includes("RATE_LIMITED")) throw new GithubApiError("rate_limited", this.resetFrom(res));
    if (data === null || data === undefined) {
      if (types.some((t) => t === "FORBIDDEN" || t === "INSUFFICIENT_SCOPES")) throw new GithubApiError("forbidden");
      throw new GithubApiError(errs.length > 0 ? "unavailable" : "invalid_response");
    }

    const parsed = schema.safeParse(data);
    if (!parsed.success) throw new GithubApiError("invalid_response");
    const partial: PartialError[] = errs.map((e) => ({
      type: typeof e.type === "string" ? e.type.slice(0, 40) : "UNKNOWN",
      path: Array.isArray(e.path) ? e.path.map(String).join(".").slice(0, 120) : "",
    }));
    return { data: parsed.data, partial, rate: rateOf(data) };
  }

  private isRateLimited(res: Response): boolean {
    return res.headers.get("x-ratelimit-remaining") === "0" || res.headers.has("retry-after") || res.status === 429;
  }

  private resetFrom(res: Response): string | null {
    const retry = Number(res.headers.get("retry-after"));
    if (Number.isFinite(retry) && retry > 0) return new Date(this.now().getTime() + retry * 1000).toISOString();
    const reset = Number(res.headers.get("x-ratelimit-reset"));
    if (Number.isFinite(reset) && reset > 0) return new Date(reset * 1000).toISOString();
    return null;
  }
}

function rateOf(data: unknown): RateInfo | null {
  const r = (data as { rateLimit?: { cost?: unknown; remaining?: unknown; resetAt?: unknown } } | null)?.rateLimit;
  if (!r || typeof r.cost !== "number" || typeof r.remaining !== "number" || typeof r.resetAt !== "string") return null;
  return { cost: r.cost, remaining: r.remaining, resetAt: r.resetAt };
}
