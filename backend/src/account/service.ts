import { z } from "zod";
import { ApiError } from "../errors.js";
import type { Logger } from "../logger.js";
import { formatIssues } from "../middleware/validate.js";
import type { RevisionStore, StatsStore } from "../analytics/stores.js";
import type { CareerService } from "../careers/service.js";
import type { CareerStore } from "../careers/store.js";
import type { SubmissionStore } from "../code/submissionStore.js";
import type { ProgressStore } from "../dsa/progressStore.js";
import type { GithubService } from "../github/service.js";
import type { GithubStore } from "../github/store.js";
import type { LearnService } from "../learn/service.js";
import type { LearnStore } from "../learn/store.js";
import type { LeetCodeService } from "../leetcode/service.js";
import type { LeetCodeStore } from "../leetcode/store.js";
import type { MentorService } from "../mentor/service.js";
import type { MentorStore } from "../mentor/store.js";
import type { PlacementService } from "../placement/service.js";
import type { PlacementStore } from "../placement/store.js";
import type { ResumeStore } from "../resume/store.js";
import type { RoleRegistry } from "../services/roles.js";
import type { SessionStore } from "../store/SessionStore.js";
import type { AccountDeleteResponse, AccountExport, AccountProfile, AccountProfileResponse } from "../types.js";
import { audit } from "../security/audit.js";
import type { AccountStore } from "./store.js";

/** Large enough to cover any one student's records; the stores cap their own pages below this. */
const SCAN = 5000;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((v) => (v ? v.replace(/\s+/g, " ") : null));

export const AccountProfileInput = z.strictObject({
  display_name: optionalText(60),
  college: optionalText(120),
  graduation_year: z.number().int().min(1990).max(2100).nullable(),
  target_role_id: z.string().regex(/^[a-z0-9_]{1,60}$/, "invalid role id").nullable(),
});

const EMPTY: AccountProfile = { display_name: null, college: null, graduation_year: null, target_role_id: null, updated_at: null };

export interface AccountDeps {
  profiles: AccountStore;
  roles: RoleRegistry;
  sessions: SessionStore;
  progress: ProgressStore;
  submissions: SubmissionStore;
  stats: StatsStore;
  revisions: RevisionStore;
  mentorStore: MentorStore;
  mentor: MentorService;
  githubStore: GithubStore;
  github: GithubService;
  placementStore: PlacementStore;
  placement: PlacementService;
  careerStore: CareerStore;
  career: CareerService;
  leetcodeStore: LeetCodeStore;
  leetcode: LeetCodeService;
  resumeStore: ResumeStore;
  learnStore: LearnStore;
  learn: LearnService;
  /** Revokes every Firebase session of the student. Absent where there is no Admin access (tests, misconfiguration). */
  revokeSessions?: (uid: string) => Promise<void>;
  logger: Logger;
  now?: () => Date;
}

/**
 * The student's own account: a small profile, a full export of everything stored for them, and deleting all of it.
 * The owner is always the verified uid; nothing here accepts a uid from the request.
 */
export class AccountService {
  private readonly now: () => Date;

  constructor(private readonly deps: AccountDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  async getProfile(uid: string): Promise<AccountProfileResponse> {
    const rec = await this.deps.profiles.get(uid);
    if (!rec) return { profile: { ...EMPTY } };
    const { owner_uid: _owner, ...profile } = rec;
    return { profile };
  }

  async saveProfile(uid: string, raw: unknown): Promise<AccountProfileResponse> {
    const parsed = AccountProfileInput.safeParse(raw);
    if (!parsed.success) throw new ApiError("BAD_REQUEST", formatIssues(parsed.error));
    const input = parsed.data;
    if (input.target_role_id !== null && !this.deps.roles.get(input.target_role_id)) {
      throw new ApiError("BAD_REQUEST", `Unknown role "${input.target_role_id}"`);
    }
    const profile: AccountProfile = { ...input, updated_at: this.now().toISOString() };
    await this.deps.profiles.put({ ...profile, owner_uid: uid });
    audit(this.deps.logger, "account.profile_updated", uid);
    return { profile };
  }

  async revokeSessions(uid: string): Promise<void> {
    if (!this.deps.revokeSessions) throw new ApiError("INTERNAL", "Signing out of all devices isn't available right now.");
    await this.deps.revokeSessions(uid);
    audit(this.deps.logger, "account.sessions_revoked", uid);
  }

  /** Everything stored for this student, as stored. GitHub credentials (encrypted tokens) are deliberately left out. */
  async exportData(uid: string): Promise<AccountExport> {
    const d = this.deps;
    const [profile, sessions, progress, submissions, stats, revisions, conversations, memories] = await Promise.all([
      this.getProfile(uid),
      d.sessions.listByOwner(uid),
      d.progress.listByOwner(uid),
      d.submissions.listByOwner(uid),
      d.stats.listByOwner(uid, SCAN),
      d.revisions.listByOwner(uid, SCAN),
      d.mentorStore.listConversations(uid, SCAN),
      d.mentorStore.listMemories(uid, SCAN),
    ]);
    const [githubConnection, githubInsights, placementProfile, placementPlan, placementTasks] = await Promise.all([
      d.githubStore.getConnection(uid),
      d.githubStore.getInsights(uid),
      d.placementStore.getProfile(uid),
      d.placementStore.getPlan(uid),
      d.placementStore.listTasks(uid, SCAN),
    ]);
    const [careerPrefs, careerResume, careerTracked, leetcodeConnection, leetcodeSnapshots, resume, learn] = await Promise.all([
      d.careerStore.getPrefs(uid),
      d.careerStore.getResume(uid),
      d.careerStore.listTracked(uid, SCAN),
      d.leetcodeStore.getConnection(uid),
      d.leetcodeStore.listSnapshots(uid, SCAN),
      d.resumeStore.get(uid),
      d.learnStore.get(uid),
    ]);
    audit(d.logger, "account.exported", uid);
    return {
      format: "unbluff-export/1",
      exported_at: this.now().toISOString(),
      uid,
      profile: profile.profile,
      data: {
        readiness_sessions: sessions,
        dsa_progress: progress,
        code_submissions: submissions,
        dsa_stats: stats,
        dsa_revision: revisions,
        mentor_conversations: conversations,
        mentor_memories: memories,
        github: { connection: githubConnection, insights: githubInsights },
        placement: { profile: placementProfile, plan: placementPlan, tasks: placementTasks },
        career: { preferences: careerPrefs, resume_skills: careerResume, tracked: careerTracked },
        leetcode: { connection: leetcodeConnection, snapshots: leetcodeSnapshots },
        resume,
        learn_progress: learn,
      },
    };
  }

  /**
   * Deletes every record for this student in every domain. Each domain is attempted even if an earlier one fails, so a
   * transient error never leaves most data behind; the call then fails and can simply be repeated (every step is idempotent).
   */
  async deleteAll(uid: string): Promise<AccountDeleteResponse> {
    const d = this.deps;
    const removed: Record<string, number> = {};
    const failed: string[] = [];
    const step = async (name: string, fn: () => Promise<number>) => {
      try {
        removed[name] = await fn();
      } catch (err) {
        failed.push(name);
        d.logger.error({ err, domain: name }, "account deletion step failed");
      }
    };

    await step("readiness_sessions", async () => {
      const owned = await d.sessions.listByOwner(uid);
      for (const s of owned) await d.sessions.delete(s.id);
      return owned.length;
    });
    await step("dsa_progress", async () => {
      const owned = await d.progress.listByOwner(uid);
      for (const r of owned) await d.progress.delete(uid, r.question_id);
      return owned.length;
    });
    await step("code_submissions", async () => {
      const owned = await d.submissions.listByOwner(uid);
      for (const r of owned) await d.submissions.delete(r.id);
      return owned.length;
    });
    await step("dsa_stats", () => drain((n) => d.stats.listByOwner(uid, n), (r) => d.stats.delete(uid, r.question_id)));
    await step("dsa_revision", () => drain((n) => d.revisions.listByOwner(uid, n), (r) => d.revisions.delete(uid, r.question_id)));
    await step("mentor", async () => {
      const [c, m] = await Promise.all([d.mentorStore.listConversations(uid, SCAN), d.mentorStore.listMemories(uid, SCAN)]);
      await d.mentor.clearMemories(uid, true);
      return c.length + m.length;
    });
    await step("github", async () => {
      const had = (await d.githubStore.getConnection(uid)) !== null;
      await d.github.disconnect(uid); // also releases the GitHub identity and revokes the grant when possible
      return had ? 1 : 0;
    });
    await step("placement", async () => {
      const had = (await d.placementStore.getProfile(uid)) !== null;
      await d.placement.deleteAll(uid);
      return had ? 1 : 0;
    });
    await step("career", async () => {
      const tracked = await d.careerStore.listTracked(uid, SCAN);
      await d.career.deleteAll(uid);
      return tracked.length;
    });
    await step("leetcode", async () => {
      const snaps = await d.leetcodeStore.listSnapshots(uid, SCAN);
      await d.leetcode.deleteAll(uid);
      return snaps.length;
    });
    await step("resume", async () => {
      const had = (await d.resumeStore.get(uid)) !== null;
      await d.resumeStore.delete(uid);
      return had ? 1 : 0;
    });
    await step("learn_progress", async () => {
      const had = (await d.learnStore.get(uid)) !== null;
      await d.learn.deleteAll(uid);
      return had ? 1 : 0;
    });
    await step("profile", async () => {
      const had = (await d.profiles.get(uid)) !== null;
      await d.profiles.delete(uid);
      return had ? 1 : 0;
    });

    if (failed.length > 0) {
      throw new ApiError("INTERNAL", `Some data could not be deleted (${failed.join(", ")}). Please try again.`);
    }
    d.logger.info({ removed }, "account data deleted");
    audit(d.logger, "account.deleted", uid, { removed });
    return { deleted: true, removed };
  }
}

/** Deletes page by page until a listing comes back empty (for stores that only list with a limit). */
async function drain<T>(list: (limit: number) => Promise<T[]>, remove: (r: T) => Promise<void>): Promise<number> {
  let total = 0;
  for (;;) {
    const page = await list(SCAN);
    if (page.length === 0) return total;
    for (const r of page) await remove(r);
    total += page.length;
    if (page.length < SCAN) return total;
  }
}
