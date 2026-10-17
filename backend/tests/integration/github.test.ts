import { pino } from "pino";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { MemoryGithubStore } from "../../src/github/store.js";
import { TokenVault } from "../../src/github/vault.js";
import { bearer, testApp } from "./app.js";
import { RecordingLlm } from "../mentor/recordingLlm.js";
import { alice, FRONTEND, harness, OTHER_KEY, REDIRECT, TEST_KEY, type Harness } from "../github/harness.js";
import { gqlError, json, NOW, sampleRepos, type FakeAccount } from "../github/fakeGithub.js";

const A = "student-a";
const B = "student-b";
const bob = (over: Partial<FakeAccount> = {}): FakeAccount => ({ id: 2002, login: "bob", repos: [], ...over });
const withRepos = (over: Partial<FakeAccount> = {}) => alice({ repos: sampleRepos("alice"), ...over });

const get = (h: Harness, path: string, uid = A) => request(h.app).get(`/api/github${path}`).set(h.auth(uid));
const post = (h: Harness, path: string, uid = A, body: object = {}) => request(h.app).post(`/api/github${path}`).set(h.auth(uid)).send(body);
const del = (h: Harness, path: string, uid = A) => request(h.app).delete(`/api/github${path}`).set(h.auth(uid));
const minutes = (h: Harness, m: number) => void (h.clock.now = new Date(h.clock.now.getTime() + m * 60_000));

async function connected(h: Harness, uid = A, account: FakeAccount = withRepos()) {
  await h.connect(uid, account);
  return (await get(h, "/connection", uid)).body;
}

function captureLogger() {
  const lines: string[] = [];
  return { lines, logger: pino({ level: "trace" }, { write: (s: string) => void lines.push(s) }) };
}

// Strict response shapes: a field that should not exist (a token, a raw payload) fails these.
const Conn = z.strictObject({
  status: z.enum(["not_configured", "disconnected", "connected", "reauthorization_required"]),
  login: z.string().nullable(),
  profile_url: z.string().nullable(),
  access: z.literal("public_only"),
  permissions: z.array(z.string()),
  connected_at: z.string().nullable(),
  last_synced_at: z.string().nullable(),
  freshness: z.enum(["never_synced", "fresh", "stale"]),
  fresh_for_minutes: z.number(),
  last_sync_error: z.string().nullable(),
  last_sync_error_at: z.string().nullable(),
  sync_in_progress: z.boolean(),
  next_sync_allowed_at: z.string().nullable(),
});
const Source = z.strictObject({ login: z.string(), synced_at: z.string().nullable(), from: z.string().nullable(), to: z.string().nullable(), freshness: z.string(), cached: z.literal(true) });
const Contributions = z.strictObject({
  source: Source, available: z.boolean(), total: z.number().nullable(), weeks: z.array(z.strictObject({ starts_on: z.string(), days: z.array(z.strictObject({ date: z.string(), count: z.number() })) })),
  weekly: z.array(z.strictObject({ period: z.string(), total: z.number() })), monthly: z.array(z.strictObject({ period: z.string(), total: z.number() })),
  breakdown: z.strictObject({ commits: z.number(), pull_requests: z.number(), reviews: z.number(), issues: z.number() }).nullable(),
  restricted_count: z.number().nullable(), active_days: z.number().nullable(), longest_streak_days: z.number().nullable(), notice: z.string(),
});
const Repos = z.strictObject({
  source: Source, available: z.boolean(),
  repositories: z.array(z.strictObject({
    name_with_owner: z.string(), url: z.string(), description: z.string().nullable(), primary_language: z.string().nullable(),
    languages: z.array(z.strictObject({ name: z.string(), percent: z.number() })), is_fork: z.boolean(), is_archived: z.boolean(), pushed_at: z.string().nullable(), updated_at: z.string().nullable(),
    stars: z.number(), open_issues: z.number(), open_pull_requests: z.number(), your_commits_90d: z.number().nullable(), has_license: z.boolean().nullable(), topics: z.array(z.string()),
  })),
  total_public_repositories: z.number().nullable(), truncated: z.boolean(),
  checklist: z.array(z.strictObject({ repository: z.string(), check: z.enum(["readme_present", "description_present", "setup_instructions", "test_instructions", "license_present"]), status: z.enum(["pass", "fail", "unknown"]), label: z.string(), evidence: z.string() })),
});
const Activity = z.strictObject({
  source: Source, available: z.boolean(), pull_requests_total: z.number().nullable(), issues_total: z.number().nullable(),
  items: z.array(z.strictObject({ kind: z.enum(["pull_request", "issue", "review"]), title: z.string(), url: z.string(), repository: z.string(), state: z.string(), occurred_at: z.string() })),
});
const Sync = z.strictObject({ outcome: z.enum(["synced", "partial", "cached", "in_progress"]), connection: Conn, unavailable_sections: z.array(z.string()), rate_limit_remaining: z.number().nullable() });

describe("GitHub: not configured (a fresh deployment)", () => {
  const app = () => testApp({ autoAuth: false });
  const auth = { Authorization: bearer(A) };

  it("reports itself as not configured and never pretends to connect", async () => {
    const c = await request(app()).get("/api/github/connection").set(auth);
    expect(c.status).toBe(200);
    expect(Conn.parse(c.body)).toMatchObject({ status: "not_configured", login: null, access: "public_only" });
    for (const [method, path] of [["post", "/connect"], ["post", "/sync"], ["get", "/contributions"], ["get", "/repositories"], ["get", "/activity"]] as const) {
      const r = await request(app())[method](`/api/github${path}`).set(auth).send({});
      expect(r.status, path).toBe(503);
      expect(r.body.error.code).toBe("GITHUB_NOT_CONFIGURED");
    }
  });

  it("the callback sends the browser back with a clear reason instead of failing", async () => {
    const r = await request(app()).get("/api/github/oauth/callback").query({ code: "abc", state: "x".repeat(43) });
    expect(r.status).toBe(302);
    expect(r.headers.location).toBe(`${FRONTEND}/settings?github=error&reason=not_configured`);
  });

  it("disconnect still works (clears anything left over) and the mentor is unaffected", async () => {
    const r = await request(app()).delete("/api/github/connection").set(auth);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ data_removed: true, revoked_at_github: false });
  });
});

describe("GitHub: authentication boundary", () => {
  it("requires a verified student for every route except GitHub's own redirect", async () => {
    const h = harness();
    for (const [method, path] of [["get", "/connection"], ["post", "/connect"], ["delete", "/connection"], ["post", "/sync"], ["get", "/contributions"], ["get", "/repositories"], ["get", "/activity"]] as const) {
      const r = await request(h.app)[method](`/api/github${path}`).send({});
      expect(r.status, `${method} ${path}`).toBe(401);
    }
    const cb = await request(h.app).get("/api/github/oauth/callback");
    expect(cb.status).toBe(302); // reachable without a token by design; it identifies the student only through server-side state
  });

  it("offers no general GraphQL proxy and accepts no URL, query or user id from the client", async () => {
    const h = harness();
    for (const path of ["/graphql", "/proxy", "/query"]) expect((await post(h, path, A, { query: "{ viewer { login } }" })).status).toBe(404);
    expect((await post(h, "/connect", A, { redirect_uri: "https://evil.example", uid: B })).status).toBe(400);
    expect((await post(h, "/sync", A, { owner_uid: B })).status).toBe(400);
  });
});

describe("GitHub: connecting", () => {
  it("builds the authorization URL on the server: fixed host, our callback, state, PKCE, no scope, no secret", async () => {
    const h = harness();
    const r = await post(h, "/connect");
    expect(r.status).toBe(200);
    expect(Object.keys(r.body).sort()).toEqual(["authorize_url", "expires_at"]);
    const u = new URL(r.body.authorize_url);
    expect(`${u.origin}${u.pathname}`).toBe("https://github.com/login/oauth/authorize");
    expect(u.searchParams.get("client_id")).toBe("test-client-id");
    expect(u.searchParams.get("redirect_uri")).toBe(REDIRECT);
    expect(u.searchParams.get("state")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(u.searchParams.has("scope")).toBe(false);
    expect(r.body.authorize_url).not.toContain("test-client-secret");
    expect(Date.parse(r.body.expires_at) - NOW.getTime()).toBe(10 * 60_000);
  });

  it("completes the round trip and ties the GitHub account to the student whose state it was", async () => {
    const h = harness();
    const location = await h.connect(A, withRepos());
    expect(location).toBe(`${FRONTEND}/settings?github=connected`);
    expect(location).not.toMatch(/code|state|token/);

    const c = Conn.parse((await get(h, "/connection")).body);
    expect(c).toMatchObject({ status: "connected", login: "alice", profile_url: "https://github.com/alice", access: "public_only", permissions: [], freshness: "never_synced" });
    expect((await get(h, "/connection", B)).body.status).toBe("disconnected"); // another student sees nothing
    // PKCE verifier and the secret were sent only to GitHub's token endpoint, by the server.
    expect(h.gh.lastExchange).toMatchObject({ client_id: "test-client-id", client_secret: "test-client-secret", redirect_uri: REDIRECT });
    expect(String(h.gh.lastExchange?.code_verifier)).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("sets the callback response to never be cached or leak the URL", async () => {
    const h = harness();
    const start = await post(h, "/connect");
    const state = new URL(start.body.authorize_url).searchParams.get("state")!;
    const r = await request(h.app).get("/api/github/oauth/callback").query({ error: "access_denied", state });
    expect(r.headers["cache-control"]).toBe("no-store");
    expect(r.headers["referrer-policy"]).toBe("no-referrer");
  });

  it("rejects a missing, malformed or unknown state without calling GitHub", async () => {
    const h = harness();
    const code = h.gh.addAccount(alice());
    for (const q of [{ code }, { code, state: "short" }, { code, state: "z".repeat(43) }, { code, state: "<script>" }]) {
      const r = await request(h.app).get("/api/github/oauth/callback").query(q);
      expect(r.headers.location, JSON.stringify(q)).toBe(`${FRONTEND}/settings?github=error&reason=invalid_state`);
    }
    expect(h.gh.calls).toHaveLength(0);
    expect((await get(h, "/connection")).body.status).toBe("disconnected");
  });

  it("accepts a state exactly once (replay is rejected)", async () => {
    const h = harness();
    const start = await post(h, "/connect");
    const u = new URL(start.body.authorize_url);
    const code = h.gh.addAccount(alice());
    h.gh.registerChallenge(code, u.searchParams.get("code_challenge")!);
    const q = { code, state: u.searchParams.get("state")! };
    expect((await request(h.app).get("/api/github/oauth/callback").query(q)).headers.location).toContain("github=connected");
    const again = await request(h.app).get("/api/github/oauth/callback").query({ ...q, code: h.gh.addAccount(alice()) });
    expect(again.headers.location).toContain("reason=invalid_state");
  });

  it("rejects an expired state", async () => {
    const h = harness();
    const start = await post(h, "/connect");
    const u = new URL(start.body.authorize_url);
    const code = h.gh.addAccount(alice());
    minutes(h, 11);
    const r = await request(h.app).get("/api/github/oauth/callback").query({ code, state: u.searchParams.get("state")! });
    expect(r.headers.location).toContain("reason=expired_state");
    expect(h.gh.count("UnbluffViewer")).toBe(0);
    expect(h.gh.calls.filter((c) => c.url.includes("access_token"))).toHaveLength(0);
  });

  it("handles a cancelled authorization (access_denied) and consumes the state", async () => {
    const h = harness();
    const start = await post(h, "/connect");
    const state = new URL(start.body.authorize_url).searchParams.get("state")!;
    const r = await request(h.app).get("/api/github/oauth/callback").query({ error: "access_denied", error_description: "The user has denied your application access.", state });
    expect(r.headers.location).toBe(`${FRONTEND}/settings?github=error&reason=access_denied`);
    expect((await get(h, "/connection")).body.status).toBe("disconnected");
    const replay = await request(h.app).get("/api/github/oauth/callback").query({ error: "access_denied", state });
    expect(replay.headers.location).toContain("reason=invalid_state");
    expect(h.gh.calls).toHaveLength(0);
  });

  it("handles other GitHub errors, a missing code and a bad code", async () => {
    const h = harness();
    const state1 = new URL((await post(h, "/connect")).body.authorize_url).searchParams.get("state")!;
    expect((await request(h.app).get("/api/github/oauth/callback").query({ error: "redirect_uri_mismatch", state: state1 })).headers.location).toContain("reason=exchange_failed");
    const state2 = new URL((await post(h, "/connect")).body.authorize_url).searchParams.get("state")!;
    expect((await request(h.app).get("/api/github/oauth/callback").query({ state: state2 })).headers.location).toContain("reason=exchange_failed");
    const state3 = new URL((await post(h, "/connect")).body.authorize_url).searchParams.get("state")!;
    expect((await request(h.app).get("/api/github/oauth/callback").query({ code: "wrong-code", state: state3 })).headers.location).toContain("reason=exchange_failed");
    expect((await get(h, "/connection")).body.status).toBe("disconnected");
  });

  it("reports GitHub being down during the exchange", async () => {
    const h = harness();
    const state = new URL((await post(h, "/connect")).body.authorize_url).searchParams.get("state")!;
    const down = (async () => json({}, 503)) as typeof fetch;
    const svc = h.makeService({ oauthFetch: down });
    expect(await svc.completeCallback({ code: "c", state })).toBe(`${FRONTEND}/settings?github=error&reason=github_unavailable`);
    expect(await h.store.getConnection(A)).toBeNull();
  });

  it("refuses a token that carries more than read-only access, revokes it, and stores nothing", async () => {
    const h = harness();
    const location = await h.connect(A, withRepos({ scope: "repo,read:user" }));
    expect(location).toContain("reason=excessive_permissions");
    expect(h.gh.revoked).toEqual([{ kind: "token", token: h.gh.tokenIssued[0]! }]);
    expect(await h.store.getCredential(A)).toBeNull();
    expect(await h.store.getConnection(A)).toBeNull();
    expect(h.gh.count("UnbluffViewer")).toBe(0); // the token was never used
    for (const scope of ["workflow", "admin:org", "write:packages", "delete_repo", "public_repo"]) {
      expect(await harness().connect(A, alice({ scope })), scope).toContain("excessive_permissions");
    }
  });

  it("tolerates the harmless read:user scope and records exactly what was granted", async () => {
    const h = harness();
    expect(await h.connect(A, withRepos({ scope: "read:user" }))).toContain("github=connected");
    expect((await get(h, "/connection")).body.permissions).toEqual(["read:user"]);
  });

  it("links one GitHub account to one student only", async () => {
    const h = harness();
    await connected(h, A);
    const location = await h.connect(B, withRepos()); // same GitHub account (id 1001)
    expect(location).toContain("reason=already_linked");
    expect((await get(h, "/connection", B)).body.status).toBe("disconnected");
    expect((await get(h, "/connection", A)).body.status).toBe("connected");
    // Only the new token is revoked: revoking the grant would cut off the first student too.
    expect(h.gh.revoked).toEqual([{ kind: "token", token: h.gh.tokenIssued[1]! }]);
    expect((await post(h, "/sync", A)).status).toBe(200); // A's token still works
  });

  it("does not allow a second connect while connected, and lets the student link a different account after disconnecting", async () => {
    const h = harness();
    await connected(h, A);
    const again = await post(h, "/connect");
    expect(again.status).toBe(400);
    await del(h, "/connection");
    expect(await h.connect(A, bob({ repos: [] }))).toContain("github=connected");
    expect((await get(h, "/connection")).body.login).toBe("bob");
    // alice's GitHub account is free again for anyone
    expect(await h.connect(B, withRepos())).toContain("github=connected");
  });

  it("limits how many unfinished authorizations a student can leave pending", async () => {
    const h = harness();
    const states: string[] = [];
    for (let i = 0; i < 7; i++) {
      states.push(new URL((await post(h, "/connect")).body.authorize_url).searchParams.get("state")!);
      h.clock.now = new Date(h.clock.now.getTime() + 1000);
    }
    const code = h.gh.addAccount(alice());
    const oldest = await request(h.app).get("/api/github/oauth/callback").query({ code, state: states[0]! });
    expect(oldest.headers.location).toContain("reason=invalid_state");
    const newest = await request(h.app).get("/api/github/oauth/callback").query({ code, state: states[6]! });
    expect(newest.headers.location).toContain("github=connected");
  });
});

describe("GitHub: credential confidentiality", () => {
  it("never exposes the token, secret, code or verifier in responses, redirects, stored records or logs", async () => {
    const { lines, logger } = captureLogger();
    const h = harness({ logger });
    const start = await post(h, "/connect");
    const u = new URL(start.body.authorize_url);
    const code = h.gh.addAccount(withRepos());
    h.gh.registerChallenge(code, u.searchParams.get("code_challenge")!);
    const cb = await request(h.app).get("/api/github/oauth/callback").query({ code, state: u.searchParams.get("state")! });
    const token = h.gh.tokenIssued[0]!;
    const seen: string[] = [cb.headers.location as string, cb.text];
    seen.push(JSON.stringify((await get(h, "/connection")).body));
    seen.push(JSON.stringify((await post(h, "/sync")).body));
    for (const p of ["/contributions", "/repositories", "/activity"]) seen.push(JSON.stringify((await get(h, p)).body));
    seen.push(JSON.stringify((await del(h, "/connection")).body));

    const state = u.searchParams.get("state")!;
    const secrets = [token, "test-client-secret", code, String(h.gh.lastExchange?.code_verifier), TEST_KEY];
    for (const s of secrets) {
      for (const text of [...seen, start.text]) expect(text).not.toContain(s);
      for (const line of lines) expect(line).not.toContain(s);
    }
    // the state is meant to travel through the browser (and only there): it must not be in responses after the callback or in logs
    for (const text of seen) expect(text).not.toContain(state);
    for (const line of lines) expect(line).not.toContain(state);
    expect(lines.length).toBeGreaterThan(0); // logging was on, and still clean
  });

  it("stores the token only encrypted, bound to the student and GitHub account", async () => {
    const h = harness();
    await connected(h);
    const token = h.gh.tokenIssued[0]!;
    const cred = await h.store.getCredential(A);
    expect(JSON.stringify(cred)).not.toContain(token);
    expect(Object.keys(cred!.sealed).sort()).toEqual(["data", "iv", "key_id", "tag", "v"]);
    expect(h.vault.open(cred!.sealed, A, "1001")).toBe(token);
    expect(() => h.vault.open(cred!.sealed, B, "1001")).toThrow();
    // nothing else in the database holds it either
    for (const rec of [await h.store.getConnection(A), await h.store.getInsights(A)]) expect(JSON.stringify(rec)).not.toContain(token);
  });

  it("a credential that cannot be decrypted (wrong or lost key) sends the student to reconnect and is deleted", async () => {
    const h = harness();
    await connected(h);
    const cred = (await h.store.getCredential(A))!;
    await h.store.saveCredential({ ...cred, sealed: new TokenVault(OTHER_KEY).seal("x", A, "1001") });
    const before = h.gh.count("UnbluffViewer");
    const r = await post(h, "/sync");
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe("GITHUB_REAUTH_REQUIRED");
    expect(await h.store.getCredential(A)).toBeNull();
    expect((await get(h, "/connection")).body.status).toBe("reauthorization_required");
    expect(h.gh.count("UnbluffViewer")).toBe(before); // GitHub was never called
  });
});

describe("GitHub: synchronisation and cached reads", () => {
  it("fetches the bounded set of GraphQL operations once and normalises them", async () => {
    const h = harness();
    await connected(h);
    const first = h.gh.calls.length; // the connect round trip itself used GitHub once (identity)
    const r = await post(h, "/sync");
    expect(r.status).toBe(200);
    const sync = Sync.parse(r.body);
    expect(sync.outcome).toBe("synced");
    expect(sync.rate_limit_remaining).toBe(4990);
    expect(sync.connection).toMatchObject({ status: "connected", freshness: "fresh", last_synced_at: NOW.toISOString(), last_sync_error: null });

    const graphql = h.gh.calls.slice(first).filter((c) => c.url === "https://api.github.com/graphql");
    expect(graphql.map((c) => c.op)).toEqual(["UnbluffViewer", "UnbluffContributions", "UnbluffRepositories", "UnbluffReadmes", "UnbluffActivity"]);
    for (const c of graphql) {
      expect(c.headers.authorization).toBe(`Bearer ${h.gh.tokenIssued[0]}`);
      expect(String(c.body?.query)).not.toMatch(/\bmutation\b/i);
    }
    const repoCall = graphql.find((c) => c.op === "UnbluffRepositories")!;
    expect(repoCall.body?.variables).toMatchObject({ after: null, authorId: "U_1001" });
    expect(Date.parse((repoCall.body?.variables as { since: string }).since)).toBe(NOW.getTime() - 90 * 86_400_000);
    const contrib = graphql.find((c) => c.op === "UnbluffContributions")!.body?.variables as { from: string; to: string };
    expect(contrib.to).toBe(NOW.toISOString());
    expect(Date.parse(contrib.to) - Date.parse(contrib.from)).toBeLessThanOrEqual(365 * 86_400_000);
    // READMEs were requested only for repositories whose own file listing showed a README
    const readme = graphql.find((c) => c.op === "UnbluffReadmes")!.body?.variables as Record<string, string>;
    expect(readme).toEqual({ o0: "alice", n0: "todo-app", e0: "HEAD:README.md", o1: "alice", n1: "shop", e1: "HEAD:README.md" });
  });

  it("serves contributions from the cache with date range, GitHub's total and derived summaries", async () => {
    const h = harness();
    await connected(h);
    await post(h, "/sync");
    const calls = h.gh.calls.length;
    const r = await get(h, "/contributions");
    const c = Contributions.parse(r.body);
    expect(c.available).toBe(true);
    expect(c.source).toMatchObject({ login: "alice", synced_at: NOW.toISOString(), freshness: "fresh", cached: true });
    expect(c.source.to).toBe("2026-06-15");
    expect(c.total).toBe(c.weeks.flatMap((w) => w.days).reduce((s, d) => s + d.count, 0));
    expect(c.monthly.reduce((s, m) => s + m.total, 0)).toBe(c.total);
    expect(c.weekly).toHaveLength(12);
    expect(c.breakdown).toEqual({ commits: 120, pull_requests: 12, reviews: 6, issues: 4 });
    expect(c.restricted_count).toBe(0);
    expect(c.notice).toMatch(/partial evidence/);
    expect(c.notice).toMatch(/not a measure of skill/);
    for (const p of ["/contributions", "/repositories", "/activity", "/connection"]) await get(h, p);
    expect(h.gh.calls.length).toBe(calls); // reading never calls GitHub
  });

  it("returns public repositories only, with the portfolio checklist built from observed facts", async () => {
    const h = harness();
    await connected(h, A, withRepos({ repos: [...sampleRepos("alice"), { nameWithOwner: "alice/secret-project", isPrivate: true, description: "hidden", tree: ["README.md"] }] }));
    await post(h, "/sync");
    const r = Repos.parse((await get(h, "/repositories")).body);
    expect(r.repositories.map((x) => x.name_with_owner)).toEqual(["alice/todo-app", "alice/notes", "alice/forked", "alice/empty", "alice/shop"]);
    expect(JSON.stringify(r)).not.toContain("secret-project");
    const todo = r.repositories[0]!;
    expect(todo).toMatchObject({ description: "A small todo app", primary_language: "TypeScript", your_commits_90d: 14, has_license: true, stars: 3 });
    expect(todo.languages).toEqual([{ name: "TypeScript", percent: 80 }, { name: "CSS", percent: 20 }]);

    const status = (repo: string, check: string) => r.checklist.find((i) => i.repository === repo && i.check === check)?.status;
    expect(["readme_present", "description_present", "license_present", "setup_instructions", "test_instructions"].map((c) => status("alice/todo-app", c))).toEqual(["pass", "pass", "pass", "pass", "pass"]);
    expect(["readme_present", "description_present", "license_present", "setup_instructions", "test_instructions"].map((c) => status("alice/notes", c))).toEqual(["fail", "fail", "fail", "unknown", "unknown"]);
    expect(status("alice/empty", "readme_present")).toBe("unknown"); // GitHub returned no files: not claimed as missing
    expect(status("alice/shop", "setup_instructions")).toBe("fail"); // README was read in full and has no install section
    expect(r.checklist.some((i) => i.repository === "alice/forked")).toBe(false); // forks are not judged
    // the hostile README text never reaches the API response
    expect(JSON.stringify(r)).not.toContain("Ignore previous instructions");
  });

  it("returns recent pull requests, issues and reviews and drops private repositories", async () => {
    const h = harness();
    await connected(h);
    await post(h, "/sync");
    const a = Activity.parse((await get(h, "/activity")).body);
    expect(a.items.map((i) => `${i.kind}:${i.title}`)).toEqual(["pull_request:Add search", "review:Fix typo", "issue:Bug: crash"]);
    expect(a.pull_requests_total).toBe(12);
    expect(JSON.stringify(a)).not.toContain("Secret work");
  });

  it("is honest before the first sync", async () => {
    const h = harness();
    await connected(h);
    const c = Contributions.parse((await get(h, "/contributions")).body);
    expect(c).toMatchObject({ available: false, total: null, weeks: [], breakdown: null });
    expect(c.source.freshness).toBe("never_synced");
    expect(Repos.parse((await get(h, "/repositories")).body)).toMatchObject({ available: false, repositories: [], checklist: [] });
    expect(Activity.parse((await get(h, "/activity")).body)).toMatchObject({ available: false, items: [] });
  });

  it("answers repeated syncs from the cache until the minimum interval passes (no extra GitHub calls)", async () => {
    const h = harness();
    await connected(h);
    expect((await post(h, "/sync")).body.outcome).toBe("synced");
    const calls = h.gh.calls.length;
    minutes(h, 4);
    const again = await post(h, "/sync");
    expect(again.body.outcome).toBe("cached");
    expect(Sync.parse(again.body).connection.next_sync_allowed_at).not.toBeNull();
    expect(h.gh.calls.length).toBe(calls);
    minutes(h, 2);
    expect((await post(h, "/sync")).body.outcome).toBe("synced");
    expect(h.gh.calls.length).toBeGreaterThan(calls);
  });

  it("marks data stale after its freshness window and says so", async () => {
    const h = harness({ freshMinutes: 60 });
    await connected(h);
    await post(h, "/sync");
    expect((await get(h, "/connection")).body.freshness).toBe("fresh");
    minutes(h, 61);
    expect((await get(h, "/connection")).body.freshness).toBe("stale");
    const c = (await get(h, "/contributions")).body;
    expect(c.available).toBe(true); // still shown, clearly labelled
    expect(c.source.freshness).toBe("stale");
    expect(c.source.synced_at).toBe(NOW.toISOString());
  });

  it("runs one synchronisation for concurrent requests", async () => {
    const h = harness();
    await connected(h);
    const viewerCalls = h.gh.count("UnbluffViewer");
    const rs = await Promise.all(Array.from({ length: 6 }, () => post(h, "/sync")));
    expect(rs.map((r) => r.status)).toEqual([200, 200, 200, 200, 200, 200]);
    expect(h.gh.count("UnbluffViewer")).toBe(viewerCalls + 1);
    expect(h.gh.count("UnbluffContributions")).toBe(1);
  });

  it("does not start a second synchronisation while another server instance holds the lock", async () => {
    const h = harness();
    await connected(h);
    expect(await h.store.acquireSyncLock(A, h.clock.now.toISOString(), new Date(h.clock.now.getTime() + 60_000).toISOString())).toBe(true);
    const r = await post(h, "/sync");
    expect(r.body.outcome).toBe("in_progress");
    expect(r.body.connection.sync_in_progress).toBe(true);
    expect(h.gh.count("UnbluffContributions")).toBe(0); // no synchronisation ran
    minutes(h, 2); // the lock expires on its own, so a crashed instance cannot block forever
    expect((await post(h, "/sync")).body.outcome).toBe("synced");
  });

  it("follows pagination, but never reads more than two pages", async () => {
    const h = harness();
    const many = (n: number) => Array.from({ length: n }, (_, i) => ({ nameWithOwner: `alice/r${String(i).padStart(2, "0")}`, description: "d", pushedAt: `2026-05-${String(28 - (i % 28)).padStart(2, "0")}T00:00:00Z`, tree: ["README.md"], readme: { text: "# r\n\nnpm install\nnpm test" } }));
    await connected(h, A, alice({ repos: many(30) }));
    await post(h, "/sync");
    const pages = h.gh.calls.filter((c) => c.op === "UnbluffRepositories");
    expect(pages.map((p) => (p.body?.variables as { after: string | null }).after)).toEqual([null, "25"]);
    let r = Repos.parse((await get(h, "/repositories")).body);
    expect(r.repositories).toHaveLength(30);
    expect(r.truncated).toBe(false);

    const h2 = harness();
    await connected(h2, A, alice({ repos: many(80) }));
    await post(h2, "/sync");
    expect(h2.gh.calls.filter((c) => c.op === "UnbluffRepositories")).toHaveLength(2);
    r = Repos.parse((await get(h2, "/repositories")).body);
    expect(r.repositories).toHaveLength(30); // bounded
    expect(r.total_public_repositories).toBe(80);
    expect(r.truncated).toBe(true);
    // README text is read for at most ten repositories
    const readmeVars = h2.gh.calls.find((c) => c.op === "UnbluffReadmes")!.body?.variables as Record<string, string>;
    expect(Object.keys(readmeVars).filter((k) => k.startsWith("n"))).toHaveLength(10);
    expect(r.checklist.length).toBe(10 * 5);
  });
});

describe("GitHub: partial results, limits and failures", () => {
  it("keeps data from a response that also carried GraphQL errors, and says the sync was partial", async () => {
    const h = harness();
    await connected(h);
    h.gh.override("UnbluffActivity", (call) => {
      if (call.op !== "UnbluffActivity") return undefined;
      return gqlError([{ type: "FORBIDDEN", path: ["viewer", "issues", "nodes", 0], message: "Resource protected by organization SAML enforcement" }], {
        viewer: { pullRequests: { totalCount: 1, nodes: [null] }, issues: { totalCount: 0, nodes: [null] }, contributionsCollection: { pullRequestReviewContributions: { nodes: [] } } },
        rateLimit: { cost: 1, remaining: 4000, resetAt: "2026-06-15T13:00:00Z" },
      });
    });
    const r = await post(h, "/sync");
    expect(r.status).toBe(200);
    expect(r.body.outcome).toBe("partial");
    const a = (await get(h, "/activity")).body;
    expect(a.available).toBe(true);
    expect(a.items).toEqual([]);
    expect(a.pull_requests_total).toBe(1);
  });

  it("one failing section does not discard the others, and older data for it is kept and labelled", async () => {
    const h = harness();
    await connected(h);
    expect((await post(h, "/sync")).body.outcome).toBe("synced");
    const before = (await get(h, "/activity")).body;

    minutes(h, 10);
    h.gh.override("UnbluffActivity", () => json({ message: "bad gateway" }, 502));
    const r = await post(h, "/sync");
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ outcome: "partial", unavailable_sections: ["activity"] });
    expect(r.body.connection.last_sync_error).toBe("unavailable");

    const after = (await get(h, "/activity")).body;
    expect(after.items).toEqual(before.items);
    expect(after.source.synced_at).toBe(NOW.toISOString()); // the OLD time: it was not refreshed
    expect((await get(h, "/contributions")).body.source.synced_at).toBe(h.clock.now.toISOString()); // the others were
  });

  it("when GitHub's rate limit is hit it reports the reset time, keeps saved data and waits for the reset", async () => {
    const h = harness();
    await connected(h);
    await post(h, "/sync");
    minutes(h, 10);
    const reset = Math.floor(h.clock.now.getTime() / 1000) + 20 * 60;
    h.gh.override("UnbluffViewer", () => json({ message: "API rate limit exceeded" }, 403, { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(reset) }));
    const r = await post(h, "/sync");
    expect(r.status).toBe(429);
    expect(r.body.error.code).toBe("GITHUB_RATE_LIMITED");
    expect(r.body.error.message).toContain(new Date(reset * 1000).toISOString());
    expect((await get(h, "/contributions")).body.available).toBe(true); // cached data unaffected

    const calls = h.gh.calls.length;
    minutes(h, 5);
    const early = await post(h, "/sync");
    expect(early.body.outcome).toBe("cached"); // does not hammer GitHub before the reset
    expect(early.body.connection.last_sync_error).toBe("rate_limited");
    expect(h.gh.calls.length).toBe(calls);

    h.gh.overrides.clear();
    minutes(h, 16);
    expect((await post(h, "/sync")).body.outcome).toBe("synced");
  });

  it("stops asking once the rate limit is hit part-way and keeps what it already fetched", async () => {
    const h = harness();
    await connected(h);
    h.gh.override("UnbluffRepositories", () => gqlError([{ type: "RATE_LIMITED", message: "API rate limit exceeded" }], null));
    const r = await post(h, "/sync");
    expect(r.body).toMatchObject({ outcome: "partial", unavailable_sections: ["repositories", "activity"] });
    expect(h.gh.count("UnbluffActivity")).toBe(0);
    expect((await get(h, "/contributions")).body.available).toBe(true);
    expect((await get(h, "/repositories")).body.available).toBe(false);
  });

  it("times out a hung GitHub request and reports it without losing saved data", async () => {
    const h = harness();
    await connected(h);
    await post(h, "/sync");
    minutes(h, 10);
    const hang = ((_u: string, init?: RequestInit) => new Promise((_res, rej) => init?.signal?.addEventListener("abort", () => rej(init.signal?.reason)))) as typeof fetch;
    const svc = h.makeService({ graphqlFetch: hang, timeoutMs: 30, retries: 1 });
    await expect(svc.sync(A)).rejects.toMatchObject({ code: "GITHUB_UNAVAILABLE" });
    expect((await get(h, "/contributions")).body.available).toBe(true);
    expect((await get(h, "/connection")).body.last_sync_error).toBe("timeout");
  });

  it("rejects a response whose shape is not what was asked for and stores nothing from it", async () => {
    const h = harness();
    await connected(h);
    h.gh.override("UnbluffViewer", () => json({ data: { viewer: { id: 7 } } }));
    const r = await post(h, "/sync");
    expect(r.status).toBe(502);
    expect(r.body.error.code).toBe("GITHUB_UNAVAILABLE");
    expect((await get(h, "/contributions")).body.available).toBe(false);
    expect(await h.store.getInsights(A)).toBeNull();
  });

  it("asks the student to reconnect when GitHub no longer accepts the token (revoked on github.com)", async () => {
    const h = harness();
    await connected(h);
    await post(h, "/sync");
    h.gh.invalidate(h.gh.tokenIssued[0]!);
    minutes(h, 10);
    const r = await post(h, "/sync");
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe("GITHUB_REAUTH_REQUIRED");
    const c = Conn.parse((await get(h, "/connection")).body);
    expect(c).toMatchObject({ status: "reauthorization_required", last_sync_error: "unauthorized", login: "alice" });
    expect(await h.store.getCredential(A)).toBeNull(); // the dead token is not kept
    expect((await get(h, "/contributions")).body.available).toBe(true); // what was synced earlier is still readable, labelled with its time

    const calls = h.gh.calls.length;
    expect((await post(h, "/sync")).status).toBe(409);
    expect(h.gh.calls.length).toBe(calls);

    // reconnecting the same account restores everything
    expect(await h.connect(A, withRepos())).toContain("github=connected");
    expect((await get(h, "/connection")).body.status).toBe("connected");
    minutes(h, 10);
    expect((await post(h, "/sync")).body.outcome).toBe("synced");
  });

  it("treats a token that now belongs to a different GitHub account as unauthorised", async () => {
    const h = harness();
    await connected(h);
    h.gh.override("UnbluffViewer", () => json({ data: { viewer: { id: "U_999", databaseId: 999, login: "mallory", url: "https://github.com/mallory" }, rateLimit: { cost: 1, remaining: 1, resetAt: "2026-06-15T13:00:00Z" } } }));
    const r = await post(h, "/sync");
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe("GITHUB_REAUTH_REQUIRED");
    expect(h.gh.count("UnbluffContributions")).toBe(0); // nothing was fetched with it
  });

  it("keeps a connection that is reauthorising from exposing the previous account's cache to a new one", async () => {
    const h = harness();
    await connected(h);
    await post(h, "/sync");
    h.gh.invalidate(h.gh.tokenIssued[0]!);
    minutes(h, 10);
    await post(h, "/sync"); // -> reauthorization_required
    // the student links a DIFFERENT GitHub account
    expect(await h.connect(A, bob({ repos: [] }))).toContain("github=connected");
    expect((await get(h, "/connection")).body.login).toBe("bob");
    const c = (await get(h, "/contributions")).body;
    expect(c.available).toBe(false);
    expect(JSON.stringify(await get(h, "/repositories"))).not.toContain("todo-app");
    // alice's account is released for others
    expect(await h.connect(B, withRepos())).toContain("github=connected");
  });

  it("rate limits the sync and connect endpoints per student", async () => {
    const h = harness({ rateLimits: { globalPerMinute: 10_000, llmPerMinute: 10_000, githubSyncPerMinute: 2, githubConnectPerMinute: 2 } });
    await connected(h);
    expect([(await post(h, "/sync")).status, (await post(h, "/sync")).status, (await post(h, "/sync")).status]).toEqual([200, 200, 429]);
    expect((await post(h, "/sync", B)).status).toBe(409); // another student has their own allowance (and is simply not connected)
    expect((await get(h, "/contributions")).status).toBe(200);
  });
});

describe("GitHub: disconnecting", () => {
  it("revokes at GitHub and removes the credential, cached data and the account link", async () => {
    const h = harness();
    await connected(h);
    await post(h, "/sync");
    const token = h.gh.tokenIssued[0]!;
    const r = await del(h, "/connection");
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ revoked_at_github: true, data_removed: true, connection: { status: "disconnected", login: null } });
    expect(h.gh.revoked).toEqual([{ kind: "grant", token }]);
    expect(await h.store.getCredential(A)).toBeNull();
    expect(await h.store.getConnection(A)).toBeNull();
    expect(await h.store.getInsights(A)).toBeNull();
    expect(await h.store.claimIdentity("1001", B, h.clock.now.toISOString())).toBe(true); // released
    for (const p of ["/contributions", "/repositories", "/activity"]) {
      const g = await get(h, p);
      expect(g.status, p).toBe(409);
      expect(g.body.error.code).toBe("GITHUB_NOT_CONNECTED");
    }
    const calls = h.gh.calls.length;
    expect((await post(h, "/sync")).body.error.code).toBe("GITHUB_NOT_CONNECTED");
    expect(h.gh.calls.length).toBe(calls); // no synchronisation after disconnect
  });

  it("still removes everything locally when GitHub cannot be reached, and says revocation did not happen", async () => {
    const h = harness();
    await connected(h);
    const offline = (async () => {
      throw new TypeError("offline");
    }) as typeof fetch;
    const svc = h.makeService({ oauthFetch: offline });
    const r = await svc.disconnect(A);
    expect(r).toMatchObject({ revoked_at_github: false, data_removed: true });
    expect(await h.store.getCredential(A)).toBeNull();
    expect(await h.store.getConnection(A)).toBeNull();
  });

  it("is idempotent and discards pending authorizations", async () => {
    const h = harness();
    await connected(h);
    const state = new URL((await post(h, "/connect", B)).body.authorize_url).searchParams.get("state")!;
    expect((await del(h, "/connection")).status).toBe(200);
    expect((await del(h, "/connection")).status).toBe(200);
    expect((await del(h, "/connection", B)).status).toBe(200); // B had only a pending state
    const r = await request(h.app).get("/api/github/oauth/callback").query({ code: h.gh.addAccount(bob()), state });
    expect(r.headers.location).toContain("reason=invalid_state");
  });

  it("wins over a synchronisation that is still running: nothing is resurrected", async () => {
    const h = harness();
    await connected(h);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let reached!: () => void;
    const atGate = new Promise<void>((r) => (reached = r));
    const slow = (async (url: string, init?: RequestInit) => {
      const query = typeof init?.body === "string" ? String((JSON.parse(init.body) as { query?: string }).query) : "";
      if (query.includes("UnbluffRepositories")) {
        reached();
        await gate; // the student presses Disconnect while this request is in flight
      }
      return h.gh.fetch(url, init);
    }) as typeof fetch;
    const running = h.makeService({ graphqlFetch: slow }).sync(A);
    await atGate;
    await h.service.disconnect(A); // revokes the token too, so the rest of the sync is unauthorised
    release();
    await running.catch(() => undefined);
    expect(await h.store.getConnection(A)).toBeNull();
    expect(await h.store.getInsights(A)).toBeNull();
    expect(await h.store.getCredential(A)).toBeNull();
  });
});

describe("GitHub: isolation between students and the public/private boundary", () => {
  it("keeps every student's connection and cache separate; the client cannot choose whose", async () => {
    const h = harness();
    await connected(h, A, withRepos());
    await connected(h, B, bob({ repos: [{ nameWithOwner: "bob/lib", description: "bob's library", tree: ["README.md"], readme: { text: "# lib" }, pushedAt: "2026-06-01T00:00:00Z" }] }));
    await post(h, "/sync", A);
    await post(h, "/sync", B);

    const a = await get(h, "/repositories", A);
    const b = await get(h, "/repositories", B);
    expect(a.body.repositories.map((r: { name_with_owner: string }) => r.name_with_owner)).toContain("alice/todo-app");
    expect(JSON.stringify(a.body)).not.toContain("bob/lib");
    expect(b.body.repositories.map((r: { name_with_owner: string }) => r.name_with_owner)).toEqual(["bob/lib"]);
    expect(JSON.stringify(b.body)).not.toContain("alice/");

    const spoof = await request(h.app).get("/api/github/repositories").query({ uid: A, owner_uid: A, login: "alice" }).set(h.auth(B));
    expect(spoof.body.repositories.map((r: { name_with_owner: string }) => r.name_with_owner)).toEqual(["bob/lib"]);
    expect((await get(h, "/connection", B)).body.login).toBe("bob");

    // disconnecting one student leaves the other untouched
    await del(h, "/connection", A);
    expect((await get(h, "/repositories", B)).status).toBe(200);
  });

  it("never serves a cache that belongs to another student or account, even if the records were swapped", async () => {
    const h = harness();
    await connected(h, A, withRepos());
    await connected(h, B, bob());
    await post(h, "/sync", A);
    const aInsights = (await h.store.getInsights(A))!;
    await h.store.saveInsights({ ...aInsights, owner_uid: B }); // a copy of A's cache filed under B
    const r = await get(h, "/repositories", B);
    expect(r.body.available).toBe(false);
    expect(JSON.stringify(r.body)).not.toContain("alice/");
  });

  it("requests only public repositories and never asks for private access", async () => {
    const h = harness();
    await connected(h);
    await post(h, "/sync");
    const q = String(h.gh.calls.find((c) => c.op === "UnbluffRepositories")!.body?.query);
    expect(q).toContain("privacy: PUBLIC");
    expect((await get(h, "/connection")).body).toMatchObject({ access: "public_only", permissions: [] });
    const authorize = new URL((await post(h, "/connect", B)).body.authorize_url);
    expect(authorize.searchParams.has("scope")).toBe(false);
  });
});

describe("GitHub: AI mentor integration", () => {
  const chat = (h: Harness, message: string, uid = A) =>
    request(h.app).post("/api/mentor/chat").set(h.auth(uid)).send({ mode: "placement_mentor", message, client_message_id: `cm_${Math.random().toString(36).slice(2, 12)}` });

  it("gives the mentor a short structured summary of the student's own cached data when asked about their projects", async () => {
    const llm = new RecordingLlm();
    const h = harness({ llm });
    await connected(h);
    await post(h, "/sync");
    const r = await chat(h, "How does my GitHub portfolio look for a backend role?");
    expect(r.status).toBe(200);
    expect(r.body.github_context).toEqual({ used: true, synced_at: NOW.toISOString(), stale: false });

    const { prompt, system } = llm.chats[0]!;
    const block = /<github_activity>([\s\S]*?)<\/github_activity>/.exec(prompt)?.[1] ?? "";
    expect(block).toContain("OBSERVED FACTS");
    expect(block).toContain("alice/todo-app | languages: TypeScript 80%, CSS 20%");
    expect(block).toContain("README: yes | install/run steps in README: yes | test steps in README: yes | licence: yes");
    expect(block).toContain("alice/notes");
    expect(block).toContain("README: no");
    expect(system).toContain("GITHUB RULES");
    expect(system).toMatch(/NOT a measure of skill|not a measure of skill/);
    expect(system).toMatch(/NOT DSA practice/);
  });

  it("minimises what is sent: no credentials, no free text from repositories, no day-by-day history, no private data", async () => {
    const llm = new RecordingLlm();
    const h = harness({ llm });
    await connected(h, A, withRepos({ repos: [...sampleRepos("alice"), { nameWithOwner: "alice/secret-project", isPrivate: true, description: "hidden", tree: ["README.md"] }] }));
    await post(h, "/sync");
    await chat(h, "Which repo needs a README?");
    const everything = llm.chats.map((c) => c.system + c.prompt).join("\n");
    const token = h.gh.tokenIssued[0]!;
    for (const s of [token, "test-client-secret", TEST_KEY, "secret-project", "Ignore previous instructions", "A small todo app", "Add search", "Secret work", "access_token", "contributionDays", "firstDay"]) expect(everything).not.toContain(s);
    const block = /<github_activity>([\s\S]*?)<\/github_activity>/.exec(llm.chats[0]!.prompt)![1]!;
    expect(block.length).toBeLessThanOrEqual(1800);
  });

  it("sends nothing about GitHub for questions that are not about projects", async () => {
    const llm = new RecordingLlm();
    const h = harness({ llm });
    await connected(h);
    await post(h, "/sync");
    const r = await chat(h, "Explain binary search to me");
    expect(llm.chats[0]!.prompt).not.toContain("github_activity");
    expect(llm.chats[0]!.system).not.toContain("GITHUB RULES");
    expect(r.body.github_context).toBeUndefined();
  });

  it("works when GitHub is disconnected, telling the model there is no data", async () => {
    const llm = new RecordingLlm();
    const h = harness({ llm });
    const r = await chat(h, "Review my GitHub projects");
    expect(r.status).toBe(200);
    expect(r.body.reply.content).toBeTruthy();
    expect(r.body.github_context).toEqual({ used: false, synced_at: null, stale: false });
    expect(llm.chats[0]!.prompt).toContain("GitHub is not connected");
    expect(llm.chats[0]!.prompt).not.toContain("alice");
  });

  it("works when GitHub is configured but never synchronised, or when its storage is failing", async () => {
    const llm = new RecordingLlm();
    const store = new MemoryGithubStore();
    const h = harness({ llm, store });
    await connected(h);
    expect((await chat(h, "my repos?")).body.github_context.used).toBe(false);
    await post(h, "/sync");
    store.getInsights = async () => {
      throw new Error("firestore down");
    };
    const r = await chat(h, "my repositories please");
    expect(r.status).toBe(200);
    expect(r.body.github_context.used).toBe(false);
  });

  it("labels old data as stale for the model and the student", async () => {
    const llm = new RecordingLlm();
    const h = harness({ llm, freshMinutes: 60 });
    await connected(h);
    await post(h, "/sync");
    minutes(h, 120);
    const r = await chat(h, "How is my github?");
    expect(r.body.github_context).toMatchObject({ used: true, stale: true });
    expect(llm.chats[0]!.prompt).toContain("STALE");
  });

  it("does not let one student's question reach another student's GitHub data", async () => {
    const llm = new RecordingLlm();
    const h = harness({ llm });
    await connected(h, A, withRepos());
    await post(h, "/sync", A);
    const r = await chat(h, "tell me about my github repos", B);
    expect(r.body.github_context.used).toBe(false);
    expect(llm.chats[0]!.prompt).not.toContain("alice/");
  });

  it("cannot be steered by hostile repository text into changing memory or DSA records", async () => {
    const llm = new RecordingLlm();
    const h = harness({ llm });
    await connected(h);
    await post(h, "/sync");
    const stable = async () => JSON.stringify({ ...(await h.analytics.overview(A)), generated_at: 0 }).replace(/\d{4}-\d\d-\d\dT[\d:.]+Z/g, "T");
    const before = await stable();
    const r = await chat(h, "Look at my GitHub repos please");
    expect(r.body.memory_saved).toEqual([]);
    expect(await stable()).toBe(before);
    expect((await h.mentorStore.listMemories(A, 100)).filter((m) => m.type !== "summary")).toEqual([]);
  });
});

describe("GitHub activity does not count as DSA performance", () => {
  it("leaves DSA analytics, revision items and goals exactly as they were", async () => {
    const h = harness();
    const stable = async () => JSON.stringify({ ...(await h.analytics.overview(A)), generated_at: 0 }).replace(/\d{4}-\d\d-\d\dT[\d:.]+Z/g, "T");
    const before = await stable();
    await connected(h);
    await post(h, "/sync");
    await get(h, "/contributions");
    expect(await stable()).toBe(before);
    const overview = await h.analytics.overview(A);
    expect(overview.has_eligible_activity).toBe(false);
    expect(JSON.stringify(overview)).not.toMatch(/github|alice|contribution/i);
    // and the analytics HTTP endpoint is unchanged
    const http = await request(h.app).get("/api/me/dsa-analytics").set(h.auth(A));
    expect(http.status).toBe(200);
    expect(JSON.stringify(http.body)).not.toMatch(/github/i);
  });
});
