import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AppRoutes } from "@/App";
import { AuthProvider } from "@/auth/AuthContext";
import type { AuthClient, AuthUser } from "@/auth/types";
import { api } from "@/api/endpoints";
import type { DsaAnalyticsResponse, RateMetric, RevisionItem, RevisionQueueResponse } from "@/types/contract";

vi.mock("@/api/endpoints", () => ({
  api: {
    getDsaAnalytics: vi.fn(),
    refreshDsaAnalytics: vi.fn(),
    getRevisionQueue: vi.fn(),
    revisionAction: vi.fn(),
    addRevision: vi.fn(),
    getDsaProgress: vi.fn(),
    getRoles: vi.fn(),
    getHealth: vi.fn(),
  },
}));
const mocked = vi.mocked(api);

const rate = (num: number, den: number, min = 5): RateMetric => ({
  value: den >= min ? num / den : null,
  numerator: num,
  denominator: den,
  available: den >= min,
  min_sample: min,
  note: den >= min ? null : `Only ${den} so far`,
});

const empty: DsaAnalyticsResponse = {
  generated_at: "2026-06-15T12:00:00.000Z",
  totals: { solved_unique: 0, attempted_unique: 0, eligible_attempts: 0, accepted_attempts: 0 },
  first_attempt_success: rate(0, 0),
  submission_success: rate(0, 0),
  topics: [],
  difficulties: [],
  weaknesses: [],
  untouched_topics: ["Arrays", "Graphs"],
  weekly: [{ week_start: "2026-06-15", attempts: 0, accepted: 0, first_solves: 0 }],
  recent: [],
  repeated_failures: [],
  comparison: {
    available: false,
    note: "A comparison needs at least 5 submissions in each of the last two 28-day periods (you have 0 and 0).",
    current: { from: "a", to: "b", attempts: 0, accepted: 0, accuracy: rate(0, 0) },
    previous: { from: "a", to: "b", attempts: 0, accepted: 0, accuracy: rate(0, 0) },
  },
  self_reported: { solved: 2, attempted: 1, needs_revision: 0, bookmarked: 3 },
  exclusions: { available: true, sampled_submissions: 4, demonstration: 3, ineligible_suite: 0, unverified_provider: 1, mock_execution: 0, judge_error: 0, unknown_provenance: 0 },
  has_eligible_activity: false,
  revision_due: 0,
};

const full: DsaAnalyticsResponse = {
  ...empty,
  totals: { solved_unique: 4, attempted_unique: 6, eligible_attempts: 12, accepted_attempts: 5 },
  first_attempt_success: rate(2, 3), // not enough data
  submission_success: rate(5, 12),
  topics: [
    { key: "Graphs", attempts: 7, accepted: 1, questions_attempted: 4, questions_solved: 1, accuracy: rate(1, 7), solve_rate: rate(1, 4, 3) },
    { key: "Arrays", attempts: 5, accepted: 4, questions_attempted: 2, questions_solved: 2, accuracy: rate(4, 5), solve_rate: rate(2, 2, 3) },
  ],
  difficulties: [{ key: "easy", attempts: 5, accepted: 4, questions_attempted: 2, questions_solved: 2, accuracy: rate(4, 5), solve_rate: rate(2, 2, 3) }],
  weaknesses: [
    { topic: "Graphs", status: "weak", trend: "declining", explanation: ["3 of 4 attempted questions are still unsolved (solve rate 25%).", "6 wrong-answer or time-limit failures across 7 submissions point at the approach rather than syntax."], evidence: { questions_attempted: 4, questions_solved: 1, attempts: 7, accepted: 1, algorithmic_failures: 6, technical_failures: 0, repeated_failure_questions: 1, revision_regressions: 0 } },
    { topic: "Arrays", status: "insufficient_data", trend: "insufficient_data", explanation: ["Not enough activity to judge: 2 questions and 5 submissions so far (needs at least 3 questions and 5 submissions)."], evidence: { questions_attempted: 2, questions_solved: 2, attempts: 5, accepted: 4, algorithmic_failures: 0, technical_failures: 0, repeated_failure_questions: 0, revision_regressions: 0 } },
  ],
  weekly: [
    { week_start: "2026-06-08", attempts: 4, accepted: 1, first_solves: 1 },
    { week_start: "2026-06-15", attempts: 8, accepted: 4, first_solves: 3 },
  ],
  recent: [{ submission_id: "sub_1", question_id: "q_a", title: "Alpha Graph Walk", verdict: "wrong_answer", at: "2026-06-15T10:00:00.000Z" }],
  repeated_failures: [{ question_id: "q_b", title: "Beta Shortest Path", consecutive_failures: 3, attempts: 4, last_verdict: "wrong_answer", last_attempt_at: "2026-06-15T09:00:00.000Z" }],
  exclusions: { available: true, sampled_submissions: 12, demonstration: 0, ineligible_suite: 0, unverified_provider: 0, mock_execution: 0, judge_error: 0, unknown_provenance: 0 },
  has_eligible_activity: true,
  revision_due: 2,
};

const item = (over: Partial<RevisionItem> = {}): RevisionItem => ({
  question_id: "q_b",
  title: "Beta Shortest Path",
  reason: "repeated_failure",
  priority: 1,
  due_at: "2026-06-15T09:00:00.000Z",
  due: true,
  status: "pending",
  stage: 0,
  last_reviewed_at: null,
  postponed_count: 0,
  created_at: "2026-06-10T09:00:00.000Z",
  updated_at: "2026-06-15T09:00:00.000Z",
  context: { attempts: 4, failures: 4, consecutive_failures: 3, last_verdict: "wrong_answer", topics: ["Graphs"], difficulty: "hard", solved: false },
  explanation: "Failed 3 times in a row (last result: wrong answer).",
  history: [],
  ...over,
});

const queueOf = (items: RevisionItem[], over: Partial<RevisionQueueResponse> = {}): RevisionQueueResponse => ({
  items,
  page: 1,
  page_size: 10,
  total: items.length,
  total_pages: 1,
  counts: { due: items.length, upcoming: 0, total: items.length },
  suggestions: [],
  ...over,
});

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
    </AuthProvider>,
  );

beforeEach(() => {
  vi.resetAllMocks();
  mocked.getRevisionQueue.mockResolvedValue(queueOf([]));
});

describe("analytics dashboard", () => {
  it("shows an honest empty state, never zeros dressed up as results, and explains what is excluded", async () => {
    mocked.getDsaAnalytics.mockResolvedValue(empty);
    renderAt("/dsa/analytics");
    expect(await screen.findByRole("heading", { name: "No counted activity yet" })).toBeInTheDocument();
    expect(screen.getByText(/self-reported marks \(2 solved, 1 attempted\) are not judged results/)).toBeInTheDocument();
    const note = screen.getByRole("note");
    expect(note).toHaveTextContent(/4 of your latest 4 submissions are not counted/);
    expect(note).toHaveTextContent(/3 on demonstration exercises \(not real interview data\)/);
    expect(note).toHaveTextContent(/1 judged by a service not confirmed as a real deployment/);
    expect(screen.queryByText("Submission success")).not.toBeInTheDocument();
    expect(screen.getByText("Nothing is due for revision.")).toBeInTheDocument();
  });

  it("renders only what the API returned: totals, sample sizes, topics, trend, evidence, and links to questions", async () => {
    mocked.getDsaAnalytics.mockResolvedValue(full);
    mocked.getRevisionQueue.mockResolvedValue(queueOf([item()]));
    renderAt("/dsa/analytics");
    await screen.findByText("Submission success");

    const summary = screen.getByRole("region", { name: "Summary" });
    expect(within(summary).getByText("4")).toBeInTheDocument(); // solved
    expect(within(summary).getByText("6")).toBeInTheDocument(); // attempted
    expect(within(summary).getByText("42%")).toBeInTheDocument(); // 5 of 12
    expect(within(summary).getByText("(5 of 12)")).toBeInTheDocument();
    expect(within(summary).getByText(/Not enough data yet \(3 of 5 needed\)/)).toBeInTheDocument(); // first-attempt metric hidden

    const topics = screen.getByRole("list", { name: "Performance by topic" });
    expect(within(topics).getByText(/1 accepted of 7 submissions · 1 of 4 questions solved/)).toBeInTheDocument();
    expect(within(topics).getByText(/Not enough data yet \(2 of 5 needed\)|80%/)).toBeInTheDocument();
    expect(screen.getByText(/Not practised yet: Arrays, Graphs/)).toBeInTheDocument();

    expect(screen.getByText("Needs work · Declining lately")).toBeInTheDocument();
    expect(screen.getByText(/3 of 4 attempted questions are still unsolved \(solve rate 25%\)/)).toBeInTheDocument();
    expect(screen.getByText(/Not enough activity to judge/)).toBeInTheDocument();

    expect(screen.getByText(/12 counted submissions in the last 2 weeks, 5 accepted/)).toBeInTheDocument();
    expect(screen.getByText(/A comparison needs at least 5 submissions/)).toBeInTheDocument();
    expect(screen.getByText(/week of 2026-06-15: 8 submissions, 4 accepted, 3 newly solved/)).toBeInTheDocument(); // chart has a text equivalent

    expect(screen.getByRole("link", { name: "Alpha Graph Walk" })).toHaveAttribute("href", "/dsa/questions/q_a/code");
    const repeated = screen.getByRole("heading", { name: "Questions failing repeatedly" }).closest("section")!;
    expect(within(repeated).getByRole("link", { name: "Beta Shortest Path" })).toHaveAttribute("href", "/dsa/questions/q_b/code");
    expect(within(repeated).getByText(/3 failures in a row \(4 submissions in total\)/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Revision due (1)" })).toBeInTheDocument();
  });

  it("states the comparison when both periods have enough data", async () => {
    mocked.getDsaAnalytics.mockResolvedValue({
      ...full,
      comparison: { available: true, note: null, current: { from: "a", to: "b", attempts: 6, accepted: 5, accuracy: rate(5, 6) }, previous: { from: "a", to: "b", attempts: 6, accepted: 2, accuracy: rate(2, 6) } },
    });
    renderAt("/dsa/analytics");
    expect(await screen.findByText(/Last 28 days: 5 of 6 accepted. The 28 days before: 2 of 6/)).toBeInTheDocument();
  });

  it("shows loading, then a retryable error", async () => {
    let fail: (e: unknown) => void = () => undefined;
    mocked.getDsaAnalytics
      .mockImplementationOnce(() => new Promise((_resolve, reject) => void (fail = reject)))
      .mockResolvedValueOnce(full);
    renderAt("/dsa/analytics");
    expect(await screen.findByText(/Loading your analytics/)).toBeInTheDocument(); // held open until we reject it
    fail(new Error("x"));
    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Submission success")).toBeInTheDocument();
  });

  it("rebuilds from submissions on request and shows the refreshed numbers", async () => {
    mocked.getDsaAnalytics.mockResolvedValue(full);
    mocked.refreshDsaAnalytics.mockResolvedValue({ ...full, totals: { ...full.totals, solved_unique: 5 } });
    renderAt("/dsa/analytics");
    await screen.findByText("Submission success");
    fireEvent.click(screen.getByRole("button", { name: "Rebuild from submissions" }));
    await waitFor(() => expect(mocked.refreshDsaAnalytics).toHaveBeenCalledTimes(1));
    expect(await within(screen.getByRole("region", { name: "Summary" })).findByText("5")).toBeInTheDocument();
  });

  it("says so when excluded-submission counts are unavailable", async () => {
    mocked.getDsaAnalytics.mockResolvedValue({ ...full, exclusions: { available: false, sampled_submissions: 0, demonstration: 0, ineligible_suite: 0, unverified_provider: 0, mock_execution: 0, judge_error: 0, unknown_provenance: 0 } });
    renderAt("/dsa/analytics");
    expect(await screen.findByText(/Counts of excluded submissions are temporarily unavailable/)).toBeInTheDocument();
  });

  it("is only for signed-in students", async () => {
    renderAt("/dsa/analytics", null);
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(mocked.getDsaAnalytics).not.toHaveBeenCalled();
  });
});

describe("revision queue page", () => {
  it("lists prioritized items with reason, due state and links to the question and coding workspace", async () => {
    mocked.getRevisionQueue.mockResolvedValue(queueOf([item(), item({ question_id: "q_c", title: "Gamma Merge", reason: "spaced_review", priority: 3, status: "pending", explanation: "Solved after 2 failed attempts; scheduled for spaced review so it sticks." })]));
    renderAt("/dsa/revision");
    expect(await screen.findByRole("link", { name: "Beta Shortest Path" })).toHaveAttribute("href", "/dsa/questions/q_b");
    expect(screen.getByText("Failed 3 times in a row (last result: wrong answer).")).toBeInTheDocument();
    expect(screen.getByText("Repeated failure")).toBeInTheDocument();
    expect(screen.getByText("Review overdue")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Open coding workspace" })[0]).toHaveAttribute("href", "/dsa/questions/q_b/code");
    expect(mocked.getRevisionQueue).toHaveBeenCalledWith({ view: "due", page: 1, page_size: 10 });
  });

  it("sends the right action for start, complete, postpone", async () => {
    mocked.getRevisionQueue.mockResolvedValue(queueOf([item()]));
    mocked.revisionAction.mockResolvedValue(item({ status: "in_progress" }));
    renderAt("/dsa/revision");
    await screen.findByText("Beta Shortest Path");
    fireEvent.click(screen.getByRole("button", { name: "Start review" }));
    await waitFor(() => expect(mocked.revisionAction).toHaveBeenLastCalledWith("q_b", { action: "start" }));
    fireEvent.click(screen.getByRole("button", { name: "Done: remembered it" }));
    await waitFor(() => expect(mocked.revisionAction).toHaveBeenLastCalledWith("q_b", { action: "complete", outcome: "remembered" }));
    fireEvent.click(screen.getByRole("button", { name: "Done: struggled" }));
    await waitFor(() => expect(mocked.revisionAction).toHaveBeenLastCalledWith("q_b", { action: "complete", outcome: "struggled" }));
    fireEvent.click(screen.getByRole("button", { name: "Postpone 2 days" }));
    await waitFor(() => expect(mocked.revisionAction).toHaveBeenLastCalledWith("q_b", { action: "postpone" }));
    expect(mocked.getRevisionQueue.mock.calls.length).toBeGreaterThan(3); // reloaded after each action
  });

  it("offers revisit for scheduled and postponed items instead of complete", async () => {
    mocked.getRevisionQueue.mockResolvedValue(queueOf([item({ status: "postponed", due: false, due_at: "2026-07-01T00:00:00.000Z" })]));
    mocked.revisionAction.mockResolvedValue(item());
    renderAt("/dsa/revision");
    await screen.findByText("Beta Shortest Path");
    expect(screen.queryByRole("button", { name: "Done: remembered it" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Postpone/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Revisit now" }));
    await waitFor(() => expect(mocked.revisionAction).toHaveBeenCalledWith("q_b", { action: "revisit" }));
  });

  it("surfaces a rejected action without losing the list", async () => {
    const { ApiError } = await import("@/api/types");
    mocked.getRevisionQueue.mockResolvedValue(queueOf([item()]));
    mocked.revisionAction.mockRejectedValue(new ApiError("gone", "REVISION_NOT_FOUND", 404));
    renderAt("/dsa/revision");
    await screen.findByText("Beta Shortest Path");
    fireEvent.click(screen.getByRole("button", { name: "Start review" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/no longer exists/);
    expect(screen.getByText("Beta Shortest Path")).toBeInTheDocument();
  });

  it("switches views, refetching from the server", async () => {
    mocked.getRevisionQueue.mockResolvedValue(queueOf([], { counts: { due: 0, upcoming: 2, total: 2 } }));
    renderAt("/dsa/revision");
    expect(await screen.findByText(/Nothing is due/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /Upcoming/ }));
    await waitFor(() => expect(mocked.getRevisionQueue).toHaveBeenLastCalledWith({ view: "upcoming", page: 1, page_size: 10 }));
    expect(screen.getByRole("tab", { name: /Upcoming/ })).toHaveAttribute("aria-selected", "true");
  });

  it("shows suggestions and adds one only when asked", async () => {
    mocked.getRevisionQueue.mockResolvedValue(
      queueOf([], { suggestions: [{ question_id: "q_s", title: "Suggested Graph Problem", topic: "Graphs", difficulty: "easy", reason: "You have 6 wrong-answer or time-limit failures in Graphs; this unsolved question is a gentle way to practise it." }] }),
    );
    mocked.addRevision.mockResolvedValue(item({ question_id: "q_s", reason: "topic_weakness", priority: 5 }));
    renderAt("/dsa/revision");
    expect(await screen.findByText("Suggested Graph Problem")).toBeInTheDocument();
    expect(mocked.addRevision).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Add to revision" }));
    await waitFor(() => expect(mocked.addRevision).toHaveBeenCalledWith("q_s"));
  });
});
