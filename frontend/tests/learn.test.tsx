import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AppRoutes } from "@/App";
import { AuthProvider } from "@/auth/AuthContext";
import type { AuthClient, AuthUser } from "@/auth/types";
import { api } from "@/api/endpoints";
import type { DbmsTopicDetail, LearnProgressResponse, PatternDetail } from "@/types/contract";

vi.mock("@/api/endpoints", () => ({
  api: {
    getLearnPatterns: vi.fn(),
    getLearnPattern: vi.fn(),
    getDbmsTopics: vi.fn(),
    getDbmsTopic: vi.fn(),
    getLearnProgress: vi.fn(),
    setPatternProgress: vi.fn(),
    submitDbmsQuiz: vi.fn(),
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
const renderAt = (path: string, u: AuthUser | null = user) =>
  render(
    <AuthProvider client={fakeAuth(u)}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </AuthProvider>
  );

const progress = (over: Partial<LearnProgressResponse> = {}): LearnProgressResponse => ({
  progress: { patterns: {}, dbms: {}, updated_at: null },
  patterns_done: 0,
  patterns_total: 2,
  dbms_passed: 0,
  dbms_total: 1,
  ...over,
});

const pattern: PatternDetail = {
  id: "sliding-window-fixed",
  name: "Sliding window, fixed size",
  topic: "Arrays and strings",
  level: "core",
  cues: ["subarray of size k"],
  summary: "Slide a window of k elements and update the total.",
  problem_count: 2,
  idea: ["Add the new element, remove the old one."],
  template: "def best(a, k):\n    return 0",
  complexity: { time: "O(n)", space: "O(1)" },
  pitfalls: ["Off-by-one at the first window."],
  variants: [{ name: "Averages", when: "You need the mean." }],
  problems: [
    { key: "maximum-average-subarray-i", title: "Maximum Average Subarray I", difficulty: "easy", note: "Window of size k.", url: "https://leetcode.com/problems/maximum-average-subarray-i/", practice_id: null },
    { key: "fp_021_longest_unique_stretch", title: "Longest unique stretch", difficulty: "medium", note: "Own problem.", url: null, practice_id: "fp_021_longest_unique_stretch" },
  ],
  related: [{ id: "prefix-sum", name: "Prefix sums" }],
};

const topic: DbmsTopicDetail = {
  id: "joins",
  name: "Joins",
  group: "SQL",
  summary: "Combine rows from two tables.",
  minutes: 8,
  has_example: true,
  quiz_questions: 2,
  sections: [{ heading: "Inner join", body: ["Keeps only matching rows."] }],
  key_points: ["LEFT JOIN keeps unmatched left rows."],
  example: { title: "Orders and customers", setup: "CREATE TABLE c(id);", query: "SELECT * FROM c;", explanation: "One row per match.", columns: ["id", "name"], rows: [[1, "Asha"], [2, null]] },
  interview: [{ q: "Inner vs outer join?", a: "Outer keeps unmatched rows." }],
  quiz: [
    { id: "q1", question: "Which join keeps unmatched left rows?", options: ["INNER", "LEFT"] },
    { id: "q2", question: "What does ON do?", options: ["Filters groups", "Matches rows"] },
  ],
  related: [{ id: "subqueries-cte", name: "Subqueries and CTEs" }],
};

beforeEach(() => {
  vi.resetAllMocks();
  mocked.getLearnProgress.mockResolvedValue(progress());
});

describe("learn: patterns", () => {
  it("lists patterns by family for a signed-out visitor, without asking for progress", async () => {
    mocked.getLearnPatterns.mockResolvedValue({
      topics: ["Arrays and strings"],
      patterns: [{ id: pattern.id, name: pattern.name, topic: pattern.topic, level: "core", cues: pattern.cues, summary: pattern.summary, problem_count: 2 }],
    });
    renderAt("/learn/patterns", null);
    expect(await screen.findByRole("link", { name: "Sliding window, fixed size" })).toHaveAttribute("href", "/learn/patterns/sliding-window-fixed");
    expect(screen.getByText("Arrays and strings")).toBeInTheDocument();
    expect(screen.getByText("“subarray of size k”")).toBeInTheDocument();
    expect(mocked.getLearnProgress).not.toHaveBeenCalled();
  });

  it("shows the template, the problems and both kinds of practice link", async () => {
    mocked.getLearnPattern.mockResolvedValue(pattern);
    renderAt("/learn/patterns/sliding-window-fixed", null);
    expect(await screen.findByRole("heading", { level: 1, name: "Sliding window, fixed size" })).toBeInTheDocument();
    expect(screen.getByText(/def best/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /LeetCode/ })).toHaveAttribute("href", "https://leetcode.com/problems/maximum-average-subarray-i/");
    expect(screen.getByRole("link", { name: /Solve in UNBLUFF/ })).toHaveAttribute("href", "/dsa/questions/fp_021_longest_unique_stretch/code");
    expect(screen.queryByRole("button", { name: "Mark solved" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ask the mentor" })).toHaveAttribute("href", expect.stringContaining("/mentor?prompt="));
  });

  it("marks a problem solved for a signed-in student and shows the saved state", async () => {
    mocked.getLearnPattern.mockResolvedValue(pattern);
    mocked.setPatternProgress.mockResolvedValue(
      progress({ progress: { patterns: { [pattern.id]: { done: false, problems_done: ["maximum-average-subarray-i"] } }, dbms: {}, updated_at: "now" } })
    );
    renderAt("/learn/patterns/sliding-window-fixed");
    const buttons = await screen.findAllByRole("button", { name: "Mark solved" });
    fireEvent.click(buttons[0]!);
    await waitFor(() => expect(mocked.setPatternProgress).toHaveBeenCalledWith(pattern.id, { problems: [{ key: "maximum-average-subarray-i", done: true }] }));
    expect(await screen.findByText("Marked solved")).toBeInTheDocument();
  });

  it("keeps a mark saved even when the first progress load finishes after it", async () => {
    let finishLoad: (r: LearnProgressResponse) => void = () => undefined;
    mocked.getLearnProgress.mockReturnValue(new Promise((resolve) => (finishLoad = resolve)));
    mocked.getLearnPattern.mockResolvedValue(pattern);
    mocked.setPatternProgress.mockResolvedValue(
      progress({ progress: { patterns: { [pattern.id]: { done: false, problems_done: ["maximum-average-subarray-i"] } }, dbms: {}, updated_at: "now" } })
    );
    renderAt("/learn/patterns/sliding-window-fixed");
    fireEvent.click((await screen.findAllByRole("button", { name: "Mark solved" }))[0]!);
    expect(await screen.findByText("Marked solved")).toBeInTheDocument();
    // the older, empty answer arrives last and must not wipe the mark
    await act(async () => finishLoad(progress()));
    expect(screen.getByText("Marked solved")).toBeInTheDocument();
  });

  it("keeps a mark saved when the progress load answers while the save is still in flight", async () => {
    let finishLoad: (r: LearnProgressResponse) => void = () => undefined;
    let finishSave: (r: LearnProgressResponse) => void = () => undefined;
    mocked.getLearnProgress.mockReturnValue(new Promise((resolve) => (finishLoad = resolve)));
    mocked.getLearnPattern.mockResolvedValue(pattern);
    mocked.setPatternProgress.mockReturnValue(new Promise((resolve) => (finishSave = resolve)));
    renderAt("/learn/patterns/sliding-window-fixed");
    fireEvent.click((await screen.findAllByRole("button", { name: "Mark solved" }))[0]!);
    await waitFor(() => expect(mocked.setPatternProgress).toHaveBeenCalled());
    await act(async () => finishLoad(progress())); // the older, empty load answers first
    await act(async () =>
      finishSave(progress({ progress: { patterns: { [pattern.id]: { done: false, problems_done: ["maximum-average-subarray-i"] } }, dbms: {}, updated_at: "now" } }))
    );
    expect(await screen.findByText("Marked solved")).toBeInTheDocument();
  });

  it("shows an error with a retry when the pattern cannot be loaded", async () => {
    mocked.getLearnPattern.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce(pattern);
    renderAt("/learn/patterns/sliding-window-fixed", null);
    fireEvent.click(await screen.findByRole("button", { name: /retry/i }));
    expect(await screen.findByRole("heading", { level: 1, name: "Sliding window, fixed size" })).toBeInTheDocument();
  });
});

describe("learn: DBMS", () => {
  it("lists topics with the student's quiz state", async () => {
    mocked.getDbmsTopics.mockResolvedValue({
      groups: ["SQL"],
      topics: [{ id: "joins", name: "Joins", group: "SQL", summary: "Combine rows.", minutes: 8, has_example: true, quiz_questions: 4 }],
    });
    mocked.getLearnProgress.mockResolvedValue(
      progress({ dbms_passed: 1, progress: { patterns: {}, dbms: { joins: { best_score: 4, total: 4, attempts: 1, passed_at: "t", last_attempt_at: "t" } }, updated_at: "t" } })
    );
    renderAt("/learn/dbms");
    expect(await screen.findByRole("link", { name: "Joins" })).toHaveAttribute("href", "/learn/dbms/joins");
    expect(await screen.findByText("Quiz passed")).toBeInTheDocument();
  });

  it("renders the notes and the checked SQL example, with NULL shown for missing values", async () => {
    mocked.getDbmsTopic.mockResolvedValue(topic);
    renderAt("/learn/dbms/joins", null);
    expect(await screen.findByRole("heading", { level: 1, name: "Joins" })).toBeInTheDocument();
    expect(screen.getByText("Keeps only matching rows.")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "name" })).toBeInTheDocument();
    expect(screen.getByText("NULL")).toBeInTheDocument();
    expect(screen.getByText(/Sign in/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Check my answers" })).not.toBeInTheDocument();
  });

  it("grades the quiz on the server and shows the right answers only afterwards", async () => {
    mocked.getDbmsTopic.mockResolvedValue(topic);
    mocked.submitDbmsQuiz.mockResolvedValue({
      topic_id: "joins",
      score: 1,
      total: 2,
      pass_mark: 2,
      passed: false,
      results: [
        { question_id: "q1", chosen: 1, answer: 1, correct: true, why: "LEFT keeps every left row." },
        { question_id: "q2", chosen: 0, answer: 1, correct: false, why: "ON matches rows." },
      ],
      progress: { best_score: 1, total: 2, attempts: 1, passed_at: null, last_attempt_at: "t" },
    });
    renderAt("/learn/dbms/joins");
    const submit = await screen.findByRole("button", { name: "Check my answers" });
    expect(submit).toBeDisabled();
    expect(screen.queryByText("(correct answer)")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "LEFT" }));
    fireEvent.click(screen.getByRole("radio", { name: "Filters groups" }));
    fireEvent.click(submit);
    await waitFor(() => expect(mocked.submitDbmsQuiz).toHaveBeenCalledWith("joins", { answers: [1, 0] }));
    expect(await screen.findByText(/1 of 2 correct/)).toBeInTheDocument();
    expect(screen.getByText("Not passed yet")).toBeInTheDocument();
    expect(screen.getByText("ON matches rows.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retake" }));
    expect(await screen.findByRole("button", { name: "Check my answers" })).toBeDisabled();
  });
});

describe("learn: removed GraphQL Lab", () => {
  it("no longer has a /graphql-lab route", async () => {
    renderAt("/graphql-lab");
    expect(await screen.findByRole("heading", { name: /Page Not Found/ })).toBeInTheDocument();
  });
});
