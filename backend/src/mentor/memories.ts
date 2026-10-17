import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { MentorMemoryProposal } from "../llm/schemas.js";
import type { Catalogue } from "../dsa/catalogue.js";
import type { CodeLanguageId, ExplanationStyle, GoalTrack, MentorMemory, MentorProfile, MentorRetention, SkillLevel } from "../types.js";
import type { MemoryRecord } from "./store.js";

/**
 * Memory rules. Memories are only created from (a) the student's own explicit statements, checked against their
 * actual message, (b) the student editing them directly, or (c) a labelled model summary of a conversation.
 * Provenance is decided here, never by the model.
 */

export const MAX_MEMORIES_PER_STUDENT = 300;
export const MAX_ACTIVE_GOALS = 10;
export const MAX_UPDATES_PER_TURN = 5;
const DAY_MS = 86_400_000;

export interface RetentionConfig {
  conversationDays: number;
  summaryDays: number;
  learningDays: number;
}

export const DEFAULT_RETENTION: RetentionConfig = { conversationDays: 90, summaryDays: 365, learningDays: 180 };

export const retentionInfo = (r: RetentionConfig): MentorRetention => ({
  conversation_days: r.conversationDays,
  summary_days: r.summaryDays,
  learning_days: r.learningDays,
  profile_and_goals: "until you delete them",
});

export const addDays = (iso: string, days: number): string => new Date(Date.parse(iso) + days * DAY_MS).toISOString();
export const newMemoryId = (): string => `mem_${randomUUID()}`;
const hash = (s: string) => createHash("sha1").update(s).digest("hex").slice(0, 24);
export const profileMemoryId = (uid: string, field: string): string => `prof_${field}_${hash(uid)}`;
export const summaryMemoryId = (conversationId: string): string => `sum_${hash(conversationId)}`;
export const conversationIdFor = (uid: string, clientMessageId: string): string => `conv_${hash(`${uid}:${clientMessageId}`)}`;

/** True for control characters other than tab and newline (those are kept and then collapsed to spaces). */
export function isControl(ch: string): boolean {
  const c = ch.charCodeAt(0);
  return (c < 32 && c !== 9 && c !== 10) || c === 127;
}

/** Replaces control characters (including tabs and newlines would be collapsed by cleanText) with spaces. */
export function stripControl(s: string): string {
  return s.split("").map((ch) => (isControl(ch) ? " " : ch)).join("");
}

/** Plain text only: no markup that could pose as one of our prompt delimiters, no control characters, bounded length. */
export function cleanText(s: string, max: number): string {
  return s
    .split("")
    .map((ch) => (isControl(ch) ? " " : ch))
    .join("")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/** Removes obvious personal identifiers (emails, phone-like numbers) from text that is stored long term. */
export function redactPii(s: string): string {
  return s.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email removed]").replace(/(?<!\d)(?:\+?\d[\d\s().-]{8,}\d)(?!\d)/g, "[number removed]");
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

// ---------------- profile ----------------

export const EMPTY_PROFILE: MentorProfile = {
  target_roles: [],
  target_companies: [],
  preferred_languages: [],
  daily_study_minutes: null,
  placement_timeline: null,
  explanation_style: null,
  current_goals: null,
  skill_self_assessment: {},
};

const short = z.string().trim().min(1).max(60);
export const ProfileInput = z.strictObject({
  target_roles: z.array(short).max(10),
  target_companies: z.array(short).max(10),
  preferred_languages: z.array(z.enum(["python", "javascript", "cpp", "java"])).max(4),
  daily_study_minutes: z.number().int().min(10).max(720).nullable(),
  placement_timeline: z.string().trim().min(1).max(100).nullable(),
  explanation_style: z.enum(["concise", "detailed", "step_by_step"]).nullable(),
  current_goals: z.string().trim().min(1).max(300).nullable(),
  skill_self_assessment: z.record(z.string().trim().min(1).max(40), z.enum(["beginner", "intermediate", "advanced"])).refine((r) => Object.keys(r).length <= 20, "at most 20 skills"),
});

export const PROFILE_FIELDS = Object.keys(EMPTY_PROFILE) as (keyof MentorProfile)[];

const PROFILE_LABEL: Record<keyof MentorProfile, string> = {
  target_roles: "Target roles",
  target_companies: "Target companies",
  preferred_languages: "Preferred languages",
  daily_study_minutes: "Daily study time",
  placement_timeline: "Placement timeline",
  explanation_style: "Preferred explanation style",
  current_goals: "Current preparation goals",
  skill_self_assessment: "Self-assessed skills (your opinion, not measured)",
};

export function profileContent(field: keyof MentorProfile, value: unknown): string {
  if (Array.isArray(value)) return `${PROFILE_LABEL[field]}: ${value.join(", ")}`;
  if (field === "daily_study_minutes") return `${PROFILE_LABEL[field]}: ${value} minutes`;
  if (field === "skill_self_assessment") return `${PROFILE_LABEL[field]}: ${Object.entries(value as Record<string, string>).map(([k, v]) => `${k} (${v})`).join(", ")}`;
  return `${PROFILE_LABEL[field]}: ${String(value)}`;
}

const isEmptyValue = (v: unknown) => v === null || v === undefined || (Array.isArray(v) && v.length === 0) || (typeof v === "object" && !Array.isArray(v) && Object.keys(v as object).length === 0);

/** Rebuilds the profile from stored profile memories. Unknown or malformed values are ignored. */
export function profileFromMemories(records: MemoryRecord[]): { profile: MentorProfile; updated_at: string | null } {
  const profile: MentorProfile = structuredClone(EMPTY_PROFILE);
  let updated: string | null = null;
  for (const r of records) {
    if (r.type !== "profile" || !r.key || !(PROFILE_FIELDS as string[]).includes(r.key)) continue;
    const field = r.key as keyof MentorProfile;
    const parsed = ProfileInput.shape[field].safeParse(r.value);
    if (parsed.success) (profile as unknown as Record<string, unknown>)[field] = parsed.data;
    if (updated === null || r.updated_at > updated) updated = r.updated_at;
  }
  return { profile, updated_at: updated };
}

/** The records that make up a profile: one memory per non-empty field, student-provided, no expiry. */
export function profileRecords(uid: string, profile: MentorProfile, existing: Map<string, MemoryRecord>, now: string): { save: MemoryRecord[]; remove: string[] } {
  const save: MemoryRecord[] = [];
  const remove: string[] = [];
  for (const field of PROFILE_FIELDS) {
    const id = profileMemoryId(uid, field);
    const value = profile[field];
    if (isEmptyValue(value)) {
      if (existing.has(id)) remove.push(id);
      continue;
    }
    const prev = existing.get(id);
    save.push({
      id,
      owner_uid: uid,
      type: "profile",
      key: field,
      topic: null,
      content: profileContent(field, value),
      value,
      provenance: "student_provided",
      confidence: "high",
      signal: null,
      status: null,
      track: null,
      completed_by: null,
      source_conversation_id: null,
      created_at: prev?.created_at ?? now,
      updated_at: now,
      expires_at: null,
      review_at: null,
    });
  }
  return { save, remove };
}

// ---------------- model proposals ----------------

export interface Rejected {
  reason: string;
}

export type Draft =
  | { kind: "profile"; field: keyof MentorProfile; value: unknown; content: string; quote: string }
  | { kind: "learning"; topic: string; signal: NonNullable<MentorMemory["signal"]>; content: string; quote: string }
  | { kind: "goal"; content: string; track: GoalTrack | null; quote: string };

const STYLE: Record<string, ExplanationStyle> = { concise: "concise", brief: "concise", short: "concise", detailed: "detailed", thorough: "detailed", step_by_step: "step_by_step", "step by step": "step_by_step", steps: "step_by_step" };
const LANGUAGE: Record<string, CodeLanguageId> = { python: "python", javascript: "javascript", js: "javascript", cpp: "cpp", "c++": "cpp", java: "java" };

function list(content: string): string[] {
  return content.split(/[,;]|\band\b/i).map((x) => cleanText(x, 60)).filter(Boolean).slice(0, 10);
}

/**
 * Turns the model's proposals into drafts, discarding anything that is not backed by the student's own words.
 * A proposal survives only if its evidence_quote appears, verbatim (ignoring case and spacing), in the student's
 * latest message. Retrieved memories, summaries and model text can therefore never create new memories.
 */
export function validateProposals(proposals: MentorMemoryProposal[], studentMessage: string, catalogue: Catalogue): { drafts: Draft[]; rejected: Rejected[] } {
  const drafts: Draft[] = [];
  const rejected: Rejected[] = [];
  const message = norm(studentMessage);
  const topics = new Set(catalogue.allTopics().map((t) => t.toLowerCase()));

  for (const p of proposals.slice(0, MAX_UPDATES_PER_TURN)) {
    const quote = cleanText(p.evidence_quote, 300);
    if (quote.length < 4 || !message.includes(norm(quote))) {
      rejected.push({ reason: "the student's message does not contain the supporting quote" });
      continue;
    }
    const content = redactPii(cleanText(p.content, 300));
    if (!content) {
      rejected.push({ reason: "empty content" });
      continue;
    }

    if (p.type === "profile") {
      const field = p.field as keyof MentorProfile | null;
      if (!field || !(PROFILE_FIELDS as string[]).includes(field) || field === "skill_self_assessment") {
        rejected.push({ reason: "unsupported profile field" });
        continue;
      }
      let value: unknown;
      if (field === "target_roles" || field === "target_companies") value = list(content);
      else if (field === "preferred_languages") value = list(content).map((l) => LANGUAGE[l.toLowerCase()]).filter((l): l is CodeLanguageId => Boolean(l));
      else if (field === "daily_study_minutes") {
        const m = /(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m)?/i.exec(content);
        const n = m ? Math.round(Number(m[1]) * (/^h/i.test(m[2] ?? "") ? 60 : 1)) : NaN;
        value = Number.isFinite(n) && n >= 10 && n <= 720 ? n : undefined;
      } else if (field === "explanation_style") value = STYLE[content.toLowerCase().replace(/-/g, "_")] ?? STYLE[content.toLowerCase()];
      else value = content;
      if (value === undefined || isEmptyValue(value)) {
        rejected.push({ reason: "could not read a valid value" });
        continue;
      }
      drafts.push({ kind: "profile", field, value, content, quote });
    } else if (p.type === "learning") {
      const topic = p.topic ? cleanText(p.topic, 60) : "";
      if (!topic || !p.signal) {
        rejected.push({ reason: "learning memories need a topic and a signal" });
        continue;
      }
      drafts.push({ kind: "learning", topic, signal: p.signal, content, quote });
    } else {
      let track: GoalTrack | null = null;
      if (p.track_kind === "question_solved" || p.track_kind === "revision_completed") {
        if (p.track_question_id && catalogue.hasQuestion(p.track_question_id)) track = { kind: p.track_kind, question_id: p.track_question_id };
      } else if (p.track_kind === "topic_practice") {
        if (p.track_topic && topics.has(p.track_topic.toLowerCase()) && p.track_target) {
          const topic = catalogue.allTopics().find((t) => t.toLowerCase() === p.track_topic!.toLowerCase())!;
          track = { kind: "topic_practice", topic, target: p.track_target };
        }
      }
      drafts.push({ kind: "goal", content, track, quote });
    }
  }
  if (proposals.length > MAX_UPDATES_PER_TURN) rejected.push({ reason: "too many updates in one turn" });
  return { drafts, rejected };
}

export interface ApplyResult {
  saved: MemoryRecord[];
  removed: string[];
}

/** Merges drafts into the student's memories (dedupe, supersede, caps). Pure: the caller persists the result. */
export function applyDrafts(uid: string, drafts: Draft[], existing: MemoryRecord[], conversationId: string | null, now: string, retention: RetentionConfig): ApplyResult {
  const byId = new Map(existing.map((m) => [m.id, m]));
  const saved: MemoryRecord[] = [];
  const removed: string[] = [];
  let total = existing.length;
  let activeGoals = existing.filter((m) => m.type === "goal" && m.status === "active").length;

  const base = (over: Partial<MemoryRecord> & Pick<MemoryRecord, "id" | "type" | "content">): MemoryRecord => ({
    owner_uid: uid,
    key: null,
    topic: null,
    provenance: "student_provided",
    confidence: "medium",
    signal: null,
    status: null,
    track: null,
    completed_by: null,
    source_conversation_id: conversationId,
    created_at: now,
    updated_at: now,
    expires_at: null,
    review_at: null,
    ...over,
  });

  for (const d of drafts) {
    if (d.kind === "profile") {
      const id = profileMemoryId(uid, d.field);
      const prev = byId.get(id);
      let value = d.value;
      if (Array.isArray(value) && Array.isArray(prev?.value)) value = Array.from(new Set([...(prev!.value as string[]), ...(value as string[])])).slice(0, 10);
      const rec = base({ id, type: "profile", key: d.field, content: profileContent(d.field, value), value, confidence: "high", created_at: prev?.created_at ?? now });
      if (!prev && total >= MAX_MEMORIES_PER_STUDENT) continue;
      if (!prev) total += 1;
      byId.set(id, rec);
      saved.push(rec);
    } else if (d.kind === "learning") {
      const topicKey = norm(d.topic);
      const sameId = `learn_${hash(`${uid}:${topicKey}:${d.signal}`)}`;
      const prev = byId.get(sameId);
      // A newer "understood" replaces "difficult" for the same topic (and the other way round).
      const opposite = d.signal === "understood" ? "difficult" : d.signal === "difficult" ? "understood" : null;
      if (opposite) {
        const oppId = `learn_${hash(`${uid}:${topicKey}:${opposite}`)}`;
        if (byId.has(oppId)) {
          byId.delete(oppId);
          removed.push(oppId);
          total -= 1;
        }
      }
      if (!prev && total >= MAX_MEMORIES_PER_STUDENT) continue;
      if (!prev) total += 1;
      const rec = base({
        id: sameId,
        type: "learning",
        topic: d.topic,
        content: d.content,
        signal: d.signal,
        confidence: "medium",
        expires_at: addDays(now, retention.learningDays),
        review_at: d.signal === "difficult" || d.signal === "studied" ? addDays(now, 30) : null,
        created_at: prev?.created_at ?? now,
      });
      byId.set(sameId, rec);
      saved.push(rec);
    } else {
      const id = `goal_${hash(`${uid}:${norm(d.content)}`)}`;
      const prev = byId.get(id);
      if (prev && prev.status === "active") continue; // the same goal is already being tracked
      if (activeGoals >= MAX_ACTIVE_GOALS || (!prev && total >= MAX_MEMORIES_PER_STUDENT)) continue;
      if (!prev) total += 1;
      activeGoals += 1;
      const rec = base({ id, type: "goal", content: d.content, status: "active", track: d.track, confidence: "medium" });
      byId.set(id, rec);
      saved.push(rec);
    }
  }
  return { saved, removed };
}

export function toPublicMemory(r: MemoryRecord): MentorMemory {
  const { owner_uid: _o, value: _v, ...rest } = r;
  return rest;
}

export type { SkillLevel };
