import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { App } from "@/App";
import type { AuthClient } from "@/auth/types";
import { navGroups } from "@/components/shell/nav";

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
const signedOut: AuthClient = {
  ...signedIn,
  onChange: (cb) => {
    queueMicrotask(() => cb(null));
    return () => undefined;
  },
};

vi.mock("@/api/endpoints", () => ({
  api: new Proxy({}, { get: () => vi.fn(() => new Promise(() => undefined)) }),
}));

describe("the sidebar for signed-in students", () => {
  it("lists every page, grouped, with the current page marked and no More menu", async () => {
    window.history.pushState({}, "", "/dsa");
    render(<App authClient={signedIn} />);
    await screen.findByRole("link", { name: "AI Mentor" });
    const nav = screen.getByRole("navigation", { name: "Primary" });
    const groups = navGroups(null);
    expect(groups.map((g) => g.label)).toEqual([
      "Plan",
      "Practice",
      "Learn",
      "Evidence",
      "Account",
    ]);
    for (const g of groups) {
      const list = within(nav).getByRole("list", { name: g.label });
      for (const item of g.items)
        expect(within(list).getByRole("link", { name: item.label })).toHaveAttribute(
          "href",
          item.to
        );
    }
    expect(within(nav).getByRole("link", { name: "DSA Arena" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(within(nav).getByRole("link", { name: "Settings" })).not.toHaveAttribute(
      "aria-current"
    );
    expect(screen.queryByRole("button", { name: "More" })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps search and the account at the foot, with who is signed in and Sign out", async () => {
    window.history.pushState({}, "", "/dsa");
    render(<App authClient={signedIn} />);
    expect(await screen.findByText("a@b.co")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Go to/ }).length).toBeGreaterThan(0); // the sidebar search, and the small-screen bar's
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(signedIn.signOut).toHaveBeenCalled());
  });

  it("shows the audit-session pages only once a session exists", () => {
    const labels = (id: string | null) =>
      navGroups(id).flatMap((g) => g.items.map((i) => i.label));
    expect(labels(null)).not.toContain("Ledger");
    expect(labels("s1")).toEqual(
      expect.arrayContaining(["Ledger", "Interview workspace", "Report"])
    );
  });

  it("opens the same navigation from the top bar on a small screen, and closes when a page is chosen", async () => {
    window.history.pushState({}, "", "/dsa");
    render(<App authClient={signedIn} />);
    fireEvent.click(await screen.findByRole("button", { name: "Open navigation" }));
    const sheet = await screen.findByRole("dialog");
    for (const name of ["Placement plan", "AI Mentor", "DBMS", "Settings"])
      expect(within(sheet).getByRole("link", { name })).toBeInTheDocument();
    fireEvent.click(within(sheet).getByRole("link", { name: "DBMS" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});

describe("the marketing header", () => {
  it("is minimal on the landing page when signed in: only Open my plan and Sign out, no navigation or sidebar", async () => {
    window.history.pushState({}, "", "/");
    render(<App authClient={signedIn} />);
    expect(await screen.findByRole("link", { name: "Open my plan" })).toHaveAttribute("href", "/placement");
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Primary" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "UNBLUFF home" })).not.toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Signed in as a@b.co" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open navigation" })).not.toBeInTheDocument();
  });

  it("shows the public pages and the audit call to action to visitors, with no account", async () => {
    window.history.pushState({}, "", "/");
    render(<App authClient={signedOut} />);
    expect(
      (await screen.findAllByRole("link", { name: "Audit My Readiness" })).length
    ).toBeGreaterThan(0);
    const nav = screen.getByRole("navigation", { name: "Primary" });
    for (const name of ["DSA", "Patterns", "DBMS", "Roadmap"])
      expect(within(nav).getByRole("link", { name })).toBeInTheDocument();
    expect(
      within(nav).queryByRole("link", { name: "Placement plan" })
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sign out" })).not.toBeInTheDocument();
  });

  it("offers the halftone graphic on the landing page with a text alternative", async () => {
    window.history.pushState({}, "", "/");
    render(<App authClient={signedOut} />);
    expect(
      await screen.findByRole("img", { name: /résumé page under review/ })
    ).toBeInTheDocument();
  });
});
