import request from "supertest";
import type { Express } from "express";
import { GithubGraphQL } from "../../src/github/client.js";
import { GithubOAuth } from "../../src/github/oauth.js";
import { GithubService } from "../../src/github/service.js";
import { MemoryGithubStore, type GithubStore } from "../../src/github/store.js";
import { TokenVault } from "../../src/github/vault.js";
import type { Logger } from "../../src/logger.js";
import type { RateLimitOptions } from "../../src/middleware/rateLimit.js";
import { MockProvider } from "../../src/llm/mock.js";
import type { LLMProvider } from "../../src/llm/provider.js";
import { MentorService } from "../../src/mentor/service.js";
import { MemoryMentorStore } from "../../src/mentor/store.js";
import { bearer, fixtureCatalogue, testApp } from "../integration/app.js";
import { roles, silentLogger } from "../helpers.js";
import { MemoryRevisionStore, MemoryStatsStore } from "../../src/analytics/stores.js";
import { MemoryProgressStore } from "../../src/dsa/progressStore.js";
import { AnalyticsService } from "../../src/analytics/service.js";
import { DsaProgressService } from "../../src/dsa/progressService.js";
import { MemorySubmissionStore } from "../../src/code/submissionStore.js";
import { MemoryStore } from "../../src/store/memoryStore.js";
import { FakeGithub, NOW, type FakeAccount } from "./fakeGithub.js";

export const TEST_KEY = Buffer.alloc(32, 7).toString("base64");
export const OTHER_KEY = Buffer.alloc(32, 9).toString("base64");
export const REDIRECT = "http://localhost:8080/api/github/oauth/callback";
export const FRONTEND = "http://localhost:5173";

export interface Harness {
  app: Express;
  gh: FakeGithub;
  store: GithubStore;
  service: GithubService;
  clock: { now: Date };
  mentorStore: MemoryMentorStore;
  analytics: AnalyticsService;
  vault: TokenVault;
  /** Runs the whole connect round trip for a student: returns the callback redirect location. */
  connect(uid: string, account: FakeAccount): Promise<string>;
  /** Another service instance over the same store, with its own fetch for GraphQL and/or OAuth calls. */
  makeService(o: { graphqlFetch?: typeof fetch; oauthFetch?: typeof fetch; timeoutMs?: number; retries?: number }): GithubService;
  auth(uid: string): { Authorization: string };
}

export function harness(opts: { llm?: LLMProvider; store?: GithubStore; freshMinutes?: number; minSyncMinutes?: number; timeoutMs?: number; logger?: Logger; rateLimits?: RateLimitOptions } = {}): Harness {
  const gh = new FakeGithub();
  const store = opts.store ?? new MemoryGithubStore();
  const clock = { now: new Date(NOW) };
  const vault = new TokenVault(TEST_KEY);
  const service = new GithubService({
    store,
    gql: new GithubGraphQL({ fetchImpl: gh.fetch, retries: 2, sleep: async () => undefined, now: () => clock.now, timeoutMs: opts.timeoutMs }),
    oauth: new GithubOAuth({ clientId: "test-client-id", clientSecret: "test-client-secret", redirectUri: REDIRECT, fetchImpl: gh.fetch }),
    vault,
    logger: opts.logger ?? silentLogger,
    frontendUrl: FRONTEND,
    now: () => clock.now,
    freshMinutes: opts.freshMinutes,
    minSyncIntervalMinutes: opts.minSyncMinutes,
  });

  // The same stores the app uses, so tests can check that GitHub never touches DSA analytics.
  const catalogue = fixtureCatalogue();
  const statsStore = new MemoryStatsStore();
  const revisionStore = new MemoryRevisionStore();
  const dsaProgress = new DsaProgressService(new MemoryProgressStore(), () => catalogue);
  const analytics = new AnalyticsService({ stats: statsStore, revisions: revisionStore, submissions: new MemorySubmissionStore(), progress: dsaProgress, catalogue: () => catalogue, logger: silentLogger });
  const mentorStore = new MemoryMentorStore();
  const sessions = new MemoryStore();
  const mentor = new MentorService({
    store: mentorStore,
    llm: opts.llm ?? new MockProvider(),
    stats: statsStore,
    revisions: revisionStore,
    analytics,
    progress: dsaProgress,
    catalogue: () => catalogue,
    sessions,
    roles,
    logger: opts.logger ?? silentLogger,
    now: () => clock.now,
    github: service,
  });
  const app = testApp({ llm: opts.llm, github: service, mentor, analytics, statsStore, revisionStore, store: sessions, catalogue, autoAuth: false, rateLimits: opts.rateLimits });

  const auth = (uid: string) => ({ Authorization: bearer(uid) });
  async function connect(uid: string, account: FakeAccount): Promise<string> {
    const start = await request(app).post("/api/github/connect").set(auth(uid)).send({});
    if (start.status !== 200) throw new Error(`connect failed: ${start.status} ${JSON.stringify(start.body)}`);
    const u = new URL(start.body.authorize_url as string);
    const code = gh.addAccount(account);
    gh.registerChallenge(code, u.searchParams.get("code_challenge") ?? "");
    const cb = await request(app).get("/api/github/oauth/callback").query({ code, state: u.searchParams.get("state") ?? "" });
    return cb.headers.location as string;
  }
  const makeService: Harness["makeService"] = (o) =>
    new GithubService({
      store,
      gql: new GithubGraphQL({ fetchImpl: o.graphqlFetch ?? gh.fetch, timeoutMs: o.timeoutMs, retries: o.retries ?? 0, sleep: async () => undefined, now: () => clock.now }),
      oauth: new GithubOAuth({ clientId: "test-client-id", clientSecret: "test-client-secret", redirectUri: REDIRECT, fetchImpl: o.oauthFetch ?? gh.fetch }),
      vault,
      logger: silentLogger,
      frontendUrl: FRONTEND,
      now: () => clock.now,
    });
  return { app, gh, store, service, clock, mentorStore, analytics, vault, connect, makeService, auth };
}

export const alice = (over: Partial<FakeAccount> = {}): FakeAccount => ({ id: 1001, login: "alice", repos: [], ...over });
