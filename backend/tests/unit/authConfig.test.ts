import { describe, expect, it } from "vitest";
import { FirebaseTokenVerifier } from "../../src/auth/verifier.js";
import { loadConfig, parseServiceAccount } from "../../src/config.js";

const prod = {
  LLM_MODE: "mock",
  NODE_ENV: "production",
  CORS_ORIGIN: "https://app.example.com",
  FIREBASE_PROJECT_ID: "my-project",
  STORE: "firestore",
};

describe("production storage and auth configuration", () => {
  it("accepts a complete production config", () => {
    const c = loadConfig(prod);
    expect(c).toMatchObject({ STORE: "firestore", FIREBASE_PROJECT_ID: "my-project", ALLOW_EPHEMERAL_STORE: false });
  });

  it("never silently falls back to in-memory storage in production", () => {
    const { STORE: _store, ...unset } = prod;
    expect(() => loadConfig(unset)).toThrow(/STORE=firestore is required/);
    expect(() => loadConfig({ ...prod, STORE: "memory" })).toThrow(/STORE=firestore is required/);
  });

  it("allows memory in production only with an explicit opt-in", () => {
    expect(loadConfig({ ...prod, STORE: "memory", ALLOW_EPHEMERAL_STORE: "true" }).STORE).toBe("memory");
  });

  it("requires the Firebase project id in production", () => {
    const { FIREBASE_PROJECT_ID: _id, ...rest } = prod;
    expect(() => loadConfig(rest)).toThrow(/FIREBASE_PROJECT_ID is required/);
    expect(() => loadConfig({ ...prod, FIREBASE_PROJECT_ID: "  " })).toThrow(/FIREBASE_PROJECT_ID is required/);
  });

  it("local dev keeps memory storage and an emulator-style project id", () => {
    const c = loadConfig({ LLM_MODE: "mock" });
    expect(c).toMatchObject({ STORE: "memory", FIREBASE_PROJECT_ID: "demo-unbluff" });
  });

  it("validates the service-account secret without echoing it", () => {
    const bad = "{not json, private_key: SUPER-SECRET";
    let message = "";
    try {
      loadConfig({ ...prod, FIREBASE_SERVICE_ACCOUNT_JSON: bad });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toMatch(/FIREBASE_SERVICE_ACCOUNT_JSON must be a service-account JSON object/);
    expect(message).not.toContain("SUPER-SECRET");
    const good = JSON.stringify({ client_email: "a@b.iam.gserviceaccount.com", private_key: "k", project_id: "p" });
    expect(() => loadConfig({ ...prod, FIREBASE_SERVICE_ACCOUNT_JSON: good })).not.toThrow();
    expect(parseServiceAccount(good)).toMatchObject({ client_email: "a@b.iam.gserviceaccount.com", project_id: "p" });
    expect(parseServiceAccount("[]")).toBeNull();
    expect(parseServiceAccount(JSON.stringify({ client_email: "x" }))).toBeNull();
  });
});

describe("FirebaseTokenVerifier", () => {
  it("returns the uid the verifier produced and propagates rejection", async () => {
    const ok = new FirebaseTokenVerifier("p", async (t) => (t === "good" ? { uid: "u1" } : Promise.reject(new Error("expired"))));
    expect(await ok.verify("good")).toEqual({ uid: "u1" });
    await expect(ok.verify("bad")).rejects.toThrow();
  });

  it("builds an Admin SDK verifier from the project id alone and rejects garbage tokens", async () => {
    const v = new FirebaseTokenVerifier("demo-unbluff");
    await expect(v.verify("not.a.jwt")).rejects.toBeDefined();
  });
});
