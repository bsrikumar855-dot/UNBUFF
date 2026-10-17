import { ApiError } from "../errors.js";
import type { Logger } from "../logger.js";
import type { SubmissionRecord, SubmissionStore } from "../code/submissionStore.js";
import type { Catalogue } from "../dsa/catalogue.js";
import type { DsaProgressService } from "../dsa/progressService.js";
import type { AnalyticsHistoryResponse, DsaAnalyticsResponse, RevisionActionRequest, RevisionItem, RevisionQueueResponse, RevisionSuggestion } from "../types.js";
import { isCountable } from "./eligibility.js";
import { DEFAULT_ANALYTICS_CONFIG, type AnalyticsConfig } from "./config.js";
import { compare, difficultyBreakdown, firstAttemptSuccess, rate, recentActivity, repeatedFailures, topicBreakdown, totals, weeklyBuckets } from "./metrics.js";
import { applyAction, byPriority, contextFrom, createSuggested, isDue, onSubmission, RevisionActionError, toItem, type RevisionContext, type RevisionRecord } from "./revision.js";
import { applyEvent, type CountedVerdict, type StatsEvent, type StatsRecord } from "./stats.js";
import type { RevisionStore, StatsStore } from "./stores.js";
import { detectWeaknesses } from "./weakness.js";

export interface AnalyticsDeps {
  stats: StatsStore;
  revisions: RevisionStore;
  submissions: SubmissionStore;
  progress: DsaProgressService;
  catalogue: () => Catalogue;
  logger: Logger;
  now?: () => Date;
  config?: AnalyticsConfig;
}

const MAX_STATS = 5000;
const MAX_REVISIONS = 500;
const EXCLUSION_SAMPLE = 200;
const DAY_MS = 86_400_000;
const DIFFICULTY_RANK = { easy: 0, medium: 1, hard: 2 } as const;

export class AnalyticsService {
  private readonly now: () => Date;
  private readonly cfg: AnalyticsConfig;
  private readonly locks = new Map<string, Promise<unknown>>();

  constructor(private readonly deps: AnalyticsDeps) {
    this.now = deps.now ?? (() => new Date());
    this.cfg = deps.config ?? DEFAULT_ANALYTICS_CONFIG;
  }

  // ---------- recording ----------

  /**
   * Folds one stored submission into the student's statistics and revision item. Only submissions marked
   * "counted" matter. Both steps are idempotent per submission id, so a retry (or a duplicate call) never
   * inflates totals or duplicates history. If a step throws, the caller logs it and the next submission,
   * a retry, or POST /api/me/dsa-analytics/refresh repairs the state.
   */
  recordSubmission(rec: SubmissionRecord): Promise<void> {
    if (!isCountable(rec)) return Promise.resolve(); // the stored status is re-checked against the record's own evidence
    return this.serialize(rec.owner_uid, async () => {
      const uid = rec.owner_uid;
      const q = this.deps.catalogue().summary(rec.question_id);
      const verdict = rec.verdict as CountedVerdict;
      const event: StatsEvent = { id: rec.id, at: rec.created_at, verdict };
      const meta = { owner_uid: uid, question_id: rec.question_id, topics: q?.topics ?? [], difficulty: q?.difficulty ?? null };

      const prev = await this.deps.stats.get(uid, rec.question_id);
      const { record: stats, applied } = applyEvent(prev, event, meta, this.cfg.metrics.maxEventsPerQuestion, this.now().toISOString());
      if (applied) await this.deps.stats.put(stats);

      const existing = await this.deps.revisions.get(uid, rec.question_id);
      const count = existing ? 0 : (await this.deps.revisions.listByOwner(uid, this.cfg.revision.maxItemsPerStudent)).length;
      const next = onSubmission(existing, stats, event, verdict, this.now(), this.cfg.revision, this.cfg.weakness.repeatedFailureThreshold, count);
      if (next && next !== existing) await this.deps.revisions.put(next);
    });
  }

  // ---------- analytics ----------

  async overview(uid: string, weeks = 8): Promise<DsaAnalyticsResponse> {
    const now = this.now();
    const cat = this.deps.catalogue();
    const records = await this.deps.stats.listByOwner(uid, MAX_STATS);
    const titleOf = (id: string) => cat.summary(id)?.title ?? null;
    const m = this.cfg.metrics;

    const t = totals(records);
    const attemptedTopics = new Set(records.filter((r) => r.attempts > 0).flatMap((r) => r.topics));
    const revisions = await this.deps.revisions.listByOwner(uid, MAX_REVISIONS);
    const progress = (await this.deps.progress.list(uid)).progress;

    return {
      generated_at: now.toISOString(),
      totals: t,
      first_attempt_success: firstAttemptSuccess(records, m),
      submission_success: rate(t.accepted_attempts, t.eligible_attempts, m.minRateSample, "judged submissions"),
      topics: topicBreakdown(records, m),
      difficulties: difficultyBreakdown(records, m),
      weaknesses: detectWeaknesses(records, now, this.cfg.weakness),
      untouched_topics: cat.allTopics().filter((x) => !attemptedTopics.has(x)),
      weekly: weeklyBuckets(records, new Date(now.getTime() - (weeks - 1) * 7 * DAY_MS), now),
      recent: recentActivity(records, titleOf, m.recentActivityLimit),
      repeated_failures: repeatedFailures(records, this.cfg.weakness.repeatedFailureThreshold, titleOf),
      comparison: compare(records, now, m),
      self_reported: {
        solved: progress.filter((p) => p.status === "solved").length,
        attempted: progress.filter((p) => p.status === "attempted").length,
        needs_revision: progress.filter((p) => p.status === "needs_revision").length,
        bookmarked: progress.filter((p) => p.bookmarked).length,
      },
      exclusions: await this.exclusions(uid),
      has_eligible_activity: t.eligible_attempts > 0,
      revision_due: revisions.filter((r) => isDue(r, now) || r.status === "in_progress").length,
    };
  }

  async history(uid: string, from: Date, to: Date): Promise<AnalyticsHistoryResponse> {
    const records = await this.deps.stats.listByOwner(uid, MAX_STATS);
    const end = new Date(to.getTime() + DAY_MS - 1);
    return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10), weekly: weeklyBuckets(records, from, end) };
  }

  /** Rebuilds the student's statistics from their stored counted submissions and fills in any missing revision items. */
  refresh(uid: string): Promise<DsaAnalyticsResponse> {
    return this.serialize(uid, async () => {
      const counted = (await this.deps.submissions.listCountedByOwner(uid, MAX_STATS)).filter(isCountable);
      counted.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
      const cat = this.deps.catalogue();
      const fresh = new Map<string, StatsRecord>();
      const nowIso = this.now().toISOString();
      for (const s of counted) {
        const q = cat.summary(s.question_id);
        const meta = { owner_uid: uid, question_id: s.question_id, topics: q?.topics ?? [], difficulty: q?.difficulty ?? null };
        const { record } = applyEvent(fresh.get(s.question_id) ?? null, { id: s.id, at: s.created_at, verdict: s.verdict as CountedVerdict }, meta, this.cfg.metrics.maxEventsPerQuestion, nowIso);
        fresh.set(s.question_id, record);
      }
      const old = await this.deps.stats.listByOwner(uid, MAX_STATS);
      for (const r of fresh.values()) await this.deps.stats.put(r);
      for (const r of old) if (!fresh.has(r.question_id)) await this.deps.stats.delete(uid, r.question_id);

      // Create (never modify) revision items for questions that are failing but have none.
      const items = await this.deps.revisions.listByOwner(uid, this.cfg.revision.maxItemsPerStudent);
      let count = items.length;
      const have = new Set(items.map((i) => i.question_id));
      for (const r of fresh.values()) {
        const last = r.events.at(-1);
        if (r.consecutive_failures === 0 || have.has(r.question_id) || !last) continue;
        const made = onSubmission(null, r, last, last.verdict, this.now(), this.cfg.revision, this.cfg.weakness.repeatedFailureThreshold, count);
        if (made) {
          await this.deps.revisions.put(made);
          count += 1;
        }
      }
    }).then(() => this.overview(uid));
  }

  // ---------- revision ----------

  async queue(uid: string, view: "due" | "upcoming" | "all", page: number, pageSize: number): Promise<RevisionQueueResponse> {
    const now = this.now();
    const all = (await this.deps.revisions.listByOwner(uid, MAX_REVISIONS)).sort(byPriority(now));
    const active = (r: RevisionRecord) => isDue(r, now) || r.status === "in_progress";
    const shown = view === "all" ? all : view === "due" ? all.filter(active) : all.filter((r) => !active(r));
    const start = (page - 1) * pageSize;
    const titleOf = (id: string) => this.deps.catalogue().summary(id)?.title ?? null;
    return {
      items: shown.slice(start, start + pageSize).map((r) => toItem(r, titleOf(r.question_id), now)),
      page,
      page_size: pageSize,
      total: shown.length,
      total_pages: Math.max(1, Math.ceil(shown.length / pageSize)),
      counts: { due: all.filter(active).length, upcoming: all.filter((r) => !active(r)).length, total: all.length },
      suggestions: await this.suggestions(uid, all),
    };
  }

  async item(uid: string, questionId: string): Promise<RevisionItem> {
    return toItem(await this.load(uid, questionId), this.titleOf(questionId), this.now());
  }

  /** Adds one question (normally a weak-topic suggestion). Idempotent: an existing item is returned unchanged. */
  add(uid: string, questionId: string): Promise<RevisionItem> {
    return this.serialize(uid, async () => {
      const cat = this.deps.catalogue();
      const q = cat.summary(questionId);
      if (!q) throw new ApiError("QUESTION_NOT_FOUND", `Question ${questionId} not found`);
      const existing = await this.deps.revisions.get(uid, questionId);
      if (existing) return toItem(existing, q.title, this.now());
      if ((await this.deps.revisions.listByOwner(uid, this.cfg.revision.maxItemsPerStudent)).length >= this.cfg.revision.maxItemsPerStudent) {
        throw new ApiError("BAD_REQUEST", "Your revision queue is full. Finish or postpone some items first.");
      }
      const stats = await this.deps.stats.get(uid, questionId);
      const context: RevisionContext = stats
        ? contextFrom(stats)
        : { attempts: 0, failures: 0, consecutive_failures: 0, last_verdict: null, topics: q.topics, difficulty: q.difficulty, solved: false };
      const rec = createSuggested(uid, questionId, context, this.now(), this.cfg.revision);
      await this.deps.revisions.put(rec);
      return toItem(rec, q.title, this.now());
    });
  }

  act(uid: string, questionId: string, req: RevisionActionRequest): Promise<RevisionItem> {
    return this.serialize(uid, async () => {
      const rec = await this.load(uid, questionId);
      let next: RevisionRecord;
      try {
        next = applyAction(rec, req, this.now(), this.cfg.revision);
      } catch (err) {
        if (err instanceof RevisionActionError) throw new ApiError("BAD_REQUEST", err.message);
        throw err;
      }
      await this.deps.revisions.put(next);
      return toItem(next, this.titleOf(questionId), this.now());
    });
  }

  // ---------- internals ----------

  private titleOf(id: string): string | null {
    return this.deps.catalogue().summary(id)?.title ?? null;
  }

  private async load(uid: string, questionId: string): Promise<RevisionRecord> {
    const rec = await this.deps.revisions.get(uid, questionId);
    if (!rec) throw new ApiError("REVISION_NOT_FOUND", `Revision item ${questionId} not found`);
    return rec;
  }

  /** Submissions that do not count, by reason, over the student's latest 200. Unavailable if the query is (e.g. missing index). */
  private async exclusions(uid: string): Promise<DsaAnalyticsResponse["exclusions"]> {
    const out = { available: true, sampled_submissions: 0, demonstration: 0, ineligible_suite: 0, unverified_provider: 0, mock_execution: 0, judge_error: 0, unknown_provenance: 0 };
    try {
      const recent = await this.deps.submissions.listRecentByOwner(uid, EXCLUSION_SAMPLE);
      out.sampled_submissions = recent.length;
      for (const r of recent) {
        const s = r.analytics_status;
        if (s === "excluded_demonstration") out.demonstration += 1;
        else if (s === "excluded_ineligible_suite") out.ineligible_suite += 1;
        else if (s === "excluded_unverified_provider") out.unverified_provider += 1;
        else if (s === "excluded_mock_execution") out.mock_execution += 1;
        else if (s === "excluded_judge_error") out.judge_error += 1;
        else if (!isCountable(r)) out.unknown_provenance += 1; // missing, unrecognized, or marked counted without the evidence
      }
    } catch (err) {
      this.deps.logger.warn({ err: (err as Error).message }, "analytics: exclusion counts unavailable");
      out.available = false;
    }
    return out;
  }

  private async suggestions(uid: string, items: RevisionRecord[]): Promise<RevisionSuggestion[]> {
    const records = await this.deps.stats.listByOwner(uid, MAX_STATS);
    const weak = detectWeaknesses(records, this.now(), this.cfg.weakness).filter((w) => w.status === "weak");
    if (weak.length === 0) return [];
    const cat = this.deps.catalogue();
    const solved = new Set(records.filter((r) => r.accepted > 0).map((r) => r.question_id));
    const queued = new Set(items.map((i) => i.question_id));
    const out: RevisionSuggestion[] = [];
    for (const w of weak) {
      const candidates = cat
        .topicQuestions(w.topic)
        .filter((q) => !solved.has(q.id) && !queued.has(q.id))
        .sort((a, b) => DIFFICULTY_RANK[a.difficulty] - DIFFICULTY_RANK[b.difficulty] || a.id.localeCompare(b.id));
      for (const q of candidates) {
        if (out.length >= this.cfg.revision.suggestionLimit) return out;
        if (out.some((o) => o.question_id === q.id)) continue;
        out.push({ question_id: q.id, title: q.title, topic: w.topic, difficulty: q.difficulty, reason: `You have ${w.evidence.algorithmic_failures} wrong-answer or time-limit failures in ${w.topic}; this unsolved question is a gentle way to practise it.` });
        break; // one per weak topic first, so topics are covered evenly
      }
    }
    return out;
  }

  private async serialize<T>(uid: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(uid) ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(fn);
    this.locks.set(uid, run);
    try {
      return await run;
    } finally {
      if (this.locks.get(uid) === run) this.locks.delete(uid);
    }
  }
}
