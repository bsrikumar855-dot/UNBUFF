import { createHash } from "node:crypto";
import { ApiError } from "../errors.js";
import type { Logger } from "../logger.js";
import type {
  LeetCodeConnection,
  LeetCodeConnectionResponse,
  LeetCodeFreshness,
  LeetCodeHistoryResponse,
  LeetCodeImportConfirmRequest,
  LeetCodeImportConfirmResponse,
  LeetCodeImportIssue,
  LeetCodeImportPreview,
  LeetCodeImportRequest,
  LeetCodeInsightsResponse,
  LeetCodeSnapshotSummary,
  LeetCodeSourceInfo,
  LeetCodeSourceKind,
  LeetCodeUnlinkResponse,
} from "../types.js";
import { NONE_EVIDENCE, leetcodeBlock, NO_DATA_TEXT, type LeetCodeEvidence } from "./context.js";
import { MAX_IMPORT_BYTES, parseImport } from "./importer.js";
import { LeetCodeLookupError, type LeetCodeLookup } from "./lookup.js";
import { parseProfile, profileUrl } from "./profile.js";
import { SNAPSHOT_ID, type LeetCodeStore, type SnapshotRecord } from "./store.js";

/**
 * The LeetCode service: a saved username, and progress numbers the student imports themselves. It never contacts
 * LeetCode (its terms forbid crawling and scraping and there is no official API), so nothing here is live, nothing is
 * verified, and ownership of the profile is never established. Imported numbers are labelled as the student's own and
 * are kept apart from UNBLUFF's judged submissions: no other module can read them as solved questions.
 */

export const MAX_SNAPSHOTS = 120;
const RECENT_DAYS = 14;
const AGING_DAYS = 45;
const DAY_MS = 86_400_000;
/** One outgoing lookup per student per this long: the same answer is returned instead of asking LeetCode again. */
const MIN_LOOKUP_INTERVAL_MS = 10 * 60_000;

export const NOTES: string[] = [
  "LeetCode has no official API, sign-in or export that UNBLUFF can use, and its terms forbid scraping, so UNBLUFF never contacts LeetCode. This is not a live connection.",
  "Linking saves your username and builds a link to your public profile. It does not prove that the profile is yours.",
  "Numbers appear only if you import them yourself. They are shown as your own supplied data, dated by when you said they were captured.",
];

/** The same notes, worded truthfully for a deployment where the operator enabled the unofficial lookup. */
export const NOTES_WITH_LOOKUP: string[] = [
  "LeetCode has no official API, sign-in or export that UNBLUFF can use. The numbers here come from an unofficial lookup of your public profile, made only when you ask, or from numbers you typed or imported. This is not an official connection.",
  "Linking saves your username (checked against LeetCode's public profiles) and builds a link to your public profile. It does not prove that the profile is yours.",
  "Numbers are shown with their source and capture date. A lookup returns solved counts only; topics, contest data and activity appear only if you import them.",
];

export interface LeetCodeDeps {
  store: LeetCodeStore;
  logger: Logger;
  /** UNBLUFF's own judged results, only ever shown beside (never added to) the LeetCode numbers. */
  judged?: (uid: string) => Promise<{ solved_unique: number; available: boolean }>;
  /** Present only when the operator enabled the unofficial public lookup. Absent: UNBLUFF never contacts LeetCode. */
  lookup?: LeetCodeLookup;
  now?: () => Date;
}

const sourceLabel = (k: LeetCodeSourceKind): string => k === "public_lookup" ? "Looked up from your public LeetCode profile · not verified as yours" : `${k === "manual_entry" ? "Typed in by you" : k === "json_file" ? "From your JSON file" : "From your CSV file"} · not synchronised with LeetCode`;

const FIELD_ORDER = ["difficulty", "available", "topics", "contest", "activity"] as const;

export class LeetCodeService {
  constructor(private readonly deps: LeetCodeDeps) {}

  private notes(): string[] {
    return this.deps.lookup ? NOTES_WITH_LOOKUP : NOTES;
  }

  private now(): Date {
    return this.deps.now ? this.deps.now() : new Date();
  }

  private freshness(capturedAt: string | null): { freshness: LeetCodeFreshness; age_days: number | null } {
    if (!capturedAt) return { freshness: "none", age_days: null };
    const age = Math.max(0, Math.floor((this.now().getTime() - Date.parse(capturedAt)) / DAY_MS));
    return { freshness: age <= RECENT_DAYS ? "recent" : age <= AGING_DAYS ? "aging" : "stale", age_days: age };
  }

  private async all(uid: string): Promise<SnapshotRecord[]> {
    return (await this.deps.store.listSnapshots(uid, MAX_SNAPSHOTS + 1)).sort((a, b) => b.captured_at.localeCompare(a.captured_at) || b.imported_at.localeCompare(a.imported_at));
  }

  private summary(r: SnapshotRecord): LeetCodeSnapshotSummary {
    return {
      id: r.id,
      captured_at: r.captured_at,
      imported_at: r.imported_at,
      solved: r.totals.solved,
      easy: r.totals.easy,
      medium: r.totals.medium,
      hard: r.totals.hard,
      source: r.source,
      linked_username: r.linked_username,
      fields: FIELD_ORDER.filter((f) => (f === "difficulty" ? r.totals.easy !== null : f === "available" ? r.available !== null : f === "topics" ? r.topics !== null : f === "contest" ? r.contest !== null : r.activity !== null)),
    };
  }

  // ---------------- connection ----------------

  private build(conn: Awaited<ReturnType<LeetCodeStore["getConnection"]>>, snaps: SnapshotRecord[]): LeetCodeConnection {
    const latest = snaps[0] ?? null; // newest capture
    const f = this.freshness(latest?.captured_at ?? null);
    const lastImport = snaps.reduce<SnapshotRecord | null>((a, s) => (a === null || s.imported_at > a.imported_at ? s : a), null);
    return {
      linked: conn !== null,
      username: conn?.username ?? null,
      profile_url: conn?.profile_url ?? null,
      linked_at: conn?.linked_at ?? null,
      mode: "profile_link_and_manual_import",
      states: { profile_linked: conn !== null, ownership_unverified: true, imported_data_available: snaps.length > 0, officially_connected: false, live_sync_unavailable: true },
      imported: { snapshot_count: snaps.length, last_imported_at: lastImport?.imported_at ?? null, last_captured_at: latest?.captured_at ?? null, last_source: lastImport?.source ?? null, ...f },
      limits: { max_import_bytes: MAX_IMPORT_BYTES, max_snapshots: MAX_SNAPSHOTS },
      notes: this.notes(),
    };
  }

  async connection(uid: string): Promise<LeetCodeConnection> {
    const [conn, snaps] = await Promise.all([this.deps.store.getConnection(uid), this.all(uid)]);
    return this.build(conn, snaps);
  }

  /** Saves a username. Nothing is looked up and nothing is verified. */
  async link(uid: string, profile: string): Promise<LeetCodeConnectionResponse> {
    const parsed = parseProfile(profile);
    if (!parsed.ok) throw new ApiError("BAD_REQUEST", parsed.message);
    await this.checkUsernameExists(parsed.username);
    const now = this.now().toISOString();
    const prev = await this.deps.store.getConnection(uid);
    const same = prev && prev.username_key === parsed.username.toLowerCase();
    await this.deps.store.saveConnection({
      owner_uid: uid,
      username: parsed.username,
      username_key: parsed.username.toLowerCase(),
      profile_url: profileUrl(parsed.username),
      linked_at: same ? prev.linked_at : now,
      updated_at: now,
    });
    return { connection: await this.connection(uid) };
  }

  /** True only when the operator enabled the unofficial public lookup. */
  lookupAvailable(): boolean {
    return this.deps.lookup !== undefined;
  }

  /**
   * With the lookup enabled, a username must match a real public LeetCode profile before it is saved. An outage on
   * LeetCode's side never blocks linking: the name is saved unchecked and numbers can be fetched later.
   */
  private async checkUsernameExists(username: string): Promise<void> {
    if (!this.deps.lookup) return;
    try {
      if ((await this.deps.lookup.lookup(username)).status === "not_found") {
        throw new ApiError("BAD_REQUEST", `LeetCode has no public profile named "${username}". Check the spelling.`);
      }
    } catch (e) {
      if (!(e instanceof LeetCodeLookupError)) throw e;
      this.deps.logger.warn({}, "leetcode: username check skipped, LeetCode unreachable");
    }
  }

  /**
   * Fetches the linked username's public solved counts and stores them as a snapshot labelled as a lookup (never as
   * verified or as proof the profile is the student's). Throttled, and identical numbers are not stored twice.
   */
  async lookupAndStore(uid: string): Promise<LeetCodeImportConfirmResponse> {
    const lookup = this.deps.lookup;
    if (!lookup) throw new ApiError("NOT_FOUND", "Looking numbers up from LeetCode is not enabled on this server.");
    const [conn, snaps] = await Promise.all([this.deps.store.getConnection(uid), this.all(uid)]);
    if (!conn) throw new ApiError("BAD_REQUEST", "Link your LeetCode username first.");
    const done = async (record: SnapshotRecord, status: "imported" | "already_imported"): Promise<LeetCodeImportConfirmResponse> => ({ status, snapshot: this.summary(record), connection: await this.connection(uid) });

    const recent = snaps.find((s) => s.source.kind === "public_lookup" && this.now().getTime() - Date.parse(s.imported_at) < MIN_LOOKUP_INTERVAL_MS);
    if (recent) return done(recent, "already_imported");

    let result;
    try {
      result = await lookup.lookup(conn.username);
    } catch (e) {
      if (e instanceof LeetCodeLookupError) throw new ApiError("LEETCODE_UNAVAILABLE", "LeetCode could not be reached right now. Try again in a few minutes, or type your numbers in.");
      throw e;
    }
    if (result.status === "not_found") throw new ApiError("BAD_REQUEST", `LeetCode has no public profile named "${conn.username}". Update the linked username.`);

    const latest = snaps[0];
    if (latest && JSON.stringify([latest.totals, latest.available]) === JSON.stringify([result.totals, result.available])) return done(latest, "already_imported");

    const capturedAt = this.now().toISOString();
    const record: SnapshotRecord = {
      id: createHash("sha256").update(JSON.stringify([capturedAt, result.totals, result.available])).digest("hex").slice(0, 32),
      owner_uid: uid,
      captured_at: capturedAt,
      totals: result.totals,
      available: result.available,
      topics: null,
      contest: null,
      activity: null,
      source: { kind: "public_lookup", description: null },
      imported_at: capturedAt,
      linked_username: conn.username,
    };
    if (snaps.length >= MAX_SNAPSHOTS) throw new ApiError("LEETCODE_IMPORT_CONFLICT", `You have ${snaps.length} snapshots, the most that are kept. Delete older ones first.`);
    const created = await this.deps.store.createSnapshot(record);
    return done(created ? record : ((await this.deps.store.getSnapshot(uid, record.id)) ?? record), created ? "imported" : "already_imported");
  }

  /** Removes the link; with `all` also every imported snapshot. Imported numbers otherwise stay, still labelled as supplied by the student. */
  async unlink(uid: string, mode: "link" | "all"): Promise<LeetCodeUnlinkResponse> {
    await this.deps.store.deleteConnection(uid);
    const deleted = mode === "all" ? await this.deps.store.deleteSnapshots(uid) : 0;
    return { connection: await this.connection(uid), deleted_snapshots: deleted };
  }

  /** Everything this student has under LeetCode (the link and every snapshot). */
  async deleteAll(uid: string): Promise<void> {
    await this.deps.store.deleteConnection(uid);
    await this.deps.store.deleteSnapshots(uid);
  }

  // ---------------- import ----------------

  private sourceOf(req: LeetCodeImportRequest, description: string | null): LeetCodeSourceInfo {
    return { kind: req.origin === "manual" ? "manual_entry" : req.format === "csv" ? "csv_file" : "json_file", description };
  }

  /** Checks the data against the documented format and the student's earlier imports. Stores nothing. */
  async preview(uid: string, req: LeetCodeImportRequest): Promise<LeetCodeImportPreview> {
    const parsed = parseImport(req.format, req.content, this.now());
    const issues: LeetCodeImportIssue[] = [...parsed.issues];
    const warnings: LeetCodeImportIssue[] = [...parsed.warnings];
    const none = (): LeetCodeImportPreview => ({ valid: false, issues, warnings, snapshot: null, source: null, content_hash: null, already_imported: false, previous: null, changes: null });
    if (!parsed.data || !parsed.hash) return none();

    const [conn, snaps] = await Promise.all([this.deps.store.getConnection(uid), this.all(uid)]);
    const data = parsed.data;
    if (conn && parsed.username && parsed.username.toLowerCase() !== conn.username_key) {
      issues.push({ path: "username", message: `This data names the LeetCode user "${parsed.username}", but you linked "${conn.username}". Unlink first, or correct the data.` });
    } else if (!conn && parsed.username) {
      warnings.push({ path: "username", message: `The data names "${parsed.username}". Nothing is linked from a file; link the profile separately if you want a profile link.` });
    }

    const same = snaps.find((s) => s.id === parsed.hash);
    const clash = snaps.find((s) => s.captured_at === data.captured_at && s.id !== parsed.hash);
    if (clash) issues.push({ path: "captured_at", message: `You already imported different numbers captured at exactly ${data.captured_at}. Use the real capture time for each snapshot; earlier history is never overwritten.` });
    if (!same && snaps.length >= MAX_SNAPSHOTS) issues.push({ path: "file", message: `You have ${snaps.length} imported snapshots, the most that are kept. Delete older ones first.` });

    // Compare with the closest earlier capture (or, for a back-dated snapshot, the closest later one).
    const before = [...snaps].filter((s) => s.captured_at < data.captured_at).sort((a, b) => b.captured_at.localeCompare(a.captured_at))[0] ?? null;
    const after = snaps.find((s) => s.captured_at > data.captured_at) ?? null;
    const previous = before;
    let changes: LeetCodeImportPreview["changes"] = null;
    if (before) {
      const delta = (a: number | null, b: number | null) => (a !== null && b !== null ? a - b : null);
      changes = { days: Math.round((Date.parse(data.captured_at) - Date.parse(before.captured_at)) / DAY_MS), solved: data.totals.solved - before.totals.solved, easy: delta(data.totals.easy, before.totals.easy), medium: delta(data.totals.medium, before.totals.medium), hard: delta(data.totals.hard, before.totals.hard) };
      if (changes.solved < 0) warnings.push({ path: "totals.solved", message: `This total is ${-changes.solved} lower than your snapshot from ${before.captured_at.slice(0, 10)}. A solved count normally only goes up, so check both.` });
    }
    if (after) warnings.push({ path: "captured_at", message: `You already have a snapshot captured later (${after.captured_at.slice(0, 10)}). This one will sit earlier in your history.` });
    if (after && data.totals.solved > after.totals.solved) warnings.push({ path: "totals.solved", message: `This total is higher than your later snapshot from ${after.captured_at.slice(0, 10)}. A solved count normally only goes up.` });

    return {
      valid: issues.length === 0,
      issues,
      warnings,
      snapshot: issues.length === 0 ? data : null,
      source: issues.length === 0 ? this.sourceOf(req, parsed.source_description) : null,
      content_hash: issues.length === 0 ? parsed.hash : null,
      already_imported: same !== undefined && issues.length === 0,
      previous: previous ? { id: previous.id, captured_at: previous.captured_at, solved: previous.totals.solved } : null,
      changes,
    };
  }

  /**
   * Stores the numbers the student reviewed. Everything is validated again here (the preview is not trusted), the owner
   * is always the signed-in student, and importing the same data twice stores it once. Earlier history is never changed.
   */
  async confirm(uid: string, req: LeetCodeImportConfirmRequest): Promise<LeetCodeImportConfirmResponse> {
    const parsed = parseImport(req.format, req.content, this.now());
    const prev = await this.preview(uid, req);
    if (!prev.valid || !prev.snapshot || !prev.content_hash) {
      const clash = prev.issues.find((i) => i.path === "captured_at" && /already imported different/.test(i.message)) ?? prev.issues.find((i) => i.path === "file" && /most that are kept/.test(i.message));
      const text = prev.issues.map((i) => i.message).join(" ");
      throw new ApiError(clash ? "LEETCODE_IMPORT_CONFLICT" : "LEETCODE_IMPORT_INVALID", text.slice(0, 600) || "The data could not be read.");
    }
    if (req.content_hash !== prev.content_hash || parsed.hash !== prev.content_hash) {
      throw new ApiError("LEETCODE_IMPORT_INVALID", "The data no longer matches what you previewed. Preview it again before importing.");
    }
    const conn = await this.deps.store.getConnection(uid);
    const record: SnapshotRecord = { ...prev.snapshot, id: prev.content_hash, owner_uid: uid, source: prev.source as LeetCodeSourceInfo, imported_at: this.now().toISOString(), linked_username: conn?.username ?? null };
    const created = await this.deps.store.createSnapshot(record);
    const stored = created ? record : ((await this.deps.store.getSnapshot(uid, record.id)) ?? record);
    return { status: created ? "imported" : "already_imported", snapshot: this.summary(stored), connection: await this.connection(uid) };
  }

  async history(uid: string): Promise<LeetCodeHistoryResponse> {
    const snaps = await this.all(uid);
    return { snapshots: snaps.map((s) => this.summary(s)), total: snaps.length };
  }

  async deleteSnapshot(uid: string, id: string): Promise<void> {
    if (!SNAPSHOT_ID.test(id)) throw new ApiError("BAD_REQUEST", "That is not a valid snapshot id.");
    if (!(await this.deps.store.deleteSnapshot(uid, id))) throw new ApiError("NOT_FOUND", "That imported snapshot could not be found.");
  }

  // ---------------- insights ----------------

  async insights(uid: string): Promise<LeetCodeInsightsResponse> {
    const [conn, snaps] = await Promise.all([this.deps.store.getConnection(uid), this.all(uid)]);
    const connection = this.build(conn, snaps);
    const judged = await this.deps.judged?.(uid).catch((e: Error) => (this.deps.logger.warn({ err: e.message }, "leetcode: judged totals unavailable"), null));
    const unbluff = { judged_solved_unique: judged ? judged.solved_unique : null, judged_available: judged ? judged.available : false };
    const latest = snaps[0];
    if (!latest) {
      return { connection, available: false, source: null, totals: null, difficulty: null, topics: null, contest: null, activity: null, history: [], trend: { available: false, reason: "Nothing has been imported yet.", from: null, to: null, solved_change: null, days: null }, unavailable: [], unbluff, notes: NOTES };
    }
    const chrono = [...snaps].reverse();
    const f = this.freshness(latest.captured_at);
    const solved = latest.totals.solved;
    const share = (n: number) => (solved > 0 ? n / solved : 0);
    const unavailable: LeetCodeInsightsResponse["unavailable"] = [];
    const difficulty =
      latest.totals.easy !== null
        ? (["easy", "medium", "hard"] as const).map((d) => ({ difficulty: d, solved: latest.totals[d] as number, available: latest.available ? latest.available[d] : null, share_of_solved: share(latest.totals[d] as number) }))
        : (unavailable.push("difficulty_breakdown"), null);
    if (!latest.topics) unavailable.push("topics");
    if (!latest.contest) unavailable.push("contest");
    if (!latest.activity) unavailable.push("recent_activity");
    const first = chrono[0]!;
    const trend =
      chrono.length >= 2
        ? { available: true, reason: null, from: first.captured_at, to: latest.captured_at, solved_change: solved - first.totals.solved, days: Math.round((Date.parse(latest.captured_at) - Date.parse(first.captured_at)) / DAY_MS) }
        : (unavailable.push("trend"), { available: false, reason: "Import at least two snapshots captured on different dates to see progress over time.", from: null, to: null, solved_change: null, days: null });
    return {
      connection,
      available: true,
      source: { kind: latest.source.kind, description: latest.source.description, captured_at: latest.captured_at, imported_at: latest.imported_at, freshness: f.freshness, age_days: f.age_days ?? 0, label: sourceLabel(latest.source.kind) },
      totals: latest.totals,
      difficulty,
      topics: latest.topics ? latest.topics.map((t) => ({ topic: t.topic, solved: t.solved, share_of_solved: share(t.solved) })) : null,
      contest: latest.contest,
      activity: latest.activity ? { items: latest.activity, total: latest.activity.reduce((s, a) => s + a.problems_solved, 0), last_active_date: latest.activity.at(-1)?.date ?? null } : null,
      history: chrono.map((s) => ({ id: s.id, captured_at: s.captured_at, solved: s.totals.solved, easy: s.totals.easy, medium: s.totals.medium, hard: s.totals.hard })),
      trend,
      unavailable,
      unbluff,
      notes: this.notes(),
    };
  }

  // ---------------- consumers: the AI mentor and the placement planner ----------------

  /** The minimal summary other modules may use. Reading it never changes anything and never reaches LeetCode. */
  async evidence(uid: string): Promise<LeetCodeEvidence> {
    const [conn, snaps] = await Promise.all([this.deps.store.getConnection(uid), this.all(uid)]);
    const latest = snaps[0];
    if (!latest) return { ...NONE_EVIDENCE, linked: conn !== null };
    const f = this.freshness(latest.captured_at);
    const first = snaps.at(-1)!;
    return {
      status: "available",
      linked: conn !== null,
      captured_at: latest.captured_at,
      imported_at: latest.imported_at,
      age_days: f.age_days,
      stale: f.freshness === "stale",
      source_kind: latest.source.kind,
      snapshot_count: snaps.length,
      data: { captured_at: latest.captured_at, totals: latest.totals, available: latest.available, topics: latest.topics, contest: latest.contest, activity: latest.activity },
      first: { captured_at: first.captured_at, solved: first.totals.solved },
    };
  }

  /** The text block for the AI mentor, and what the student is told about it. */
  async mentorContext(uid: string): Promise<{ text: string; used: boolean; captured_at: string | null; stale: boolean }> {
    const e = await this.evidence(uid);
    return { text: e.status === "available" ? leetcodeBlock(e) : NO_DATA_TEXT, used: e.status === "available", captured_at: e.captured_at, stale: e.stale };
  }
}
