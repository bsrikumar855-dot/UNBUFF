import { createHash } from "node:crypto";
import { addDays, isValidYmd, ymd } from "../placement/dates.js";
import type { LeetCodeImportFormat, LeetCodeImportIssue, LeetCodeSnapshotData } from "../types.js";
import { isValidUsername } from "./profile.js";

/**
 * Reading and validating progress numbers the student supplies themselves (a JSON or CSV file in UNBLUFF's documented
 * format, or the manual form, which produces the same JSON). The file is never trusted: it is parsed, every field is
 * range-checked, related totals must agree, and unknown or duplicate fields are rejected. It carries no user id; the
 * owner is always the signed-in student. Nothing here reaches LeetCode.
 */

export const SCHEMA_VERSION = "unbluff.leetcode-import/1";
/** Bytes of file content accepted. A real file is well under 10 KB. */
export const MAX_IMPORT_BYTES = 64 * 1024;
export const MAX_COUNT = 10_000;
const MAX_TOPICS = 100;
const MAX_ACTIVITY = 400;
const MAX_PER_DAY = 100;
const MAX_RATING = 5_000;
const MAX_RANK = 5_000_000;
const MAX_CONTESTS = 5_000;
const EARLIEST = Date.parse("2015-01-01T00:00:00Z");
const FUTURE_SLACK_MS = 5 * 60_000;
export const STALE_AFTER_DAYS = 45;

const TOPIC_NAME = /^[A-Za-z0-9][A-Za-z0-9 &+/'.-]{0,39}$/;
const CAPTURED = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;
const TOP_KEYS = ["schema_version", "example_data", "source_description", "username", "captured_at", "totals", "available", "topics", "contest", "activity"] as const;

export interface ParsedImport {
  issues: LeetCodeImportIssue[];
  warnings: LeetCodeImportIssue[];
  data: LeetCodeSnapshotData | null;
  source_description: string | null;
  username: string | null;
  hash: string | null;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
// eslint-disable-next-line no-control-regex -- control characters are rejected in free text
const CONTROL = /[\u0000-\u001f\u007f]/;

/** The template students download. Every number is fictitious and the file refuses to import until it is replaced. */
export const TEMPLATE_JSON = {
  schema_version: SCHEMA_VERSION,
  example_data: true,
  source_description: "FICTITIOUS EXAMPLE. Replace every value with your own, then delete the example_data line.",
  captured_at: "2026-01-15T09:30:00+05:30",
  totals: { solved: 60, easy: 30, medium: 24, hard: 6 },
  available: { easy: 900, medium: 1900, hard: 850 },
  topics: [
    { topic: "Array", solved: 28 },
    { topic: "Hash Table", solved: 17 },
    { topic: "Dynamic Programming", solved: 9 },
  ],
  contest: { rating: 1500, global_rank: 250000, attended: 3 },
  activity: [
    { date: "2026-01-12", problems_solved: 2 },
    { date: "2026-01-14", problems_solved: 1 },
  ],
};

export const TEMPLATE_CSV = [
  "key,value",
  `schema_version,${SCHEMA_VERSION}`,
  "example_data,true",
  "source_description,FICTITIOUS EXAMPLE. Replace every value with your own then delete the example_data row.",
  "captured_at,2026-01-15T09:30:00+05:30",
  "solved,60",
  "easy,30",
  "medium,24",
  "hard,6",
  "available_easy,900",
  "available_medium,1900",
  "available_hard,850",
  "contest_rating,1500",
  "contest_global_rank,250000",
  "contest_attended,3",
  "topic:Array,28",
  "topic:Hash Table,17",
  "topic:Dynamic Programming,9",
  "activity:2026-01-12,2",
  "activity:2026-01-14,1",
  "",
].join("\n");

// ---------------- CSV ----------------

/** One CSV row, with RFC 4180 quoting. Returns null for a malformed row (an unterminated quote). */
function splitRow(line: string): string[] | null {
  const cells: string[] = [];
  let cur = "";
  let i = 0;
  while (i <= line.length) {
    if (line[i] === '"') {
      i += 1;
      for (;;) {
        if (i >= line.length) return null;
        if (line[i] === '"') {
          if (line[i + 1] === '"') {
            cur += '"';
            i += 2;
            continue;
          }
          i += 1;
          break;
        }
        cur += line[i];
        i += 1;
      }
      if (i < line.length && line[i] !== ",") return null;
    } else {
      while (i < line.length && line[i] !== ",") {
        cur += line[i];
        i += 1;
      }
    }
    cells.push(cur);
    cur = "";
    i += 1; // past the comma (or the end)
  }
  return cells;
}

const INT = /^\d+$/;
const DECIMAL = /^\d+(?:\.\d+)?$/;
const num = (s: string, decimal = false): number | string => ((decimal ? DECIMAL : INT).test(s) ? Number(s) : s);

/** Turns the documented key,value CSV into the same object the JSON format uses, so there is one validator. */
export function csvToObject(text: string, issues: LeetCodeImportIssue[]): Record<string, unknown> | null {
  const lines = text.split(/\r\n|\n|\r/);
  if (lines.length > MAX_ACTIVITY + MAX_TOPICS + 60) {
    issues.push({ path: "file", message: "The CSV has too many rows." });
    return null;
  }
  const flat = new Map<string, string>();
  const topics: { topic: string; solved: number | string }[] = [];
  const activity: { date: string; problems_solved: number | string }[] = [];
  let first = true;
  let bad = false;
  lines.forEach((raw, n) => {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) return;
    const cells = splitRow(line);
    if (cells === null || cells.length !== 2) {
      issues.push({ path: `line ${n + 1}`, message: 'Each row must be exactly two values: "key,value". Put values that contain a comma in double quotes.' });
      bad = true;
      return;
    }
    const key = cells[0]!.trim();
    const value = cells[1]!.trim();
    if (first) {
      first = false;
      if (key.toLowerCase() === "key" && value.toLowerCase() === "value") return; // optional header row
    }
    if (key.startsWith("topic:")) {
      const name = key.slice(6).trim();
      if (topics.some((t) => t.topic.toLowerCase() === name.toLowerCase())) issues.push({ path: `topics.${name}`, message: `The topic "${name}" appears more than once.` });
      topics.push({ topic: name, solved: num(value) });
      return;
    }
    if (key.startsWith("activity:")) {
      const date = key.slice(9).trim();
      if (activity.some((a) => a.date === date)) issues.push({ path: `activity.${date}`, message: `The date ${date} appears more than once.` });
      activity.push({ date, problems_solved: num(value) });
      return;
    }
    if (flat.has(key)) {
      issues.push({ path: key, message: `"${key}" appears more than once.` });
      return;
    }
    flat.set(key, value);
  });
  if (bad) return null;

  const known = new Set(["schema_version", "example_data", "source_description", "username", "captured_at", "solved", "easy", "medium", "hard", "available_easy", "available_medium", "available_hard", "contest_rating", "contest_global_rank", "contest_attended"]);
  for (const k of flat.keys()) if (!known.has(k)) issues.push({ path: k, message: `Unrecognised key "${k}". Use only the keys in the template.` });
  const get = (k: string) => (flat.has(k) && flat.get(k) !== "" ? flat.get(k)! : undefined);
  const obj: Record<string, unknown> = {};
  if (get("schema_version") !== undefined) obj.schema_version = get("schema_version");
  if (get("example_data") !== undefined) obj.example_data = get("example_data") === "true" ? true : get("example_data");
  if (get("source_description") !== undefined) obj.source_description = get("source_description");
  if (get("username") !== undefined) obj.username = get("username");
  if (get("captured_at") !== undefined) obj.captured_at = get("captured_at");
  const totals: Record<string, unknown> = {};
  for (const k of ["solved", "easy", "medium", "hard"]) if (get(k) !== undefined) totals[k] = num(get(k)!);
  obj.totals = totals;
  const avail: Record<string, unknown> = {};
  for (const k of ["easy", "medium", "hard"]) if (get(`available_${k}`) !== undefined) avail[k] = num(get(`available_${k}`)!);
  if (Object.keys(avail).length > 0) obj.available = avail;
  const contest: Record<string, unknown> = {};
  if (get("contest_rating") !== undefined) contest.rating = num(get("contest_rating")!, true);
  if (get("contest_global_rank") !== undefined) contest.global_rank = num(get("contest_global_rank")!);
  if (get("contest_attended") !== undefined) contest.attended = num(get("contest_attended")!);
  if (Object.keys(contest).length > 0) obj.contest = contest;
  if (topics.length > 0) obj.topics = topics;
  if (activity.length > 0) obj.activity = activity;
  return obj;
}

// ---------------- validation ----------------

export class Collector {
  readonly issues: LeetCodeImportIssue[] = [];
  readonly warnings: LeetCodeImportIssue[] = [];
  bad(path: string, message: string) {
    this.issues.push({ path, message });
  }
  warn(path: string, message: string) {
    this.warnings.push({ path, message });
  }
  /** A whole number in range, or undefined (with the reason recorded). */
  int(v: unknown, path: string, lo: number, hi: number, label: string): number | undefined {
    if (typeof v !== "number" || !Number.isFinite(v)) {
      this.bad(path, typeof v === "string" && v !== "" ? `${label} must be a number, not text ("${v.slice(0, 20)}").` : `${label} must be a whole number.`);
      return undefined;
    }
    if (!Number.isInteger(v)) {
      this.bad(path, `${label} must be a whole number (got ${v}).`);
      return undefined;
    }
    if (v < lo) {
      this.bad(path, v < 0 ? `${label} cannot be negative (got ${v}).` : `${label} must be at least ${lo} (got ${v}).`);
      return undefined;
    }
    if (v > hi) {
      this.bad(path, `${label} is implausibly large (${v}; the limit here is ${hi}).`);
      return undefined;
    }
    return v;
  }
}

/** A timestamp with an explicit time zone, as UTC. The zone is required so a date can never be read in the wrong day. */
function parseCaptured(v: unknown, c: Collector, now: Date): string | undefined {
  if (typeof v !== "string") {
    c.bad("captured_at", "captured_at is required: the date and time the numbers were true, with a time zone, for example 2026-01-15T09:30:00+05:30 or 2026-01-15T04:00:00Z.");
    return undefined;
  }
  const m = CAPTURED.exec(v.trim());
  if (!m) {
    c.bad("captured_at", "captured_at must look like 2026-01-15T09:30:00+05:30 or 2026-01-15T04:00:00Z. A time zone (Z or +hh:mm) is required.");
    return undefined;
  }
  const [, date, hh, mm, ss, zone] = m;
  const off = zone === "Z" ? null : /^([+-])(\d{2}):(\d{2})$/.exec(zone!);
  if (!isValidYmd(date!) || Number(hh) > 23 || Number(mm) > 59 || Number(ss ?? "0") > 59 || (off && (Number(off[2]) > 14 || Number(off[3]) > 59))) {
    c.bad("captured_at", "captured_at is not a real date and time.");
    return undefined;
  }
  const t = Date.parse(v.trim());
  if (!Number.isFinite(t)) {
    c.bad("captured_at", "captured_at is not a real date and time.");
    return undefined;
  }
  if (t > now.getTime() + FUTURE_SLACK_MS) {
    c.bad("captured_at", "captured_at is in the future. Use when the numbers were actually true.");
    return undefined;
  }
  if (t < EARLIEST) {
    c.bad("captured_at", "captured_at is before 2015, which is before LeetCode's problem set existed in this form. Check the year.");
    return undefined;
  }
  return new Date(t).toISOString();
}

/** Validates an already-parsed object (from JSON, or from the CSV converter). */
export function validateObject(raw: unknown, now: Date, c = new Collector()): ParsedImport {
  const empty = (): ParsedImport => ({ issues: c.issues, warnings: c.warnings, data: null, source_description: null, username: null, hash: null });
  if (!isObj(raw)) {
    c.bad("file", "The data must be one JSON object (see the template).");
    return empty();
  }
  for (const k of Object.keys(raw)) {
    if (!(TOP_KEYS as readonly string[]).includes(k)) {
      c.bad(k, /^(user_?id|uid|owner|owner_uid|account|email|password|token|cookie|session|csrf)/i.test(k) ? `"${k}" is not accepted. UNBLUFF never takes an account id from a file, and you must never include a password, cookie or token.` : `Unrecognised field "${k}". Use only the fields in the template.`);
    }
  }
  if (raw.schema_version !== SCHEMA_VERSION) {
    c.bad("schema_version", typeof raw.schema_version === "string" ? `Unsupported schema_version "${raw.schema_version.slice(0, 40)}". This version of UNBLUFF reads "${SCHEMA_VERSION}".` : `schema_version is required and must be "${SCHEMA_VERSION}".`);
  }
  if (raw.example_data !== undefined) {
    c.bad("example_data", raw.example_data === true ? "This is the fictitious example template. Replace every number with your own, then remove the example_data line." : "example_data must be true or left out.");
  }

  let sourceDescription: string | null = null;
  if (raw.source_description !== undefined) {
    if (typeof raw.source_description !== "string" || CONTROL.test(raw.source_description) || raw.source_description.trim().length > 120) c.bad("source_description", "source_description must be plain text of at most 120 characters.");
    else {
      sourceDescription = raw.source_description.trim() || null;
      if (sourceDescription && /^fictitious/i.test(sourceDescription)) c.bad("source_description", "This note says the data is fictitious. Describe where your real numbers came from instead.");
    }
  }
  let username: string | null = null;
  if (raw.username !== undefined) {
    if (typeof raw.username !== "string" || !isValidUsername(raw.username.trim().replace(/^@/, ""))) c.bad("username", "username must be a LeetCode username (2 to 40 letters, digits, underscores or hyphens), or left out.");
    else username = raw.username.trim().replace(/^@/, "");
  }

  const captured = parseCaptured(raw.captured_at, c, now);

  // ---- totals
  const totals = { solved: 0, easy: null as number | null, medium: null as number | null, hard: null as number | null };
  let totalsOk = false;
  if (!isObj(raw.totals)) c.bad("totals", "totals is required (at least totals.solved).");
  else {
    for (const k of Object.keys(raw.totals)) if (!["solved", "easy", "medium", "hard"].includes(k)) c.bad(`totals.${k}`, `Unrecognised field "totals.${k}".`);
    const solved = raw.totals.solved === undefined ? (c.bad("totals.solved", "totals.solved is required."), undefined) : c.int(raw.totals.solved, "totals.solved", 0, MAX_COUNT, "totals.solved");
    const parts = (["easy", "medium", "hard"] as const).map((k) => [k, raw.totals && (raw.totals as Record<string, unknown>)[k]] as const);
    const given = parts.filter(([, v]) => v !== undefined && v !== null);
    let split: Record<string, number> | null = null;
    if (given.length > 0 && given.length < 3) c.bad("totals", `Give all three of easy, medium and hard, or none of them (missing: ${parts.filter(([, v]) => v === undefined || v === null).map(([k]) => k).join(", ")}).`);
    else if (given.length === 3) {
      const got = parts.map(([k, v]) => [k, c.int(v, `totals.${k}`, 0, MAX_COUNT, `totals.${k}`)] as const);
      if (got.every(([, v]) => v !== undefined)) split = Object.fromEntries(got) as Record<string, number>;
    }
    if (solved !== undefined) {
      totals.solved = solved;
      totalsOk = true;
      if (split) {
        const sum = split.easy! + split.medium! + split.hard!;
        if (sum !== solved) {
          c.bad("totals", `easy + medium + hard is ${sum}, but totals.solved is ${solved}. They must agree.`);
          totalsOk = false;
        } else {
          totals.easy = split.easy!;
          totals.medium = split.medium!;
          totals.hard = split.hard!;
        }
      }
    }
  }

  // ---- available
  let available: LeetCodeSnapshotData["available"] = null;
  if (raw.available !== undefined && raw.available !== null) {
    if (!isObj(raw.available)) c.bad("available", "available must be an object with easy, medium and hard.");
    else {
      for (const k of Object.keys(raw.available)) if (!["easy", "medium", "hard"].includes(k)) c.bad(`available.${k}`, `Unrecognised field "available.${k}".`);
      const a = (["easy", "medium", "hard"] as const).map((k) => [k, (raw.available as Record<string, unknown>)[k] === undefined ? (c.bad(`available.${k}`, `available.${k} is required when available is given.`), undefined) : c.int((raw.available as Record<string, unknown>)[k], `available.${k}`, 1, MAX_COUNT, `available.${k}`)] as const);
      if (a.every(([, v]) => v !== undefined)) {
        available = Object.fromEntries(a) as { easy: number; medium: number; hard: number };
        if (totals.easy !== null) {
          for (const k of ["easy", "medium", "hard"] as const) {
            if ((totals[k] as number) > available[k]) {
              c.bad(`available.${k}`, `You report ${totals[k]} ${k} problems solved but only ${available[k]} were available. Check both numbers.`);
              available = null;
              break;
            }
          }
        }
      }
    }
  }

  // ---- topics
  let topics: LeetCodeSnapshotData["topics"] = null;
  if (raw.topics !== undefined && raw.topics !== null) {
    if (!Array.isArray(raw.topics)) c.bad("topics", "topics must be a list of { topic, solved }.");
    else if (raw.topics.length === 0) c.bad("topics", "topics is empty. Leave it out if you have no topic counts.");
    else if (raw.topics.length > MAX_TOPICS) c.bad("topics", `At most ${MAX_TOPICS} topics are accepted.`);
    else {
      const seen = new Set<string>();
      const out: { topic: string; solved: number }[] = [];
      raw.topics.forEach((t: unknown, i) => {
        if (!isObj(t)) return c.bad(`topics.${i}`, "Each topic must be { topic, solved }.");
        for (const k of Object.keys(t)) if (k !== "topic" && k !== "solved") c.bad(`topics.${i}.${k}`, `Unrecognised field "${k}".`);
        const name = typeof t.topic === "string" ? t.topic.trim().replace(/\s+/g, " ") : "";
        if (!TOPIC_NAME.test(name)) return c.bad(`topics.${i}.topic`, "A topic name is 1 to 40 letters, digits, spaces or & + / ' . - characters.");
        const key = name.toLowerCase();
        if (seen.has(key)) return c.bad(`topics.${i}.topic`, `The topic "${name}" appears more than once.`);
        seen.add(key);
        const solved = c.int(t.solved, `topics.${i}.solved`, 0, MAX_COUNT, `The count for "${name}"`);
        if (solved === undefined) return;
        if (totalsOk && solved > totals.solved) return c.bad(`topics.${i}.solved`, `"${name}" has ${solved} solved, which is more than your total of ${totals.solved}.`);
        out.push({ topic: name, solved });
      });
      if (out.length === raw.topics.length) topics = out.sort((a, b) => b.solved - a.solved || a.topic.localeCompare(b.topic));
    }
  }

  // ---- contest
  let contest: LeetCodeSnapshotData["contest"] = null;
  if (raw.contest !== undefined && raw.contest !== null) {
    if (!isObj(raw.contest)) c.bad("contest", "contest must be { rating, global_rank, attended }.");
    else {
      for (const k of Object.keys(raw.contest)) if (!["rating", "global_rank", "attended"].includes(k)) c.bad(`contest.${k}`, `Unrecognised field "contest.${k}".`);
      const v = raw.contest as Record<string, unknown>;
      const present = (k: string) => v[k] !== undefined && v[k] !== null;
      let rating: number | null = null;
      if (present("rating")) {
        if (typeof v.rating !== "number" || !Number.isFinite(v.rating)) c.bad("contest.rating", "contest.rating must be a number.");
        else if (v.rating < 0 || v.rating > MAX_RATING) c.bad("contest.rating", `contest.rating must be between 0 and ${MAX_RATING}.`);
        else rating = Math.round(v.rating * 100) / 100;
      }
      const rank = present("global_rank") ? (c.int(v.global_rank, "contest.global_rank", 1, MAX_RANK, "contest.global_rank") ?? null) : null;
      const attended = present("attended") ? (c.int(v.attended, "contest.attended", 0, MAX_CONTESTS, "contest.attended") ?? null) : null;
      if (!present("rating") && !present("global_rank") && !present("attended")) c.bad("contest", "contest is empty. Leave it out if you have no contest data.");
      else if (c.issues.every((i) => !i.path.startsWith("contest"))) {
        contest = { rating, global_rank: rank, attended };
        if (rating !== null && attended === 0) c.warn("contest", "A contest rating with 0 contests attended is unusual. Check attended.");
      }
    }
  }

  // ---- activity
  let activity: LeetCodeSnapshotData["activity"] = null;
  if (raw.activity !== undefined && raw.activity !== null) {
    if (!Array.isArray(raw.activity)) c.bad("activity", "activity must be a list of { date, problems_solved }.");
    else if (raw.activity.length === 0) c.bad("activity", "activity is empty. Leave it out if you have no per-day records.");
    else if (raw.activity.length > MAX_ACTIVITY) c.bad("activity", `At most ${MAX_ACTIVITY} days of activity are accepted.`);
    else {
      const seen = new Set<string>();
      const out: { date: string; problems_solved: number }[] = [];
      const latestDate = captured ? addDays(ymd(new Date(captured)), 1) : null; // a day of slack for time zones
      raw.activity.forEach((a: unknown, i) => {
        if (!isObj(a)) return c.bad(`activity.${i}`, "Each entry must be { date, problems_solved }.");
        for (const k of Object.keys(a)) if (k !== "date" && k !== "problems_solved") c.bad(`activity.${i}.${k}`, `Unrecognised field "${k}".`);
        const date = typeof a.date === "string" ? a.date : "";
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !isValidYmd(date)) return c.bad(`activity.${i}.date`, `"${String(a.date).slice(0, 20)}" is not a real date. Use YYYY-MM-DD.`);
        if (seen.has(date)) return c.bad(`activity.${i}.date`, `The date ${date} appears more than once.`);
        seen.add(date);
        if (latestDate && date > latestDate) return c.bad(`activity.${i}.date`, `${date} is after captured_at.`);
        const n = c.int(a.problems_solved, `activity.${i}.problems_solved`, 0, MAX_PER_DAY, `problems_solved on ${date}`);
        if (n !== undefined) out.push({ date, problems_solved: n });
      });
      if (out.length === raw.activity.length) {
        const sum = out.reduce((s, x) => s + x.problems_solved, 0);
        if (totalsOk && sum > totals.solved) c.bad("activity", `The activity list adds up to ${sum} problems first solved, which is more than your total of ${totals.solved}.`);
        else {
          activity = out.sort((a, b) => a.date.localeCompare(b.date));
          if (captured && activity[0]!.date < addDays(ymd(new Date(captured)), -366)) c.warn("activity", "Some activity is more than a year before captured_at.");
        }
      }
    }
  }

  // ---- notes for the student (not errors)
  if (captured && totalsOk) {
    if (totals.easy === null) c.warn("totals", "No easy, medium and hard split was supplied, so the difficulty view will show as unavailable.");
    if (totals.solved === 0) c.warn("totals.solved", "The total is 0. This is accepted, but check it is what you meant.");
    const ageDays = Math.floor((now.getTime() - Date.parse(captured)) / 86_400_000);
    if (ageDays > STALE_AFTER_DAYS) c.warn("captured_at", `These numbers are ${ageDays} days old, so they will be shown as out of date.`);
  }

  if (c.issues.length > 0 || !captured || !totalsOk) return { issues: c.issues, warnings: c.warnings, data: null, source_description: sourceDescription, username, hash: null };
  const data: LeetCodeSnapshotData = { captured_at: captured, totals, available, topics, contest, activity };
  return { issues: c.issues, warnings: c.warnings, data, source_description: sourceDescription, username, hash: hashSnapshot(data) };
}

/** The identity of a snapshot: the same numbers captured at the same moment always give the same id, whatever the file format. */
export function hashSnapshot(d: LeetCodeSnapshotData): string {
  const canonical = JSON.stringify({
    c: d.captured_at,
    t: [d.totals.solved, d.totals.easy, d.totals.medium, d.totals.hard],
    a: d.available ? [d.available.easy, d.available.medium, d.available.hard] : null,
    p: d.topics ? [...d.topics].sort((x, y) => x.topic.toLowerCase().localeCompare(y.topic.toLowerCase())).map((x) => [x.topic.toLowerCase(), x.solved]) : null,
    k: d.contest ? [d.contest.rating, d.contest.global_rank, d.contest.attended] : null,
    v: d.activity ? d.activity.map((x) => [x.date, x.problems_solved]) : null,
  });
  return createHash("sha256").update(canonical).digest("hex").slice(0, 32);
}

/** Parses and validates a student's file or form content. Never throws on bad input: problems come back as `issues`. */
export function parseImport(format: LeetCodeImportFormat, content: string, now: Date): ParsedImport {
  const c = new Collector();
  const fail = (): ParsedImport => ({ issues: c.issues, warnings: c.warnings, data: null, source_description: null, username: null, hash: null });
  if (Buffer.byteLength(content, "utf8") > MAX_IMPORT_BYTES) {
    c.bad("file", `The data is larger than ${MAX_IMPORT_BYTES / 1024} KB. A progress file should be a few KB.`);
    return fail();
  }
  const text = content.replace(/^\uFEFF/, "");
  if (text.trim() === "") {
    c.bad("file", "The file is empty.");
    return fail();
  }
  // eslint-disable-next-line no-control-regex -- binary data is not a text export
  if (/[\u0000-\u0008\u000e-\u001f]/.test(text)) {
    c.bad("file", "This does not look like a text file. Use the JSON or CSV format in the template.");
    return fail();
  }
  let obj: unknown;
  if (format === "json") {
    try {
      obj = JSON.parse(text);
    } catch (e) {
      c.bad("file", `This is not valid JSON (${(e as Error).message.slice(0, 100)}).`);
      return fail();
    }
  } else {
    obj = csvToObject(text, c.issues);
    if (obj === null || c.issues.length > 0) {
      if (obj !== null) validateObject(obj, now, c); // report the rest of the problems in the same pass
      return fail();
    }
  }
  return validateObject(obj, now, c);
}
