import { describe, expect, it } from "vitest";
import { githubRedirectProblem, loadConfig } from "../../src/config.js";

const KEY = Buffer.alloc(32, 5).toString("base64");
const base = { LLM_MODE: "mock" };
const full = { ...base, GITHUB_CLIENT_ID: "cid", GITHUB_CLIENT_SECRET: "sec", GITHUB_REDIRECT_URI: "http://localhost:8080/api/github/oauth/callback", GITHUB_TOKEN_ENCRYPTION_KEY: KEY };
const prod = { ...base, NODE_ENV: "production", CORS_ORIGIN: "https://app.example.com", FIREBASE_PROJECT_ID: "p", STORE: "firestore" };

describe("GitHub configuration", () => {
  it("is optional: with nothing set the feature is simply off", () => {
    const c = loadConfig(base);
    expect(c.GITHUB_CLIENT_ID).toBeUndefined();
    expect(c.GITHUB_FRESH_MINUTES).toBe(360);
    expect(c.GITHUB_MIN_SYNC_INTERVAL_MINUTES).toBe(5);
  });

  it("accepts a complete configuration", () => {
    expect(loadConfig(full).GITHUB_REDIRECT_URI).toContain("/api/github/oauth/callback");
  });

  it("refuses a half-configured setup and names what is missing (never the values)", () => {
    expect(() => loadConfig({ ...base, GITHUB_CLIENT_ID: "cid" })).toThrow(/GITHUB_CLIENT_SECRET, GITHUB_REDIRECT_URI, GITHUB_TOKEN_ENCRYPTION_KEY/);
    const { GITHUB_CLIENT_SECRET: _s, ...noSecret } = full;
    try {
      loadConfig(noSecret);
      expect.unreachable();
    } catch (e) {
      expect(String(e)).toContain("GITHUB_CLIENT_SECRET");
      expect(String(e)).not.toContain(KEY);
    }
  });

  it("requires a real 32-byte key, including for retired keys", () => {
    expect(() => loadConfig({ ...full, GITHUB_TOKEN_ENCRYPTION_KEY: "short" })).toThrow(/32 random bytes/);
    expect(() => loadConfig({ ...full, GITHUB_TOKEN_ENCRYPTION_KEY_RETIRED: "short" })).toThrow(/retired key/);
    expect(loadConfig({ ...full, GITHUB_TOKEN_ENCRYPTION_KEY_RETIRED: `${KEY}, ${Buffer.alloc(32, 6).toString("base64")}` })).toBeTruthy();
  });

  it("requires https for the callback in production, and no credentials, query or fragment ever", () => {
    expect(githubRedirectProblem("http://localhost:8080/cb", false)).toBeNull();
    expect(githubRedirectProblem("http://localhost:8080/cb", true)).toMatch(/https/);
    expect(githubRedirectProblem("http://app.example.com/cb", false)).toMatch(/https/);
    expect(githubRedirectProblem("https://app.example.com/api/github/oauth/callback", true)).toBeNull();
    expect(githubRedirectProblem("https://u:p@app.example.com/cb", true)).toMatch(/credentials/);
    expect(githubRedirectProblem("https://app.example.com/cb?x=1", true)).toMatch(/query/);
    expect(githubRedirectProblem("not a url", false)).toMatch(/valid URL/);
    expect(() => loadConfig({ ...prod, ...full })).toThrow(/https/);
    expect(loadConfig({ ...prod, ...full, GITHUB_REDIRECT_URI: "https://api.example.com/api/github/oauth/callback" })).toBeTruthy();
  });

  it("validates the post-connect origin and the tuning knobs", () => {
    expect(() => loadConfig({ ...full, GITHUB_FRONTEND_URL: "https://app.example.com/path" })).toThrow(/bare origin/);
    expect(() => loadConfig({ ...full, GITHUB_FRONTEND_URL: "*" })).toThrow(/bare origin/);
    expect(loadConfig({ ...full, GITHUB_FRONTEND_URL: "https://app.example.com" }).GITHUB_FRONTEND_URL).toBe("https://app.example.com");
    expect(() => loadConfig({ ...full, GITHUB_MIN_SYNC_INTERVAL_MINUTES: "0" })).toThrow();
    expect(() => loadConfig({ ...full, GITHUB_FRESH_MINUTES: "5" })).toThrow();
  });
});
