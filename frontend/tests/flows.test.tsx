import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { Report, Role } from "@/types/contract";
import { SessionProvider } from "@/state/SessionContext";
import { useSessionState } from "@/state/useSession";
import { LedgerPage } from "@/pages/LedgerPage";
import WorkspacePage, { RETEST_BANNER } from "@/pages/WorkspacePage";
import { ReportView } from "@/components/report/ReportView";
import demoReport from "@/mocks/report.json";
import { api } from "@/api/endpoints";
import { makeClaim, makeGrade, makeProgress, makeTurn } from "./fixtures";

vi.mock("@/api/endpoints", () => ({
  api: {
    getRole: vi.fn(),
    confirmClaims: vi.fn(),
    interrogate: vi.fn(),
    getFixTask: vi.fn(),
    getReport: vi.fn(),
  },
}));

const role: Role = {
  id: "frontend_developer",
  name: "Frontend Developer",
  description: "d",
  skills: [
    { id: "react_state", name: "React State & Rendering", weight: 0.6, description: "", keywords: [], levels: { L1: [], L2: [], L3: [] }, prerequisites: [] },
    { id: "git", name: "Git", weight: 0.4, description: "", keywords: [], levels: { L1: [], L2: [], L3: [] }, prerequisites: [] },
  ],
};

const claims = [
  makeClaim({ id: "CL-001", text: "Built a React dashboard" }),
  makeClaim({ id: "CL-002", text: "Used Git in a team", skill_id: "git", resume_line: "Used Git in a team" }),
];

/** Seeds the session context the way Setup does after extract. */
const Seed: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { state, dispatch } = useSessionState();
  if (!state.sessionId) {
    dispatch({
      type: "SET_SESSION",
      payload: { sessionId: "s_test", roleId: "frontend_developer", mode: "prepare", claims, blindSpots: [], progress: makeProgress({ claims_total: 2 }) },
    });
    return null;
  }
  return <>{children}</>;
};

function renderAt(path: string) {
  return render(
    <SessionProvider>
      <Seed>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/ledger" element={<LedgerPage />} />
            <Route path="/workspace/:sessionId" element={<WorkspacePage />} />
          </Routes>
        </MemoryRouter>
      </Seed>
    </SessionProvider>,
  );
}

beforeEach(() => {
  vi.mocked(api.getRole).mockResolvedValue(role);
  vi.mocked(api.confirmClaims).mockReset();
  vi.mocked(api.interrogate).mockReset();
  vi.mocked(api.getFixTask).mockReset();
});

describe("Claim ledger", () => {
  it("2. deleting a row removes it from the confirm payload", async () => {
    vi.mocked(api.confirmClaims).mockResolvedValue({ session_id: "s_test", role_id: "frontend_developer", mode: "prepare", claims: [claims[1]!], blind_spots: [], progress: makeProgress() });
    renderAt("/ledger");
    fireEvent.click(await screen.findByRole("button", { name: /Delete claim 1: Built a React dashboard/ }));
    fireEvent.click(screen.getByRole("button", { name: "Start interrogation" }));
    await waitFor(() => expect(api.confirmClaims).toHaveBeenCalledTimes(1));
    expect(api.confirmClaims).toHaveBeenCalledWith({
      session_id: "s_test",
      claims: [{ id: "CL-002", text: "Used Git in a team", resume_line: "Used Git in a team", skill_id: "git" }],
    });
  });
});

describe("Workspace", () => {
  it("3a. turn 'clarify' shows the follow-up tag", async () => {
    vi.mocked(api.interrogate)
      .mockResolvedValueOnce(makeTurn())
      .mockResolvedValueOnce(makeTurn({ turn: "clarify", question: "Which hook exactly?", grade: makeGrade(false, { needs_clarification: true }) }));
    renderAt("/workspace/s_test");
    fireEvent.change(await screen.findByLabelText("Your answer"), { target: { value: "I used hooks for it" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit answer" }));
    expect(await screen.findByText("Follow-up — be more specific")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Which hook exactly?" })).toHaveFocus();
    expect(api.interrogate).toHaveBeenLastCalledWith({ session_id: "s_test", claim_id: "CL-001", answer: "I used hooks for it" });
  });

  it("3b. turn 'done' with teach_now shows the verdict badge and the fix card", async () => {
    const gap = makeClaim({ verdict: "honest_gap", root_cause: "JS closures & references" });
    vi.mocked(api.interrogate)
      .mockResolvedValueOnce(makeTurn())
      .mockResolvedValueOnce(makeTurn({ turn: "done", level: null, question: null, teach_now: true, claim: gap, grade: makeGrade(false, { admits_gap: true }), progress: makeProgress({ claims_done: 1, next_claim_id: "CL-002" }) }));
    vi.mocked(api.getFixTask).mockResolvedValue({ claim_id: "CL-001", skill_id: "react_state", root_cause: "JS closures & references", missing_concepts: ["x"], explanation: "Closures capture **references**.", exercise: "Write a counter." });
    renderAt("/workspace/s_test");
    fireEvent.click(await screen.findByRole("button", { name: "I don't know" }));
    expect(api.interrogate).toHaveBeenLastCalledWith({ session_id: "s_test", claim_id: "CL-001", answer: "I don't know" });
    const fix = await screen.findByRole("region", { name: "Fix task" });
    expect(within(fix).getByText(/Root cause:/)).toBeInTheDocument();
    expect(screen.getAllByText("Honest gap").length).toBeGreaterThan(0);
    fireEvent.click(within(fix).getByRole("button", { name: "Got it, continue →" }));
    expect(screen.getByRole("button", { name: "Next claim →" })).toBeInTheDocument();
  });

  it("4. next_mode 'retest' shows the welcome-back banner and starts the retest", async () => {
    vi.mocked(api.interrogate)
      .mockResolvedValueOnce(makeTurn({ claim: makeClaim({ id: "CL-002" }) }))
      .mockResolvedValueOnce(
        makeTurn({ turn: "done", level: null, question: null, claim: makeClaim({ id: "CL-002", verdict: "defended", levels_passed: 3 }), progress: makeProgress({ claims_done: 2, next_claim_id: "CL-001", next_mode: "retest" }) }),
      )
      .mockResolvedValueOnce(makeTurn({ mode: "retest", question: "Scenario: it breaks in production. Why?" }));
    renderAt("/workspace/s_test");
    fireEvent.change(await screen.findByLabelText("Your answer"), { target: { value: "A long and specific answer about the component." } });
    fireEvent.click(screen.getByRole("button", { name: "Submit answer" }));
    expect(await screen.findByText(RETEST_BANNER)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Start retest →" }));
    await waitFor(() => expect(api.interrogate).toHaveBeenLastCalledWith({ session_id: "s_test", claim_id: "CL-001", mode: "retest" }));
    expect(await screen.findByRole("heading", { name: "Scenario: it breaks in production. Why?" })).toBeInTheDocument();
  });

  it("shows backend 400 messages (e.g. retest locked) in an alert", async () => {
    const { ApiError } = await import("@/api/types");
    vi.mocked(api.interrogate)
      .mockResolvedValueOnce(makeTurn())
      .mockRejectedValueOnce(new ApiError("Retest unlocks after 2 more concepts", "BAD_REQUEST", 400));
    renderAt("/workspace/s_test");
    fireEvent.click(await screen.findByRole("button", { name: "I don't know" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Retest unlocks after 2 more concepts");
  });
});

describe("Report", () => {
  const report = demoReport as unknown as Report;

  it("5. renders verdict LABELS (not just colors) from the demo report", () => {
    render(
      <MemoryRouter>
        <ReportView report={report} isDemo onChanged={() => undefined} />
      </MemoryRouter>,
    );
    for (const label of ["Shaky", "Defended", "Bluff", "Honest gap"]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    expect(screen.getByText("Demo data")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: `Readiness ${report.readiness} out of 100` })).toBeInTheDocument();
    expect(screen.getByText(/Verified after 2 other concepts/)).toBeInTheDocument();
  });

  it("6. evidence drawer opens on Enter, closes on Esc, and returns focus to the line", async () => {
    render(
      <MemoryRouter>
        <ReportView report={report} isDemo onChanged={() => undefined} />
      </MemoryRouter>,
    );
    const line = screen.getByRole("button", { name: /^Resume line: Built a React e-commerce dashboard.*Verdict: Shaky\. Open evidence\.$/ });
    line.focus();
    fireEvent.keyDown(line, { key: "Enter" });
    fireEvent.click(line); // a native <button> activates on Enter via click
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(within(dialog).getByText(/Root cause:/)).toBeInTheDocument();
    expect(dialog.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(line).toHaveFocus();
  });
});

describe("Server wake-up gate", () => {
  it("shows the waking status after 3s, then disappears when /api/health answers", async () => {
    vi.useFakeTimers();
    let resolveHealth: (v: Response) => void = () => undefined;
    const original = global.fetch;
    global.fetch = vi.fn(() => new Promise<Response>((r) => (resolveHealth = r))) as unknown as typeof fetch;
    const { ServerWakeGate } = await import("@/components/common/ServerWakeGate");
    const { act } = await import("@testing-library/react");
    render(<ServerWakeGate />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(3100);
    });
    expect(screen.getByRole("status")).toHaveTextContent("Waking up the server… (~30–60s)");
    await act(async () => {
      resolveHealth(new Response(JSON.stringify({ status: "ok", llm_mode: "mock", model: null }), { headers: { "content-type": "application/json" } }));
    });
    vi.useRealTimers();
    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
    global.fetch = original;
  });

  it("shows an alert with Retry when the server can't be reached", async () => {
    const original = global.fetch;
    global.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch")) as unknown as typeof fetch;
    const { ServerWakeGate } = await import("@/components/common/ServerWakeGate");
    render(<ServerWakeGate />);
    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't reach the server.");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    global.fetch = original;
  });
});
