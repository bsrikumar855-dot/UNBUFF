import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { apiClient } from "@/api/client";
import { ApiError } from "@/api/types";
import { api } from "@/api/endpoints";

describe("API Client & Endpoint Layer", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("normalizes backend contract errors with exact code and status", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
      headers: {
        get: (h: string) => (h === "content-type" ? "application/json" : null),
      },
      json: async () => ({
        error: {
          code: "ROLE_NOT_FOUND",
          message: "Role unknown_role not found",
        },
      }),
    });

    await expect(apiClient("/roles/unknown_role")).rejects.toThrowError(ApiError);

    try {
      await apiClient("/roles/unknown_role");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as ApiError;
      expect(apiErr.code).toBe("ROLE_NOT_FOUND");
      expect(apiErr.status).toBe(404);
      expect(apiErr.message).toBe("Role unknown_role not found");
    }
  });

  it("handles successful JSON responses across endpoints", async () => {
    const mockHealth = {
      status: "ok",
      llm_mode: "mock",
      model: null,
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: (h: string) => (h === "content-type" ? "application/json" : null),
      },
      json: async () => mockHealth,
    });

    const res = await api.getHealth();
    expect(res).toEqual(mockHealth);
  });

  it("times out and normalizes to LLM_TIMEOUT on request abort", async () => {
    // Mock fetch that aborts
    global.fetch = vi.fn().mockImplementation((_url, options) => {
      return new Promise((_, reject) => {
        if (options?.signal) {
          options.signal.addEventListener("abort", () => {
            const err = new DOMException("The operation was aborted", "AbortError");
            reject(err);
          });
        }
      });
    });

    // Run with 50ms timeout for test speed
    await expect(
      apiClient("/claims/extract", { timeoutMs: 50 })
    ).rejects.toThrowError(ApiError);

    try {
      await apiClient("/claims/extract", { timeoutMs: 50 });
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as ApiError;
      expect(apiErr.code).toBe("LLM_TIMEOUT");
      expect(apiErr.status).toBe(504);
    }
  });
});
