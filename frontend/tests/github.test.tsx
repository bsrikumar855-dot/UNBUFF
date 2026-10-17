import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AppRoutes } from "@/App";
import { AuthProvider } from "@/auth/AuthContext";
import type { AuthClient, AuthUser } from "@/auth/types";
import { api } from "@/api/endpoints";
import { ApiError } from "@/api/types";
import type {
  GithubActivityResponse,
  GithubConnection,
  GithubContributionsResponse,
  GithubRepositoriesResponse,
  GithubSourceInfo,
  GithubSyncResponse,
} from "@/types/contract";

vi.mock("@/api/endpoints", () => ({
  api: {
    getGithubConnection: vi.fn(),
    connectGithub: vi.fn(),
    disconnectGithub: vi.fn(),
    syncGithub: vi.fn(),
    getGithubContributions: vi.fn(),
    getGithubRepositories: vi.fn(),
    getGithubActivity: vi.fn(),
    getHealth: vi.fn(),
    getRoles: vi.fn(),
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
const renderAt = (path: string, u: AuthUser | null = user) =>
  render(
    <AuthProvider client={fakeAuth(u)}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </AuthProvider>
  );

const conn = (over: Partial<GithubConnection> = {}): GithubConnection => ({
  status: "connected",
  login: "alice",
  profile_url: "https://github.com/alice",
  access: "public_only",
  permissions: [],
  connected_at: "2026-06-01T00:00:00.000Z",
  last_synced_at: "2026-06-15T12:00:00.000Z",
  freshness: "fresh",
  fresh_for_minutes: 360,
  last_sync_error: null,
  last_sync_error_at: null,
  sync_in_progress: false,
  next_sync_allowed_at: null,
  ...over,
});
const source = (over: Partial<GithubSourceInfo> = {}): GithubSourceInfo => ({
  login: "alice",
  synced_at: "2026-06-15T12:00:00.000Z",
  from: "2025-06-16",
  to: "2026-06-15",
  freshness: "fresh",
  cached: true,
  ...over,
});

const contributions = (
  over: Partial<GithubContributionsResponse> = {}
): GithubContributionsResponse => ({
  source: source(),
  available: true,
  total: 21,
  weeks: [
    {
      starts_on: "2026-06-07",
      days: [
        { date: "2026-06-07", count: 0 },
        { date: "2026-06-08", count: 5 },
        { date: "2026-06-09", count: 16 },
      ],
    },
  ],
  weekly: [{ period: "2026-06-07", total: 21 }],
  monthly: [{ period: "2026-06", total: 21 }],
  breakdown: { commits: 15, pull_requests: 3, reviews: 2, issues: 1 },
  restricted_count: 4,
  active_days: 2,
  longest_streak_days: 2,
  notice:
    "Contribution counts are partial evidence of development work, not a measure of skill.",
  ...over,
});
const repositories = (
  over: Partial<GithubRepositoriesResponse> = {}
): GithubRepositoriesResponse => ({
  source: source(),
  available: true,
  total_public_repositories: 2,
  truncated: false,
  repositories: [
    {
      name_with_owner: "alice/todo-app",
      url: "https://github.com/alice/todo-app",
      description: "A small todo app",
      primary_language: "TypeScript",
      languages: [{ name: "TypeScript", percent: 80 }],
      is_fork: false,
      is_archived: false,
      pushed_at: "2026-06-10T00:00:00Z",
      updated_at: null,
      stars: 3,
      open_issues: 1,
      open_pull_requests: 0,
      your_commits_90d: 14,
      has_license: true,
      topics: [],
    },
    {
      name_with_owner: "alice/notes",
      url: "https://github.com/alice/notes",
      description: null,
      primary_language: null,
      languages: [],
      is_fork: false,
      is_archived: false,
      pushed_at: null,
      updated_at: null,
      stars: 0,
      open_issues: 0,
      open_pull_requests: 0,
      your_commits_90d: null,
      has_license: null,
      topics: [],
    },
  ],
  checklist: [
    {
      repository: "alice/todo-app",
      check: "readme_present",
      status: "pass",
      label: "Has a README at the repository root",
      evidence: "Found README.md.",
    },
    {
      repository: "alice/notes",
      check: "readme_present",
      status: "fail",
      label: "Has a README at the repository root",
      evidence: "No README file in the root listing returned by GitHub.",
    },
    {
      repository: "alice/notes",
      check: "setup_instructions",
      status: "unknown",
      label: "README explains how to install or run the project",
      evidence: "There is no README to inspect (a docs folder was not checked).",
    },
  ],
  ...over,
});
const activity = (
  over: Partial<GithubActivityResponse> = {}
): GithubActivityResponse => ({
  source: source(),
  available: true,
  pull_requests_total: 12,
  issues_total: 4,
  items: [
    {
      kind: "pull_request",
      title: "Add search",
      url: "https://github.com/alice/todo-app/pull/3",
      repository: "alice/todo-app",
      state: "merged",
      occurred_at: "2026-06-01T10:00:00Z",
    },
  ],
  ...over,
});
const syncResult = (over: Partial<GithubSyncResponse> = {}): GithubSyncResponse => ({
  outcome: "synced",
  connection: conn(),
  unavailable_sections: [],
  rate_limit_remaining: 4990,
  ...over,
});

const realLocation = window.location;
let assign: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.resetAllMocks();
  assign = vi.fn();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...realLocation, assign },
  });
  mocked.getGithubConnection.mockResolvedValue(conn());
  mocked.getGithubContributions.mockResolvedValue(contributions());
  mocked.getGithubRepositories.mockResolvedValue(repositories());
  mocked.getGithubActivity.mockResolvedValue(activity());
});
afterEach(() =>
  Object.defineProperty(window, "location", { configurable: true, value: realLocation })
);

describe("GitHub connection (settings)", () => {
  it("explains what a not-configured server means and offers no connect button", async () => {
    mocked.getGithubConnection.mockResolvedValue(
      conn({
        status: "not_configured",
        login: null,
        profile_url: null,
        connected_at: null,
        last_synced_at: null,
        freshness: "never_synced",
      })
    );
    renderAt("/settings");
    expect(await screen.findByText(/not set up on this server/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Connect GitHub/ })
    ).not.toBeInTheDocument();
  });

  it("states what connecting does and does not do, and sends the student to GitHub's real authorization page", async () => {
    mocked.getGithubConnection.mockResolvedValue(
      conn({
        status: "disconnected",
        login: null,
        profile_url: null,
        connected_at: null,
        last_synced_at: null,
        freshness: "never_synced",
      })
    );
    mocked.connectGithub.mockResolvedValue({
      authorize_url: "https://github.com/login/oauth/authorize?client_id=x&state=y",
      expires_at: "2026-06-15T12:10:00Z",
    });
    renderAt("/settings");
    expect(
      await screen.findByText(/Read-only: UNBLUFF can never change anything on GitHub/)
    ).toBeInTheDocument();
    expect(screen.getByText(/no private repositories are requested/)).toBeInTheDocument();
    expect(screen.getByText(/You stay signed in to UNBLUFF/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Connect GitHub" }));
    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith(
        "https://github.com/login/oauth/authorize?client_id=x&state=y"
      )
    );
  });

  it("refuses to navigate to an address that is not GitHub's authorization page", async () => {
    mocked.getGithubConnection.mockResolvedValue(
      conn({ status: "disconnected", login: null })
    );
    mocked.connectGithub.mockResolvedValue({
      authorize_url: "https://evil.example/login/oauth/authorize",
      expires_at: "x",
    });
    renderAt("/settings");
    fireEvent.click(await screen.findByRole("button", { name: "Connect GitHub" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(assign).not.toHaveBeenCalled();
  });

  it("shows the connected account, freshness and the last sync, and syncs on request", async () => {
    mocked.syncGithub.mockResolvedValue(syncResult());
    renderAt("/settings");
    const link = await screen.findByRole("link", { name: "@alice" });
    expect(link).toHaveAttribute("href", "https://github.com/alice");
    expect(screen.getByText(/public data only/)).toBeInTheDocument();
    expect(screen.getByText("Up to date")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sync now" }));
    expect(
      await screen.findByText("Synchronised with GitHub just now.")
    ).toBeInTheDocument();
    expect(mocked.syncGithub).toHaveBeenCalledTimes(1);
  });

  it("reports partial and cached synchronisations honestly", async () => {
    mocked.syncGithub.mockResolvedValueOnce(
      syncResult({ outcome: "partial", unavailable_sections: ["activity"] })
    );
    renderAt("/settings");
    fireEvent.click(await screen.findByRole("button", { name: "Sync now" }));
    expect(
      await screen.findByText(/did not return: activity\. Older saved data/)
    ).toBeInTheDocument();
    mocked.syncGithub.mockResolvedValueOnce(
      syncResult({
        outcome: "cached",
        connection: conn({ next_sync_allowed_at: "2026-06-15T12:05:00Z" }),
      })
    );
    fireEvent.click(screen.getByRole("button", { name: "Sync now" }));
    expect(await screen.findByText(/no new request was made/)).toBeInTheDocument();
  });

  it("shows rate-limit and availability failures with the saved data kept", async () => {
    mocked.syncGithub.mockRejectedValue(
      new ApiError("limit", "GITHUB_RATE_LIMITED", 429)
    );
    renderAt("/settings");
    fireEvent.click(await screen.findByRole("button", { name: "Sync now" }));
    expect(
      await screen.findByText(/rate limit is used up.*saved data is unchanged/)
    ).toBeInTheDocument();
  });

  it("asks to reconnect when GitHub no longer accepts the connection", async () => {
    mocked.getGithubConnection.mockResolvedValue(
      conn({ status: "reauthorization_required", last_sync_error: "unauthorized" })
    );
    mocked.connectGithub.mockResolvedValue({
      authorize_url: "https://github.com/login/oauth/authorize?x=1",
      expires_at: "x",
    });
    renderAt("/settings");
    expect(
      await screen.findByText(/no longer accepts the saved connection/)
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sync now" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reconnect GitHub" }));
    await waitFor(() => expect(assign).toHaveBeenCalled());
  });

  it("disconnects only after confirmation and says whether GitHub revoked access", async () => {
    mocked.disconnectGithub.mockResolvedValue({
      connection: conn({ status: "disconnected", login: null, profile_url: null }),
      revoked_at_github: false,
      data_removed: true,
    });
    renderAt("/settings");
    fireEvent.click(await screen.findByRole("button", { name: "Disconnect GitHub" }));
    expect(mocked.disconnectGithub).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Keep it" }));
    expect(mocked.disconnectGithub).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Disconnect GitHub" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, disconnect" }));
    expect(
      await screen.findByText(/GitHub could not be reached to revoke access/)
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "Connect GitHub" })
    ).toBeInTheDocument();
  });

  it("shows a retryable error when the connection cannot be loaded", async () => {
    mocked.getGithubConnection
      .mockRejectedValueOnce(new Error("x"))
      .mockResolvedValueOnce(conn());
    renderAt("/settings");
    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("link", { name: "@alice" })).toBeInTheDocument();
  });

  it("returning from GitHub: starts one synchronisation and removes the parameters from the address", async () => {
    mocked.syncGithub.mockResolvedValue(syncResult());
    renderAt("/settings?github=connected");
    expect(
      await screen.findByText(/GitHub is connected\. Fetching your public activity now/)
    ).toBeInTheDocument();
    await waitFor(() => expect(mocked.syncGithub).toHaveBeenCalledTimes(1));
    expect(
      await screen.findByText("Synchronised with GitHub just now.")
    ).toBeInTheDocument();
    expect(mocked.syncGithub).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["access_denied", /You cancelled the authorization/],
    ["already_linked", /already linked to another UNBLUFF student/],
    ["excessive_permissions", /only ever reads public data/],
    ["expired_state", /expired after 10 minutes/],
    ["something_new", /could not be connected/],
  ])(
    "explains a failed connection (%s) without connecting or syncing",
    async (reason, text) => {
      mocked.getGithubConnection.mockResolvedValue(
        conn({ status: "disconnected", login: null })
      );
      renderAt(`/settings?github=error&reason=${reason}`);
      expect(await screen.findByRole("alert")).toHaveTextContent(text);
      expect(mocked.syncGithub).not.toHaveBeenCalled();
    }
  );

  it("is only for signed-in students", async () => {
    renderAt("/settings", null);
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(mocked.getGithubConnection).not.toHaveBeenCalled();
  });
});

describe("GitHub insights page", () => {
  it("does not fetch any data while disconnected and invites the student to connect", async () => {
    mocked.getGithubConnection.mockResolvedValue(
      conn({ status: "disconnected", login: null, profile_url: null })
    );
    renderAt("/github");
    expect(
      await screen.findByText(/Connect GitHub above to see your contribution history/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/partial evidence, not a measure of skill/)
    ).toBeInTheDocument();
    expect(mocked.getGithubContributions).not.toHaveBeenCalled();
    expect(mocked.getGithubRepositories).not.toHaveBeenCalled();
  });

  it("shows the calendar with GitHub's totals, date range, derived summaries and source", async () => {
    renderAt("/github");
    expect(
      await screen.findByRole("img", {
        name: /Contribution heatmap from 2025-06-16 to 2026-06-15: 21 contributions/,
      })
    ).toBeInTheDocument();
    expect(screen.getAllByText(/saved copy synchronised/).length).toBe(3);
    expect(screen.getByText("Contributions").nextElementSibling).toHaveTextContent("21");
    expect(screen.getByText("15 · 3 · 2 · 1")).toBeInTheDocument();
    expect(
      screen.getByRole("list", { name: "Contributions per month" })
    ).toHaveTextContent("21");
    expect(
      screen.getByRole("list", { name: "Contributions per week" })
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /also counts 4 contributions to private repositories.*Only the number is shown/
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(/partial evidence of development work, not a measure of skill/)
    ).toBeInTheDocument();
  });

  it("lists repositories, unknown values as such, and recent collaboration", async () => {
    renderAt("/github");
    expect(await screen.findByRole("link", { name: "alice/todo-app" })).toHaveAttribute(
      "href",
      "https://github.com/alice/todo-app"
    );
    expect(screen.getByText("A small todo app")).toBeInTheDocument();
    expect(screen.getByText("No description.")).toBeInTheDocument();
    expect(screen.getByText(/TypeScript 80%/)).toBeInTheDocument();
    expect(
      screen.getByText(/your commits in the last 90 days: unknown/)
    ).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "Add search" })).toBeInTheDocument();
    expect(
      screen.getByText(/12 pull requests and 4 issues opened in total/)
    ).toBeInTheDocument();
  });

  it("states checklist results in words, separating 'missing' from 'couldn't check'", async () => {
    renderAt("/github");
    const notes = await screen.findByRole("region", {
      name: "Checklist for alice/notes",
    });
    expect(
      within(notes).getByText(/Has a README at the repository root: Missing/)
    ).toBeInTheDocument();
    expect(
      within(notes).getByText(
        /README explains how to install or run the project: Couldn't check/
      )
    ).toBeInTheDocument();
    expect(within(notes).getByText(/a docs folder was not checked/)).toBeInTheDocument();
    const todo = screen.getByRole("region", { name: "Checklist for alice/todo-app" });
    expect(within(todo).getByText(/Done/)).toBeInTheDocument();
    expect(screen.getByText(/does not judge your code/)).toBeInTheDocument();
  });

  it("is honest before the first synchronisation", async () => {
    mocked.getGithubConnection.mockResolvedValue(
      conn({ last_synced_at: null, freshness: "never_synced" })
    );
    mocked.getGithubContributions.mockResolvedValue(
      contributions({
        available: false,
        total: null,
        weeks: [],
        weekly: [],
        monthly: [],
        breakdown: null,
        source: source({ synced_at: null, freshness: "never_synced" }),
      })
    );
    mocked.getGithubRepositories.mockResolvedValue(
      repositories({ available: false, repositories: [], checklist: [] })
    );
    mocked.getGithubActivity.mockResolvedValue(activity({ available: false, items: [] }));
    renderAt("/github");
    expect(await screen.findByText(/No contribution data yet/)).toBeInTheDocument();
    expect(screen.getByText(/No repository data yet/)).toBeInTheDocument();
    expect(screen.getByText(/No activity data yet/)).toBeInTheDocument();
    expect(
      screen.getByText(/Available after the first synchronisation/)
    ).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /heatmap/ })).not.toBeInTheDocument();
  });

  it("labels stale data and keeps showing it", async () => {
    mocked.getGithubConnection.mockResolvedValue(conn({ freshness: "stale" }));
    mocked.getGithubContributions.mockResolvedValue(
      contributions({ source: source({ freshness: "stale" }) })
    );
    renderAt("/github");
    expect(
      await screen.findByText(/May be out of date/, { selector: "p.text-xs" })
    ).toBeInTheDocument();
    expect(await screen.findByRole("img", { name: /heatmap/ })).toBeInTheDocument();
  });

  it("a failing section shows its own error and retry without hiding the others", async () => {
    mocked.getGithubActivity
      .mockRejectedValueOnce(new ApiError("x", "GITHUB_UNAVAILABLE", 502))
      .mockResolvedValueOnce(activity());
    renderAt("/github");
    expect(await screen.findByRole("img", { name: /heatmap/ })).toBeInTheDocument();
    expect(
      await screen.findByText(/couldn't be reached or answered unexpectedly/)
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("link", { name: "Add search" })).toBeInTheDocument();
  });

  it("reloads the data after a manual synchronisation", async () => {
    mocked.syncGithub.mockResolvedValue(syncResult());
    renderAt("/github");
    await screen.findByRole("img", { name: /heatmap/ });
    expect(mocked.getGithubContributions).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Sync now" }));
    await waitFor(() => expect(mocked.getGithubContributions).toHaveBeenCalledTimes(2));
  });

  it("still shows saved data while a reconnect is needed, and clears the page after a disconnect", async () => {
    mocked.getGithubConnection.mockResolvedValue(
      conn({ status: "reauthorization_required" })
    );
    mocked.disconnectGithub.mockResolvedValue({
      connection: conn({ status: "disconnected", login: null, profile_url: null }),
      revoked_at_github: true,
      data_removed: true,
    });
    renderAt("/github");
    expect(await screen.findByRole("img", { name: /heatmap/ })).toBeInTheDocument();
    expect(
      screen.getByText(/no longer accepts the saved connection/)
    ).toBeInTheDocument();
    mocked.getGithubConnection.mockResolvedValue(
      conn({ status: "disconnected", login: null, profile_url: null })
    );
    fireEvent.click(screen.getByRole("button", { name: "Disconnect GitHub" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, disconnect" }));
    await waitFor(() =>
      expect(screen.queryByRole("img", { name: /heatmap/ })).not.toBeInTheDocument()
    );
    expect(await screen.findByText(/Connect GitHub above/)).toBeInTheDocument();
  });

  it("is only for signed-in students", async () => {
    renderAt("/github", null);
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  });
});
