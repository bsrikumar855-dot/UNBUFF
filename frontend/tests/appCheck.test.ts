import { afterEach, describe, expect, it, vi } from "vitest";
import { apiClient, setAuthHooks } from "@/api/client";
import { ApiError } from "@/api/types";
import { connectSrc, cspMetaTag } from "@/lib/csp";

const ok = () =>
  vi.fn().mockResolvedValue({ ok: true, status: 200, statusText: "OK", headers: { get: () => "application/json" }, json: async () => ({}) });
const sentHeaders = (fetchMock: ReturnType<typeof vi.fn>) => (fetchMock.mock.calls[0]![1] as { headers: Record<string, string> }).headers;

describe("App Check header", () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    setAuthHooks(null);
  });

  it("attaches the App Check token next to the ID token when one is available", async () => {
    global.fetch = ok();
    setAuthHooks({ getToken: async () => "id-token", getAppCheckToken: async () => "app-check-token", onUnauthorized: vi.fn() });
    await apiClient("/me/profile");
    const headers = sentHeaders(global.fetch as ReturnType<typeof vi.fn>);
    expect(headers.Authorization).toBe("Bearer id-token");
    expect(headers["X-Firebase-AppCheck"]).toBe("app-check-token");
  });

  it("sends the request without it when App Check is off or fails", async () => {
    global.fetch = ok();
    setAuthHooks({ getToken: async () => null, getAppCheckToken: async () => Promise.reject(new Error("recaptcha blocked")), onUnauthorized: vi.fn() });
    await apiClient("/roles");
    expect(sentHeaders(global.fetch as ReturnType<typeof vi.fn>)["X-Firebase-AppCheck"]).toBeUndefined();
  });

  it("an App Check refusal is a 403 and never signs the student out", async () => {
    const onUnauthorized = vi.fn();
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      statusText: "Forbidden",
      headers: { get: () => "application/json" },
      json: async () => ({ error: { code: "APP_CHECK_FAILED", message: "x" } }),
    });
    setAuthHooks({ getToken: async () => "id-token", onUnauthorized });
    await expect(apiClient("/sessions")).rejects.toMatchObject({ code: "APP_CHECK_FAILED", status: 403 } satisfies Partial<ApiError>);
    expect(onUnauthorized).not.toHaveBeenCalled();
  });
});

describe("connect-src for the built page", () => {
  it("allows only this app, the API origin and Firebase sign-in", () => {
    expect(connectSrc({ VITE_API_URL: "https://api.unbluff.app/" }, { production: true })).toBe(
      "'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://api.unbluff.app"
    );
  });

  it("adds App Check and reCAPTCHA only when App Check is configured", () => {
    const withKey = connectSrc({ VITE_API_URL: "https://api.unbluff.app", VITE_FIREBASE_APPCHECK_SITE_KEY: "k" }, { production: true });
    expect(withKey).toContain("https://content-firebaseappcheck.googleapis.com");
    expect(withKey).toContain("https://www.google.com/recaptcha/");
    expect(connectSrc({ VITE_API_URL: "https://api.unbluff.app" }, { production: true })).not.toContain("recaptcha");
  });

  it("uses the same origin when no API URL is set (relative /api)", () => {
    expect(connectSrc({}, { production: true })).toBe("'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com");
  });

  it("refuses a production build with a plain-http API or the emulator", () => {
    expect(() => connectSrc({ VITE_API_URL: "http://api.unbluff.app" }, { production: true })).toThrow(/must use https/);
    expect(() => connectSrc({ VITE_API_URL: "not a url" }, { production: true })).toThrow(/not a valid URL/);
    expect(() => connectSrc({ VITE_FIREBASE_AUTH_EMULATOR_URL: "http://127.0.0.1:9099" }, { production: true })).toThrow(/EMULATOR_URL must not be set/);
    expect(connectSrc({ VITE_API_URL: "http://localhost:8094", VITE_FIREBASE_AUTH_EMULATOR_URL: "http://127.0.0.1:9099" }, { production: false })).toContain("http://127.0.0.1:9099");
  });

  it("renders a meta tag with only connect-src", () => {
    expect(cspMetaTag({}, { production: true })).toMatch(/^<meta http-equiv="Content-Security-Policy" content="connect-src 'self' [^"]+" \/>$/);
  });
});
