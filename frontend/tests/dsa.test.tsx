import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AppRoutes } from "@/App";
import { AuthProvider } from "@/auth/AuthContext";
import type { AuthClient, AuthUser } from "@/auth/types";
import { api } from "@/api/endpoints";
import type { CompaniesResponse, DsaProgress, DsaSource, QuestionSummary, QuestionsResponse } from "@/types/contract";

vi.mock("@/api/endpoints", () => ({
  api: {
    getCompanies: vi.fn(),
    getCompany: vi.fn(),
    getQuestions: vi.fn(),
    getQuestion: vi.fn(),
    getDsaProgress: vi.fn(),
    putDsaProgress: vi.fn(),
    deleteDsaProgress: vi.fn(),
    getRoles: vi.fn(),
    getHealth: vi.fn(),
  },
}));
const mocked = vi.mocked(api);

const sample: DsaSource = {
  name: "UNBLUFF development fixture",
  license_status: "development_fixture",
  license_note: "Synthetic sample data.",
  url: null,
  imported_at: "2026-01-01T00:00:00.000Z",
  source_updated_at: null,
  is_sample_data: true,
};

const q = (n: number, over: Partial<QuestionSummary> = {}): QuestionSummary => ({
  id: `q_${n}`,
  title: `Sample Problem ${n}`,
  url: `https://example.com/p/${n}`,
  difficulty: "medium",
  topics: ["Arrays", "Hash Table"],
  company_ids: ["acme"],
  ...over,
});

const questionsPage = (questions: QuestionSummary[], over: Partial<QuestionsResponse> = {}): QuestionsResponse => ({
  questions,
  page: 1,
  page_size: 20,
  total: questions.length,
  total_pages: 1,
  facets: { topics: ["Arrays", "Hash Table"], difficulties: ["easy", "medium", "hard"] },
  source: sample,
  ...over,
});

function fakeAuth(user: AuthUser | null): AuthClient {
  const emit = vi.fn();
  void emit;
  return {
    configured: true,
    onChange(cb) {
      queueMicrotask(() => cb(user));
      return () => undefined;
    },
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(async () => undefined),
    sendPasswordReset: vi.fn(),
    getIdToken: vi.fn(async () => (user ? "t" : null)),
  };
}

const signedIn: AuthUser = { uid: "u1", email: "a@b.co" };

function renderAt(path: string, user: AuthUser | null = null) {
  return render(
    <AuthProvider client={fakeAuth(user)}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </AuthProvider>,
  );
}

const rec = (over: Partial<DsaProgress> = {}): DsaProgress => ({
  question_id: "q_1",
  status: "attempted",
  bookmarked: false,
  notes: "",
  created_at: "2026-02-01T00:00:00.000Z",
  updated_at: "2026-02-01T00:00:00.000Z",
  ...over,
});

beforeEach(() => {
  vi.resetAllMocks();
  mocked.getDsaProgress.mockResolvedValue({ progress: [] });
});

describe("DSA Arena landing", () => {
  const companies: CompaniesResponse = {
    companies: [
      { id: "acme", name: "Acme", question_count: 12, catalogue_available: true },
      { id: "empty-co", name: "Empty Co", question_count: 0, catalogue_available: false },
    ],
    page: 1,
    page_size: 24,
    total: 2,
    total_pages: 1,
    source: sample,
  };

  it("lists companies with counts from real data, flags unavailable catalogues and labels sample data", async () => {
    mocked.getCompanies.mockResolvedValue(companies);
    renderAt("/dsa");
    expect(await screen.findByRole("heading", { name: "DSA Arena" })).toBeInTheDocument();
    expect(await screen.findByText(/12 questions in the catalogue/)).toBeInTheDocument();
    expect(screen.getByText(/No catalogue available for this company/)).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent(/not real company interview data/i);
    expect(screen.getByRole("link", { name: /Acme/ })).toHaveAttribute("href", "/dsa/companies/acme");
    expect(screen.queryByRole("link", { name: "My progress" })).not.toBeInTheDocument(); // signed out
  });

  it("searches companies on the server", async () => {
    mocked.getCompanies.mockResolvedValue(companies);
    renderAt("/dsa");
    await screen.findByText("Acme");
    fireEvent.change(screen.getByLabelText("Search companies"), { target: { value: "acm" } });
    await waitFor(() => expect(mocked.getCompanies).toHaveBeenLastCalledWith(expect.objectContaining({ search: "acm", page: 1 })));
  });

  it("shows an honest empty state when no catalogue is loaded, and an error with retry", async () => {
    mocked.getCompanies.mockResolvedValueOnce({ companies: [], page: 1, page_size: 24, total: 0, total_pages: 1, source: null });
    renderAt("/dsa");
    expect(await screen.findByText(/Nothing to browse until a catalogue is loaded/)).toBeInTheDocument();
    expect(screen.getAllByRole("note")[0]).toHaveTextContent(/No question catalogue is loaded/);
  });

  it("shows a retryable error", async () => {
    mocked.getCompanies.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce(companies);
    renderAt("/dsa");
    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Acme")).toBeInTheDocument();
  });
});

describe("Question explorer", () => {
  it("reads filters from the URL, queries the server with them and shows results", async () => {
    mocked.getQuestions.mockResolvedValue(questionsPage([q(1), q(2, { difficulty: "hard" })]));
    renderAt("/dsa/questions?difficulty=medium&topic=Arrays&q=sample&page=1&sort=difficulty&order=desc");
    expect(await screen.findByRole("link", { name: "Sample Problem 1" })).toBeInTheDocument();
    expect(mocked.getQuestions).toHaveBeenCalledWith(
      expect.objectContaining({ search: "sample", difficulty: "medium", topic: "Arrays", sort: "difficulty", order: "desc", page: 1, page_size: 20 }),
    );
    expect(screen.getByLabelText("Difficulty")).toHaveValue("medium");
    expect(screen.getByLabelText("Topic")).toHaveValue("Arrays");
    expect(screen.getByRole("button", { name: "Clear filters" })).toBeInTheDocument();
  });

  it("changing a filter requests the server again and resets to page 1", async () => {
    mocked.getQuestions.mockResolvedValue(questionsPage([q(1)], { page: 2, total_pages: 3, total: 41 }));
    renderAt("/dsa/questions?page=2");
    await screen.findByText("Page 2 of 3");
    fireEvent.change(screen.getByLabelText("Difficulty"), { target: { value: "hard" } });
    await waitFor(() => expect(mocked.getQuestions).toHaveBeenLastCalledWith(expect.objectContaining({ difficulty: "hard", page: 1 })));
  });

  it("paginates through the server", async () => {
    mocked.getQuestions.mockResolvedValue(questionsPage([q(1)], { total_pages: 3, total: 41 }));
    renderAt("/dsa/questions");
    await screen.findByText("Page 1 of 3");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(mocked.getQuestions).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 })));
    expect(screen.getByRole("button", { name: "Previous" })).toBeInTheDocument();
  });

  it("scopes to a company route and shows its header and an unavailable catalogue honestly", async () => {
    mocked.getCompany.mockResolvedValue({
      company: { id: "empty-co", name: "Empty Co", question_count: 0, catalogue_available: false },
      topics: [],
      difficulties: { easy: 0, medium: 0, hard: 0 },
      source: sample,
    });
    mocked.getQuestions.mockResolvedValue(questionsPage([], { facets: { topics: [], difficulties: [] } }));
    renderAt("/dsa/companies/empty-co");
    expect(await screen.findByRole("heading", { name: "Empty Co" })).toBeInTheDocument();
    expect(await screen.findByText(/No catalogue is available for this company/)).toBeInTheDocument();
    expect(await screen.findByText(/No questions are available for this company/)).toBeInTheDocument();
    expect(mocked.getQuestions).toHaveBeenCalledWith(expect.objectContaining({ company: "empty-co" }));
  });

  it("shows the no-match empty state when filters exclude everything", async () => {
    mocked.getQuestions.mockResolvedValue(questionsPage([]));
    renderAt("/dsa/questions?topic=Graphs");
    expect(await screen.findByText(/No questions match these filters/)).toBeInTheDocument();
  });

  it("shows the signed-in student's status and bookmark on rows, and invites signed-out visitors to sign in", async () => {
    mocked.getQuestions.mockResolvedValue(questionsPage([q(1), q(2)]));
    mocked.getDsaProgress.mockResolvedValue({ progress: [rec({ question_id: "q_1", status: "solved", bookmarked: true })] });
    const { unmount } = renderAt("/dsa/questions", signedIn);
    const row = (await screen.findByRole("link", { name: "Sample Problem 1" })).closest("li")!;
    expect(await within(row).findByText("Solved")).toBeInTheDocument();
    expect(within(row).getByText("Bookmarked")).toBeInTheDocument();
    unmount();

    renderAt("/dsa/questions", null);
    await screen.findByRole("link", { name: "Sample Problem 1" });
    expect(await screen.findByText(/to track progress, bookmarks and notes/)).toBeInTheDocument();
    expect(mocked.getDsaProgress).toHaveBeenCalledTimes(1); // never requested while signed out
  });
});

describe("Question detail and personal progress", () => {
  const detail = { question: q(1), companies: [{ id: "acme", name: "Acme" }], source: sample };

  it("links to the original problem, offers no code execution, and asks signed-out visitors to sign in", async () => {
    mocked.getQuestion.mockResolvedValue(detail);
    renderAt("/dsa/questions/q_1", null);
    expect(await screen.findByRole("heading", { name: "Sample Problem 1" })).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /Open original problem/ });
    expect(link).toHaveAttribute("href", "https://example.com/p/1");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
    expect(screen.queryByRole("button", { name: /^(run|submit)/i })).not.toBeInTheDocument();
    expect(await screen.findByText(/to save your status, bookmark and notes/)).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: "Status" })).not.toBeInTheDocument();
    expect(mocked.getDsaProgress).not.toHaveBeenCalled();
  });

  it("saves status, bookmark and notes through the server and shows what the server returns", async () => {
    mocked.getQuestion.mockResolvedValue(detail);
    mocked.getDsaProgress.mockResolvedValue({ progress: [rec({ notes: "stored note" })] });
    mocked.putDsaProgress.mockImplementation(async (id, patch) => rec({ question_id: id, ...patch, notes: patch.notes ?? "stored note" }));
    renderAt("/dsa/questions/q_1", signedIn);

    const notes = await screen.findByLabelText(/Notes/);
    await waitFor(() => expect(notes).toHaveValue("stored note"));
    expect(screen.getByRole("radio", { name: "Attempted" })).toHaveAttribute("aria-checked", "true");

    fireEvent.click(screen.getByRole("radio", { name: "Solved" }));
    await waitFor(() => expect(mocked.putDsaProgress).toHaveBeenCalledWith("q_1", { status: "solved" }));
    await waitFor(() => expect(screen.getByRole("radio", { name: "Solved" })).toHaveAttribute("aria-checked", "true"));

    fireEvent.click(screen.getByRole("button", { name: "Bookmark" }));
    await waitFor(() => expect(mocked.putDsaProgress).toHaveBeenCalledWith("q_1", { bookmarked: true }));
    expect(await screen.findByRole("button", { name: "Bookmarked" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.change(notes, { target: { value: "new insight" } });
    fireEvent.click(screen.getByRole("button", { name: "Save notes" }));
    await waitFor(() => expect(mocked.putDsaProgress).toHaveBeenCalledWith("q_1", { notes: "new insight" }));
    expect(await screen.findByText("Notes saved")).toBeInTheDocument();
    expect(notes).toHaveValue("new insight");
  });

  it("surfaces a failed save without losing the typed note", async () => {
    mocked.getQuestion.mockResolvedValue(detail);
    mocked.putDsaProgress.mockRejectedValue(new Error("offline"));
    renderAt("/dsa/questions/q_1", signedIn);
    const notes = await screen.findByLabelText(/Notes/);
    fireEvent.change(notes, { target: { value: "draft" } });
    fireEvent.click(screen.getByRole("button", { name: "Save notes" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(notes).toHaveValue("draft");
  });

  it("shows a clear message for a question that no longer exists", async () => {
    const { ApiError } = await import("@/api/types");
    mocked.getQuestion.mockRejectedValue(new ApiError("nope", "QUESTION_NOT_FOUND", 404));
    renderAt("/dsa/questions/q_gone", signedIn);
    expect(await screen.findByText(/couldn't find that question/i)).toBeInTheDocument();
  });
});

describe("Access control in the UI", () => {
  it("sends signed-out visitors from /dsa/progress to sign in, but keeps the catalogue public", async () => {
    mocked.getCompanies.mockResolvedValue({ companies: [], page: 1, page_size: 24, total: 0, total_pages: 1, source: sample });
    const { unmount } = renderAt("/dsa/progress", null);
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    unmount();
    renderAt("/dsa", null);
    expect(await screen.findByRole("heading", { name: "DSA Arena" })).toBeInTheDocument();
  });

  it("My progress lists records, joins titles and flags questions removed from the catalogue", async () => {
    const { ApiError } = await import("@/api/types");
    mocked.getDsaProgress.mockResolvedValue({
      progress: [rec({ question_id: "q_1", status: "solved", notes: "my note" }), rec({ question_id: "q_removed", status: "needs_revision" })],
    });
    mocked.getQuestion.mockImplementation(async (id) => {
      if (id === "q_removed") throw new ApiError("gone", "QUESTION_NOT_FOUND", 404);
      return { question: q(1), companies: [], source: sample };
    });
    renderAt("/dsa/progress", signedIn);
    expect(await screen.findByRole("link", { name: "Sample Problem 1" })).toBeInTheDocument();
    expect(screen.getByText("my note")).toBeInTheDocument();
    expect(await screen.findByText(/no longer in the catalogue/)).toBeInTheDocument();
  });
});

describe("Catalogue size and provenance are reported honestly", () => {
  const practicePack: DsaSource = {
    name: "UNBLUFF first-party practice pack",
    license_status: "own_work",
    license_note: "Written by the UNBLUFF project.",
    url: null,
    imported_at: "2026-01-01T00:00:00.000Z",
    source_updated_at: null,
    is_sample_data: false,
  };

  it("a catalogue with questions but no companies says how many questions it holds and why there are no company lists", async () => {
    mocked.getCompanies.mockResolvedValue({ companies: [], page: 1, page_size: 24, total: 0, total_pages: 1, source: practicePack });
    mocked.getQuestions.mockResolvedValue(questionsPage([q(1)], { total: 10, source: practicePack }));
    renderAt("/dsa");
    expect(await screen.findByText(/It holds 10 questions, none linked to a company/)).toBeInTheDocument();
    expect(screen.getByText(/only after an approved dataset with company links is imported/)).toBeInTheDocument();
    expect(screen.queryByText(/not real company interview data/i)).not.toBeInTheDocument(); // not mislabelled as sample data
    expect(screen.getByRole("note")).toHaveTextContent(/first-party practice pack/i);
  });

  it("the question explorer shows the true server total and walks pages of twenty", async () => {
    mocked.getQuestions.mockResolvedValue(questionsPage([q(1), q(2)], { total: 250, total_pages: 13, page_size: 20 }));
    renderAt("/dsa/questions");
    expect(await screen.findByText("Page 1 of 13")).toBeInTheDocument();
    expect(screen.getByText("250")).toBeInTheDocument();
    expect(mocked.getQuestions).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, page_size: 20 }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(mocked.getQuestions).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2, page_size: 20 })));
  });
});
