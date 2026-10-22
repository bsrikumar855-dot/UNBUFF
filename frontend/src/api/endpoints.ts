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
  PatternsResponse,
  PatternDetail,
  DbmsTopicsResponse,
  DbmsTopicDetail,
  DbmsQuizRequest,
  DbmsQuizResult,
  LearnProgressResponse,
  PatternProgressRequest,
  LeetCodeHistoryResponse,
  LeetCodeImportConfirmRequest,
  LeetCodeImportConfirmResponse,
  LeetCodeLookupStatusResponse,
  AtsRequest,
  AtsResult,
  ResumeCompileRequest,
  ResumeImportRequest,
  ResumeImportResponse,
  ResumeCompileResponse,
  ResumeResponse,
  ResumeSaveRequest,
  ResumeTemplatesResponse,
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
  SessionDetailResponse,
  AccountProfileResponse,
  AccountProfileUpdate,
  AccountExport,
  AccountDeleteResponse,
  UsageResponse,
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
  /** GET /api/resume: the saved LaTeX résumé, its freshly computed ATS score, and whether this server can build PDFs. */
  getResume(): Promise<ResumeResponse> {
    return apiClient<ResumeResponse>("/resume", { method: "GET" });
  },
  /** PUT /api/resume: saves the LaTeX, the target role and an optional job description. */
  saveResume(body: ResumeSaveRequest): Promise<ResumeResponse> {
    return apiClient<ResumeResponse>("/resume", { method: "PUT", body: JSON.stringify(body) });
  },
  /** DELETE /api/resume: removes the saved résumé. */
  async deleteResume(): Promise<void> {
    await apiClient<unknown>("/resume", { method: "DELETE" });
  },
  /** GET /api/resume/templates: ATS-friendly LaTeX starting points. */
  getResumeTemplates(): Promise<ResumeTemplatesResponse> {
    return apiClient<ResumeTemplatesResponse>("/resume/templates", { method: "GET" });
  },
  /** POST /api/resume/ats: scores the text without saving it (a heuristic estimate, not an employer's verdict). */
  scoreResume(body: AtsRequest): Promise<AtsResult> {
    return apiClient<AtsResult>("/resume/ats", { method: "POST", body: JSON.stringify(body) });
  },
  /** POST /api/resume/import: converts the text of an existing résumé (read from a PDF in the browser) into editable LaTeX. Nothing is stored. */
  importResume(body: ResumeImportRequest): Promise<ResumeImportResponse> {
    return apiClient<ResumeImportResponse>("/resume/import", { method: "POST", body: JSON.stringify(body) });
  },
  /** POST /api/resume/compile: builds the PDF in an isolated LaTeX container. A failed build is a normal result with the log. */
  compileResume(body: ResumeCompileRequest): Promise<ResumeCompileResponse> {
    return apiClient<ResumeCompileResponse>("/resume/compile", { method: "POST", body: JSON.stringify(body) });
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
   * GET /api/sessions/:sessionId: the full claim list and where the student left off (read-only, no LLM call).
   */
  async getSession(sessionId: string): Promise<SessionDetailResponse> {
    return apiClient<SessionDetailResponse>(`/sessions/${encodeURIComponent(sessionId)}`, { method: "GET" });
  },

  /**
   * DELETE /api/sessions/:sessionId: deletes an owned session and its resume-derived data.
   */
  async deleteSession(sessionId: string): Promise<void> {
    return apiClient<void>(`/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" });
  },

  /** Account: the student's own profile, a full JSON export, and deleting everything. */
  async getAccountProfile(): Promise<AccountProfileResponse> {
    return apiClient<AccountProfileResponse>("/me/profile", { method: "GET" });
  },
  async saveAccountProfile(profile: AccountProfileUpdate): Promise<AccountProfileResponse> {
    return apiClient<AccountProfileResponse>("/me/profile", { method: "PUT", body: JSON.stringify(profile) });
  },
  /** Today's AI allowance (UTC day). */
  async getUsage(): Promise<UsageResponse> {
    return apiClient<UsageResponse>("/me/usage", { method: "GET" });
  },
  /** Revokes every session of this account on every device (this one included). */
  async signOutEverywhere(): Promise<void> {
    await apiClient<unknown>("/me/sign-out-everywhere", { method: "POST" });
  },
  async exportAccount(): Promise<AccountExport> {
    return apiClient<AccountExport>("/me/export", { method: "GET", timeoutMs: 60_000 });
  },
  /** The phrase must be typed by the student; the server refuses anything else. */
  async deleteAccountData(confirm: string): Promise<AccountDeleteResponse> {
    return apiClient<AccountDeleteResponse>("/me", { method: "DELETE", body: JSON.stringify({ confirm }), timeoutMs: 60_000 });
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

  /** Learn: the pattern and DBMS lessons are public; progress and quizzes need sign-in. */
  async getLearnPatterns(): Promise<PatternsResponse> {
    return apiClient<PatternsResponse>("/learn/patterns", { method: "GET" });
  },
  async getLearnPattern(id: string): Promise<PatternDetail> {
    return apiClient<PatternDetail>(`/learn/patterns/${encodeURIComponent(id)}`, { method: "GET" });
  },
  async getDbmsTopics(): Promise<DbmsTopicsResponse> {
    return apiClient<DbmsTopicsResponse>("/learn/dbms", { method: "GET" });
  },
  async getDbmsTopic(id: string): Promise<DbmsTopicDetail> {
    return apiClient<DbmsTopicDetail>(`/learn/dbms/${encodeURIComponent(id)}`, { method: "GET" });
  },
  async getLearnProgress(): Promise<LearnProgressResponse> {
    return apiClient<LearnProgressResponse>("/learn/progress", { method: "GET" });
  },
  async setPatternProgress(id: string, body: PatternProgressRequest): Promise<LearnProgressResponse> {
    return apiClient<LearnProgressResponse>(`/learn/patterns/${encodeURIComponent(id)}/progress`, { method: "PUT", body: JSON.stringify(body) });
  },
  async submitDbmsQuiz(id: string, body: DbmsQuizRequest): Promise<DbmsQuizResult> {
    return apiClient<DbmsQuizResult>(`/learn/dbms/${encodeURIComponent(id)}/quiz`, { method: "POST", body: JSON.stringify(body) });
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
