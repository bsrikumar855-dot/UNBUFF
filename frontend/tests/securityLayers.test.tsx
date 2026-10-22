import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { api } from "@/api/endpoints";
import { ApiError } from "@/api/types";
import { AuthProvider } from "@/auth/AuthContext";
import { RequireAuth } from "@/auth/RequireAuth";
import type { AuthClient, AuthUser } from "@/auth/types";
import { DataPanel } from "@/components/settings/DataPanel";
import { SecurityPanel } from "@/components/settings/SecurityPanel";
import { clearDrafts, loadDraft, saveDraft } from "@/lib/drafts";
import { getErrorMessage } from "@/lib/errors";
import { LoginPage } from "@/pages/LoginPage";
import { InterrogationProvider } from "@/state/InterrogationContext";
import { SessionProvider } from "@/state/SessionContext";

vi.mock("@/api/endpoints", () => ({
  api: {
    getUsage: vi.fn(),
    signOutEverywhere: vi.fn(),
    getAccountProfile: vi.fn(),
    exportAccount: vi.fn(),
    deleteAccountData: vi.fn(),
  },
}));
const mocked = vi.mocked(api);

function fakeAuth(initial: AuthUser | null) {
  let listener: ((u: AuthUser | null) => void) | null = null;
  const client: Required<AuthClient> = {
    configured: true,
    onChange(cb) {
      listener = cb;
      queueMicrotask(() => cb(initial));
      return () => undefined;
    },
    signIn: vi.fn(async () => undefined),
    signUp: vi.fn(async () => undefined),
    signOut: vi.fn(async () => listener?.(null)),
    sendPasswordReset: vi.fn(async () => undefined),
    sendVerificationEmail: vi.fn(async () => undefined),
    refreshUser: vi.fn(async () => undefined),
    getAppCheckToken: vi.fn(async () => null),
    getIdToken: vi.fn(async () => "t"),
    changePassword: vi.fn(async () => undefined),
    verifyPassword: vi.fn(async () => undefined),
    deleteAccount: vi.fn(async () => undefined),
  };
  return { client, emit: (u: AuthUser | null) => listener?.(u) };
}

const unverified: AuthUser = { uid: "carol", email: "carol@example.test", emailVerified: false };

function renderApp(client: AuthClient, path: string, extra: React.ReactNode = null) {
  return render(
    <AuthProvider client={client}>
      <SessionProvider>
        <InterrogationProvider>
          <MemoryRouter initialEntries={[path]}>
            <Routes>
              <Route path="/" element={<p>home</p>} />
              <Route path="/login" element={<LoginPage />} />
              <Route element={<RequireAuth />}>
                <Route path="/setup" element={<p>setup page</p>} />
                <Route path="/settings" element={<>{extra ?? <p>settings page</p>}</>} />
              </Route>
            </Routes>
          </MemoryRouter>
        </InterrogationProvider>
      </SessionProvider>
    </AuthProvider>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe("verified email gate", () => {
  it("holds private pages until the address is verified, and lets them through once it is", async () => {
    const { client, emit } = fakeAuth(unverified);
    renderApp(client, "/setup");
    expect(await screen.findByRole("heading", { name: "Verify your email" })).toBeInTheDocument();
    expect(screen.queryByText("setup page")).not.toBeInTheDocument();
    expect(screen.getByText("carol@example.test")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Resend the link" }));
    expect(await screen.findByRole("status")).toHaveTextContent("We sent a new link");
    expect(client.sendVerificationEmail).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: /Resend in \d+s/ })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "I've verified, continue" }));
    await waitFor(() => expect(client.refreshUser).toHaveBeenCalled());
    emit({ ...unverified, emailVerified: true });
    expect(await screen.findByText("setup page")).toBeInTheDocument();
  });

  it("keeps Settings reachable so an unverified account can still be exported or deleted", async () => {
    const { client } = fakeAuth(unverified);
    renderApp(client, "/settings");
    expect(await screen.findByText("settings page")).toBeInTheDocument();
  });
});

describe("remember this device", () => {
  it("signing in with it off keeps the session to this tab and drafts in session storage", async () => {
    const { client } = fakeAuth(null);
    renderApp(client, "/login");
    fireEvent.change(await screen.findByLabelText("Email"), { target: { value: "a@example.test" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "long-password" } });
    const box = screen.getByRole("checkbox", { name: /Keep me signed in on this device/ });
    expect(box).toBeChecked();
    fireEvent.click(box);
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(client.signIn).toHaveBeenCalledWith("a@example.test", "long-password", false));

    saveDraft("u1", "q1", "python", "print(1)");
    expect(window.sessionStorage.getItem("unbluff:draft:u1:q1:python")).toBe("print(1)");
    expect(window.localStorage.getItem("unbluff:draft:u1:q1:python")).toBeNull();
    expect(loadDraft("u1", "q1", "python")).toBe("print(1)");
    clearDrafts("u1");
    expect(loadDraft("u1", "q1", "python")).toBeNull();
  });
});

describe("sign out of all devices", () => {
  it("revokes every session on the server, then signs out here too", async () => {
    mocked.signOutEverywhere.mockResolvedValue(undefined);
    const { client } = fakeAuth({ uid: "alice", email: "alice@example.test", emailVerified: true });
    renderApp(client, "/settings", <SecurityPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "Sign out of all devices…" }));
    fireEvent.click(screen.getByRole("button", { name: "Sign out everywhere" }));
    await waitFor(() => expect(client.signOut).toHaveBeenCalled());
    expect(mocked.signOutEverywhere).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("home")).toBeInTheDocument();
  });

  it("stays signed in and explains when the server could not do it", async () => {
    mocked.signOutEverywhere.mockRejectedValue(new ApiError("x", "INTERNAL", 500));
    const { client } = fakeAuth({ uid: "alice", email: "alice@example.test", emailVerified: true });
    renderApp(client, "/settings", <SecurityPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "Sign out of all devices…" }));
    fireEvent.click(screen.getByRole("button", { name: "Sign out everywhere" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(client.signOut).not.toHaveBeenCalled();
  });
});

describe("AI allowance", () => {
  it("shows today's usage in Settings", async () => {
    mocked.getUsage.mockResolvedValue({ date: "2026-10-22", used: 12, limit: 150, resets_at: "2026-10-23T00:00:00.000Z" });
    const { client } = fakeAuth({ uid: "alice", email: "alice@example.test", emailVerified: true });
    renderApp(client, "/settings", <DataPanel />);
    const meter = await screen.findByRole("meter", { name: "AI allowance used today" });
    expect(meter).toHaveAttribute("aria-valuenow", "12");
    expect(screen.getByText(/12 of 150 used/)).toBeInTheDocument();
  });

  it("passes the server's 'resets in about N hours' message through", () => {
    expect(getErrorMessage(new ApiError("You've used today's AI allowance. It resets in about 5 hours.", "DAILY_LIMIT_REACHED", 429))).toBe(
      "You've used today's AI allowance. It resets in about 5 hours."
    );
    expect(getErrorMessage(new ApiError("", "EMAIL_NOT_VERIFIED", 403))).toMatch(/Verify your email/);
  });
});
