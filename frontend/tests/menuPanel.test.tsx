import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { App } from "@/App";
import type { AuthClient } from "@/auth/types";

const signedIn: AuthClient = {
  configured: true,
  onChange(cb) {
    queueMicrotask(() => cb({ uid: "u1", email: "a@b.co" }));
    return () => undefined;
  },
  signIn: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(async () => undefined),
  sendPasswordReset: vi.fn(),
  getIdToken: vi.fn(async () => "t"),
};

vi.mock("@/api/endpoints", () => ({ api: new Proxy({}, { get: () => vi.fn(() => new Promise(() => undefined)) }) }));

describe("the floating menu panel", () => {
  it("opens from the Menu pill with the main places in large type, and closes with the Close pill", async () => {
    window.history.pushState({}, "", "/dsa");
    render(<App authClient={signedIn} />);
    fireEvent.click(await screen.findByRole("button", { name: "Menu" }));
    const dialog = await screen.findByRole("dialog", { name: "Navigation" });
    for (const name of ["Placement plan", "DSA Arena", "AI Mentor", "DSA patterns", "DBMS"]) {
      expect(dialog).toContainElement(screen.getAllByRole("link", { name })[0]!);
    }
    expect(screen.getByRole("link", { name: "DSA Arena" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /Paste it\. Get hints, not spoilers/ })).toHaveAttribute("href", "/mentor");
    expect(screen.queryByText("GraphQL Lab")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Close/ }));
    await vi.waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("closes when a link is chosen", async () => {
    window.history.pushState({}, "", "/dsa");
    render(<App authClient={signedIn} />);
    fireEvent.click(await screen.findByRole("button", { name: "Menu" }));
    fireEvent.click(await screen.findByRole("link", { name: "DBMS" }));
    await vi.waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});
