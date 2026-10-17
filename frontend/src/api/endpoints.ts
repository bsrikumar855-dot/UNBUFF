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
  SessionsResponse,
  CompaniesResponse,
  CompanyDetailResponse,
  QuestionsResponse,
  QuestionDetailResponse,
  DsaProgress,
  DsaProgressListResponse,
  DsaProgressUpdate,
  CodeLanguagesResponse,
  CodeExerciseResponse,
  CodeRunRequest,
  CodeRunResponse,
  CodeSubmitRequest,
  CodeSubmission,
  CodeSubmissionDetail,
  CodeSubmissionsResponse,
  DsaAnalyticsResponse,
  RevisionQueueResponse,
  RevisionItem,
  RevisionActionRequest,
  MentorChatRequest,
  MentorChatResponse,
  MentorConversation,
  MentorConversationsResponse,
  MentorMemoriesResponse,
  MentorMemory,
  MentorProfile,
  MentorProfileResponse,
  MemoryType,
  GoalTrack,
  LearningSignal,
} from "@/types/contract";

/**
 * UNBLUFF API Service Layer
 * Strict 1:1 mapping with frozen endpoints in CONTRACT.md §5.
 * This is a thin transport layer with zero local scoring or business decisions.
 */
function queryString(params: Record<string, string | number | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : "";
}

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

  /** GET /api/companies: public catalogue, searched and paginated on the server. */
  async getCompanies(params: Record<string, string | number | undefined> = {}): Promise<CompaniesResponse> {
    return apiClient<CompaniesResponse>(`/companies${queryString(params)}`, { method: "GET" });
  },

  /** GET /api/companies/:companyId */
  async getCompany(companyId: string): Promise<CompanyDetailResponse> {
    return apiClient<CompanyDetailResponse>(`/companies/${encodeURIComponent(companyId)}`, { method: "GET" });
  },

  /** GET /api/questions (or /api/companies/:id/questions when `company` is given): server-side filters and paging. */
  async getQuestions(params: Record<string, string | number | undefined> = {}): Promise<QuestionsResponse> {
    return apiClient<QuestionsResponse>(`/questions${queryString(params)}`, { method: "GET" });
  },

  /** GET /api/questions/:questionId */
  async getQuestion(questionId: string): Promise<QuestionDetailResponse> {
    return apiClient<QuestionDetailResponse>(`/questions/${encodeURIComponent(questionId)}`, { method: "GET" });
  },

  /** POST /api/mentor/chat: one mentoring turn. Resending the same client_message_id is safe. */
  async mentorChat(payload: MentorChatRequest): Promise<MentorChatResponse> {
    return apiClient<MentorChatResponse>("/mentor/chat", { method: "POST", body: JSON.stringify(payload), timeoutMs: 60_000 });
  },

  async listMentorConversations(page = 1): Promise<MentorConversationsResponse> {
    return apiClient<MentorConversationsResponse>(`/mentor/conversations?page=${page}&page_size=20`, { method: "GET" });
  },

  async getMentorConversation(id: string): Promise<MentorConversation> {
    return apiClient<MentorConversation>(`/mentor/conversations/${encodeURIComponent(id)}`, { method: "GET" });
  },

  /** DELETE /api/mentor/conversations/:id (also removes its summary memory unless keepSummary). */
  async deleteMentorConversation(id: string, keepSummary = false): Promise<void> {
    return apiClient<void>(`/mentor/conversations/${encodeURIComponent(id)}${keepSummary ? "?keep_summary=true" : ""}`, { method: "DELETE" });
  },

  async listMentorMemories(params: { type?: MemoryType; page?: number; page_size?: number } = {}): Promise<MentorMemoriesResponse> {
    return apiClient<MentorMemoriesResponse>(`/mentor/memories${queryString(params)}`, { method: "GET" });
  },

  async createMentorMemory(body: { type: "goal" | "learning"; content: string; topic?: string; signal?: LearningSignal; track?: GoalTrack }): Promise<MentorMemory> {
    return apiClient<MentorMemory>("/mentor/memories", { method: "POST", body: JSON.stringify(body) });
  },

  async patchMentorMemory(id: string, body: { content?: string; topic?: string | null; status?: "active" | "completed" | "dismissed" }): Promise<MentorMemory> {
    return apiClient<MentorMemory>(`/mentor/memories/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) });
  },

  async deleteMentorMemory(id: string): Promise<void> {
    return apiClient<void>(`/mentor/memories/${encodeURIComponent(id)}`, { method: "DELETE" });
  },

  /** DELETE /api/mentor/memories: clears every mentor memory, and the conversations too when asked. */
  async clearMentorMemories(includeConversations = false): Promise<void> {
    return apiClient<void>(`/mentor/memories${includeConversations ? "?conversations=true" : ""}`, { method: "DELETE" });
  },

  async getMentorProfile(): Promise<MentorProfileResponse> {
    return apiClient<MentorProfileResponse>("/mentor/profile", { method: "GET" });
  },

  async putMentorProfile(profile: MentorProfile): Promise<MentorProfileResponse> {
    return apiClient<MentorProfileResponse>("/mentor/profile", { method: "PUT", body: JSON.stringify(profile) });
  },

  /** GET /api/me/dsa-analytics: metrics from the student's own counted, judged submissions. */
  async getDsaAnalytics(weeks = 8): Promise<DsaAnalyticsResponse> {
    return apiClient<DsaAnalyticsResponse>(`/me/dsa-analytics?weeks=${weeks}`, { method: "GET" });
  },

  /** POST /api/me/dsa-analytics/refresh: rebuilds the caller's statistics from stored submissions. */
  async refreshDsaAnalytics(): Promise<DsaAnalyticsResponse> {
    return apiClient<DsaAnalyticsResponse>("/me/dsa-analytics/refresh", { method: "POST" });
  },

  /** GET /api/me/dsa-revision */
  async getRevisionQueue(params: { view?: "due" | "upcoming" | "all"; page?: number; page_size?: number } = {}): Promise<RevisionQueueResponse> {
    return apiClient<RevisionQueueResponse>(`/me/dsa-revision${queryString(params)}`, { method: "GET" });
  },

  /** POST /api/me/dsa-revision: add a suggested weak-topic question. */
  async addRevision(questionId: string): Promise<RevisionItem> {
    return apiClient<RevisionItem>("/me/dsa-revision", { method: "POST", body: JSON.stringify({ question_id: questionId }) });
  },

  /** POST /api/me/dsa-revision/:questionId/actions */
  async revisionAction(questionId: string, body: RevisionActionRequest): Promise<RevisionItem> {
    return apiClient<RevisionItem>(`/me/dsa-revision/${encodeURIComponent(questionId)}/actions`, { method: "POST", body: JSON.stringify(body) });
  },

  /** GET /api/code/languages: only what the execution service really offers. */
  async getCodeLanguages(): Promise<CodeLanguagesResponse> {
    return apiClient<CodeLanguagesResponse>("/code/languages", { method: "GET" });
  },

  /** GET /api/code/exercises/:questionId: samples and metadata; hidden tests never leave the server. */
  async getCodeExercise(questionId: string): Promise<CodeExerciseResponse> {
    return apiClient<CodeExerciseResponse>(`/code/exercises/${encodeURIComponent(questionId)}`, { method: "GET" });
  },

  /** POST /api/code/run: runs in the isolated service; never changes progress. */
  async runCode(payload: CodeRunRequest): Promise<CodeRunResponse> {
    return apiClient<CodeRunResponse>("/code/run", { method: "POST", body: JSON.stringify(payload), timeoutMs: 60_000 });
  },

  /** POST /api/code/submit: judged against hidden tests on the server. */
  async submitCode(payload: CodeSubmitRequest): Promise<CodeSubmission> {
    return apiClient<CodeSubmission>("/code/submit", { method: "POST", body: JSON.stringify(payload), timeoutMs: 120_000 });
  },

  /** GET /api/code/submissions: the signed-in student's own history. */
  async getCodeSubmissions(questionId?: string): Promise<CodeSubmissionsResponse> {
    return apiClient<CodeSubmissionsResponse>(`/code/submissions${questionId ? `?question_id=${encodeURIComponent(questionId)}` : ""}`, { method: "GET" });
  },

  /** GET /api/code/submissions/:id (includes the source). */
  async getCodeSubmission(id: string): Promise<CodeSubmissionDetail> {
    return apiClient<CodeSubmissionDetail>(`/code/submissions/${encodeURIComponent(id)}`, { method: "GET" });
  },

  /** DELETE /api/code/submissions/:id */
  async deleteCodeSubmission(id: string): Promise<void> {
    return apiClient<void>(`/code/submissions/${encodeURIComponent(id)}`, { method: "DELETE" });
  },

  /** GET /api/me/dsa-progress: the signed-in student's own records. */
  async getDsaProgress(): Promise<DsaProgressListResponse> {
    return apiClient<DsaProgressListResponse>("/me/dsa-progress", { method: "GET" });
  },

  /** PUT /api/me/dsa-progress/:questionId: creates or updates the single record for this question. */
  async putDsaProgress(questionId: string, update: DsaProgressUpdate): Promise<DsaProgress> {
    return apiClient<DsaProgress>(`/me/dsa-progress/${encodeURIComponent(questionId)}`, {
      method: "PUT",
      body: JSON.stringify(update),
    });
  },

  /** DELETE /api/me/dsa-progress/:questionId */
  async deleteDsaProgress(questionId: string): Promise<void> {
    return apiClient<void>(`/me/dsa-progress/${encodeURIComponent(questionId)}`, { method: "DELETE" });
  },

  /**
   * GET /api/sessions: the signed-in student's own sessions, newest first.
   */
  async getSessions(): Promise<SessionsResponse> {
    return apiClient<SessionsResponse>("/sessions", { method: "GET" });
  },

  /**
   * DELETE /api/sessions/:sessionId: deletes an owned session and its resume-derived data.
   */
  async deleteSession(sessionId: string): Promise<void> {
    return apiClient<void>(`/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" });
  },

  /**
   * GET /api/demo/report
   * Retrieves the verbatim frozen demo report for preview / offline demo mode.
   */
  async getDemoReport(): Promise<Report> {
    return apiClient<Report>("/demo/report", { method: "GET" });
  },
};
