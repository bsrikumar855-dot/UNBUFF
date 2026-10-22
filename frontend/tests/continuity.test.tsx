import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { Role, SessionDetailResponse, SessionSummary } from "@/types/contract";
import { api } from "@/api/endpoints";
import { AuthProvider } from "@/auth/AuthContext";
import type { AuthClient } from "@/auth/types";
import { loadDraft } from "@/lib/drafts";
import { LedgerPage } from "@/pages/LedgerPage";
import SessionsPage from "@/pages/SessionsPage";
import WorkspacePage from "@/pages/WorkspacePage";
import { SessionProvider } from "@/state/SessionContext";
import { useSessionState } from "@/state/useSession";
import { makeClaim, makeProgress, makeTurn } from "./fixtures";

vi.mock("@/api/endpoints", () => ({
  api: {
    getRole: vi.fn(),
    getSession: vi.fn(),
    getSessions: vi.fn(),
    deleteSession: vi.fn(),
    confirmClaims: vi.fn(),
    interrogate: vi.fn(),
    getFixTask: vi.fn(),
    getReport: vi.fn(),
  },
}));
const mocked = vi.mocked(api);

const role: Role = {
  id: "frontend_developer",
  name: "Frontend Developer",
  description: "d",
  skills: [{ id: "react_state", name: "React State & Rendering", weight: 1, description: "", keywords: [], levels: { L1: [], L2: [], L3: [] }, prerequisites: [] }],
};

const claims = [
  makeClaim({ id: "CL-001", text: "Built a React dashboard" }),
  makeClaim({ id: "CL-002", text: "Wrote Jest tests" }),
  makeClaim({ id: "CL-003", text: "Deployed an Express API" }),
];

const detail = (over: Partial<SessionDetailResponse> = {}): SessionDetailResponse => ({
  session_id: "s_saved",
  role_id: "frontend_developer",
  mode: "prepare",
  claims,
  blind_spots: [],
  progress: makeProgress({ claims_total: 3, next_claim_id: "CL-001" }),
  created_at: "2026-10-22T10:00:00.000Z",
  stage: "review",
  open_claim_id: null,
  ...over,
});

const fakeAuth = (uid = "u1"): AuthClient => ({
  configured: true,
  onChange(cb) {
    queueMicrotask(() => cb({ uid, email: `${uid}@example.test` }));
    return () => undefined;
  },
  signIn: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(async () => undefined),
  sendPasswordReset: vi.fn(),
  getIdToken: vi.fn(async () => "t"),
});

/** A fresh tab: nothing in memory, only the address. */
function openFresh(path: string) {
  return render(
    <AuthProvider client={fakeAuth()}>
      <SessionProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/ledger" element={<LedgerPage />} />
            <Route path="/ledger/:sessionId" element={<LedgerPage />} />
            <Route path="/workspace/:sessionId" element={<WorkspacePage />} />
            <Route path="/sessions" element={<SessionsPage />} />
          </Routes>
        </MemoryRouter>
      </SessionProvider>
    </AuthProvider>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  window.localStorage.clear();
  mocked.getRole.mockResolvedValue(role);
});

describe("session state", () => {
  it("UPSERT_CLAIM replaces a known claim and appends one it hasn't seen", () => {
    const { result } = renderHook(() => useSessionState(), { wrapper: SessionProvider });
    act(() => result.current.dispatch({ type: "SET_SESSION", payload: { sessionId: "s", roleId: "r", claims: [claims[0]!], progress: makeProgress() } }));
    act(() => result.current.dispatch({ type: "UPSERT_CLAIM", payload: { claim: { ...claims[0]!, verdict: "defended" }, progress: makeProgress({ claims_done: 1 }) } }));
    act(() => result.current.dispatch({ type: "UPSERT_CLAIM", payload: { claim: claims[1]!, progress: makeProgress({ claims_done: 1 }) } }));
    expect(result.current.state.claims.map((c) => [c.id, c.verdict])).toEqual([
      ["CL-001", "defended"],
      ["CL-002", "pending"],
    ]);
    expect(result.current.state.progress?.claims_done).toBe(1);
  });
});

describe("the ledger survives a reload", () => {
  it("loads the session named in the address when memory is empty", async () => {
    mocked.getSession.mockResolvedValue(detail());
    openFresh("/ledger/s_saved");
    expect(await screen.findByDisplayValue("Wrote Jest tests")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Deployed an Express API")).toBeInTheDocument();
    expect(mocked.getSession).toHaveBeenCalledWith("s_saved");
    expect(mocked.getReport).not.toHaveBeenCalled();
  });

  it("explains a session that can't be found and points to My sessions", async () => {
    const { ApiError } = await import("@/api/types");
    mocked.getSession.mockRejectedValue(new ApiError("not found", "SESSION_NOT_FOUND", 404));
    openFresh("/ledger/s_gone");
    expect(await screen.findByText(/couldn't find this session/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "My sessions" })).toHaveAttribute("href", "/sessions");
  });

  it("with no session at all, offers setup and My sessions", async () => {
    openFresh("/ledger");
    expect(await screen.findByRole("link", { name: "Go to setup" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "My sessions" })).toBeInTheDocument();
    expect(mocked.getSession).not.toHaveBeenCalled();
  });
});

describe("the workspace survives a reload", () => {
  it("rehydrates without the report, resumes the open question and keeps every claim listed", async () => {
    mocked.getSession.mockResolvedValue(detail({ stage: "interrogate", open_claim_id: "CL-002", progress: makeProgress({ claims_total: 3, claims_done: 1, next_claim_id: "CL-002" }) }));
    mocked.interrogate.mockResolvedValue(makeTurn({ session_id: "s_saved", claim_id: "CL-002", claim: claims[1]!, question: "How does Jest track coverage?", level: 2 }));
    openFresh("/workspace/s_saved");
    expect(await screen.findByRole("heading", { name: "How does Jest track coverage?" })).toBeInTheDocument();
    expect(mocked.interrogate).toHaveBeenCalledWith({ session_id: "s_saved", claim_id: "CL-002", mode: "assess" });
    expect(mocked.getReport).not.toHaveBeenCalled();
    // Regression: the first turn used to replace the hydrated list with just its own claim.
    for (const text of ["Built a React dashboard", "Wrote Jest tests", "Deployed an Express API"]) {
      expect(await screen.findByText(text)).toBeInTheDocument();
    }
  });

  it("keeps an unsent answer as a draft for this account, and drops it once sent", async () => {
    mocked.getSession.mockResolvedValue(detail({ stage: "interrogate", open_claim_id: "CL-001" }));
    mocked.interrogate.mockResolvedValue(makeTurn({ session_id: "s_saved", claim_id: "CL-001", claim: claims[0]!, question: "What did you build?" }));
    const first = openFresh("/workspace/s_saved");
    fireEvent.change(await screen.findByLabelText("Your answer"), { target: { value: "A dashboard with hooks" } });
    expect(loadDraft("u1", "answer:s_saved:CL-001", "assess-L1-question")).toBe("A dashboard with hooks");
    first.unmount();

    openFresh("/workspace/s_saved");
    expect(await screen.findByDisplayValue("A dashboard with hooks")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Submit answer" }));
    await waitFor(() => expect(loadDraft("u1", "answer:s_saved:CL-001", "assess-L1-question")).toBeNull());
  });
});

describe("My sessions", () => {
  const summary = (over: Partial<SessionSummary>): SessionSummary => ({
    session_id: "s_x",
    role_id: "frontend_developer",
    mode: "prepare",
    created_at: "2026-10-22T10:00:00.000Z",
    claims_total: 3,
    claims_done: 0,
    stage: "review",
    ...over,
  });

  it("offers the right next step for each stage", async () => {
    mocked.getSessions.mockResolvedValue({
      sessions: [
        summary({ session_id: "s_review" }),
        summary({ session_id: "s_mid", stage: "interrogate", claims_done: 1 }),
        summary({ session_id: "s_done", stage: "complete", claims_done: 3, mode: "defense" }),
      ],
    });
    openFresh("/sessions");
    const items = await screen.findAllByRole("listitem");
    expect(within(items[0]!).getByRole("link", { name: "Review claims" })).toHaveAttribute("href", "/ledger/s_review");
    expect(within(items[0]!).getByText("Frontend Developer · Teach me")).toBeInTheDocument();
    expect(within(items[1]!).getByRole("link", { name: "Continue interview" })).toHaveAttribute("href", "/workspace/s_mid");
    expect(within(items[1]!).getByRole("link", { name: "Report so far" })).toHaveAttribute("href", "/report/s_mid");
    expect(within(items[2]!).getByRole("link", { name: "Open report" })).toHaveAttribute("href", "/report/s_done");
    expect(within(items[2]!).getByText(/Interview defense/)).toBeInTheDocument();
  });
});
