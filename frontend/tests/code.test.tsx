import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AppRoutes } from "@/App";
import { AuthProvider } from "@/auth/AuthContext";
import type { AuthClient, AuthUser } from "@/auth/types";
import { api } from "@/api/endpoints";
import { clearDrafts, loadDraft, saveDraft } from "@/lib/drafts";
import type { CodeExerciseResponse, CodeLanguage, CodeSubmission, QuestionDetailResponse } from "@/types/contract";

// Monaco cannot run in jsdom (no layout, workers or canvas). The real editor is checked in a browser instead.
vi.mock("@/components/code/CodeEditor", () => ({
  default: ({ value, onChange, ariaLabel }: { value: string; onChange: (v: string) => void; ariaLabel: string }) => (
    <textarea aria-label={ariaLabel} value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

vi.mock("@/api/endpoints", () => ({
  api: {
    getQuestion: vi.fn(),
    getCodeExercise: vi.fn(),
    getCodeLanguages: vi.fn(),
    runCode: vi.fn(),
    submitCode: vi.fn(),
    getCodeSubmissions: vi.fn(),
    getCodeSubmission: vi.fn(),
    deleteCodeSubmission: vi.fn(),
    getDsaProgress: vi.fn(),
    getRoles: vi.fn(),
    getHealth: vi.fn(),
  },
}));
const mocked = vi.mocked(api);

const languages: CodeLanguage[] = [
  { id: "python", name: "Python (3.12.5)", starter_code: "# python starter\n" },
  { id: "cpp", name: "C++ (GCC 14.1.0)", starter_code: "// cpp starter\n" },
];

const detail: QuestionDetailResponse = {
  question: { id: "q_fixture_06", title: "Sample Problem 06: Pair Sum", url: "https://example.com/p/6", difficulty: "easy", topics: ["Arrays"], company_ids: [] },
  companies: [],
  source: null,
};

const exercise = (over: Partial<CodeExerciseResponse> = {}): CodeExerciseResponse => ({
  question_id: "q_fixture_06",
  statement: "Demonstration statement.",
  is_demonstration: true,
  samples: [{ input: "4 9\n2 7 11 15\n", expected_output: "YES\n" }],
  starter_code: {},
  gradable: true,
  hidden_test_count: 8,
  test_revision: "demo-1",
  limits: { cpu_time_seconds: 2, memory_mb: 128 },
  ...over,
});

const sub = (over: Partial<CodeSubmission> = {}): CodeSubmission => ({
  id: "sub_1",
  question_id: "q_fixture_06",
  language: "python",
  verdict: "wrong_answer",
  passed: 3,
  total: 8,
  failed_test: 4,
  compile_output: null,
  time_ms: 12,
  memory_kb: 3000,
  test_revision: "demo-1",
  progress_updated: false,
  analytics_status: "counted",
  created_at: "2026-03-01T00:00:00.000Z",
  ...over,
});

const user: AuthUser = { uid: "u1", email: "a@b.co" };
function fakeAuth(u: AuthUser | null): AuthClient {
  return {
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
  };
}

const renderWorkspace = (u: AuthUser | null) =>
  render(
    <AuthProvider client={fakeAuth(u)}>
      <MemoryRouter initialEntries={["/dsa/questions/q_fixture_06/code"]}>
        <AppRoutes />
      </MemoryRouter>
    </AuthProvider>,
  );

/**
 * The editor element exists a moment before the page loads the starter code or saved draft into it, so wait for that
 * too: acting on an empty editor (Run is disabled, assertions see "") made these tests depend on machine speed.
 */
const editor = async () => {
  const el = await screen.findByLabelText(/Code editor, Python/);
  await waitFor(() => expect(el).not.toHaveValue(""));
  return el;
};

beforeEach(() => {
  vi.resetAllMocks();
  window.localStorage.clear();
  mocked.getQuestion.mockResolvedValue(detail);
  mocked.getCodeExercise.mockResolvedValue(exercise());
  mocked.getCodeLanguages.mockResolvedValue({ languages, execution_available: true });
  mocked.getCodeSubmissions.mockResolvedValue({ submissions: [] });
});

describe("workspace layout and content", () => {
  it("shows problem metadata, the original link, the demonstration label, samples, language selector and starter code", async () => {
    renderWorkspace(user);
    expect(await screen.findByRole("heading", { name: "Sample Problem 06: Pair Sum" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Original problem/ })).toHaveAttribute("href", "https://example.com/p/6");
    expect(screen.getByRole("note")).toHaveTextContent(/not a real company interview question/i);
    expect(screen.getByText("Demonstration statement.")).toBeInTheDocument();
    expect(screen.getByText(/judged on 8 hidden tests/)).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Python (3.12.5)" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "C++ (GCC 14.1.0)" })).toBeInTheDocument();
    expect(await editor()).toHaveValue("# python starter\n");
    fireEvent.change(screen.getByLabelText("Language"), { target: { value: "cpp" } });
    expect(await screen.findByLabelText(/Code editor, C\+\+/)).toHaveValue("// cpp starter\n");
  });

  it("uses a question's own starter code when it has one", async () => {
    mocked.getCodeExercise.mockResolvedValue(exercise({ starter_code: { python: "# custom starter\n" } }));
    renderWorkspace(user);
    expect(await editor()).toHaveValue("# custom starter\n");
  });

  it("offers a plain text editor", async () => {
    renderWorkspace(user);
    await editor();
    fireEvent.click(screen.getByLabelText("Plain text editor"));
    expect(await screen.findByLabelText(/Code editor, Python/)).toBeInTheDocument();
  });

  it("is honest when no execution service exists: no languages, Run and Submit disabled", async () => {
    mocked.getCodeLanguages.mockResolvedValue({ languages: [], execution_available: false });
    renderWorkspace(user);
    expect(await screen.findByRole("alert")).toHaveTextContent(/Code execution isn't available right now/);
    expect(screen.getByRole("button", { name: "Run" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Submit" })).toBeDisabled();
    expect(screen.getByText("Choose a language to start.")).toBeInTheDocument();
  });

  it("explains that judging is unavailable when the question has no suite and keeps Submit disabled", async () => {
    mocked.getCodeExercise.mockResolvedValue(exercise({ gradable: false, samples: [], hidden_test_count: 0, test_revision: null, statement: null, is_demonstration: false }));
    renderWorkspace(user);
    await editor();
    expect(screen.getByText(/Full judging is not available for this question/)).toBeInTheDocument();
    expect(screen.getByText(/No visible samples for this question/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Submit" })).toBeDisabled();
    expect(screen.getByText(/No problem statement is stored here/)).toBeInTheDocument();
  });

  it("shows a retryable error when the exercise cannot load", async () => {
    mocked.getCodeExercise.mockRejectedValueOnce(new Error("x")).mockResolvedValueOnce(exercise());
    renderWorkspace(user);
    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
    expect(await editor()).toBeInTheDocument();
  });
});

describe("signed-out visitors", () => {
  it("can read the exercise but cannot run, submit or see history, and are asked to sign in", async () => {
    renderWorkspace(null);
    await editor();
    expect(screen.getByRole("button", { name: "Run" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Submit" })).toBeDisabled();
    expect(screen.getByRole("link", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByText("Sign in to see your submission history.")).toBeInTheDocument();
    expect(mocked.getCodeSubmissions).not.toHaveBeenCalled();
    expect(mocked.runCode).not.toHaveBeenCalled();
  });
});

describe("Run", () => {
  it("runs custom input and shows the real output and metrics, without any progress language", async () => {
    mocked.runCode.mockResolvedValue({ status: "completed", stdout: "YES\n", stderr: "", compile_output: "", time_ms: 14, memory_kb: 4096, sample_passed: null });
    renderWorkspace(user);
    await editor();
    fireEvent.change(screen.getByLabelText(/Custom input/), { target: { value: "4 9\n2 7 11 15\n" } });
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    const out = await screen.findByRole("region", { name: "Run output" });
    expect(within(out).getByText("Finished")).toBeInTheDocument();
    expect(within(out).getByText("YES")).toBeInTheDocument();
    expect(within(out).getByText(/14 ms · 4.0 MB/)).toBeInTheDocument();
    expect(mocked.runCode).toHaveBeenCalledWith({ language: "python", source: "# python starter\n", stdin: "4 9\n2 7 11 15\n" });
    expect(mocked.submitCode).not.toHaveBeenCalled();
    expect(within(out).getByText(/never changes your progress/)).toBeInTheDocument();
  });

  it("runs a visible sample and reports whether it matched", async () => {
    mocked.runCode.mockResolvedValue({ status: "completed", stdout: "NO\n", stderr: "", compile_output: "", time_ms: 9, memory_kb: 3000, sample_passed: false });
    renderWorkspace(user);
    await editor();
    fireEvent.click(screen.getByRole("button", { name: "Run sample 1" }));
    expect(await screen.findByText("Output does not match the sample.")).toBeInTheDocument();
    expect(mocked.runCode).toHaveBeenCalledWith({ language: "python", source: "# python starter\n", question_id: "q_fixture_06", sample_index: 0 });
  });

  it("copies a sample into the custom input box", async () => {
    renderWorkspace(user);
    await editor();
    fireEvent.click(screen.getByRole("button", { name: "Use as custom input" }));
    expect(screen.getByLabelText(/Custom input/)).toHaveValue("4 9\n2 7 11 15\n");
  });

  it.each([
    ["compile_error", "Compilation error", { compile_output: "error: expected ';'" }, "error: expected ';'"],
    ["runtime_error", "Runtime error", { stderr: "ZeroDivisionError" }, "ZeroDivisionError"],
    ["time_limit_exceeded", "Time limit exceeded", {}, null],
    ["judge_error", "Judge error", {}, null],
  ] as const)("shows %s diagnostics", async (status, label, extra, text) => {
    mocked.runCode.mockResolvedValue({ status, stdout: "", stderr: "", compile_output: "", time_ms: null, memory_kb: null, sample_passed: null, ...extra });
    renderWorkspace(user);
    await editor();
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    const out = await screen.findByRole("region", { name: "Run output" });
    expect(within(out).getByText(new RegExp(label))).toBeInTheDocument();
    if (text) expect(within(out).getByText(text)).toBeInTheDocument();
  });

  it("shows provider unavailability honestly", async () => {
    const { ApiError } = await import("@/api/types");
    mocked.runCode.mockRejectedValue(new ApiError("down", "EXECUTION_UNAVAILABLE", 503));
    renderWorkspace(user);
    await editor();
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Code execution is not available right now/);
    expect(screen.queryByRole("region", { name: "Run output" })).not.toBeInTheDocument();
  });

  it("disables the buttons while a run is in flight", async () => {
    let finish: (v: never) => void = () => undefined;
    mocked.runCode.mockImplementation(() => new Promise((r) => (finish = r as never)));
    renderWorkspace(user);
    await editor();
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    expect(await screen.findByRole("button", { name: "Running…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Submit" })).toBeDisabled();
    finish({ status: "completed", stdout: "", stderr: "", compile_output: "", time_ms: 1, memory_kb: 1, sample_passed: null } as never);
    await screen.findByRole("region", { name: "Run output" });
  });
});

describe("Submit and history", () => {
  it("shows an accepted verdict, the solved notice and refreshes the history", async () => {
    mocked.submitCode.mockResolvedValue(sub({ verdict: "accepted", passed: 8, total: 8, failed_test: null, progress_updated: true }));
    mocked.getCodeSubmissions
      .mockResolvedValueOnce({ submissions: [] })
      .mockResolvedValueOnce({ submissions: [sub({ verdict: "accepted", passed: 8, failed_test: null })] });
    renderWorkspace(user);
    await editor();
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    const res = await screen.findByRole("region", { name: "Submission result" });
    expect(within(res).getByText("Accepted")).toBeInTheDocument();
    expect(within(res).getByText(/8 of 8 hidden tests passed/)).toBeInTheDocument();
    expect(within(res).getByText(/now marked solved/)).toBeInTheDocument();
    expect(mocked.submitCode).toHaveBeenCalledWith({ question_id: "q_fixture_06", language: "python", source: "# python starter\n" });
    expect(await screen.findByText(/python · 8\/8/)).toBeInTheDocument();
  });

  it("shows a rejected verdict with only the failing test number and a hidden-data note", async () => {
    mocked.submitCode.mockResolvedValue(sub());
    renderWorkspace(user);
    await editor();
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    const res = await screen.findByRole("region", { name: "Submission result" });
    expect(within(res).getByText("Wrong answer")).toBeInTheDocument();
    expect(within(res).getByText(/3 of 8 hidden tests passed \(first failure: test 4\)/)).toBeInTheDocument();
    expect(within(res).getByText(/Hidden test data is never shown/)).toBeInTheDocument();
    expect(within(res).queryByText(/marked solved/)).not.toBeInTheDocument();
  });

  it("lists history, shows a past submission's code, loads it into the editor, and deletes it", async () => {
    mocked.getCodeSubmissions.mockResolvedValue({ submissions: [sub()] });
    mocked.getCodeSubmission.mockResolvedValue({ ...sub(), source: "print('old attempt')" });
    mocked.deleteCodeSubmission.mockResolvedValue(undefined);
    renderWorkspace(user);
    await editor();
    expect(await screen.findByText(/Wrong answer/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "View code" }));
    expect(await screen.findByText("print('old attempt')")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Load into editor" }));
    await waitFor(() => expect(screen.getByLabelText(/Code editor, Python/)).toHaveValue("print('old attempt')"));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(mocked.deleteCodeSubmission).toHaveBeenCalledWith("sub_1"));
    expect(await screen.findByText(/No submissions yet/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Load into editor" })).not.toBeInTheDocument(); // the viewer closed with it
  });

  it("shows grading-unavailable errors from the server", async () => {
    const { ApiError } = await import("@/api/types");
    mocked.submitCode.mockRejectedValue(new ApiError("none", "GRADING_UNAVAILABLE", 409));
    renderWorkspace(user);
    await editor();
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/no test suite yet/);
  });
});

describe("drafts", () => {
  it("saves a draft under the signed-in account and restores it on the next visit", async () => {
    const first = renderWorkspace(user);
    const box = await editor();
    fireEvent.change(box, { target: { value: "print('my draft')" } });
    await waitFor(() => expect(loadDraft("u1", "q_fixture_06", "python")).toBe("print('my draft')"), { timeout: 3000 });
    first.unmount();
    renderWorkspace(user);
    expect(await editor()).toHaveValue("print('my draft')");
  });

  it("never shows another account's draft and never saves drafts for signed-out visitors", async () => {
    saveDraft("someone-else", "q_fixture_06", "python", "print('not yours')");
    const out = renderWorkspace(null);
    const box = await editor();
    expect(box).toHaveValue("# python starter\n");
    fireEvent.change(box, { target: { value: "print('anon')" } });
    await new Promise((r) => setTimeout(r, 800));
    expect(window.localStorage.length).toBe(1); // only the other account's draft, untouched
    out.unmount();
    renderWorkspace({ uid: "u2", email: "x@y.z" });
    expect(await editor()).toHaveValue("# python starter\n");
  });

  it("clearDrafts removes only the given account's drafts", () => {
    saveDraft("u1", "q1", "python", "a");
    saveDraft("u1", "q2", "cpp", "b");
    saveDraft("u2", "q1", "python", "c");
    clearDrafts("u1");
    expect(loadDraft("u1", "q1", "python")).toBeNull();
    expect(loadDraft("u1", "q2", "cpp")).toBeNull();
    expect(loadDraft("u2", "q1", "python")).toBe("c");
  });

  it("clears the account's drafts on sign-out", async () => {
    saveDraft("u1", "q_fixture_06", "python", "print('bye')");
    mocked.getCodeSubmissions.mockResolvedValue({ submissions: [] });
    const { App } = await import("@/App");
    render(<App authClient={fakeAuth(user)} />);
    fireEvent.click(await screen.findByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(loadDraft("u1", "q_fixture_06", "python")).toBeNull());
  });
});
