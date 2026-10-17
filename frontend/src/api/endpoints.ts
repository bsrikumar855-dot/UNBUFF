import { apiClient } from "./client";
import type {
  HealthResponse,
  RolesResponse,
  Role,
  ExtractRequest,
  ClaimsResponse,
  ConfirmRequest,
  InterrogateRequest,
  TurnResponse,
  Report,
  FixTaskRequest,
  FixTaskResponse,
} from "@/types/contract";

/**
 * UNBLUFF API Service Layer
 * Strict 1:1 mapping with frozen endpoints in CONTRACT.md §5.
 * This is a thin transport layer with zero local scoring or business decisions.
 */
export const api = {
  /**
   * GET /api/health
   */
  async getHealth(): Promise<HealthResponse> {
    return apiClient<HealthResponse>("/health", { method: "GET" });
  },

  /**
   * GET /api/roles
   */
  async getRoles(): Promise<RolesResponse> {
    return apiClient<RolesResponse>("/roles", { method: "GET" });
  },

  /**
   * GET /api/roles/:roleId
   */
  async getRole(roleId: string): Promise<Role> {
    return apiClient<Role>(`/roles/${encodeURIComponent(roleId)}`, {
      method: "GET",
    });
  },

  /**
   * POST /api/claims/extract
   * Creates the session and extracts claims from resume and/or declared skills.
   * `mode` ("prepare" | "defense") selects teach-as-you-go vs interview simulation.
   */
  async extractClaims(payload: ExtractRequest): Promise<ClaimsResponse> {
    return apiClient<ClaimsResponse>("/claims/extract", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  /**
   * POST /api/claims/confirm
   * Replaces/confirms the active claim list before interrogation begins.
   */
  async confirmClaims(payload: ConfirmRequest): Promise<ClaimsResponse> {
    return apiClient<ClaimsResponse>("/claims/confirm", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  /**
   * POST /api/interrogate
   * Drives both assessment and retest turns.
   * Empty answer starts/resumes claim; answer submits for grading.
   */
  async interrogate(payload: InterrogateRequest): Promise<TurnResponse> {
    return apiClient<TurnResponse>("/interrogate", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  /**
   * GET /api/report/:sessionId
   * Builds and fetches the full readiness report.
   */
  async getReport(sessionId: string): Promise<Report> {
    return apiClient<Report>(`/report/${encodeURIComponent(sessionId)}`, {
      method: "GET",
    });
  },

  /**
   * POST /api/fix-task
   * Generates a fix task for shaky, bluff, or honest_gap claims.
   */
  async getFixTask(payload: FixTaskRequest): Promise<FixTaskResponse> {
    return apiClient<FixTaskResponse>("/fix-task", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  /**
   * GET /api/demo/report
   * Retrieves the verbatim frozen demo report for preview / offline demo mode.
   */
  async getDemoReport(): Promise<Report> {
    return apiClient<Report>("/demo/report", { method: "GET" });
  },
};
