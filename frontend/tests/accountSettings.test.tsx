import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import type { AccountProfile } from "@/types/contract";
import { api } from "@/api/endpoints";
import { AuthProvider } from "@/auth/AuthContext";
import { RequireAuth } from "@/auth/RequireAuth";
import { AuthError, type AuthClient, type AuthUser } from "@/auth/types";
import { DataPanel, DELETE_PHRASE } from "@/components/settings/DataPanel";
import { ProfilePanel } from "@/components/settings/ProfilePanel";
import { SecurityPanel } from "@/components/settings/SecurityPanel";
import { AccountMenu } from "@/components/shell/AccountMenu";
import { clearCachedAccountProfile } from "@/hooks/useAccountProfile";
import { loadDraft, saveDraft } from "@/lib/drafts";
import { InterrogationProvider } from "@/state/InterrogationContext";
import { SessionProvider } from "@/state/SessionContext";

vi.mock("@/api/endpoints", () => ({
  api: {
    getAccountProfile: vi.fn(),
    saveAccountProfile: vi.fn(),
    exportAccount: vi.fn(),
    deleteAccountData: vi.fn(),
    getRoles: vi.fn(),
  },
}));
const mocked = vi.mocked(api);

const EMPTY: AccountProfile = { display_name: null, college: null, graduation_year: null, target_role_id: null, updated_at: null };

/** A controllable fake: `emit` changes the signed-in user like Firebase's onAuthStateChanged does. */
function fakeAuth(initial: AuthUser | null) {
  let listener: ((u: AuthUser | null) => void) | null = null;
  const client: Required<AuthClient> = {
    configured: true,
    onChange(cb) {
      listener = cb;
      queueMicrotask(() => cb(initial));
      return () => undefined;
    },
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(async () => listener?.(null)),
    sendPasswordReset: vi.fn(async () => undefined),
    getIdToken: vi.fn(async () => "t"),
    changePassword: vi.fn(async () => undefined),
    verifyPassword: vi.fn(async () => undefined),
    deleteAccount: vi.fn(async () => undefined),
  };
  return { client, emit: (u: AuthUser | null) => listener?.(u) };
}

const alice: AuthUser = { uid: "alice", email: "alice@example.test" };

const Where: React.FC = () => {
  const loc = useLocation();
  return <p data-testid="where">{`${loc.pathname}|${JSON.stringify(loc.state ?? null)}`}</p>;
};

function renderWith(client: AuthClient, ui: React.ReactNode, path = "/settings") {
  return render(
    <AuthProvider client={client}>
      <SessionProvider>
        <InterrogationProvider>
          <MemoryRouter initialEntries={[path]}>
            <Routes>
              <Route path="/" element={<Where />} />
              <Route path="/login" element={<Where />} />
              <Route element={<RequireAuth />}>
                <Route path="/settings" element={<>{ui}</>} />
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
  clearCachedAccountProfile();
  window.localStorage.clear();
  mocked.getAccountProfile.mockResolvedValue({ profile: EMPTY });
  mocked.getRoles.mockResolvedValue({ roles: [{ id: "frontend_developer", name: "Frontend Developer", description: "d", skill_count: 1 }] });
});

describe("profile", () => {
  it("saves trimmed values (blank → null) and shows the name in the account menu", async () => {
    const { client } = fakeAuth(alice);
    mocked.saveAccountProfile.mockImplementation(async (p) => ({ profile: { ...p, updated_at: "2026-10-22T10:00:00.000Z" } }));
    renderWith(client, <><ProfilePanel /><AccountMenu /></>);
    fireEvent.change(await screen.findByLabelText("Display name"), { target: { value: "  Asha Rao " } });
    fireEvent.change(screen.getByLabelText("College"), { target: { value: "   " } });
    fireEvent.change(screen.getByLabelText("Graduation year"), { target: { value: "2027" } });
    await screen.findByRole("option", { name: "Frontend Developer" });
    fireEvent.change(screen.getByLabelText("Target role"), { target: { value: "frontend_developer" } });
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Saved.");
    expect(mocked.saveAccountProfile).toHaveBeenCalledWith({ display_name: "Asha Rao", college: null, graduation_year: 2027, target_role_id: "frontend_developer" });
    expect(await screen.findByText("Asha Rao")).toBeInTheDocument();
  });

  it("refuses an impossible graduation year before calling the server", async () => {
    const { client } = fakeAuth(alice);
    renderWith(client, <ProfilePanel />);
    fireEvent.change(await screen.findByLabelText("Graduation year"), { target: { value: "1800" } });
    expect(screen.getByText("Enter a year between 1990 and 2100.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save profile" })).toBeDisabled();
    expect(mocked.saveAccountProfile).not.toHaveBeenCalled();
  });

  it("never shows one account's cached name to the next account", async () => {
    mocked.getAccountProfile.mockResolvedValueOnce({ profile: { ...EMPTY, display_name: "Asha Rao" } }).mockResolvedValueOnce({ profile: EMPTY });
    const { client, emit } = fakeAuth(alice);
    renderWith(client, <AccountMenu />);
    expect(await screen.findByText("Asha Rao")).toBeInTheDocument();
    emit({ uid: "bob", email: "bob@example.test" });
    expect(await screen.findByText("bob@example.test")).toBeInTheDocument();
    expect(screen.queryByText("Asha Rao")).not.toBeInTheDocument();
  });
});

describe("security", () => {
  it("checks the new password locally, then changes it with the current one", async () => {
    const { client } = fakeAuth(alice);
    renderWith(client, <SecurityPanel />);
    fireEvent.change(await screen.findByLabelText("Current password"), { target: { value: "old-password" } });
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "short" } });
    expect(screen.getByText(/at least 8 characters/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "a-new-password" } });
    fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: "a-new-passwordX" } });
    expect(screen.getByText("The new passwords don't match.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Change password" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: "a-new-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Your password is changed.");
    expect(client.changePassword).toHaveBeenCalledWith("old-password", "a-new-password");
  });

  it("shows the friendly message when the current password is wrong", async () => {
    const { client } = fakeAuth(alice);
    vi.mocked(client.changePassword).mockRejectedValue(new AuthError("Incorrect email or password.", "auth/invalid-credential"));
    renderWith(client, <SecurityPanel />);
    fireEvent.change(await screen.findByLabelText("Current password"), { target: { value: "wrong-one" } });
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "a-new-password" } });
    fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: "a-new-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Incorrect email or password.");
  });

  it("emails a reset link to the signed-in address", async () => {
    const { client } = fakeAuth(alice);
    renderWith(client, <SecurityPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "Email me a reset link" }));
    expect(await screen.findByRole("status")).toHaveTextContent("alice@example.test");
    expect(client.sendPasswordReset).toHaveBeenCalledWith("alice@example.test");
  });
});

describe("delete everything", () => {
  const open = async () => {
    fireEvent.click(await screen.findByRole("button", { name: "Delete everything…" }));
    fireEvent.change(screen.getByLabelText(/to confirm/), { target: { value: DELETE_PHRASE } });
    fireEvent.change(screen.getByLabelText("Your password"), { target: { value: "pw" } });
  };

  it("needs the exact phrase and a password", async () => {
    const { client } = fakeAuth(alice);
    renderWith(client, <DataPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "Delete everything…" }));
    fireEvent.change(screen.getByLabelText(/to confirm/), { target: { value: "delete my data" } });
    fireEvent.change(screen.getByLabelText("Your password"), { target: { value: "pw" } });
    expect(screen.getByRole("button", { name: "Permanently delete" })).toBeDisabled();
  });

  it("checks the password first, then deletes the data, then the sign-in account, and clears this browser", async () => {
    const { client } = fakeAuth(alice);
    const order: string[] = [];
    vi.mocked(client.verifyPassword).mockImplementation(async () => void order.push("verify"));
    mocked.deleteAccountData.mockImplementation(async () => {
      order.push("data");
      return { deleted: true, removed: {} };
    });
    vi.mocked(client.deleteAccount).mockImplementation(async () => void order.push("account"));
    saveDraft("alice", "answer:s1:CL-001", "assess-L1-question", "half an answer");
    renderWith(client, <DataPanel />);
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Permanently delete" }));
    await waitFor(() => expect(order).toEqual(["verify", "data", "account"]));
    expect(mocked.deleteAccountData).toHaveBeenCalledWith(DELETE_PHRASE);
    await waitFor(() => expect(loadDraft("alice", "answer:s1:CL-001", "assess-L1-question")).toBeNull());
    expect(await screen.findByTestId("where")).toHaveTextContent(/^\/\|null$/);
  });

  it("touches nothing when the password is wrong", async () => {
    const { client } = fakeAuth(alice);
    vi.mocked(client.verifyPassword).mockRejectedValue(new AuthError("Incorrect email or password.", "auth/invalid-credential"));
    renderWith(client, <DataPanel />);
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Permanently delete" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Incorrect email or password.");
    expect(mocked.deleteAccountData).not.toHaveBeenCalled();
    expect(client.deleteAccount).not.toHaveBeenCalled();
  });

  it("says so plainly if the data went but the sign-in account could not be removed", async () => {
    const { client } = fakeAuth(alice);
    mocked.deleteAccountData.mockResolvedValue({ deleted: true, removed: {} });
    vi.mocked(client.deleteAccount).mockRejectedValue(new AuthError("For your security, sign out and sign in again, then retry.", "auth/requires-recent-login"));
    renderWith(client, <DataPanel />);
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Permanently delete" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Your data is deleted, but the sign-in account could not be removed: For your security/);
  });
});

describe("signing out", () => {
  it("on purpose: goes home with no return address for the next person", async () => {
    const { client } = fakeAuth(alice);
    renderWith(client, <AccountMenu />);
    fireEvent.click(await screen.findByRole("button", { name: "Sign out" }));
    expect(await screen.findByTestId("where")).toHaveTextContent(/^\/\|null$/);
  });

  it("when the token is no longer valid: the sign-in page remembers the page, for the same student", async () => {
    const { client, emit } = fakeAuth(alice);
    renderWith(client, <p>private page</p>);
    await screen.findByText("private page");
    emit(null);
    expect(await screen.findByTestId("where")).toHaveTextContent('/login|{"from":"/settings"}');
  });
});
