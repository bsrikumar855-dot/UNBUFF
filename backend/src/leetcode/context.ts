import type { LeetCodeSnapshotData, LeetCodeSourceKind } from "../types.js";

/**
 * What the rest of UNBLUFF (the AI mentor and the placement planner) may know about a student's imported LeetCode
 * numbers. It is deliberately small: aggregates only, no username, no free text written by the student, and no
 * credentials (none exist). Every consumer is told the numbers are the student's own, were captured on a stated date,
 * are not live, and are not verified, so they are context and never a measure of ability.
 */

export interface LeetCodeEvidence {
  status: "none" | "available";
  linked: boolean;
  captured_at: string | null;
  imported_at: string | null;
  age_days: number | null;
  stale: boolean;
  source_kind: LeetCodeSourceKind | null;
  snapshot_count: number;
  data: LeetCodeSnapshotData | null;
  /** The earliest imported snapshot, for the change between two real imports. */
  first: { captured_at: string; solved: number } | null;
}

export const NONE_EVIDENCE: LeetCodeEvidence = { status: "none", linked: false, captured_at: null, imported_at: null, age_days: null, stale: false, source_kind: null, snapshot_count: 0, data: null, first: null };

const TOPIC = /\b(leet ?code|lc (?:stats|profile|progress|problems)|imported (?:stats|statistics|data|numbers|progress)|my (?:coding|problem[- ]solving) (?:stats|statistics|progress))\b/i;

/** Only questions about LeetCode or the student's imported statistics get LeetCode context (the student can also turn it on explicitly). */
export const wantsLeetcode = (message: string): boolean => TOPIC.test(message);

export const NO_DATA_TEXT =
  "(The student has NOT imported any LeetCode data. You have NO LeetCode statistics. Say so, do not guess or estimate any number, and suggest they link their LeetCode profile and import their own numbers from the Settings or LeetCode page. Linking a profile alone provides no statistics.)";

const KIND_TEXT: Record<LeetCodeSourceKind, string> = { manual_entry: "typed into UNBLUFF by the student", json_file: "a JSON file the student uploaded", csv_file: "a CSV file the student uploaded" };

/** Topic names differ in plural and spacing between sources ("Array" and "Arrays"); this is the only matching UNBLUFF does, and it is exact after this. */
export const normalizeTopic = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, "").replace(/s$/, "");

const MAX_CHARS = 1900;

export function leetcodeBlock(e: LeetCodeEvidence): string {
  if (e.status !== "available" || !e.data) return NO_DATA_TEXT;
  const d = e.data;
  const lines = [
    `Source: numbers the student supplied themselves (${e.source_kind ? KIND_TEXT[e.source_kind] : "unknown origin"}). They are NOT live, were NOT synchronised with LeetCode, and are NOT verified. Captured ${e.captured_at}, imported ${e.imported_at}${e.stale ? ` (STALE: ${e.age_days} days old, so they may be well out of date)` : e.age_days !== null ? ` (${e.age_days} days old)` : ""}.`,
    "WHAT THE STUDENT'S DATA SAYS:",
    `- Problems solved as reported by the student: ${d.totals.solved}${d.totals.easy !== null ? ` (easy ${d.totals.easy}, medium ${d.totals.medium}, hard ${d.totals.hard})` : "; no easy/medium/hard split was supplied"}.`,
  ];
  if (d.available) lines.push(`- Problems available per difficulty at capture: easy ${d.available.easy}, medium ${d.available.medium}, hard ${d.available.hard}.`);
  if (d.topics && d.topics.length > 0) {
    const sorted = [...d.topics].sort((a, b) => b.solved - a.solved || a.topic.localeCompare(b.topic));
    lines.push(`- Topic counts supplied (${sorted.length} topics): ${sorted.slice(0, 8).map((t) => `${t.topic} ${t.solved}`).join(", ")}${sorted.length > 8 ? ", …" : ""}.`);
    if (sorted.length > 3) lines.push(`- Lowest among the topics supplied (topics not listed are unknown, not zero): ${sorted.slice(-4).reverse().map((t) => `${t.topic} ${t.solved}`).join(", ")}.`);
  } else lines.push("- Topic counts: not supplied.");
  lines.push(d.contest ? `- Contest data supplied: rating ${d.contest.rating ?? "not given"}, global rank ${d.contest.global_rank ?? "not given"}, contests attended ${d.contest.attended ?? "not given"}.` : "- Contest data: not supplied.");
  if (d.activity && d.activity.length > 0) {
    const total = d.activity.reduce((s, a) => s + a.problems_solved, 0);
    lines.push(`- Activity records supplied: ${total} problems first solved across ${d.activity.length} dated days, the latest on ${d.activity.at(-1)!.date}.`);
  } else lines.push("- Per-day activity: not supplied.");
  lines.push(e.first && e.snapshot_count > 1 && e.captured_at && e.first.captured_at < e.captured_at ? `- Change across ${e.snapshot_count} imported snapshots (${e.first.captured_at.slice(0, 10)} to ${e.captured_at.slice(0, 10)}): ${d.totals.solved - e.first.solved >= 0 ? "+" : ""}${d.totals.solved - e.first.solved} solved.` : "- Progress over time: only one snapshot has been imported, so no trend exists.");
  lines.push("These are separate from the student's UNBLUFF judged submissions and must never be added to them or described as verified problem-solving.");
  return lines.join("\n").slice(0, MAX_CHARS);
}
