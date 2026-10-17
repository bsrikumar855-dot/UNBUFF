import type { AnalyticsService, QuestionOutcome } from "../analytics/service.js";
import type { Catalogue } from "../dsa/catalogue.js";
import type { SuiteRegistry } from "../code/suites.js";
import { buildReport } from "../core/report.js";
import type { GithubService } from "../github/service.js";
import type { LabService } from "../graphqllab/service.js";
import type { Logger } from "../logger.js";
import type { MentorService } from "../mentor/service.js";
import type { RoleRegistry } from "../services/roles.js";
import type { SessionStore } from "../store/SessionStore.js";
import type { DsaAnalyticsResponse, MentorProfile, QuestionSummary, RevisionItem, SkillState } from "../types.js";

/**
 * Collects what the other modules already know about a student. Nothing is recomputed here: DSA numbers come from the
 * analytics service (counted judged submissions only), interview skill states from the existing report builder, the
 * GraphQL results from the Lab's own graded progress, project context from the GitHub cache and goals from the mentor's
 * memory. Each source is read independently: one failing never blocks the rest.
 */

export interface GradableQuestion {
  summary: QuestionSummary;
  /** The suite is declared analytics-eligible, so a judged accepted submission can count. */
  eligible: boolean;
}

export interface DsaEvidence {
  overview: DsaAnalyticsResponse | null;
  outcomes: QuestionOutcome[];
  revision: RevisionItem[];
  gradable: GradableQuestion[];
  topicsInScope: string[];
  execution: { configured: boolean; verified: boolean };
  readFailed: boolean;
}

export interface InterviewSkill {
  role_id: string;
  skill_id: string;
  name: string;
  state: SkillState;
  proficiency: number;
  at: string;
  assessments: number;
  retested: boolean;
  gaps: string[];
}
export interface InterviewSession {
  id: string;
  role_id: string;
  created_at: string;
  assessed_skill_ids: string[];
}
export interface InterviewEvidence {
  skills: InterviewSkill[];
  sessions: InterviewSession[];
  /** True when the model that graded answers is the built-in mock: the results are demonstrations, not assessments. */
  demonstration: boolean;
  readFailed: boolean;
}

export interface LabExerciseState {
  id: string;
  module_id: string;
  lesson_id: string;
  title: string;
  order: number;
  passed: boolean;
  attempts: number;
  last_attempt_at: string | null;
  module_title: string;
  module_order: number;
  difficulty: string;
}
export interface LabEvidence {
  exercises: LabExerciseState[];
  readFailed: boolean;
}

export interface GithubEvidence {
  status: "not_configured" | "not_connected" | "needs_reconnect" | "connected_no_data" | "available";
  stale: boolean;
  syncedAt: string | null;
  totalPublic: number | null;
  /** Observed failures from the checklist (never guesses). */
  gaps: { repository: string; check: string; label: string }[];
  readFailed: boolean;
}

export interface MemoryEvidence {
  goals: string[];
  profile: MentorProfile | null;
  readFailed: boolean;
}

export interface EvidenceBundle {
  generatedAt: string;
  dsa: DsaEvidence;
  interview: InterviewEvidence;
  lab: LabEvidence;
  github: GithubEvidence;
  memory: MemoryEvidence;
  conversations: { id: string; mode: string; messages: number; updated_at: string }[];
}

export interface EvidenceDeps {
  analytics: AnalyticsService;
  sessions: SessionStore;
  roles: RoleRegistry;
  lab: LabService;
  github: GithubService;
  mentor: MentorService;
  catalogue: () => Catalogue;
  suites: SuiteRegistry;
  execution: { configured: boolean; verified: boolean };
  llmMode: "live" | "mock";
  logger: Logger;
  now?: () => Date;
}

const MAX_SESSIONS = 10;

export class EvidenceService {
  private readonly now: () => Date;
  constructor(private readonly deps: EvidenceDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  async collect(uid: string): Promise<EvidenceBundle> {
    const [dsa, interview, lab, github, memory, conversations] = await Promise.all([this.dsa(uid), this.interview(uid), this.labEvidence(uid), this.githubEvidence(uid), this.memory(uid), this.conversations(uid)]);
    return { generatedAt: this.now().toISOString(), dsa, interview, lab, github, memory, conversations };
  }

  /** Questions a student can actually be judged on: they exist in the catalogue and have a hidden-test suite. */
  gradableQuestions(): GradableQuestion[] {
    const cat = this.deps.catalogue();
    const seen = new Set<string>();
    const out: GradableQuestion[] = [];
    for (const topic of cat.allTopics()) {
      for (const q of cat.topicQuestions(topic)) {
        if (seen.has(q.id) || !this.deps.suites.suite(q.id)) continue;
        seen.add(q.id);
        out.push({ summary: q, eligible: this.deps.suites.isEligible(q.id) });
      }
    }
    return out.sort((a, b) => a.summary.id.localeCompare(b.summary.id));
  }

  private async dsa(uid: string): Promise<DsaEvidence> {
    const gradable = this.gradableQuestions();
    const topicsInScope = [...new Set(gradable.flatMap((g) => g.summary.topics))].sort();
    const base: DsaEvidence = { overview: null, outcomes: [], revision: [], gradable, topicsInScope, execution: this.deps.execution, readFailed: false };
    try {
      const [overview, outcomes, queue] = await Promise.all([this.deps.analytics.overview(uid), this.deps.analytics.questionOutcomes(uid), this.deps.analytics.queue(uid, "all", 1, 50)]);
      return { ...base, overview, outcomes, revision: queue.items };
    } catch (err) {
      this.deps.logger.warn({ err: (err as Error).message }, "placement: DSA evidence could not be read");
      return { ...base, readFailed: true };
    }
  }

  private async interview(uid: string): Promise<InterviewEvidence> {
    const demonstration = this.deps.llmMode === "mock";
    try {
      const owned = (await this.deps.sessions.listByOwner(uid)).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, MAX_SESSIONS);
      const latest = new Map<string, InterviewSkill>();
      const sessions: InterviewSession[] = [];
      for (const s of owned) {
        const role = this.deps.roles.get(s.role_id);
        if (!role) continue;
        sessions.push({ id: s.id, role_id: s.role_id, created_at: s.created_at, assessed_skill_ids: [...new Set(s.claims.filter((c) => c.skill_id !== null && c.verdict !== "pending").map((c) => c.skill_id as string))] });
        const report = buildReport({ ...s, session_id: s.id }, role, this.now().toISOString());
        for (const sk of report.skills) {
          const key = `${s.role_id}:${sk.skill_id}`;
          if (latest.has(key)) continue; // newest session first
          const claims = s.claims.filter((c) => c.skill_id === sk.skill_id);
          latest.set(key, {
            role_id: s.role_id,
            skill_id: sk.skill_id,
            name: sk.name,
            state: sk.state,
            proficiency: sk.proficiency,
            at: sk.history.at(-1)?.at ?? s.created_at,
            assessments: sk.history.length,
            retested: claims.some((c) => c.retest !== null),
            gaps: [...new Set(claims.flatMap((c) => c.missing_concepts))].slice(0, 3),
          });
        }
      }
      return { skills: [...latest.values()], sessions, demonstration, readFailed: false };
    } catch (err) {
      this.deps.logger.warn({ err: (err as Error).message }, "placement: interview evidence could not be read");
      return { skills: [], sessions: [], demonstration, readFailed: true };
    }
  }

  private async labEvidence(uid: string): Promise<LabEvidence> {
    try {
      return { exercises: await this.deps.lab.studentExercises(uid), readFailed: false };
    } catch (err) {
      this.deps.logger.warn({ err: (err as Error).message }, "placement: GraphQL Lab evidence could not be read");
      return { exercises: [], readFailed: true };
    }
  }

  private async githubEvidence(uid: string): Promise<GithubEvidence> {
    const none: GithubEvidence = { status: "not_connected", stale: false, syncedAt: null, totalPublic: null, gaps: [], readFailed: false };
    try {
      const c = await this.deps.github.connection(uid);
      if (c.status === "not_configured") return { ...none, status: "not_configured" };
      if (c.status === "disconnected") return none;
      const cached = await this.deps.github.cachedForMentor(uid);
      if (!cached) return { ...none, status: c.status === "reauthorization_required" ? "needs_reconnect" : "connected_no_data" };
      const gaps = (cached.repositories?.checklist ?? []).filter((i) => i.status === "fail").map((i) => ({ repository: i.repository, check: i.check, label: i.label }));
      return { status: c.status === "reauthorization_required" ? "needs_reconnect" : "available", stale: cached.stale, syncedAt: cached.syncedAt, totalPublic: cached.repositories?.total_public ?? null, gaps, readFailed: false };
    } catch (err) {
      this.deps.logger.warn({ err: (err as Error).message }, "placement: GitHub evidence could not be read");
      return { ...none, readFailed: true };
    }
  }

  private async memory(uid: string): Promise<MemoryEvidence> {
    try {
      const [profile, goals] = await Promise.all([this.deps.mentor.getProfile(uid), this.deps.mentor.listMemories(uid, "goal", 1, 20)]);
      return { profile: profile.profile, goals: goals.memories.filter((m) => m.status === "active").map((m) => m.content), readFailed: false };
    } catch (err) {
      this.deps.logger.warn({ err: (err as Error).message }, "placement: mentor memory could not be read");
      return { profile: null, goals: [], readFailed: true };
    }
  }

  /** Recent mentor conversations (summaries only), used to detect completed conversational practice. */
  private async conversations(uid: string): Promise<EvidenceBundle["conversations"]> {
    try {
      const r = await this.deps.mentor.listConversations(uid, 1, 20);
      return r.conversations.map((c) => ({ id: c.id, mode: c.mode, messages: c.message_count, updated_at: c.updated_at }));
    } catch {
      return [];
    }
  }
}
