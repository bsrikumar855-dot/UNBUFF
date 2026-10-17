import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { App } from "@/App";

describe("App architectural smoke test", () => {
  it("renders without crashing and shows the exact product headline", () => {
    render(<App />);
    expect(screen.getAllByRole("link", { name: /UNBLUFF/i }).length).toBeGreaterThan(0);
    expect(
      screen.getByRole("heading", { name: /Your resume says you.re ready\. Let.s prove it\./i })
    ).toBeInTheDocument();
  });

  it("exposes the two required CTAs in the header nav", () => {
    render(<App />);
    expect(
      screen.getAllByRole("link", { name: "Audit My Readiness" }).length
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("button", { name: "View Demo Report" }).length
    ).toBeGreaterThan(0);
  });
});
