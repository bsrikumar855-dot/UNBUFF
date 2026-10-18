import type {
  LeetCodeConnection,
  LeetCodeFreshness,
  LeetCodeImportFormat,
  LeetCodeSourceKind,
} from "@/types/contract";

/** Mirrors the server's rule (2 to 40 letters, digits, underscores or hyphens) so the preview can answer as the student types. The server decides. */
const USERNAME = /^[A-Za-z0-9_-]{2,40}$/;
const RESERVED = new Set([
  "u",
  "problems",
  "problemset",
  "contest",
  "discuss",
  "explore",
  "store",
  "premium",
  "subscribe",
  "studyplan",
  "interview",
  "assessment",
  "accounts",
  "login",
  "logout",
  "signup",
  "register",
  "profile",
  "settings",
  "submissions",
  "playground",
  "list",
  "tag",
  "company",
  "jobs",
  "support",
  "terms",
  "privacy",
  "api",
  "graphql",
  "static",
  "student",
  "business",
]);

export type ProfileCheck =
  | { state: "empty" }
  | { state: "valid"; username: string; url: string }
  | { state: "invalid"; message: string };

/** What the student typed, as a username, a profile address, or an explanation of what is wrong. Pure: nothing is contacted. */
export function checkProfileInput(raw: string): ProfileCheck {
  const input = raw.trim();
  if (input === "") return { state: "empty" };
  if (/\s/.test(input))
    return { state: "invalid", message: "A LeetCode username has no spaces." };
  const asAddress =
    /^[a-z][a-z0-9+.-]*:\/\//i.test(input) ||
    /^(?:www\.)?leetcode\.[a-z]+(?:[/?#]|$)/i.test(input);
  let name: string | null = null;
  if (!asAddress) name = input.replace(/^@/, "");
  else {
    try {
      const u = new URL(
        /^[a-z][a-z0-9+.-]*:\/\//i.test(input) ? input : `https://${input}`
      );
      const host = u.hostname.toLowerCase();
      if (u.username || u.password)
        return {
          state: "invalid",
          message:
            "A profile address must not contain a login. Never enter a password or token here.",
        };
      if (host.endsWith("leetcode.cn"))
        return {
          state: "invalid",
          message: "Only leetcode.com profiles are supported, not leetcode.cn.",
        };
      if (
        (u.protocol !== "https:" && u.protocol !== "http:") ||
        u.port !== "" ||
        (host !== "leetcode.com" && host !== "www.leetcode.com")
      ) {
        return {
          state: "invalid",
          message: "Only https://leetcode.com profile addresses are supported.",
        };
      }
      const parts = u.pathname.split("/").filter(Boolean);
      if (parts[0]?.toLowerCase() === "u" && parts.length === 2)
        name = decodeURIComponent(parts[1]!);
      else if (parts.length === 1 && !RESERVED.has(parts[0]!.toLowerCase()))
        name = decodeURIComponent(parts[0]!);
      else
        return {
          state: "invalid",
          message:
            "That does not look like a profile address. Use https://leetcode.com/u/<username>/.",
        };
    } catch {
      return {
        state: "invalid",
        message:
          "That is not a valid address. Use https://leetcode.com/u/<username>/ or just the username.",
      };
    }
  }
  if (!USERNAME.test(name) || RESERVED.has(name.toLowerCase())) {
    return {
      state: "invalid",
      message: "A LeetCode username has 2 to 40 letters, digits, underscores or hyphens.",
    };
  }
  return {
    state: "valid",
    username: name,
    url: `https://leetcode.com/u/${encodeURIComponent(name)}/`,
  };
}

export const FRESHNESS_LABEL: Record<LeetCodeFreshness, string> = {
  none: "No data imported",
  recent: "Recent",
  aging: "Getting old",
  stale: "Out of date",
};

export const SOURCE_LABEL: Record<LeetCodeSourceKind, string> = {
  manual_entry: "Typed in by you",
  json_file: "Your JSON file",
  csv_file: "Your CSV file",
};

export const formatWhen = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleString() : "never";
export const formatDay = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleDateString() : "unknown";

/** The five states the interface must never blur, in the order they are explained. */
export function stateRows(
  c: LeetCodeConnection
): { key: string; label: string; on: boolean; detail: string }[] {
  const s = c.states;
  return [
    {
      key: "linked",
      label: "Profile linked",
      on: s.profile_linked,
      detail: s.profile_linked
        ? "A username and profile link are saved."
        : "No username is saved.",
    },
    {
      key: "unverified",
      label: "Ownership unverified",
      on: s.ownership_unverified,
      detail: "Nothing can prove the profile is yours, so UNBLUFF never claims it is.",
    },
    {
      key: "imported",
      label: "Imported data available",
      on: s.imported_data_available,
      detail: s.imported_data_available
        ? `${c.imported.snapshot_count} snapshot${c.imported.snapshot_count === 1 ? "" : "s"} you supplied passed validation.`
        : "You have not imported any numbers.",
    },
    {
      key: "official",
      label: "Officially connected",
      on: false,
      detail: "Not available: LeetCode offers no official integration.",
    },
    {
      key: "live",
      label: "Live sync unavailable",
      on: s.live_sync_unavailable,
      detail: "Numbers are never fetched from LeetCode. They are only what you import.",
    },
  ];
}

export const MAX_FILE_BYTES = 64 * 1024;

/** Reads a file as text. Falls back to FileReader where Blob.text is missing (older browsers). */
const textOf = (file: File): Promise<string> =>
  typeof file.text === "function"
    ? file.text()
    : new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result ?? ""));
        r.onerror = () => reject(r.error);
        r.readAsText(file);
      });

export type FileCheck =
  | { ok: true; format: LeetCodeImportFormat; text: string }
  | { ok: false; message: string };

/** Reads a file the student chose, after checking its type and size. The text is sent to the server, which validates it again. */
export async function readImportFile(file: File): Promise<FileCheck> {
  const name = file.name.toLowerCase();
  const format: LeetCodeImportFormat | null = name.endsWith(".json")
    ? "json"
    : name.endsWith(".csv")
      ? "csv"
      : null;
  if (format === null)
    return {
      ok: false,
      message: "Choose a .json or .csv file in the template's format.",
    };
  if (file.size === 0) return { ok: false, message: "That file is empty." };
  if (file.size > MAX_FILE_BYTES)
    return {
      ok: false,
      message: `That file is ${Math.round(file.size / 1024)} KB. The largest accepted is ${MAX_FILE_BYTES / 1024} KB.`,
    };
  try {
    return { ok: true, format, text: await textOf(file) };
  } catch {
    return { ok: false, message: "That file could not be read." };
  }
}

export interface ManualForm {
  captured_on: string; // YYYY-MM-DD (the form adds a time zone from the student's own)
  solved: string;
  easy: string;
  medium: string;
  hard: string;
  rating: string;
  rank: string;
  attended: string;
  note: string;
}

export const EMPTY_FORM: ManualForm = {
  captured_on: "",
  solved: "",
  easy: "",
  medium: "",
  hard: "",
  rating: "",
  rank: "",
  attended: "",
  note: "",
};

const count = (s: string): number | string =>
  /^\d+$/.test(s.trim()) ? Number(s) : s.trim();

/** `+05:30` style offset of the student's own time zone, for a given local date. */
export function offsetOf(date: Date): string {
  const m = -date.getTimezoneOffset();
  const sign = m >= 0 ? "+" : "-";
  const a = Math.abs(m);
  return `${sign}${String(Math.floor(a / 60)).padStart(2, "0")}:${String(a % 60).padStart(2, "0")}`;
}

/**
 * The manual form as the same JSON file format, so manual entry and file upload go through one validator. Empty
 * optional fields are left out; text where a number belongs is passed through so the server can say so.
 */
export function formToJson(f: ManualForm, now = new Date()): string {
  const out: Record<string, unknown> = { schema_version: "unbluff.leetcode-import/1" };
  if (f.note.trim()) out.source_description = f.note.trim();
  const day = f.captured_on.trim();
  if (day) {
    const sameDay = day === now.toISOString().slice(0, 10);
    const time = sameDay ? now.toTimeString().slice(0, 8) : "12:00:00";
    out.captured_at = `${day}T${time}${offsetOf(new Date(`${day}T${time}`))}`;
  }
  const totals: Record<string, unknown> = {};
  if (f.solved.trim()) totals.solved = count(f.solved);
  for (const k of ["easy", "medium", "hard"] as const)
    if (f[k].trim()) totals[k] = count(f[k]);
  out.totals = totals;
  const contest: Record<string, unknown> = {};
  if (f.rating.trim())
    contest.rating = /^\d+(\.\d+)?$/.test(f.rating.trim())
      ? Number(f.rating)
      : f.rating.trim();
  if (f.rank.trim()) contest.global_rank = count(f.rank);
  if (f.attended.trim()) contest.attended = count(f.attended);
  if (Object.keys(contest).length > 0) out.contest = contest;
  return JSON.stringify(out, null, 2);
}

export const TEMPLATE_JSON_TEXT = JSON.stringify(
  {
    schema_version: "unbluff.leetcode-import/1",
    example_data: true,
    source_description:
      "FICTITIOUS EXAMPLE. Replace every value with your own, then delete the example_data line.",
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
  },
  null,
  2
);

export const TEMPLATE_CSV_TEXT = [
  "key,value",
  "schema_version,unbluff.leetcode-import/1",
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

/** Starting points for the AI mentor, each one answerable only from the numbers the student imported. */
export const LEETCODE_STARTERS = [
  "What do my imported LeetCode statistics indicate?",
  "Which difficulty level should I focus on?",
  "Which topics appear underrepresented in my available data?",
  "How can I balance LeetCode practice with my UNBLUFF preparation plan?",
];
