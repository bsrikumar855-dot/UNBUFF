import type { MemoryRecord } from "./store.js";

/**
 * Explicit, deterministic memory retrieval: by owner (the caller only passes this student's records), type, topic
 * and recency. No embeddings. Expired memories are never returned, and the result is bounded in count and characters.
 */

export interface RetrievalLimits {
  profile: number;
  goals: number;
  learning: number;
  summaries: number;
  maxChars: number;
}

export const DEFAULT_RETRIEVAL: RetrievalLimits = { profile: 8, goals: 5, learning: 6, summaries: 3, maxChars: 3000 };
const DAY_MS = 86_400_000;

/** Topics from the catalogue that the text mentions (whole-word, case-insensitive). */
export function topicsIn(text: string, known: string[]): string[] {
  const lower = ` ${text.toLowerCase().replace(/[^a-z0-9+#]+/g, " ")} `;
  return known.filter((t) => lower.includes(` ${t.toLowerCase().replace(/[^a-z0-9+#]+/g, " ").trim()} `));
}

const isExpired = (m: MemoryRecord, now: number) => m.expires_at !== null && Date.parse(m.expires_at) <= now;

function relevance(m: MemoryRecord, topics: string[], now: number): number {
  const text = `${m.topic ?? ""} ${m.content}`.toLowerCase();
  const matches = topics.filter((t) => text.includes(t.toLowerCase())).length;
  const ageDays = Math.max(0, (now - Date.parse(m.updated_at)) / DAY_MS);
  const verified = m.provenance === "verified_record" || m.provenance === "student_provided" ? 1 : 0;
  return matches * 5 + verified + Math.max(0, 3 - ageDays / 30);
}

export function selectMemories(all: MemoryRecord[], opts: { topics: string[]; now: Date; limits?: RetrievalLimits }): MemoryRecord[] {
  const limits = opts.limits ?? DEFAULT_RETRIEVAL;
  const now = opts.now.getTime();
  const live = all.filter((m) => !isExpired(m, now));
  const byScore = (a: MemoryRecord, b: MemoryRecord) => relevance(b, opts.topics, now) - relevance(a, opts.topics, now) || b.updated_at.localeCompare(a.updated_at) || a.id.localeCompare(b.id);

  const profile = live.filter((m) => m.type === "profile").sort((a, b) => (a.key ?? "").localeCompare(b.key ?? "")).slice(0, limits.profile);
  const goals = live.filter((m) => m.type === "goal" && m.status === "active").sort(byScore).slice(0, limits.goals);

  const learning = live.filter((m) => m.type === "learning");
  const matchingLearning = learning.filter((m) => relevance(m, opts.topics, now) >= 5).sort(byScore);
  const otherLearning = learning.filter((m) => !matchingLearning.includes(m)).sort(byScore).slice(0, 2);
  const learningPick = [...matchingLearning, ...otherLearning].slice(0, limits.learning);

  const summaries = live.filter((m) => m.type === "summary");
  const matchingSummaries = summaries.filter((m) => relevance(m, opts.topics, now) >= 5).sort(byScore);
  const summaryPick = (matchingSummaries.length > 0 ? matchingSummaries : [...summaries].sort(byScore).slice(0, 1)).slice(0, limits.summaries);

  const out: MemoryRecord[] = [];
  let chars = 0;
  for (const m of [...profile, ...goals, ...learningPick, ...summaryPick]) {
    if (chars + m.content.length > limits.maxChars) continue;
    chars += m.content.length;
    out.push(m);
  }
  return out;
}
