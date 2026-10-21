import { apiClient } from "./client";
import type {
  CareerFacetsResponse,
  CareerFeedResponse,
  CareerJobDetailResponse,
  CareerPreferences,
  CareerPreferencesResponse,
  CareerTab,
  CareerTrackedItem,
  CareerTrackedResponse,
  CareerTrackerUpdate,
  HealthResponse,
  LeetCodeConnectionResponse,
  LeetCodeHistoryResponse,
  LeetCodeImportConfirmRequest,
  LeetCodeImportConfirmResponse,
  LeetCodeLookupStatusResponse,
  LeetCodeImportPreview,
  LeetCodeImportRequest,
  LeetCodeInsightsResponse,
  LeetCodeUnlinkResponse,
  ResumeSkillsExtractResponse,
  ResumeSkillsResponse,
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
  PlacementProfile,
  PlacementProfileResponse,
  PlacementDashboard,
  PlacementGenerateRequest,
  PlacementTask,
  PlacementTaskActionRequest,
  PlacementAssistantResponse,
  PlacementApplyChangeRequest,
  PlacementApplyChangeResponse,
  LabModulesResponse,
  LabModuleDetail,
  LabExercise,
  LabTrainingSchemaResponse,
  LabExecuteRequest,
  LabExecuteResponse,
  LabHintResponse,
  LabSubmitRequest,
  LabSubmitResponse,
  LabProgressResponse,
  LabAttemptsResponse,
  LabResetResponse,
  LabHelpRequest,
  LabHelpResponse,
  GithubConnection,
  GithubConnectResponse,
  GithubDisconnectResponse,
  GithubSyncResponse,
  GithubContributionsResponse,
  GithubRepositoriesResponse,
  GithubActivityResponse,
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

export type CareerFeedParams = {
  tab: CareerTab;
  q?: string;
  search_in?: "all" | "title" | "company";
  category?: string[];
  skills?: string[];
  skills_mode?: "and";
  countries?: string[];
  cities?: string[];
  work_mode?: string[];
  seniority?: string[];
  employment_type?: string[];
  include_stale?: boolean;
  tech_only?: boolean;
  broaden?: boolean;
  sort?: "best_match" | "newest";
  posted_within_days?: number;
  salary_min?: number;
  offset?: number;
  limit?: number;
};

/** Lists become comma-separated values and empty values are left out, so the URL carries exactly what the student chose. */
function careerQuery(params: object): string {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0)) continue;
    out[k] = Array.isArray(v) ? v.join(",") : typeof v === "boolean" ? String(v) : (v as string | number);
  }
  return queryString(out);
}

export const api = {
  /** GET /api/leetcode/connection: the saved username, what is imported, and what is (not) true about the link. */
  async getLeetCodeConnection(): Promise<LeetCodeConnectionResponse> {
    return apiClient<LeetCodeConnectionResponse>("/leetcode/connection", { method: "GET" });
  },
  /** PUT /api/leetcode/connection: saves a username. Nothing is looked up or verified. */
  async linkLeetCode(profile: string): Promise<LeetCodeConnectionResponse> {
    return apiClient<LeetCodeConnectionResponse>("/leetcode/connection", { method: "PUT", body: JSON.stringify({ profile }) });
  },
  /** DELETE /api/leetcode/connection: removes the link, and with mode "all" every imported snapshot. */
  async unlinkLeetCode(mode: "link" | "all"): Promise<LeetCodeUnlinkResponse> {
    return apiClient<LeetCodeUnlinkResponse>(`/leetcode/connection?mode=${mode}`, { method: "DELETE" });
  },
  /** GET /api/leetcode/lookup: whether the operator enabled the unofficial lookup of public solved counts by username. */
  getLeetCodeLookup(): Promise<LeetCodeLookupStatusResponse> {
    return apiClient<LeetCodeLookupStatusResponse>("/leetcode/lookup", { method: "GET" });
  },
  /** POST /api/leetcode/lookup: fetches the linked username's public solved counts and stores them as a labelled snapshot. */
  lookupLeetCode(): Promise<LeetCodeImportConfirmResponse> {
    return apiClient<LeetCodeImportConfirmResponse>("/leetcode/lookup", { method: "POST" });
  },
  /** POST /api/leetcode/import/preview: validates the student's own data. Nothing is stored. */
  async previewLeetCodeImport(body: LeetCodeImportRequest): Promise<LeetCodeImportPreview> {
    return apiClient<LeetCodeImportPreview>("/leetcode/import/preview", { method: "POST", body: JSON.stringify(body) });
  },
  /** POST /api/leetcode/import/confirm: stores exactly what was previewed (the same data is never stored twice). */
  async confirmLeetCodeImport(body: LeetCodeImportConfirmRequest): Promise<LeetCodeImportConfirmResponse> {
    return apiClient<LeetCodeImportConfirmResponse>("/leetcode/import/confirm", { method: "POST", body: JSON.stringify(body) });
  },
  async getLeetCodeInsights(): Promise<LeetCodeInsightsResponse> {
    return apiClient<LeetCodeInsightsResponse>("/leetcode/insights", { method: "GET" });
  },
  async getLeetCodeHistory(): Promise<LeetCodeHistoryResponse> {
    return apiClient<LeetCodeHistoryResponse>("/leetcode/import-history", { method: "GET" });
  },
  async deleteLeetCodeSnapshot(id: string): Promise<void> {
    await apiClient<void>(`/leetcode/import-history/${encodeURIComponent(id)}`, { method: "DELETE" });
  },

  /**
   * GET /api/health
   */
  async getHealth(): Promise<HealthResponse> {
    return apiClient<HealthResponse>("/health", { method: "GET" });
  },

  /** GET /api/career/jobs: Freehire listings, matched against the student's own profile. */
  async getCareerJobs(params: CareerFeedParams): Promise<CareerFeedResponse> {
    return apiClient<CareerFeedResponse>(`/career/jobs${careerQuery(params)}`, { method: "GET", timeoutMs: 30_000 });
  },
  async getCareerJob(slug: string): Promise<CareerJobDetailResponse> {
    return apiClient<CareerJobDetailResponse>(`/career/jobs/${encodeURIComponent(slug)}`, { method: "GET", timeoutMs: 30_000 });
  },
  async getCareerFacets(params: Omit<CareerFeedParams, "tab" | "offset" | "limit"> = {}): Promise<CareerFacetsResponse> {
    return apiClient<CareerFacetsResponse>(`/career/facets${careerQuery(params)}`, { method: "GET", timeoutMs: 30_000 });
  },
  async getCareerPreferences(): Promise<CareerPreferencesResponse> {
    return apiClient<CareerPreferencesResponse>("/career/preferences", { method: "GET" });
  },
  async putCareerPreferences(preferences: CareerPreferences): Promise<CareerPreferencesResponse> {
    return apiClient<CareerPreferencesResponse>("/career/preferences", { method: "PUT", body: JSON.stringify(preferences) });
  },
  /** POST /api/career/resume-skills/extract: suggestions only. The text is read, not stored. */
  async extractResumeSkills(text: string): Promise<ResumeSkillsExtractResponse> {
    return apiClient<ResumeSkillsExtractResponse>("/career/resume-skills/extract", { method: "POST", body: JSON.stringify({ text }), timeoutMs: 30_000 });
  },
  async getResumeSkills(): Promise<ResumeSkillsResponse> {
    return apiClient<ResumeSkillsResponse>("/career/resume-skills", { method: "GET" });
  },
  /** PUT /api/career/resume-skills: replaces the skills the student confirmed from their resume. */
  async saveResumeSkills(skills: string[]): Promise<ResumeSkillsResponse> {
    return apiClient<ResumeSkillsResponse>("/career/resume-skills", { method: "PUT", body: JSON.stringify({ skills }) });
  },
  async deleteResumeSkills(): Promise<void> {
    await apiClient<void>("/career/resume-skills", { method: "DELETE" });
  },
  async getCareerTracked(filter: "saved" | "applications" | "all" = "all"): Promise<CareerTrackedResponse> {
    return apiClient<CareerTrackedResponse>(`/career/tracked?filter=${filter}`, { method: "GET" });
  },
  /** PUT /api/career/tracked/:slug: bookmark, status, dates and private notes for one listing. */
  async updateCareerTracked(slug: string, update: CareerTrackerUpdate): Promise<{ item: CareerTrackedItem | null }> {
    return apiClient<{ item: CareerTrackedItem | null }>(`/career/tracked/${encodeURIComponent(slug)}`, { method: "PUT", body: JSON.stringify(update), timeoutMs: 30_000 });
  },
  async removeCareerTracked(slug: string, mode: "bookmark" | "all"): Promise<void> {
    await apiClient<void>(`/career/tracked/${encodeURIComponent(slug)}?mode=${mode}`, { method: "DELETE" });
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

  /** Unified placement planner: everything is calculated by the backend from stored records. */
  async getPlacementProfile(): Promise<PlacementProfileResponse> {
    return apiClient<PlacementProfileResponse>("/placement/profile", { method: "GET" });
  },
  async putPlacementProfile(profile: PlacementProfile): Promise<PlacementProfileResponse> {
    return apiClient<PlacementProfileResponse>("/placement/profile", { method: "PUT", body: JSON.stringify(profile) });
  },
  async getPlacementDashboard(): Promise<PlacementDashboard> {
    return apiClient<PlacementDashboard>("/placement/dashboard", { method: "GET" });
  },
  async refreshPlacement(): Promise<PlacementDashboard> {
    return apiClient<PlacementDashboard>("/placement/refresh", { method: "POST", body: JSON.stringify({}) });
  },
  async generatePlacementPlan(body: PlacementGenerateRequest = {}): Promise<PlacementDashboard> {
    return apiClient<PlacementDashboard>("/placement/plan/generate", { method: "POST", body: JSON.stringify(body) });
  },
  async placementTaskAction(taskId: string, body: PlacementTaskActionRequest): Promise<PlacementTask> {
    return apiClient<PlacementTask>(`/placement/tasks/${encodeURIComponent(taskId)}/action`, { method: "POST", body: JSON.stringify(body) });
  },
  async placementAssistant(message: string): Promise<PlacementAssistantResponse> {
    return apiClient<PlacementAssistantResponse>("/placement/assistant", { method: "POST", body: JSON.stringify({ message }) });
  },
  async applyPlacementChange(change: PlacementApplyChangeRequest["change"]): Promise<PlacementApplyChangeResponse> {
    return apiClient<PlacementApplyChangeResponse>("/placement/changes/apply", { method: "POST", body: JSON.stringify({ change }) });
  },
  async deletePlacementData(): Promise<void> {
    return apiClient<void>("/placement/data", { method: "DELETE" });
  },

  /** GraphQL Learning Lab: runs only against the Lab's own training API. */
  async getLabModules(): Promise<LabModulesResponse> {
    return apiClient<LabModulesResponse>("/graphql-lab/modules", { method: "GET" });
  },
  async getLabModule(id: string): Promise<LabModuleDetail> {
    return apiClient<LabModuleDetail>(`/graphql-lab/modules/${encodeURIComponent(id)}`, { method: "GET" });
  },
  async getLabExercise(id: string): Promise<LabExercise> {
    return apiClient<LabExercise>(`/graphql-lab/exercises/${encodeURIComponent(id)}`, { method: "GET" });
  },
  async getLabTrainingSchema(): Promise<LabTrainingSchemaResponse> {
    return apiClient<LabTrainingSchemaResponse>("/graphql-lab/training-schema", { method: "GET" });
  },
  async executeLab(body: LabExecuteRequest): Promise<LabExecuteResponse> {
    return apiClient<LabExecuteResponse>("/graphql-lab/execute", { method: "POST", body: JSON.stringify(body) });
  },
  async hintLab(exerciseId: string): Promise<LabHintResponse> {
    return apiClient<LabHintResponse>(`/graphql-lab/exercises/${encodeURIComponent(exerciseId)}/hint`, { method: "POST", body: JSON.stringify({}) });
  },
  async submitLab(exerciseId: string, body: LabSubmitRequest): Promise<LabSubmitResponse> {
    return apiClient<LabSubmitResponse>(`/graphql-lab/exercises/${encodeURIComponent(exerciseId)}/submit`, { method: "POST", body: JSON.stringify(body) });
  },
  async getLabProgress(): Promise<LabProgressResponse> {
    return apiClient<LabProgressResponse>("/graphql-lab/progress", { method: "GET" });
  },
  async getLabAttempts(exerciseId?: string): Promise<LabAttemptsResponse> {
    return apiClient<LabAttemptsResponse>(`/graphql-lab/attempts${exerciseId ? `?exercise_id=${encodeURIComponent(exerciseId)}` : ""}`, { method: "GET" });
  },
  async resetLabTrainingData(): Promise<LabResetResponse> {
    return apiClient<LabResetResponse>("/graphql-lab/training-data/reset", { method: "POST", body: JSON.stringify({}) });
  },
  async deleteLabProgress(): Promise<void> {
    return apiClient<void>("/graphql-lab/progress", { method: "DELETE" });
  },
  async labHelp(body: LabHelpRequest): Promise<LabHelpResponse> {
    return apiClient<LabHelpResponse>("/graphql-lab/help", { method: "POST", body: JSON.stringify(body) });
  },

  /** GitHub (read-only, public data). The token never reaches the browser. */
  async getGithubConnection(): Promise<GithubConnection> {
    return apiClient<GithubConnection>("/github/connection", { method: "GET" });
  },
  async connectGithub(): Promise<GithubConnectResponse> {
    return apiClient<GithubConnectResponse>("/github/connect", { method: "POST", body: JSON.stringify({}) });
  },
  async disconnectGithub(): Promise<GithubDisconnectResponse> {
    return apiClient<GithubDisconnectResponse>("/github/connection", { method: "DELETE" });
  },
  async syncGithub(): Promise<GithubSyncResponse> {
    return apiClient<GithubSyncResponse>("/github/sync", { method: "POST", body: JSON.stringify({}) });
  },
  async getGithubContributions(): Promise<GithubContributionsResponse> {
    return apiClient<GithubContributionsResponse>("/github/contributions", { method: "GET" });
  },
  async getGithubRepositories(): Promise<GithubRepositoriesResponse> {
    return apiClient<GithubRepositoriesResponse>("/github/repositories", { method: "GET" });
  },
  async getGithubActivity(): Promise<GithubActivityResponse> {
    return apiClient<GithubActivityResponse>("/github/activity", { method: "GET" });
  },

  /**
   * GET /api/demo/report
   * Retrieves the verbatim frozen demo report for preview / offline demo mode.
   */
  async getDemoReport(): Promise<Report> {
    return apiClient<Report>("/demo/report", { method: "GET" });
  },
};
