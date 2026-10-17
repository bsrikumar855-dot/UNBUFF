import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { SessionProvider } from "@/state/SessionContext";
import { InterrogationProvider } from "@/state/InterrogationContext";
import { SetupPage } from "@/pages/SetupPage";
import { api } from "@/api/endpoints";
import { ApiError } from "@/api/types";
import type { RoleSummary, ClaimsResponse } from "@/types/contract";
import { makeClaim, makeClaimsResponse } from "./fixtures";

vi.mock("@/api/endpoints", () => ({
  api: { getRoles: vi.fn(), extractClaims: vi.fn() },
}));

vi.mock("@/hooks/usePdfExtractor", () => ({
  usePdfExtractor: () => ({
    extractText: vi.fn().mockResolvedValue("Extracted resume content from PDF"),
    isExtracting: false,
    error: null,
    clearError: vi.fn(),
  }),
}));

const mockRoles: RoleSummary[] = [
  {
    id: "frontend_developer",
    name: "Frontend Developer",
    description: "React, JavaScript, APIs, responsive UI",
    skill_count: 8,
  },
];

const mockClaimsResponse: ClaimsResponse = makeClaimsResponse(
  [makeClaim({ text: "Built a React dashboard", resume_line: "Built a React dashboard" })],
  { session_id: "s_test_456", blind_spots: [] },
);

function renderSetup() {
  return render(
    <SessionProvider>
      <InterrogationProvider>
        <MemoryRouter initialEntries={["/setup"]}>
          <Routes>
            <Route path="/setup" element={<SetupPage />} />
            <Route path="/ledger" element={<div>LEDGER_PLACEHOLDER</div>} />
          </Routes>
        </MemoryRouter>
      </InterrogationProvider>
    </SessionProvider>
  );
}

async function selectRoleAndMode() {
  await screen.findByRole("radio", { name: /Frontend Developer/i });
  fireEvent.click(screen.getByRole("radio", { name: /Frontend Developer/i }));
  fireEvent.click(screen.getByRole("radio", { name: /Teach me/i }));
}

describe("SetupPage — role loading", () => {
  beforeEach(() => {
    vi.mocked(api.getRoles).mockReset();
    vi.mocked(api.extractClaims).mockReset();
  });

  it("loads roles from the API and renders them", async () => {
    vi.mocked(api.getRoles).mockResolvedValue({ roles: mockRoles });
    renderSetup();

    expect(
      await screen.findByRole("radio", { name: /Frontend Developer/i })
    ).toBeInTheDocument();
  });

  it("shows a retryable error when role loading fails", async () => {
    vi.mocked(api.getRoles)
      .mockRejectedValueOnce(new ApiError("down", "INTERNAL", 500))
      .mockResolvedValueOnce({ roles: mockRoles });
    renderSetup();

    const retry = await screen.findByRole("button", { name: "Retry" });
    fireEvent.click(retry);

    expect(
      await screen.findByRole("radio", { name: /Frontend Developer/i })
    ).toBeInTheDocument();
  });
});

describe("SetupPage — validation and submission", () => {
  beforeEach(() => {
    vi.mocked(api.getRoles).mockReset().mockResolvedValue({ roles: mockRoles });
    vi.mocked(api.extractClaims).mockReset();
  });

  it("keeps submit disabled until role, mode, and resume text are all present", async () => {
    renderSetup();
    const submit = await screen.findByRole("button", { name: "Extract My Claims" });
    expect(submit).toBeDisabled();

    await selectRoleAndMode();
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Your resume"), {
      target: { value: "I built things." },
    });
    expect(submit).toBeEnabled();
  });

  it("populates editable resume text after a PDF is uploaded", async () => {
    renderSetup();
    await screen.findByRole("radio", { name: /Frontend Developer/i });

    const file = new File(["dummy"], "resume.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText(/upload pdf/i, { selector: "input" }), {
      target: { files: [file] },
    });

    await waitFor(() => {
      expect(screen.getByLabelText("Your resume")).toHaveValue(
        "Extracted resume content from PDF"
      );
    });
    expect(screen.getByText(/extracted successfully/i)).toBeInTheDocument();
  });

  it("sends exactly the contract payload and hands off to the Claim Ledger on success", async () => {
    vi.mocked(api.extractClaims).mockResolvedValue(mockClaimsResponse);
    renderSetup();
    await selectRoleAndMode();
    fireEvent.change(screen.getByLabelText("Your resume"), {
      target: { value: "I built a React dashboard." },
    });

    fireEvent.click(screen.getByRole("button", { name: "Extract My Claims" }));

    await waitFor(() => {
      expect(screen.getByText("LEDGER_PLACEHOLDER")).toBeInTheDocument();
    });
    // Required: the contract field is `mode` ("prepare" for Teach me); `prep_mode` is rejected by the backend.
    expect(api.extractClaims).toHaveBeenCalledWith({
      role_id: "frontend_developer",
      mode: "prepare",
      resume_text: "I built a React dashboard.",
    });
    const payload = vi.mocked(api.extractClaims).mock.calls[0]?.[0] as unknown as Record<string, unknown>;
    expect(payload).not.toHaveProperty("prep_mode");
  });

  it("disables submit while the request is in flight", async () => {
    let resolveRequest: (v: ClaimsResponse) => void;
    vi.mocked(api.extractClaims).mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve;
      })
    );
    renderSetup();
    await selectRoleAndMode();
    fireEvent.change(screen.getByLabelText("Your resume"), {
      target: { value: "I built a React dashboard." },
    });

    const submit = screen.getByRole("button", { name: "Extract My Claims" });
    fireEvent.click(submit);

    expect(await screen.findByText(/Extracting your claims…/i)).toBeDisabled();
    resolveRequest!(mockClaimsResponse);
    await waitFor(() => {
      expect(screen.getByText("LEDGER_PLACEHOLDER")).toBeInTheDocument();
    });
  });

  it("shows a safe error message and retries the same request on failure", async () => {
    vi.mocked(api.extractClaims)
      .mockRejectedValueOnce(new ApiError("boom", "INTERNAL", 500))
      .mockResolvedValueOnce(mockClaimsResponse);
    renderSetup();
    await selectRoleAndMode();
    fireEvent.change(screen.getByLabelText("Your resume"), {
      target: { value: "I built a React dashboard." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Extract My Claims" }));

    const retry = await screen.findByRole("button", { name: "Retry" });
    expect(screen.queryByText("boom")).not.toBeInTheDocument();

    fireEvent.click(retry);
    await waitFor(() => {
      expect(screen.getByText("LEDGER_PLACEHOLDER")).toBeInTheDocument();
    });
    expect(api.extractClaims).toHaveBeenCalledTimes(2);
  });
});
