import { ApiError } from "./types";
import type { ApiErrorBody } from "@/types/contract";

export interface RequestOptions extends RequestInit {
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;

export interface AuthHooks {
  /** Resolves with a fresh Firebase ID token, or null when signed out. */
  getToken: () => Promise<string | null>;
  /** A Firebase App Check token, or null when App Check isn't configured. */
  getAppCheckToken?: () => Promise<string | null>;
  /** Called when the backend answers 401 to a request that carried a token (expired or revoked). */
  onUnauthorized: () => void;
}

let authHooks: AuthHooks | null = null;

/** Installed by AuthProvider. The token is only ever sent in the Authorization header. */
export function setAuthHooks(hooks: AuthHooks | null): void {
  authHooks = hooks;
}

/**
 * Base URL resolution:
 * Uses import.meta.env.VITE_API_URL if set; otherwise defaults to empty string for relative proxying.
 */
function getApiBaseUrl(): string {
  const envUrl = import.meta.env.VITE_API_URL;
  if (!envUrl) {
    return "/api";
  }
  // Trim trailing slash if present
  const cleaned = envUrl.replace(/\/+$/, "");
  return `${cleaned}/api`;
}

/**
 * Low-level HTTP transport client.
 * Features:
 * - Centralized /api base path
 * - Automatic timeout with AbortController (default 30 seconds)
 * - Normalized backend error preservation (ApiError with code, message, and status)
 * - JSON serialization / deserialization
 */
export async function apiClient<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, headers, ...customConfig } = options;
  const baseUrl = getApiBaseUrl();
  const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const url = `${baseUrl}${cleanEndpoint}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  // Link caller-provided signal if present
  if (customConfig.signal) {
    customConfig.signal.addEventListener("abort", () => {
      controller.abort();
    });
  }

  const defaultHeaders: HeadersInit = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  let token: string | null = null;
  try {
    token = (await authHooks?.getToken()) ?? null;
  } catch {
    token = null; // a failed token refresh surfaces as a 401 from the server, handled below
  }
  if (token) (defaultHeaders as Record<string, string>).Authorization = `Bearer ${token}`;
  try {
    const appCheck = (await authHooks?.getAppCheckToken?.()) ?? null;
    if (appCheck) (defaultHeaders as Record<string, string>)["X-Firebase-AppCheck"] = appCheck;
  } catch {
    // no App Check token: the backend decides
  }

  try {
    const response = await fetch(url, {
      ...customConfig,
      headers: {
        ...defaultHeaders,
        ...headers,
      },
      signal: controller.signal,
    });

    // Handle 204 No Content
    if (response.status === 204) {
      return undefined as unknown as T;
    }

    const contentType = response.headers.get("content-type");
    const isJson = contentType && contentType.includes("application/json");

    if (response.status === 401 && token) authHooks?.onUnauthorized();

    if (!response.ok) {
      if (isJson) {
        try {
          const errorBody = (await response.json()) as ApiErrorBody;
          if (errorBody && errorBody.error) {
            throw new ApiError(
              errorBody.error.message || response.statusText,
              errorBody.error.code || "INTERNAL",
              response.status
            );
          }
        } catch (parseError) {
          if (parseError instanceof ApiError) {
            throw parseError;
          }
          // If JSON parse failed, throw HTTP status error
        }
      }
      throw new ApiError(
        `HTTP Error ${response.status}: ${response.statusText}`,
        response.status === 404 ? "NOT_FOUND" : "INTERNAL",
        response.status
      );
    }

    if (isJson) {
      return (await response.json()) as T;
    }

    return (await response.text()) as unknown as T;
  } catch (err: unknown) {
    if (err instanceof ApiError) {
      throw err;
    }

    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ApiError(
        "Request timed out after 30 seconds",
        "LLM_TIMEOUT",
        504
      );
    }

    const message = err instanceof Error ? err.message : "Network error";
    throw new ApiError(message, "INTERNAL", 500);
  } finally {
    clearTimeout(timeoutId);
  }
}
