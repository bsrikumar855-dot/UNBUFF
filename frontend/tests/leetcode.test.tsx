import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AppRoutes } from "@/App";
import { AuthProvider } from "@/auth/AuthContext";
import { InterrogationProvider } from "@/state/InterrogationContext";
import { SessionProvider } from "@/state/SessionContext";
import type { AuthClient, AuthUser } from "@/auth/types";
import { api } from "@/api/endpoints";
import { ApiError } from "@/api/types";
import { MAX_FILE_BYTES, TEMPLATE_CSV_TEXT, TEMPLATE_JSON_TEXT, checkProfileInput, formToJson, readImportFile, EMPTY_FORM } from "@/lib/leetcode";
import { navGroups } from "@/components/shell/nav";
import type { LeetCodeConnection, LeetCodeImportPreview, LeetCodeInsightsResponse, LeetCodeSnapshotSummary, MentorChatResponse } from "@/types/contract";

vi.mock("@/api/endpoints", () => ({
  api: {
    getAccountProfile: vi.fn(),
    getRoles: vi.fn(), // the Settings page also shows the profile panel, which these tests do not exercise
    getLeetCodeConnection: vi.fn(),
    linkLeetCode: vi.fn(),
    unlinkLeetCode: vi.fn(),
    getLeetCodeLookup: vi.fn(),
    lookupLeetCode: vi.fn(),
    previewLeetCodeImport: vi.fn(),
    confirmLeetCodeImport: vi.fn(),
    getLeetCodeInsights: vi.fn(),
    getLeetCodeHistory: vi.fn(),
    deleteLeetCodeSnapshot: vi.fn(),
    getGithubConnection: vi.fn(),
    getDsaAnalytics: vi.fn(),
    getRevisionQueue: vi.fn(),
    mentorChat: vi.fn(),
    listMentorConversations: vi.fn(),
    getMentorConversation: vi.fn(),
    getHealth: vi.fn(),
  },
}));
const mocked = vi.mocked(api);

const user: AuthUser = { uid: "u1", email: "a@b.co" };
const fakeAuth = (u: AuthUser | null): AuthClient => ({
  configured: true,
  onChange(cb) {
    queueMicrotask(() => cb(u));
    return () => undefined;
  },
  signIn: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(async () => undefined),
  sendPasswordReset: vi.fn(),
  getIdToken: vi.fn(async () => (u ? "t" : null)),
});
const renderAt = (path: string) =>
  render(
    <AuthProvider client={fakeAuth(user)}>
      <SessionProvider>
        <InterrogationProvider>
          <MemoryRouter initialEntries={[path]}>
            <AppRoutes />
          </MemoryRouter>
        </InterrogationProvider>
      </SessionProvider>
    </AuthProvider>
  );

// Every number below is fictitious test data.
const connection = (over: Partial<LeetCodeConnection> = {}, states: Partial<LeetCodeConnection["states"]> = {}): LeetCodeConnection => ({
  linked: false,
  username: null,
  profile_url: null,
  linked_at: null,
  mode: "profile_link_and_manual_import",
  states: { profile_linked: false, ownership_unverified: true, imported_data_available: false, officially_connected: false, live_sync_unavailable: true, ...states },
  imported: { snapshot_count: 0, last_imported_at: null, last_captured_at: null, last_source: null, freshness: "none", age_days: null },
  limits: { max_import_bytes: 65536, max_snapshots: 120 },
  notes: ["LeetCode has no official API, sign-in or export that UNBLUFF can use, and its terms forbid scraping, so UNBLUFF never contacts LeetCode. This is not a live connection."],
  ...over,
});
const linked = (): LeetCodeConnection => connection({ linked: true, username: "lee215", profile_url: "https://leetcode.com/u/lee215/", linked_at: "2026-10-18T10:00:00.000Z" }, { profile_linked: true });
const imported = (): LeetCodeConnection =>
  connection(
    { imported: { snapshot_count: 2, last_imported_at: "2026-10-18T10:00:00.000Z", last_captured_at: "2026-10-10T08:00:00.000Z", last_source: { kind: "json_file", description: null }, freshness: "recent", age_days: 8 } },
    { imported_data_available: true }
  );

const insights = (over: Partial<LeetCodeInsightsResponse> = {}): LeetCodeInsightsResponse => ({
  connection: { ...imported(), linked: true, username: "lee215", profile_url: "https://leetcode.com/u/lee215/", linked_at: "2026-10-18T10:00:00.000Z", states: { ...imported().states, profile_linked: true } },
  available: true,
  source: { kind: "json_file", description: "copied by hand", captured_at: "2026-10-10T08:00:00.000Z", imported_at: "2026-10-18T10:00:00.000Z", freshness: "recent", age_days: 8, label: "From your JSON file · not synchronised with LeetCode" },
  totals: { solved: 100, easy: 50, medium: 40, hard: 10 },
  difficulty: [
    { difficulty: "easy", solved: 50, available: 900, share_of_solved: 0.5 },
    { difficulty: "medium", solved: 40, available: 1900, share_of_solved: 0.4 },
    { difficulty: "hard", solved: 10, available: 850, share_of_solved: 0.1 },
  ],
  topics: [
    { topic: "Array", solved: 45, share_of_solved: 0.45 },
    { topic: "Graph", solved: 4, share_of_solved: 0.04 },
  ],
  contest: { rating: 1650, global_rank: 120000, attended: 12 },
  activity: { items: [{ date: "2026-10-06", problems_solved: 1 }, { date: "2026-10-08", problems_solved: 2 }], total: 3, last_active_date: "2026-10-08" },
  history: [
    { id: "a".repeat(32), captured_at: "2026-09-10T08:00:00.000Z", solved: 80, easy: 40, medium: 32, hard: 8 },
    { id: "b".repeat(32), captured_at: "2026-10-10T08:00:00.000Z", solved: 100, easy: 50, medium: 40, hard: 10 },
  ],
  trend: { available: true, reason: null, from: "2026-09-10T08:00:00.000Z", to: "2026-10-10T08:00:00.000Z", solved_change: 20, days: 30 },
  unavailable: [],
  unbluff: { judged_solved_unique: 3, judged_available: true },
  notes: ["Linking saves your username and builds a link to your public profile. It does not prove that the profile is yours."],
  ...over,
});
const snap = (id: string, solved: number, day: string): LeetCodeSnapshotSummary => ({ id, captured_at: `${day}T08:00:00.000Z`, imported_at: "2026-10-18T10:00:00.000Z", solved, easy: null, medium: null, hard: null, source: { kind: "json_file", description: null }, linked_username: null, fields: [] });
const history = (n = 2) => ({ snapshots: [snap("b".repeat(32), 100, "2026-10-10"), snap("a".repeat(32), 80, "2026-09-10")].slice(0, n), total: n });

const preview = (over: Partial<LeetCodeImportPreview> = {}): LeetCodeImportPreview => ({
  valid: true,
  issues: [],
  warnings: [],
  snapshot: { captured_at: "2026-10-10T08:00:00.000Z", totals: { solved: 100, easy: 50, medium: 40, hard: 10 }, available: null, topics: [{ topic: "Array", solved: 45 }], contest: null, activity: null },
  source: { kind: "json_file", description: null },
  content_hash: "c".repeat(32),
  already_imported: false,
  previous: null,
  changes: null,
  ...over,
});

beforeEach(() => {
  vi.resetAllMocks();
  mocked.getAccountProfile.mockResolvedValue({ profile: { display_name: null, college: null, graduation_year: null, target_role_id: null, updated_at: null } });
  mocked.getRoles.mockResolvedValue({ roles: [] });
  mocked.getLeetCodeConnection.mockResolvedValue({ connection: connection() });
  mocked.getLeetCodeLookup.mockResolvedValue({ available: false });
  mocked.getLeetCodeInsights.mockResolvedValue(insights({ connection: connection(), available: false, source: null, totals: null, difficulty: null, topics: null, contest: null, activity: null, history: [], trend: { available: false, reason: "Nothing has been imported yet.", from: null, to: null, solved_change: null, days: null } }));
  mocked.getLeetCodeHistory.mockResolvedValue({ snapshots: [], total: 0 });
  mocked.getGithubConnection.mockResolvedValue({ status: "disconnected" } as never);
});

describe("username and profile address checking", () => {
  it("builds the address from a username or a profile link, and explains rejections", () => {
    expect(checkProfileInput("")).toEqual({ state: "empty" });
    expect(checkProfileInput(" @lee215 ")).toEqual({ state: "valid", username: "lee215", url: "https://leetcode.com/u/lee215/" });
    expect(checkProfileInput("https://leetcode.com/u/Lee_215/?x=1")).toMatchObject({ state: "valid", username: "Lee_215" });
    expect(checkProfileInput("leetcode.com/lee215")).toMatchObject({ state: "valid", username: "lee215" });
    for (const bad of ["a", "has space", "https://example.com/u/x/", "https://leetcode.com/problems/", "https://leetcode.com/u/lee215/submissions/", "problems", "ftp://leetcode.com/u/x/"]) expect(checkProfileInput(bad).state, bad).toBe("invalid");
    expect(checkProfileInput("https://leetcode.cn/u/x/")).toMatchObject({ state: "invalid", message: expect.stringMatching(/leetcode\.cn/) });
    expect(checkProfileInput("https://me:pw@leetcode.com/u/x/")).toMatchObject({ state: "invalid", message: expect.stringMatching(/Never enter a password/) });
  });
});

describe("import helpers", () => {
  it("turns the manual form into the documented JSON, leaving out empty optional fields and passing text through for the server to reject", () => {
    const j = JSON.parse(formToJson({ ...EMPTY_FORM, captured_on: "2026-10-10", solved: "100", easy: "50", medium: "40", hard: "10", rating: "1650.5", note: "by hand" }, new Date("2026-10-18T10:00:00Z")));
    expect(j).toMatchObject({ schema_version: "unbluff.leetcode-import/1", source_description: "by hand", totals: { solved: 100, easy: 50, medium: 40, hard: 10 }, contest: { rating: 1650.5 } });
    expect(j.captured_at).toMatch(/^2026-10-10T12:00:00[+-]\d{2}:\d{2}$/);
    expect(j.contest).not.toHaveProperty("global_rank");
    expect(j).not.toHaveProperty("topics");
    const minimal = JSON.parse(formToJson({ ...EMPTY_FORM, solved: "lots" }));
    expect(minimal.totals).toEqual({ solved: "lots" });
    expect(minimal).not.toHaveProperty("captured_at");
  });

  it("checks file type and size before reading, and reads a good file", async () => {
    const file = (body: string, name: string) => new File([body], name);
    expect(await readImportFile(file("x", "notes.txt"))).toMatchObject({ ok: false, message: expect.stringMatching(/\.json or \.csv/) });
    expect(await readImportFile(file("", "a.json"))).toMatchObject({ ok: false, message: expect.stringMatching(/empty/) });
    expect(await readImportFile(file("x".repeat(MAX_FILE_BYTES + 1), "a.csv"))).toMatchObject({ ok: false, message: expect.stringMatching(/largest accepted is 64 KB/) });
    expect(await readImportFile(file("{}", "A.JSON"))).toEqual({ ok: true, format: "json", text: "{}" });
    expect(await readImportFile(file("a,b", "x.csv"))).toMatchObject({ ok: true, format: "csv" });
  });

  it("ships templates that say they are fictitious and refuse to import as they are", () => {
    expect(TEMPLATE_JSON_TEXT).toMatch(/FICTITIOUS EXAMPLE/);
    expect(JSON.parse(TEMPLATE_JSON_TEXT).example_data).toBe(true);
    expect(TEMPLATE_CSV_TEXT).toMatch(/example_data,true/);
    expect(TEMPLATE_CSV_TEXT).toMatch(/FICTITIOUS EXAMPLE/);
  });
});

describe("the connection panel (Settings)", () => {
  it("lists the five states and never says connected: not linked, ownership unverified, no data, not official, live sync unavailable", async () => {
    renderAt("/settings");
    const list = await screen.findByRole("list", { name: "What is and is not true about this link" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows.map((r) => r.getAttribute("data-state"))).toEqual(["linked", "unverified", "imported", "official", "live"]);
    expect(rows.map((r) => r.getAttribute("data-on"))).toEqual(["false", "true", "false", "false", "true"]);
    expect(within(list).getByText("Officially connected")).toBeInTheDocument();
    expect(within(list).getByText(/LeetCode offers no official integration/)).toBeInTheDocument();
    expect(screen.getByText(/This is not a live connection/)).toBeInTheDocument();
    expect(screen.queryByText(/^Connected$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Connected as/)).not.toBeInTheDocument();
    expect(screen.getByText(/Never enter a LeetCode password, cookie or session token/)).toBeInTheDocument();
    expect(screen.getByText("No numbers imported yet. A saved link alone shows no statistics.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /GitHub/ })).toBeInTheDocument(); // beside the GitHub panel
  });

  it("previews the profile address while typing, validates, and only links a valid one", async () => {
    mocked.linkLeetCode.mockResolvedValue({ connection: linked() });
    renderAt("/settings");
    const input = await screen.findByLabelText("LeetCode username or profile address");
    const submit = screen.getByRole("button", { name: "Link profile" });
    expect(submit).toBeDisabled();
    fireEvent.change(input, { target: { value: "https://example.com/u/lee215/" } });
    fireEvent.blur(input);
    expect(await screen.findByText(/Only https:\/\/leetcode\.com profile addresses are supported/)).toBeInTheDocument();
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(submit).toBeDisabled();
    fireEvent.change(input, { target: { value: "https://leetcode.com/u/lee215/" } });
    expect(screen.getByText("https://leetcode.com/u/lee215/", { selector: "span.font-mono" })).toBeInTheDocument();
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    await waitFor(() => expect(mocked.linkLeetCode).toHaveBeenCalledWith("https://leetcode.com/u/lee215/"));
    expect(await screen.findByText(/This does not prove the profile is yours and it does not import any numbers/)).toBeInTheDocument();
    const name = await screen.findByRole("link", { name: "lee215" });
    expect(name).toHaveAttribute("href", "https://leetcode.com/u/lee215/");
    expect(name).toHaveAttribute("rel", "noreferrer");
    expect(screen.getByText(/· unverified · saved/)).toBeInTheDocument();
    expect(screen.queryByText(/^Connected$/)).not.toBeInTheDocument();
  });

  it("shows a linked profile with imported data, its capture date, freshness and source, without calling it live", async () => {
    mocked.getLeetCodeConnection.mockResolvedValue({ connection: { ...imported(), linked: true, username: "lee215", profile_url: "https://leetcode.com/u/lee215/", linked_at: "2026-10-18T10:00:00.000Z", states: { ...imported().states, profile_linked: true } } });
    renderAt("/settings");
    expect((await screen.findByText(/Imported data:/)).closest("p")).toHaveTextContent(/2 snapshots.*recent, 8 days old.*your json file.*Supplied by you, not synchronised with LeetCode/i);
    expect(screen.getByRole("link", { name: "Import numbers and see LeetCode insights" })).toHaveAttribute("href", "/leetcode");
  });

  it("offers a choice when unlinking: keep the imported numbers, or delete them too", async () => {
    mocked.getLeetCodeConnection.mockResolvedValue({ connection: linked() });
    mocked.unlinkLeetCode.mockResolvedValue({ connection: connection(), deleted_snapshots: 0 });
    renderAt("/settings");
    fireEvent.click(await screen.findByRole("button", { name: "Unlink LeetCode" }));
    const group = screen.getByRole("group", { name: "Confirm unlink" });
    fireEvent.click(within(group).getByRole("button", { name: "Keep my imported numbers" }));
    await waitFor(() => expect(mocked.unlinkLeetCode).toHaveBeenCalledWith("link"));
    expect(await screen.findByText(/numbers you imported were kept/)).toBeInTheDocument();
  });

  it("deletes everything when asked to", async () => {
    mocked.getLeetCodeConnection.mockResolvedValue({ connection: { ...linked(), imported: imported().imported, states: { ...linked().states, imported_data_available: true } } });
    mocked.unlinkLeetCode.mockResolvedValue({ connection: connection(), deleted_snapshots: 2 });
    renderAt("/settings");
    fireEvent.click(await screen.findByRole("button", { name: "Unlink LeetCode" }));
    fireEvent.click(within(screen.getByRole("group", { name: "Confirm unlink" })).getByRole("button", { name: "Delete them too" }));
    await waitFor(() => expect(mocked.unlinkLeetCode).toHaveBeenCalledWith("all"));
    expect(await screen.findByText(/Link removed and 2 imported snapshots deleted/)).toBeInTheDocument();
  });

  it("offers to delete imported numbers even when no profile is linked", async () => {
    mocked.getLeetCodeConnection.mockResolvedValue({ connection: imported() });
    mocked.unlinkLeetCode.mockResolvedValue({ connection: connection(), deleted_snapshots: 2 });
    renderAt("/settings");
    fireEvent.click(await screen.findByRole("button", { name: "Delete imported numbers" }));
    const group = screen.getByRole("group", { name: "Confirm unlink" });
    expect(within(group).queryByRole("button", { name: "Keep my imported numbers" })).not.toBeInTheDocument();
    fireEvent.click(within(group).getByRole("button", { name: "Yes, delete them" }));
    await waitFor(() => expect(mocked.unlinkLeetCode).toHaveBeenCalledWith("all"));
  });

  it("shows a loading state while the link is read", async () => {
    mocked.getLeetCodeConnection.mockReturnValue(new Promise(() => undefined));
    renderAt("/settings");
    expect(await screen.findByText("Checking your LeetCode link…")).toBeInTheDocument();
  });

  it("shows a load error with a retry that works, and an error from saving", async () => {
    mocked.getLeetCodeConnection.mockRejectedValueOnce(new ApiError("boom", "INTERNAL", 500)).mockResolvedValue({ connection: connection() });
    renderAt("/settings");
    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
    await screen.findByLabelText("LeetCode username or profile address");
    mocked.linkLeetCode.mockRejectedValue(new ApiError("That is not a valid address.", "BAD_REQUEST", 400));
    fireEvent.change(screen.getByLabelText("LeetCode username or profile address"), { target: { value: "lee215" } });
    fireEvent.click(screen.getByRole("button", { name: "Link profile" }));
    expect(await screen.findByText("That is not a valid address.")).toBeInTheDocument();
  });
});

describe("looking numbers up by username (when the operator enabled it)", () => {
  const snap = { id: "a".repeat(32), captured_at: "2026-10-21T10:00:00.000Z", imported_at: "2026-10-21T10:00:00.000Z", solved: 93, easy: 69, medium: 23, hard: 1, source: { kind: "public_lookup" as const, description: null }, linked_username: "lee215", fields: ["difficulty" as const, "available" as const] };

  it("states on the LeetCode page whether UNBLUFF contacts LeetCode, matching the server setting", async () => {
    renderAt("/leetcode");
    expect(await screen.findByText(/UNBLUFF never contacts LeetCode\./)).toBeInTheDocument();
    mocked.getLeetCodeLookup.mockResolvedValue({ available: true });
    renderAt("/leetcode");
    expect(await screen.findByText(/contacts LeetCode only when you ask it to look your numbers up/)).toBeInTheDocument();
  });

  it("is hidden and never calls LeetCode when the server has the lookup off", async () => {
    renderAt("/settings");
    await screen.findByText(/This is not a live connection/);
    expect(screen.queryByRole("button", { name: "Fetch my numbers from LeetCode" })).not.toBeInTheDocument();
    expect(mocked.lookupLeetCode).not.toHaveBeenCalled();
  });

  it("looks the numbers up right after a username is linked, and says they are not verified as yours", async () => {
    mocked.getLeetCodeLookup.mockResolvedValue({ available: true });
    mocked.linkLeetCode.mockResolvedValue({ connection: linked() });
    mocked.lookupLeetCode.mockResolvedValue({ status: "imported", snapshot: snap, connection: linked() });
    renderAt("/settings");
    expect(await screen.findByText(/This is not an official connection/)).toBeInTheDocument();
    fireEvent.change(await screen.findByLabelText("LeetCode username or profile address"), { target: { value: "lee215" } });
    fireEvent.click(screen.getByRole("button", { name: "Link profile" }));
    await waitFor(() => expect(mocked.lookupLeetCode).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/Saved 93 solved \(easy 69, medium 23, hard 1\).*not verified as yours/)).toBeInTheDocument();
    expect(screen.getByText("Fetched on request, not live")).toBeInTheDocument();
  });

  it("refuses a username LeetCode does not know and shows the reason", async () => {
    mocked.getLeetCodeLookup.mockResolvedValue({ available: true });
    mocked.linkLeetCode.mockRejectedValue(new ApiError('LeetCode has no public profile named "ghost_user". Check the spelling.', "BAD_REQUEST", 400));
    renderAt("/settings");
    fireEvent.change(await screen.findByLabelText("LeetCode username or profile address"), { target: { value: "ghost_user" } });
    fireEvent.click(screen.getByRole("button", { name: "Link profile" }));
    expect(await screen.findByText(/LeetCode has no public profile named "ghost_user"/)).toBeInTheDocument();
    expect(mocked.lookupLeetCode).not.toHaveBeenCalled();
  });

  it("offers a refresh button for a linked profile", async () => {
    mocked.getLeetCodeLookup.mockResolvedValue({ available: true });
    mocked.getLeetCodeConnection.mockResolvedValue({ connection: linked() });
    mocked.lookupLeetCode.mockResolvedValue({ status: "already_imported", snapshot: snap, connection: linked() });
    renderAt("/settings");
    fireEvent.click(await screen.findByRole("button", { name: "Fetch my numbers from LeetCode" }));
    expect(await screen.findByText(/Already up to date: 93 solved/)).toBeInTheDocument();
  });
});

describe("the LeetCode page: empty and loading", () => {
  it("shows what is unavailable before anything is imported, and invents no figure", async () => {
    renderAt("/leetcode");
    expect(await screen.findByRole("heading", { name: "Your LeetCode insights" })).toBeInTheDocument();
    expect(screen.getByText(/Nothing to show yet/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "LeetCode insights" })).toBeInTheDocument();
    expect(screen.getByText(/They are your own reported data: not live, not synchronised, not verified/)).toBeInTheDocument();
    expect(screen.queryByText("Total solved")).not.toBeInTheDocument();
    expect(screen.queryByText("Compared with UNBLUFF, kept separate")).not.toBeInTheDocument();
  });

  it("shows a loading state while the data is read", async () => {
    mocked.getLeetCodeInsights.mockReturnValue(new Promise(() => undefined));
    renderAt("/leetcode");
    expect(await screen.findByText("Loading your LeetCode data…")).toBeInTheDocument();
  });

  it("says a link alone provides no statistics", async () => {
    mocked.getLeetCodeInsights.mockResolvedValue(insights({ connection: linked(), available: false, source: null, totals: null }));
    renderAt("/leetcode");
    expect(await screen.findByText(/a link alone provides no statistics/)).toBeInTheDocument();
  });

  it("shows an error with a retry", async () => {
    mocked.getLeetCodeInsights.mockRejectedValueOnce(new ApiError("boom", "INTERNAL", 500));
    renderAt("/leetcode");
    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("heading", { name: "Your LeetCode insights" })).toBeInTheDocument();
  });
});

describe("the LeetCode page: insights", () => {
  beforeEach(() => {
    mocked.getLeetCodeInsights.mockResolvedValue(insights());
    mocked.getLeetCodeHistory.mockResolvedValue(history());
  });

  it("shows the source, capture date and freshness first, and labels the numbers as the student's own", async () => {
    renderAt("/leetcode");
    const banner = (await screen.findByText(/not live, not checked against LeetCode, and not verified/)).closest("div")!;
    expect(banner).toHaveTextContent(/From your JSON file · not synchronised with LeetCode/);
    expect(banner).toHaveTextContent(/8 days old/);
    expect(banner).toHaveTextContent(/Your note: copied by hand/);
    expect(screen.getByRole("heading", { name: "Problems solved, as you reported them" })).toBeInTheDocument();
  });

  it("shows totals, difficulty, topics, contest, activity and the trend, from the supplied data only", async () => {
    renderAt("/leetcode");
    await screen.findByText("Total solved");
    expect(screen.getByRole("list", { name: "Problems solved by difficulty, as you reported them" })).toHaveTextContent(/Easy.*50 solved \(50% of your total\).*900 available at the time/);
    expect(within(screen.getByRole("list", { name: "Topic counts you supplied" })).getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText(/A topic that is not listed is unknown, not zero/)).toBeInTheDocument();
    expect(screen.getByText("1650")).toBeInTheDocument();
    expect(screen.getByText(/3 problems first solved across 2 days you listed/)).toBeInTheDocument();
    expect(screen.getByText(/\+20 solved between .* \(30 days\), across your imported snapshots/)).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Problems solved at each imported snapshot, oldest first" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open your LeetCode profile" })).toHaveAttribute("href", "https://leetcode.com/u/lee215/");
  });

  it("shows missing parts as unavailable, not as zero", async () => {
    mocked.getLeetCodeInsights.mockResolvedValue(
      insights({
        totals: { solved: 12, easy: null, medium: null, hard: null },
        difficulty: null,
        topics: null,
        contest: null,
        activity: null,
        history: [{ id: "a".repeat(32), captured_at: "2026-10-10T08:00:00.000Z", solved: 12, easy: null, medium: null, hard: null }],
        trend: { available: false, reason: "Import at least two snapshots captured on different dates to see progress over time.", from: null, to: null, solved_change: null, days: null },
        unavailable: ["difficulty_breakdown", "topics", "contest", "recent_activity", "trend"],
      })
    );
    renderAt("/leetcode");
    await screen.findByText("Total solved");
    for (const what of ["Difficulty breakdown", "Topic counts", "Contest rating and rank", "Recent activity", "Trend"]) expect(screen.getByText(`${what}: unavailable.`)).toBeInTheDocument();
    expect(screen.getByText(/Import at least two snapshots captured on different dates/)).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Problems solved by difficulty, as you reported them" })).not.toBeInTheDocument();
  });

  it("keeps LeetCode's numbers and UNBLUFF's judged count apart, and says they are never added", async () => {
    renderAt("/leetcode");
    const panel = await screen.findByLabelText("Imported numbers compared with UNBLUFF's judged results, kept separate");
    expect(panel).toHaveTextContent(/Reported by you from LeetCode.*100/);
    expect(panel).toHaveTextContent(/Judged in UNBLUFF.*3/);
    expect(panel).toHaveTextContent(/never added together/);
    expect(panel).toHaveTextContent(/do not mark any UNBLUFF question as solved/);
    expect(panel).not.toHaveTextContent(/103/);
  });

  it("explains an unreadable or empty judged count instead of showing a number", async () => {
    mocked.getLeetCodeInsights.mockResolvedValue(insights({ unbluff: { judged_solved_unique: null, judged_available: false } }));
    renderAt("/leetcode");
    expect(await screen.findByText("Could not be read right now.")).toBeInTheDocument();
  });

  it("links to the mentor with LeetCode context on, using the four questions", async () => {
    renderAt("/leetcode");
    const links = await screen.findAllByRole("link", { name: /LeetCode statistics indicate|difficulty level|underrepresented|balance LeetCode practice/ });
    expect(links).toHaveLength(4);
    expect(links[0]).toHaveAttribute("href", expect.stringMatching(/^\/mentor\?leetcode=1&prompt=What%20do%20my%20imported/));
  });

  it("lists snapshots, and removes only the one chosen after confirmation", async () => {
    mocked.deleteLeetCodeSnapshot.mockResolvedValue(undefined);
    renderAt("/leetcode");
    const list = await screen.findByRole("list", { name: "Imported snapshots" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    fireEvent.click(within(items[0]!).getByRole("button", { name: /^Remove the snapshot captured/ }));
    const group = within(items[0]!).getByRole("group", { name: /Confirm removing the snapshot/ });
    expect(mocked.deleteLeetCodeSnapshot).not.toHaveBeenCalled(); // asks first
    fireEvent.click(within(group).getByRole("button", { name: "Yes, remove" }));
    await waitFor(() => expect(mocked.deleteLeetCodeSnapshot).toHaveBeenCalledWith("b".repeat(32)));
    expect(mocked.deleteLeetCodeSnapshot).toHaveBeenCalledTimes(1);
  });
});

describe("importing", () => {
  beforeEach(() => {
    mocked.getLeetCodeConnection.mockResolvedValue({ connection: connection() });
  });
  const fileInput = async () => (await screen.findByLabelText(/JSON or CSV file in the template format/)) as HTMLInputElement;
  const upload = async (name: string, body: string) => {
    const input = await fileInput();
    const file = new File([body], name);
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    fireEvent.change(input);
  };

  it("previews an uploaded file, shows what would be stored and its source, and imports only after confirmation", async () => {
    mocked.previewLeetCodeImport.mockResolvedValue(preview({ previous: { id: "a".repeat(32), captured_at: "2026-09-10T08:00:00.000Z", solved: 80 }, changes: { days: 30, solved: 20, easy: 10, medium: 8, hard: 2 }, warnings: [{ path: "totals", message: "No easy, medium and hard split was supplied." }] }));
    mocked.confirmLeetCodeImport.mockResolvedValue({ status: "imported", snapshot: snap("c".repeat(32), 100, "2026-10-10"), connection: imported() });
    renderAt("/leetcode");
    await upload("progress.json", '{"x":1}');
    await waitFor(() => expect(mocked.previewLeetCodeImport).toHaveBeenCalledWith({ format: "json", origin: "file", content: '{"x":1}' }));
    const box = await screen.findByLabelText("Preview of what would be stored");
    expect(box).toHaveTextContent(/Problems solved.*100 — easy 50, medium 40, hard 10/);
    expect(box).toHaveTextContent(/Your JSON file, supplied by you. It will not be shown as live or verified/);
    expect(box).toHaveTextContent(/solved \+20, easy \+10, medium \+8, hard \+2/);
    expect(within(box).getByRole("status", { name: "Things to check" })).toHaveTextContent(/No easy, medium and hard split/);
    expect(mocked.confirmLeetCodeImport).not.toHaveBeenCalled(); // nothing stored before the student confirms
    fireEvent.click(within(box).getByRole("button", { name: "Import these numbers" }));
    await waitFor(() => expect(mocked.confirmLeetCodeImport).toHaveBeenCalledWith({ format: "json", origin: "file", content: '{"x":1}', content_hash: "c".repeat(32) }));
    expect(await screen.findByText(/Imported\. Your numbers captured .* are saved as supplied by you/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Preview of what would be stored")).not.toBeInTheDocument();
  });

  it("shows every reason a file was rejected, with no way to import it", async () => {
    mocked.previewLeetCodeImport.mockResolvedValue(preview({ valid: false, snapshot: null, source: null, content_hash: null, issues: [{ path: "totals", message: "easy + medium + hard is 101, but totals.solved is 100. They must agree." }, { path: "user_id", message: '"user_id" is not accepted.' }] }));
    renderAt("/leetcode");
    await upload("bad.csv", "x");
    const alert = await screen.findByText("This data was not accepted. Nothing was stored.");
    const box = alert.closest("div")!;
    expect(box).toHaveTextContent(/must agree/);
    expect(box).toHaveTextContent(/user_id/);
    expect(screen.queryByRole("button", { name: "Import these numbers" })).not.toBeInTheDocument();
    expect(mocked.confirmLeetCodeImport).not.toHaveBeenCalled();
  });

  it("refuses the wrong file type or an oversize file before sending anything", async () => {
    renderAt("/leetcode");
    await upload("notes.txt", "hello");
    expect(await screen.findByText(/Choose a \.json or \.csv file/)).toBeInTheDocument();
    await upload("big.json", "x".repeat(MAX_FILE_BYTES + 10));
    expect(await screen.findByText(/largest accepted is 64 KB/)).toBeInTheDocument();
    expect(mocked.previewLeetCodeImport).not.toHaveBeenCalled();
  });

  it("says when exactly these numbers were already imported and offers no second import", async () => {
    mocked.previewLeetCodeImport.mockResolvedValue(preview({ already_imported: true }));
    renderAt("/leetcode");
    await upload("p.json", "{}");
    expect(await screen.findByText(/already imported exactly these numbers, so confirming would change nothing/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Import these numbers" })).not.toBeInTheDocument();
  });

  it("shows the server's reason when confirming fails, and keeps the preview so the student can decide", async () => {
    mocked.previewLeetCodeImport.mockResolvedValue(preview());
    mocked.confirmLeetCodeImport.mockRejectedValue(new ApiError("You already imported different numbers captured at exactly 2026-10-10T08:00:00.000Z.", "LEETCODE_IMPORT_CONFLICT", 409));
    renderAt("/leetcode");
    await upload("p.json", "{}");
    fireEvent.click(await screen.findByRole("button", { name: "Import these numbers" }));
    expect(await screen.findByText(/already imported different numbers captured at exactly/)).toBeInTheDocument();
    expect(screen.getByLabelText("Preview of what would be stored")).toBeInTheDocument();
  });

  it("shows an error when the preview request fails", async () => {
    mocked.previewLeetCodeImport.mockRejectedValue(new ApiError("boom", "INTERNAL", 500));
    renderAt("/leetcode");
    await upload("p.json", "{}");
    expect(await screen.findByRole("alert")).toHaveTextContent(/Something went wrong on our side/);
  });

  it("supports typing the numbers: sends the same JSON with origin manual and tells how the data is recorded", async () => {
    mocked.previewLeetCodeImport.mockResolvedValue(preview({ source: { kind: "manual_entry", description: null } }));
    renderAt("/leetcode");
    fireEvent.mouseDown(await screen.findByRole("tab", { name: "Type the numbers" }), { button: 0, ctrlKey: false });
    fireEvent.click(screen.getByRole("tab", { name: "Type the numbers" }));
    fireEvent.change(await screen.findByLabelText("Date these numbers were true"), { target: { value: "2026-10-10" } });
    fireEvent.change(screen.getByLabelText("Total solved"), { target: { value: "100" } });
    fireEvent.change(screen.getByLabelText("Easy"), { target: { value: "50" } });
    fireEvent.change(screen.getByLabelText("Medium"), { target: { value: "40" } });
    fireEvent.change(screen.getByLabelText("Hard"), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: "Check these numbers" }));
    await waitFor(() => expect(mocked.previewLeetCodeImport).toHaveBeenCalled());
    const sent = mocked.previewLeetCodeImport.mock.calls[0]![0];
    expect(sent).toMatchObject({ format: "json", origin: "manual" });
    expect(JSON.parse(sent.content)).toMatchObject({ schema_version: "unbluff.leetcode-import/1", totals: { solved: 100, easy: 50, medium: 40, hard: 10 } });
    expect(await screen.findByLabelText("Preview of what would be stored")).toHaveTextContent(/Typed in by you, supplied by you/);
  });

  it("states what the import is and is not, and links fictitious templates", async () => {
    renderAt("/leetcode");
    expect(await screen.findByText("you supplied, with the date you give")).toBeInTheDocument();
    expect(screen.getByText(/never as live, synchronised or verified data/)).toBeInTheDocument();
    expect(screen.getByText(/such files are rejected/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "JSON" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "CSV" })).toBeInTheDocument();
    expect(screen.getByText(/clearly fictitious numbers \(it will not import until you replace them\)/)).toBeInTheDocument();
  });
});

describe("the AI mentor", () => {
  const reply = (over: Partial<MentorChatResponse> = {}): MentorChatResponse => ({
    conversation: { id: "conv_aaaaaaaaaaaaaaaaaaaaaaaa", title: "t", mode: "placement_mentor", message_count: 2, hint_level: 0, created_at: "x", updated_at: "x" },
    reply: { id: "m", role: "assistant", content: "Here is what your numbers say.", at: "x" },
    memory_saved: [],
    persistence: { conversation: "saved", memory: "none" },
    references: [],
    analytics_note: null,
    degraded: false,
    mock: false,
    ...over,
  });
  beforeEach(() => {
    mocked.listMentorConversations.mockResolvedValue({ conversations: [], total: 0 } as never);
    mocked.getHealth.mockResolvedValue({ status: "ok", llm_mode: "live", model: "m" } as never);
  });

  it("opens with LeetCode context on, offers the four questions, prefills a chosen one, and sends the flag", async () => {
    mocked.mentorChat.mockResolvedValue(reply({ leetcode_context: { used: true, captured_at: "2026-10-10T08:00:00.000Z", stale: false } }));
    renderAt("/mentor?leetcode=1&prompt=Which%20difficulty%20level%20should%20I%20focus%20on%3F");
    expect(await screen.findByText(/LeetCode context is on/)).toBeInTheDocument();
    expect(screen.getByLabelText("Your message")).toHaveValue("Which difficulty level should I focus on?");
    for (const q of ["What do my imported LeetCode statistics indicate?", "Which topics appear underrepresented in my available data?"]) expect(screen.getByRole("button", { name: q })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(mocked.mentorChat).toHaveBeenCalled());
    expect(mocked.mentorChat.mock.calls[0]![0]).toMatchObject({ mode: "placement_mentor", leetcode_context: true, message: "Which difficulty level should I focus on?" });
    expect(await screen.findByText(/used a short summary of the LeetCode numbers you imported .* not live and not verified/)).toBeInTheDocument();
  });

  it("tells the student when there was nothing to use", async () => {
    mocked.mentorChat.mockResolvedValue(reply({ leetcode_context: { used: false, captured_at: null, stale: false } }));
    renderAt("/mentor?leetcode=1");
    fireEvent.change(await screen.findByLabelText("Your message"), { target: { value: "my leetcode stats?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText(/You have not imported any LeetCode numbers, so the mentor had none to use/)).toBeInTheDocument();
  });

  it("flags out-of-date numbers, and sends no LeetCode flag from an ordinary mentor page", async () => {
    mocked.mentorChat.mockResolvedValue(reply({ leetcode_context: { used: true, captured_at: "2026-06-01T08:00:00.000Z", stale: true } }));
    renderAt("/mentor");
    fireEvent.change(await screen.findByLabelText("Your message"), { target: { value: "how are my leetcode stats" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(mocked.mentorChat).toHaveBeenCalled());
    expect(mocked.mentorChat.mock.calls[0]![0].leetcode_context).toBeUndefined();
    expect(await screen.findByText(/out of date\)/)).toBeInTheDocument();
    expect(screen.queryByText(/LeetCode context is on/)).not.toBeInTheDocument();
  });
});

describe("DSA analytics keeps LeetCode numbers apart", () => {
  const emptyAnalytics = { generated_at: "2026-06-15T12:00:00.000Z", totals: { solved_unique: 0, attempted_unique: 0, eligible_attempts: 0, accepted_attempts: 0 }, topics: [], difficulties: [], weaknesses: [], untouched_topics: [], weekly: [], recent: [], repeated_failures: [], self_reported: { solved: 0, attempted: 0, needs_revision: 0, bookmarked: 0 }, exclusions: { available: false, sampled_submissions: 0, demonstration: 0, ineligible_suite: 0, unverified_provider: 0, mock_execution: 0, judge_error: 0, unknown_provenance: 0 }, has_eligible_activity: false, revision_due: 0, comparison: { available: false, note: null, current: {}, previous: {} }, first_attempt_success: { value: null, numerator: 0, denominator: 0, available: false, min_sample: 5, note: null }, submission_success: { value: null, numerator: 0, denominator: 0, available: false, min_sample: 5, note: null } };
  beforeEach(() => {
    mocked.getDsaAnalytics.mockResolvedValue(emptyAnalytics as never);
    mocked.getRevisionQueue.mockResolvedValue({ items: [], page: 1, page_size: 10, total: 0, total_pages: 1, counts: { due: 0, upcoming: 0, total: 0 }, suggestions: [] });
  });

  it("shows imported numbers in their own labelled section, as not counted and not live or verified", async () => {
    mocked.getLeetCodeInsights.mockResolvedValue(insights());
    renderAt("/dsa/analytics");
    const section = await screen.findByRole("region", { name: "External progress (not counted above)" });
    expect(section).toHaveTextContent(/You reported 100 problems solved on LeetCode/);
    expect(section).toHaveTextContent(/not live or verified, and they are not judged UNBLUFF submissions/);
    expect(screen.getByRole("link", { name: "LeetCode insights" })).toHaveAttribute("href", "/leetcode");
  });

  it("shows nothing when nothing was imported, or when the data cannot be read", async () => {
    renderAt("/dsa/analytics");
    await screen.findByRole("heading", { name: "No counted activity yet" });
    expect(screen.queryByText(/External progress/)).not.toBeInTheDocument();
  });

  it("does not break analytics when the LeetCode request fails", async () => {
    mocked.getLeetCodeInsights.mockRejectedValue(new ApiError("boom", "INTERNAL", 500));
    renderAt("/dsa/analytics");
    expect(await screen.findByRole("heading", { name: "No counted activity yet" })).toBeInTheDocument();
    expect(screen.queryByText(/External progress/)).not.toBeInTheDocument();
  });
});

describe("navigation", () => {
  it("lists LeetCode under Evidence beside GitHub, with a real route", () => {
    const evidence = navGroups(null).find((g) => g.id === "evidence")!;
    const labels = evidence.items.map((i) => i.label);
    expect(labels).toContain("LeetCode");
    expect(labels.indexOf("LeetCode")).toBe(labels.indexOf("GitHub") + 1);
    const item = evidence.items.find((i) => i.label === "LeetCode")!;
    expect(item.to).toBe("/leetcode");
    expect(item.match("/leetcode")).toBe(true);
    expect(item.match("/leetcodes")).toBe(false);
  });
});
