import { randomUUID } from "node:crypto";
import type { RevisionStore, StatsStore } from "../analytics/stores.js";
import { ApiError } from "../errors.js";
import { LlmError, type LLMProvider } from "../llm/provider.js";
import type { Logger } from "../logger.js";
import type {
  GoalTrack,
  MemoryType,
  MentorChatRequest,
  MentorChatResponse,
  MentorConversation,
  MentorConversationsResponse,
  MentorConversationSummary,
  MentorMemoriesResponse,
  MentorMemory,
  MentorMessage,
  MentorProfile,
  MentorProfileResponse,
  MentorSavedMemory,
} from "../types.js";
import { githubBlock, NOT_CONNECTED_TEXT, wantsGithub, type CachedGithub } from "../github/context.js";
import { wantsLeetcode } from "../leetcode/context.js";
import { wantsResume } from "../resume/context.js";
import { buildActivityContext, type ActivityDeps } from "./activity.js";
import { evaluateGoals } from "./goals.js";
import {
  addDays,
  applyDrafts,
  cleanText,
  conversationIdFor,
  DEFAULT_RETENTION,
  MAX_ACTIVE_GOALS,
  MAX_MEMORIES_PER_STUDENT,
  profileContent,
  profileFromMemories,
  profileRecords,
  redactPii,
  retentionInfo,
  stripControl,
  summaryMemoryId,
  toPublicMemory,
  validateProposals,
  type Draft,
  type RetentionConfig,
} from "./memories.js";
import { chatPrompt, CONTEXT_LIMITS, planSystemPrompt, summaryPrompt, SUMMARY_SYSTEM, systemPrompt } from "./prompts.js";
import { selectMemories, topicsIn } from "./retrieve.js";
import type { ConversationRecord, MemoryRecord, MentorStore, StoredMessage } from "./store.js";

export interface MentorDeps extends ActivityDeps {
  store: MentorStore;
  llm: LLMProvider;
  stats: StatsStore;
  revisions: RevisionStore;
  logger: Logger;
  now?: () => Date;
  retention?: RetentionConfig;
  /** Optional GitHub summary source. The mentor works the same without it. */
  github?: { cachedForMentor(uid: string): Promise<CachedGithub | null> };
  /** Optional job-listing context (lazy, because the Career service is built after the mentor). The mentor works the same without it. */
  career?: () => { mentorContext(uid: string): Promise<{ text: string; available: boolean }> } | undefined;
  /** Optional: a minimal summary of the numbers the student imported from LeetCode (never live data). The mentor works the same without it. */
  leetcode?: { mentorContext(uid: string): Promise<{ text: string; used: boolean; captured_at: string | null; stale: boolean }> };
  /** The student's saved résumé and its freshly computed ATS result, as text for the model. */
  resume?: { mentorContext(uid: string): Promise<{ text: string; used: boolean; score: number | null; updated_at: string | null }> };
}

const MAX_STORED_MESSAGES = 60;
const MAX_CONVERSATIONS = 100;
const MAX_MEMORY_SCAN = 400;
const SUMMARY_EVERY_TURNS = 4;

const toSummary = (c: ConversationRecord): MentorConversationSummary => ({
  id: c.id,
  title: c.title,
  mode: c.mode,
  message_count: c.messages.length,
  hint_level: c.hint_level,
  created_at: c.created_at,
  updated_at: c.updated_at,
});

const pub = (m: StoredMessage): MentorMessage => ({ id: m.id, role: m.role, content: m.content, at: m.at });
const isExpired = (iso: string | null | undefined, now: Date) => iso !== null && iso !== undefined && Date.parse(iso) <= now.getTime();

export class MentorService {
  private readonly now: () => Date;
  private readonly retention: RetentionConfig;
  private readonly inFlight = new Set<string>();
  private readonly locks = new Map<string, Promise<unknown>>();

  constructor(private readonly deps: MentorDeps) {
    this.now = deps.now ?? (() => new Date());
    this.retention = deps.retention ?? DEFAULT_RETENTION;
  }

  // ---------------- chat ----------------

  async chat(uid: string, req: MentorChatRequest): Promise<MentorChatResponse> {
    if (this.inFlight.has(uid)) throw new ApiError("RATE_LIMITED", "Your previous message is still being answered. Wait for it to finish.");
    this.inFlight.add(uid);
    try {
      return await this.serialize(uid, () => this.chatOnce(uid, req));
    } finally {
      this.inFlight.delete(uid);
    }
  }

  private async chatOnce(uid: string, req: MentorChatRequest): Promise<MentorChatResponse> {
    const { store, llm, logger } = this.deps;
    const now = this.now();
    const nowIso = now.toISOString();
    const catalogue = this.deps.catalogue();
    if (req.question_id && !catalogue.hasQuestion(req.question_id)) throw new ApiError("QUESTION_NOT_FOUND", `Question ${req.question_id} not found`);

    // ---- conversation (owner-checked; a retry of the same client_message_id replays the stored answer)
    const convId = req.conversation_id ?? conversationIdFor(uid, req.client_message_id);
    let conv = await store.getConversation(convId);
    if (conv && (conv.owner_uid !== uid || isExpired(conv.expires_at, now))) conv = null;
    if (req.conversation_id && !conv) throw new ApiError("CONVERSATION_NOT_FOUND", `Conversation ${req.conversation_id} not found`);
    if (conv) {
      const at = conv.messages.findIndex((m) => m.role === "user" && m.client_message_id === req.client_message_id);
      const stored = at >= 0 ? conv.messages[at + 1] : undefined;
      if (stored?.role === "assistant") {
        return {
          conversation: toSummary(conv),
          reply: pub(stored),
          memory_saved: [],
          persistence: { conversation: "saved", memory: "none" },
          references: [],
          analytics_note: null,
          degraded: false,
          mock: llm.mode === "mock",
        };
      }
    }

    const message = stripControl(req.message).trim().slice(0, CONTEXT_LIMITS.message);
    let hintLevel = conv?.hint_level ?? 0;
    if (req.assist === "hint") hintLevel = Math.min(3, hintLevel + 1);
    const gated = req.assist === "solution" && hintLevel < 2;

    // ---- memory + verified activity (a failure here degrades the answer instead of breaking it)
    let allMemories: MemoryRecord[] = [];
    let memoryReadFailed = false;
    try {
      allMemories = (await store.listMemories(uid, MAX_MEMORY_SCAN)).filter((m) => !isExpired(m.expires_at, now));
      const finished = await evaluateGoals(uid, allMemories, { stats: this.deps.stats, revisions: this.deps.revisions }, now);
      for (const g of finished) {
        await store.saveMemory(g);
        allMemories = allMemories.map((m) => (m.id === g.id ? g : m));
      }
    } catch (err) {
      memoryReadFailed = true;
      logger.warn({ err: (err as Error).message }, "mentor: memory could not be read; answering without it");
    }
    const topics = topicsIn(`${message} ${conv?.title ?? ""}`, catalogue.allTopics());
    const selected = selectMemories(allMemories, { topics, now });
    const profile = profileFromMemories(allMemories).profile;
    const activity = await buildActivityContext(uid, this.deps, { questionId: req.question_id, topics });

    // ---- GitHub summary: only when the message is about projects/GitHub, only the student's own cached public data
    let githubText: string | undefined;
    let githubMeta: { used: boolean; synced_at: string | null; stale: boolean } | undefined;
    if (this.deps.github && wantsGithub(message)) {
      const cached = await this.deps.github.cachedForMentor(uid).catch(() => null);
      githubText = cached ? githubBlock(cached) : NOT_CONNECTED_TEXT;
      githubMeta = { used: cached !== null, synced_at: cached?.syncedAt ?? null, stale: cached?.stale ?? false };
    }

    // ---- job listings, only when the student asked for career context; the application computed every score
    let careerText: string | undefined;
    const careerSource = req.career_context ? this.deps.career?.() : undefined;
    if (careerSource) careerText = (await careerSource.mentorContext(uid).catch(() => ({ text: "The job listings could not be loaded right now. Do not invent any.", available: false }))).text;

    // ---- imported LeetCode numbers: only when the message is about LeetCode (or the student turned it on); aggregates only, labelled as student-supplied
    let leetcodeText: string | undefined;
    let leetcodeMeta: { used: boolean; captured_at: string | null; stale: boolean } | undefined;
    if (this.deps.leetcode && (req.leetcode_context || wantsLeetcode(message))) {
      const c = await this.deps.leetcode.mentorContext(uid).catch(() => null);
      if (c) {
        leetcodeText = c.text;
        leetcodeMeta = { used: c.used, captured_at: c.captured_at, stale: c.stale };
      } else {
        leetcodeText = "(The imported LeetCode data could not be read right now. You have NO LeetCode statistics; say so and do not guess any number.)";
        leetcodeMeta = { used: false, captured_at: null, stale: false };
      }
    }

    // ---- the saved résumé and its ATS score: only when the message is about the résumé (or the student turned it on)
    let resumeText: string | undefined;
    let resumeMeta: { used: boolean; score: number | null; updated_at: string | null } | undefined;
    if (this.deps.resume && (req.resume_context || wantsResume(message))) {
      const c = await this.deps.resume.mentorContext(uid).catch(() => null);
      if (c) {
        resumeText = c.text;
        resumeMeta = { used: c.used, score: c.score, updated_at: c.updated_at };
      } else {
        resumeText = "(The saved résumé could not be read right now. You have NO résumé text and NO ATS score; say so and do not guess either.)";
        resumeMeta = { used: false, score: null, updated_at: null };
      }
    }

    // ---- the model (skipped when a full solution is requested too early)
    let replyText: string;
    let proposals: Parameters<typeof validateProposals>[0] = [];
    if (gated) {
      replyText = `You have used ${hintLevel} of 3 hints on this conversation. Let's try hints first: ask for a hint and I'll point you at the key idea without giving the answer away. After at least 2 hints you can ask for the full solution.`;
    } else {
      try {
        const out = await llm.mentorChat({
          system: systemPrompt(req.mode, { hintLevel, solutionAllowed: req.assist === "solution", github: githubText !== undefined, career: careerText !== undefined, leetcode: leetcodeText !== undefined, resume: resumeText !== undefined }),
          prompt: chatPrompt({ activity: activity.text, profile: nonEmptyProfileJson(profile), memories: selected, recent: conv?.messages ?? [], message, ...(githubText !== undefined ? { github: githubText } : {}), ...(careerText !== undefined ? { career: careerText } : {}), ...(leetcodeText !== undefined ? { leetcode: leetcodeText } : {}), ...(resumeText !== undefined ? { resume: resumeText } : {}) }),
        });
        replyText = stripControl(out.reply).trim().slice(0, 6000);
        proposals = out.memory_updates;
      } catch (err) {
        // Nothing is stored and no memory is created when the model fails; the client may retry with the same id.
        if (err instanceof LlmError) {
          throw new ApiError(err.code === "LLM_TIMEOUT" ? "LLM_TIMEOUT" : "LLM_INVALID_OUTPUT", "The mentor could not answer right now. Please try again.");
        }
        throw err;
      }
    }

    // ---- conversation history
    const userMsg: StoredMessage = { id: `msg_${randomUUID()}`, role: "user", content: message, at: nowIso, client_message_id: req.client_message_id };
    const replyMsg: StoredMessage = { id: `msg_${randomUUID()}`, role: "assistant", content: replyText, at: nowIso };
    const record: ConversationRecord = conv ?? {
      id: convId,
      owner_uid: uid,
      title: cleanText(message, 60) || "New conversation",
      mode: req.mode,
      hint_level: 0,
      created_at: nowIso,
      updated_at: nowIso,
      messages: [],
      turns: 0,
      summarized_turns: 0,
      expires_at: addDays(nowIso, this.retention.conversationDays),
    };
    record.mode = req.mode;
    record.hint_level = hintLevel;
    record.turns += 1;
    record.updated_at = nowIso;
    record.expires_at = addDays(nowIso, this.retention.conversationDays);
    record.messages = [...record.messages, userMsg, replyMsg].slice(-MAX_STORED_MESSAGES);
    let conversationStatus: "saved" | "failed" = "saved";
    try {
      await store.saveConversation(record);
    } catch (err) {
      conversationStatus = "failed";
      logger.error({ err: (err as Error).message }, "mentor: conversation could not be saved");
    }

    // ---- memory updates (only the student's own quoted statements survive validation)
    let memoryStatus: "saved" | "none" | "failed" = memoryReadFailed ? "failed" : "none";
    const savedPublic: MentorSavedMemory[] = [];
    if (!memoryReadFailed && !gated && proposals.length > 0) {
      const { drafts } = validateProposals(proposals, message, catalogue);
      if (drafts.length > 0) {
        const result = applyDrafts(uid, drafts, allMemories, record.id, nowIso, this.retention);
        try {
          for (const m of result.saved) await store.saveMemory(m);
          for (const id of result.removed) await store.deleteMemory(id);
          for (const m of result.saved) savedPublic.push({ id: m.id, type: m.type, content: m.content, provenance: m.provenance });
          memoryStatus = result.saved.length > 0 ? "saved" : "none";
        } catch (err) {
          memoryStatus = "failed";
          savedPublic.length = 0;
          logger.error({ err: (err as Error).message }, "mentor: memory could not be saved");
        }
      }
    }

    // ---- periodic session summary (best effort; its failure never affects the answer)
    if (conversationStatus === "saved" && record.turns >= SUMMARY_EVERY_TURNS && record.turns % SUMMARY_EVERY_TURNS === 0 && record.summarized_turns < record.turns) {
      await this.writeSummary(uid, record).catch((err) => logger.warn({ err: (err as Error).message }, "mentor: automatic summary skipped"));
    }

    return {
      conversation: toSummary(record),
      reply: pub(replyMsg),
      memory_saved: savedPublic,
      persistence: { conversation: conversationStatus, memory: memoryStatus },
      references: activity.references,
      analytics_note: activity.analytics_note,
      degraded: conversationStatus === "failed" || memoryStatus === "failed",
      mock: llm.mode === "mock",
      ...(githubMeta ? { github_context: githubMeta } : {}),
      ...(leetcodeMeta ? { leetcode_context: leetcodeMeta } : {}),
      ...(resumeMeta ? { resume_context: resumeMeta } : {}),
    };
  }

  // ---------------- placement-plan tutoring ----------------

  /**
   * One-shot help explaining the student's placement plan, answered by the same mentor, model, memory store and safeguards as chat.
   * `context` is the plan the application calculated; it is untrusted data to the model.
   * Nothing is stored as a conversation. A memory is saved only when the student's own typed question states a supported fact.
   */
  async tutorHelp(uid: string, input: { context: string; message: string; topics: string[] }): Promise<{ reply: string; mock: boolean; memory_saved: MentorSavedMemory[] }> {
    if (this.inFlight.has(uid)) throw new ApiError("RATE_LIMITED", "Your previous mentor request is still being answered. Wait for it to finish.");
    this.inFlight.add(uid);
    try {
      return await this.serialize(uid, () => this.tutorOnce(uid, input));
    } finally {
      this.inFlight.delete(uid);
    }
  }

  private async tutorOnce(uid: string, input: { context: string; message: string; topics: string[] }) {
    const { store, llm, logger } = this.deps;
    const now = this.now();
    const message = stripControl(input.message).trim().slice(0, 500);
    let allMemories: MemoryRecord[] = [];
    let memoryReadFailed = false;
    try {
      allMemories = (await store.listMemories(uid, MAX_MEMORY_SCAN)).filter((m) => !isExpired(m.expires_at, now));
    } catch (err) {
      memoryReadFailed = true;
      logger.warn({ err: (err as Error).message }, "mentor: memory could not be read for plan help; answering without it");
    }
    const selected = selectMemories(allMemories, { topics: input.topics, now });
    const profile = profileFromMemories(allMemories).profile;
    let out;
    try {
      out = await llm.mentorChat({
        system: planSystemPrompt(),
        prompt: chatPrompt({ activity: "(not used for plan help)", profile: nonEmptyProfileJson(profile), memories: selected, recent: [], message: message || "(the student did not type a question; use the context block)", plan: input.context }),
      });
    } catch (err) {
      if (err instanceof LlmError) throw new ApiError(err.code === "LLM_TIMEOUT" ? "LLM_TIMEOUT" : "LLM_INVALID_OUTPUT", "The mentor could not answer right now. The plan itself is unaffected.");
      throw err;
    }
    const saved: MentorSavedMemory[] = [];
    if (!memoryReadFailed && message !== "" && out.memory_updates.length > 0) {
      const { drafts } = validateProposals(out.memory_updates, message, this.deps.catalogue());
      if (drafts.length > 0) {
        const result = applyDrafts(uid, drafts, allMemories, null, now.toISOString(), this.retention);
        try {
          for (const m of result.saved) await store.saveMemory(m);
          for (const id of result.removed) await store.deleteMemory(id);
          for (const m of result.saved) saved.push({ id: m.id, type: m.type, content: m.content, provenance: m.provenance });
        } catch (err) {
          saved.length = 0;
          logger.error({ err: (err as Error).message }, "mentor: memory could not be saved for plan help");
        }
      }
    }
    return { reply: stripControl(out.reply).trim().slice(0, 6000), mock: llm.mode === "mock", memory_saved: saved };
  }

  // ---------------- conversations ----------------

  async listConversations(uid: string, page: number, pageSize: number): Promise<MentorConversationsResponse> {
    await this.purgeExpired(uid);
    const all = (await this.deps.store.listConversations(uid, MAX_CONVERSATIONS)).filter((c) => c.owner_uid === uid).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    const start = (page - 1) * pageSize;
    return { conversations: all.slice(start, start + pageSize).map(toSummary), page, page_size: pageSize, total: all.length, total_pages: Math.max(1, Math.ceil(all.length / pageSize)) };
  }

  async getConversation(uid: string, id: string): Promise<MentorConversation> {
    const c = await this.owned(uid, id);
    return { ...toSummary(c), messages: c.messages.map(pub) };
  }

  /** Deletes the conversation and, unless keepSummary, any summary memory made from it, so no retrievable copy remains. */
  async deleteConversation(uid: string, id: string, keepSummary: boolean): Promise<void> {
    await this.owned(uid, id);
    await this.deps.store.deleteConversation(id);
    if (!keepSummary) {
      const memories = await this.deps.store.listMemories(uid, MAX_MEMORY_SCAN);
      for (const m of memories) if (m.type === "summary" && m.source_conversation_id === id) await this.deps.store.deleteMemory(m.id);
    }
  }

  async summarize(uid: string, id: string): Promise<MentorMemory> {
    const c = await this.owned(uid, id);
    if (c.turns < 1) throw new ApiError("BAD_REQUEST", "This conversation has no messages to summarize.");
    return toPublicMemory(await this.writeSummary(uid, c));
  }

  private async writeSummary(uid: string, conv: ConversationRecord): Promise<MemoryRecord> {
    let out;
    try {
      out = await this.deps.llm.mentorSummarize({ system: SUMMARY_SYSTEM, prompt: summaryPrompt(conv.messages) });
    } catch (err) {
      if (err instanceof LlmError) throw new ApiError(err.code === "LLM_TIMEOUT" ? "LLM_TIMEOUT" : "LLM_INVALID_OUTPUT", "The summary could not be created right now.");
      throw err;
    }
    const nowIso = this.now().toISOString();
    const parts = [out.summary, out.decisions.length ? `Decisions: ${out.decisions.join("; ")}.` : "", out.unresolved.length ? `Unresolved: ${out.unresolved.join("; ")}.` : "", out.next_steps.length ? `Next steps: ${out.next_steps.join("; ")}.` : ""];
    const id = summaryMemoryId(conv.id);
    const prev = await this.deps.store.getMemory(id);
    const rec: MemoryRecord = {
      id,
      owner_uid: uid,
      type: "summary",
      key: null,
      topic: redactPii(cleanText(out.topic, 60)),
      content: redactPii(cleanText(parts.filter(Boolean).join(" "), 1200)),
      provenance: "model_summary",
      confidence: "medium",
      signal: null,
      status: null,
      track: null,
      completed_by: null,
      source_conversation_id: conv.id,
      created_at: prev?.created_at ?? nowIso,
      updated_at: nowIso,
      expires_at: addDays(nowIso, this.retention.summaryDays),
      review_at: null,
    };
    await this.deps.store.saveMemory(rec);
    conv.summarized_turns = conv.turns;
    await this.deps.store.saveConversation(conv).catch(() => undefined);
    return rec;
  }

  // ---------------- memories ----------------

  async listMemories(uid: string, type: MemoryType | undefined, page: number, pageSize: number): Promise<MentorMemoriesResponse> {
    await this.purgeExpired(uid);
    let all = (await this.deps.store.listMemories(uid, MAX_MEMORY_SCAN)).filter((m) => m.owner_uid === uid);
    // Goals the application can verify are completed by application events, never by the model.
    const finished = await evaluateGoals(uid, all, { stats: this.deps.stats, revisions: this.deps.revisions }, this.now()).catch(() => []);
    for (const g of finished) {
      await this.deps.store.saveMemory(g);
      all = all.map((m) => (m.id === g.id ? g : m));
    }
    const counts: Record<MemoryType, number> = { profile: 0, learning: 0, summary: 0, goal: 0 };
    for (const m of all) counts[m.type] += 1;
    const shown = all.filter((m) => !type || m.type === type).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    const start = (page - 1) * pageSize;
    return {
      memories: shown.slice(start, start + pageSize).map(toPublicMemory),
      counts,
      retention: retentionInfo(this.retention),
      page,
      page_size: pageSize,
      total: shown.length,
      total_pages: Math.max(1, Math.ceil(shown.length / pageSize)),
    };
  }

  /** A goal or learning note written by the student themselves. */
  async createMemory(
    uid: string,
    body: { type: "goal" | "learning"; content: string; topic?: string; signal?: NonNullable<MentorMemory["signal"]>; track?: GoalTrack },
  ): Promise<MentorMemory> {
    const catalogue = this.deps.catalogue();
    const content = redactPii(cleanText(body.content, 300));
    if (!content) throw new ApiError("BAD_REQUEST", "content is required");
    const nowIso = this.now().toISOString();
    let draft: Draft;
    if (body.type === "goal") {
      let track: GoalTrack | null = null;
      if (body.track) {
        const t = body.track;
        if ((t.kind === "question_solved" || t.kind === "revision_completed") && !catalogue.hasQuestion(t.question_id)) throw new ApiError("QUESTION_NOT_FOUND", `Question ${t.question_id} not found`);
        if (t.kind === "topic_practice" && !catalogue.allTopics().includes(t.topic)) throw new ApiError("BAD_REQUEST", "Unknown topic for a practice goal");
        track = t;
      }
      draft = { kind: "goal", content, track, quote: content };
    } else {
      const topic = cleanText(body.topic ?? "", 60);
      if (!topic || !body.signal) throw new ApiError("BAD_REQUEST", "A learning note needs a topic and a signal");
      draft = { kind: "learning", topic, signal: body.signal, content, quote: content };
    }
    const existing = await this.deps.store.listMemories(uid, MAX_MEMORY_SCAN);
    if (draft.kind === "goal" && existing.filter((m) => m.type === "goal" && m.status === "active").length >= MAX_ACTIVE_GOALS) throw new ApiError("BAD_REQUEST", `You can have at most ${MAX_ACTIVE_GOALS} active goals.`);
    if (existing.length >= MAX_MEMORIES_PER_STUDENT) throw new ApiError("BAD_REQUEST", "You have reached the memory limit. Delete some memories first.");
    const result = applyDrafts(uid, [draft], existing, null, nowIso, this.retention);
    const rec = result.saved[0];
    if (!rec) throw new ApiError("BAD_REQUEST", "That goal is already being tracked.");
    for (const m of result.saved) await this.deps.store.saveMemory(m);
    for (const id of result.removed) await this.deps.store.deleteMemory(id);
    return toPublicMemory(rec);
  }

  async patchMemory(uid: string, id: string, patch: { content?: string; topic?: string | null; status?: "active" | "completed" | "dismissed" }): Promise<MentorMemory> {
    const m = await this.ownedMemory(uid, id);
    if (m.type === "profile") throw new ApiError("BAD_REQUEST", "Edit profile fields through the profile form.");
    if (patch.status && m.type !== "goal") throw new ApiError("BAD_REQUEST", "Only goals have a status.");
    const next: MemoryRecord = { ...m, updated_at: this.now().toISOString() };
    if (patch.content !== undefined) {
      const content = redactPii(cleanText(patch.content, m.type === "summary" ? 1200 : 300));
      if (!content) throw new ApiError("BAD_REQUEST", "content cannot be empty");
      next.content = content;
      next.provenance = "student_provided"; // the student's own correction is now their statement
    }
    if (patch.topic !== undefined) next.topic = patch.topic === null ? null : cleanText(patch.topic, 60) || null;
    if (patch.status) {
      next.status = patch.status;
      next.completed_by = patch.status === "completed" ? "student" : null;
    }
    await this.deps.store.saveMemory(next);
    return toPublicMemory(next);
  }

  async deleteMemory(uid: string, id: string): Promise<void> {
    await this.ownedMemory(uid, id);
    await this.deps.store.deleteMemory(id);
  }

  /** Clears every AI mentor memory (profile, learning notes, summaries, goals). Optionally the conversations too. */
  async clearMemories(uid: string, includeConversations: boolean): Promise<void> {
    await this.deps.store.deleteMemoriesByOwner(uid);
    if (includeConversations) await this.deps.store.deleteConversationsByOwner(uid);
  }

  // ---------------- profile ----------------

  async getProfile(uid: string): Promise<MentorProfileResponse> {
    return profileFromMemories(await this.deps.store.listMemories(uid, MAX_MEMORY_SCAN));
  }

  async putProfile(uid: string, profile: MentorProfile): Promise<MentorProfileResponse> {
    const existing = new Map((await this.deps.store.listMemories(uid, MAX_MEMORY_SCAN)).filter((m) => m.type === "profile").map((m) => [m.id, m]));
    const { save, remove } = profileRecords(uid, profile, existing, this.now().toISOString());
    for (const m of save) await this.deps.store.saveMemory(m);
    for (const id of remove) await this.deps.store.deleteMemory(id);
    return this.getProfile(uid);
  }

  // ---------------- internals ----------------

  private async owned(uid: string, id: string): Promise<ConversationRecord> {
    const c = await this.deps.store.getConversation(id);
    if (!c || c.owner_uid !== uid || isExpired(c.expires_at, this.now())) throw new ApiError("CONVERSATION_NOT_FOUND", `Conversation ${id} not found`);
    return c;
  }

  private async ownedMemory(uid: string, id: string): Promise<MemoryRecord> {
    const m = await this.deps.store.getMemory(id);
    if (!m || m.owner_uid !== uid) throw new ApiError("MEMORY_NOT_FOUND", `Memory ${id} not found`);
    return m;
  }

  /** Deletes this student's expired conversations and memories. There is no background job; this runs on reads. */
  private async purgeExpired(uid: string): Promise<void> {
    const now = this.now();
    try {
      for (const c of await this.deps.store.listConversations(uid, MAX_CONVERSATIONS)) if (isExpired(c.expires_at, now)) await this.deps.store.deleteConversation(c.id);
      for (const m of await this.deps.store.listMemories(uid, MAX_MEMORY_SCAN)) if (isExpired(m.expires_at, now)) await this.deps.store.deleteMemory(m.id);
    } catch (err) {
      this.deps.logger.warn({ err: (err as Error).message }, "mentor: expired-record cleanup skipped");
    }
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

function nonEmptyProfileJson(p: MentorProfile): string {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(p)) {
    const empty = v === null || (Array.isArray(v) && v.length === 0) || (typeof v === "object" && !Array.isArray(v) && Object.keys(v as object).length === 0);
    if (!empty) out[k] = v;
  }
  return Object.keys(out).length > 0 ? JSON.stringify(out) : "";
}

export { profileContent };
