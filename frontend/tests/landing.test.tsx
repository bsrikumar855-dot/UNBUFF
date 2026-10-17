import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { App } from "@/App";
import type { Report } from "@/types/contract";

const mockReport: Report = {
  session_id: "s_demo_123",
  mode: "defense",
  role: { id: "frontend_developer", name: "Frontend Developer" },
  generated_at: "2026-01-01T00:00:00Z",
  readiness: 52,
  coverage: 70,
  claims: [],
  skills: [],
  deprioritized_claim_ids: [],
  blind_spots: [],
  resume_lines: [],
  priorities: [],
  plan: [],
  progress: { claims_total: 0, claims_done: 0, next_claim_id: null, next_mode: null },
};

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    headers: { get: (h: string) => (h === "content-type" ? "application/json" : null) },
    json: async () => body,
  };
}

describe("Landing — demo report flow", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("shows the loading state, then routes to the report with real data on success", async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(mockReport));
    render(<App />);

    const demoButtons = screen.getAllByRole("button", { name: "View Demo Report" });
    fireEvent.click(demoButtons[0]!);

    expect(await screen.findByText(/Preparing demo report…/i)).toBeInTheDocument();

    expect(await screen.findByRole("heading", { level: 1, name: "Readiness report" })).toBeInTheDocument();
    expect(screen.getByText("Demo data")).toBeInTheDocument();
    expect(screen.getByText(/Frontend Developer/)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Readiness 52 out of 100" })).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledTimes(1); // the report handed over via router state is not refetched
  });

  it("shows a safe error message and retries the same request on failure", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse({ error: { code: "INTERNAL", message: "boom" } }, false, 500)
    );
    render(<App />);

    const demoButtons = screen.getAllByRole("button", { name: "View Demo Report" });
    fireEvent.click(demoButtons[0]!);

    const retry = await screen.findByRole("button", { name: "Retry" });
    expect(screen.getByRole("alert")).toHaveTextContent(/went wrong on our side/i);
    expect(screen.queryByText("boom")).not.toBeInTheDocument();

    fireEvent.click(retry);
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });
});
