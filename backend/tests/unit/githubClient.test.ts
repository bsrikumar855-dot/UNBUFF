import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { GITHUB_GRAPHQL_URL, GithubApiError, GithubGraphQL } from "../../src/github/client.js";
import { GITHUB_AUTHORIZE_URL, GithubOAuth, GithubOAuthError, newPkce, newState } from "../../src/github/oauth.js";
import { ACTIVITY_QUERY, CONTRIBUTIONS_QUERY, readmesQuery, REPOSITORIES_QUERY, VIEWER_QUERY } from "../../src/github/queries.js";
import { gqlError, json } from "../github/fakeGithub.js";

const Schema = z.object({ viewer: z.object({ login: z.string() }) });
const ok = (data: unknown = { viewer: { login: "alice" } }) => json({ data });
const client = (fetchImpl: typeof fetch, extra: Partial<ConstructorParameters<typeof GithubGraphQL>[0]> = {}) =>
  new GithubGraphQL({ fetchImpl, sleep: async () => undefined, now: () => new Date("2026-06-15T12:00:00Z"), ...extra });
const kind = async (p: Promise<unknown>) => (await p.then(() => null, (e: unknown) => e)) as GithubApiError | null;

describe("GraphQL request construction", () => {
  it("posts to the one fixed endpoint with a bearer token, JSON body and variables (never interpolated)", async () => {
    const fetchImpl = vi.fn(async () => ok());
    await client(fetchImpl as unknown as typeof fetch).query("tok_123", "query Q($a: String!) { viewer { login } }", { a: "x\"y" }, Schema);
    const calls = fetchImpl.mock.calls as unknown as [string, RequestInit][];
    const [url, init] = calls[0]!;
    expect(url).toBe(GITHUB_GRAPHQL_URL);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok_123");
    expect(init.redirect).toBe("error");
    expect(JSON.parse(init.body as string)).toEqual({ query: "query Q($a: String!) { viewer { login } }", variables: { a: 'x"y' } });
  });

  it("the shipped documents are constant, name their operation, request rate-limit info and contain no write operations", () => {
    for (const q of [VIEWER_QUERY, CONTRIBUTIONS_QUERY, REPOSITORIES_QUERY, ACTIVITY_QUERY, readmesQuery(3)]) {
      expect(q).toMatch(/^query Unbluff\w+/);
      expect(q).toContain("rateLimit { cost remaining resetAt }");
      expect(q).not.toMatch(/\bmutation\b/i);
    }
    expect(REPOSITORIES_QUERY).toContain("privacy: PUBLIC"); // public repositories only
    expect(REPOSITORIES_QUERY).toContain("first: 25"); // bounded page
    expect(CONTRIBUTIONS_QUERY).toContain("$from: DateTime!");
  });

  it("builds the README query from variables only and caps how many repositories it reads", () => {
    const q = readmesQuery(3);
    expect(q).toContain("$o0: String!, $n0: String!, $e0: String!");
    expect(q).toContain("r2: repository(owner: $o2, name: $n2)");
    expect(q).toContain("object(expression: $e1)");
    expect(readmesQuery(500).match(/r\d+: repository/g)).toHaveLength(10);
    expect(q).not.toMatch(/name: "/); // no literal names in the document
  });
});

describe("responses, errors and limits", () => {
  it("returns validated data and the rate-limit info GitHub reported", async () => {
    const r = await client((async () => ok({ viewer: { login: "alice" }, rateLimit: { cost: 2, remaining: 4000, resetAt: "2026-06-15T13:00:00Z" } })) as typeof fetch).query("t", "q", {}, Schema);
    expect(r.data.viewer.login).toBe("alice");
    expect(r.rate).toEqual({ cost: 2, remaining: 4000, resetAt: "2026-06-15T13:00:00Z" });
    expect(r.partial).toEqual([]);
  });

  it("treats a response that does not match the expected shape as invalid, never as data", async () => {
    const e = await kind(client((async () => ok({ viewer: { login: 5 } })) as typeof fetch).query("t", "q", {}, Schema));
    expect(e?.kind).toBe("invalid_response");
    expect((await kind(client((async () => new Response("<html>", { status: 200 })) as typeof fetch).query("t", "q", {}, Schema)))?.kind).toBe("invalid_response");
    expect((await kind(client((async () => json([1, 2])) as typeof fetch).query("t", "q", {}, Schema)))?.kind).toBe("invalid_response");
  });

  it("keeps data from a partially failed response and records only the error type and path", async () => {
    const f = (async () => gqlError([{ type: "NOT_FOUND", path: ["viewer", "repositories", "nodes", 3], message: "secret details" }], { viewer: { login: "alice" } })) as typeof fetch;
    const r = await client(f).query("t", "q", {}, Schema);
    expect(r.data.viewer.login).toBe("alice");
    expect(r.partial).toEqual([{ type: "NOT_FOUND", path: "viewer.repositories.nodes.3" }]);
    expect(JSON.stringify(r.partial)).not.toContain("secret details");
  });

  it("maps 401 to unauthorized (no retry) and permission errors to forbidden", async () => {
    const f401 = vi.fn(async () => json({ message: "Bad credentials" }, 401));
    expect((await kind(client(f401 as unknown as typeof fetch).query("t", "q", {}, Schema)))?.kind).toBe("unauthorized");
    expect(f401).toHaveBeenCalledTimes(1);
    expect((await kind(client((async () => json({ message: "forbidden" }, 403)) as typeof fetch).query("t", "q", {}, Schema)))?.kind).toBe("forbidden");
    expect((await kind(client((async () => gqlError([{ type: "INSUFFICIENT_SCOPES" }], null)) as typeof fetch).query("t", "q", {}, Schema)))?.kind).toBe("forbidden");
  });

  it("recognises rate limiting from headers, Retry-After and GraphQL errors, and reports when it resets", async () => {
    const byHeader = await kind(client((async () => json({ message: "API rate limit exceeded" }, 403, { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1781528400" })) as typeof fetch).query("t", "q", {}, Schema));
    expect(byHeader?.kind).toBe("rate_limited");
    expect(byHeader?.resetAt).toBe(new Date(1781528400 * 1000).toISOString());

    const byRetry = await kind(client((async () => json({ message: "secondary" }, 403, { "retry-after": "60" })) as typeof fetch).query("t", "q", {}, Schema));
    expect(byRetry?.kind).toBe("rate_limited");
    expect(byRetry?.resetAt).toBe("2026-06-15T12:01:00.000Z");

    const byGraphql = await kind(client((async () => gqlError([{ type: "RATE_LIMITED", message: "limit" }], null)) as typeof fetch).query("t", "q", {}, Schema));
    expect(byGraphql?.kind).toBe("rate_limited");
    expect((await kind(client((async () => json({}, 429)) as typeof fetch).query("t", "q", {}, Schema)))?.kind).toBe("rate_limited");
  });

  it("retries transient failures with backoff and then succeeds", async () => {
    const sleeps: number[] = [];
    let n = 0;
    const f = (async () => (++n < 3 ? json({}, 502) : ok())) as typeof fetch;
    const r = await client(f, { sleep: async (ms) => void sleeps.push(ms) }).query("t", "q", {}, Schema);
    expect(r.data.viewer.login).toBe("alice");
    expect(n).toBe(3);
    expect(sleeps).toEqual([300, 600]);
  });

  it("gives up after the bounded number of attempts and never retries a rate limit", async () => {
    const f = vi.fn(async () => json({}, 503));
    expect((await kind(client(f as unknown as typeof fetch, { retries: 2 }).query("t", "q", {}, Schema)))?.kind).toBe("unavailable");
    expect(f).toHaveBeenCalledTimes(3);
    const limited = vi.fn(async () => json({}, 429));
    await kind(client(limited as unknown as typeof fetch).query("t", "q", {}, Schema));
    expect(limited).toHaveBeenCalledTimes(1);
  });

  it("times out a hung request and reports a timeout", async () => {
    const hang = ((_u: string, init: RequestInit) => new Promise((_res, rej) => init.signal?.addEventListener("abort", () => rej(init.signal?.reason)))) as unknown as typeof fetch;
    const e = await kind(client(hang, { timeoutMs: 20, retries: 1 }).query("t", "q", {}, Schema));
    expect(e?.kind).toBe("timeout");
  });

  it("a network error is a transient 'unavailable'", async () => {
    const f = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    expect((await kind(client(f as unknown as typeof fetch, { retries: 1 }).query("t", "q", {}, Schema)))?.kind).toBe("unavailable");
    expect(f).toHaveBeenCalledTimes(2);
  });
});

describe("OAuth requests", () => {
  const cfg = { clientId: "cid", clientSecret: "shh-secret", redirectUri: "http://localhost:8080/api/github/oauth/callback" };

  it("builds the authorization URL: fixed host, state, PKCE S256, and NO scope", () => {
    const { verifier, challenge } = newPkce();
    expect(challenge).toBe(createHash("sha256").update(verifier).digest("base64url"));
    const u = new URL(new GithubOAuth(cfg).authorizeUrl("st4te", challenge));
    expect(`${u.origin}${u.pathname}`).toBe(GITHUB_AUTHORIZE_URL);
    expect(Object.fromEntries(u.searchParams)).toEqual({
      client_id: "cid",
      redirect_uri: cfg.redirectUri,
      state: "st4te",
      code_challenge: challenge,
      code_challenge_method: "S256",
      allow_signup: "false",
    });
    expect(u.searchParams.has("scope")).toBe(false);
    expect(u.toString()).not.toContain("shh-secret");
  });

  it("generates unguessable, distinct states and verifiers", () => {
    const states = new Set(Array.from({ length: 50 }, newState));
    expect(states.size).toBe(50);
    expect([...states][0]).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newPkce().verifier).not.toBe(newPkce().verifier);
  });

  it("exchanges a code with the secret and verifier, and parses the granted scopes", async () => {
    const f = vi.fn(async () => json({ access_token: "gho_x", token_type: "bearer", scope: "read:user,user:email" }));
    const r = await new GithubOAuth({ ...cfg, fetchImpl: f as unknown as typeof fetch }).exchange("thecode", "theverifier");
    expect(r).toEqual({ token: "gho_x", scopes: ["read:user", "user:email"] });
    const [url, init] = (f.mock.calls as unknown as [string, RequestInit][])[0]!;
    expect(url).toBe("https://github.com/login/oauth/access_token");
    expect(JSON.parse(init.body as string)).toEqual({ client_id: "cid", client_secret: "shh-secret", code: "thecode", redirect_uri: cfg.redirectUri, code_verifier: "theverifier" });
  });

  it("classifies exchange failures without leaking details", async () => {
    const fail = (r: () => Promise<Response>) => new GithubOAuth({ ...cfg, fetchImpl: r as unknown as typeof fetch }).exchange("c", "v").then(() => null, (e: unknown) => (e as GithubOAuthError).reason);
    expect(await fail(async () => json({ error: "bad_verification_code", error_description: "The code passed is incorrect or expired." }))).toBe("exchange_failed");
    expect(await fail(async () => json({ access_token: "" }))).toBe("exchange_failed");
    expect(await fail(async () => new Response("nope", { status: 200 }))).toBe("exchange_failed");
    expect(await fail(async () => json({}, 503))).toBe("github_unavailable");
    expect(await fail(async () => { throw new TypeError("down"); })).toBe("github_unavailable");
  });

  it("revokes with Basic auth for the app (grant or token), treating 404 as already revoked", async () => {
    const f = vi.fn(async () => new Response(null, { status: 204 }));
    const oauth = new GithubOAuth({ ...cfg, fetchImpl: f as unknown as typeof fetch });
    expect(await oauth.revokeGrant("tok")).toBe(true);
    expect(await oauth.revokeToken("tok")).toBe(true);
    const calls = f.mock.calls as unknown as [string, RequestInit][];
    expect(calls[0]![0]).toBe("https://api.github.com/applications/cid/grant");
    expect(calls[1]![0]).toBe("https://api.github.com/applications/cid/token");
    expect(calls[0]![1].method).toBe("DELETE");
    expect((calls[0]![1].headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from("cid:shh-secret").toString("base64")}`);
    expect(JSON.parse(calls[0]![1].body as string)).toEqual({ access_token: "tok" });
    expect(await new GithubOAuth({ ...cfg, fetchImpl: (async () => new Response(null, { status: 404 })) as typeof fetch }).revokeGrant("t")).toBe(true);
    expect(await new GithubOAuth({ ...cfg, fetchImpl: (async () => new Response(null, { status: 500 })) as typeof fetch }).revokeGrant("t")).toBe(false);
    expect(await new GithubOAuth({ ...cfg, fetchImpl: (async () => { throw new Error("x"); }) as typeof fetch }).revokeGrant("t")).toBe(false);
  });
});
