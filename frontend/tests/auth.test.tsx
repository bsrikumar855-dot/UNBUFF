import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { apiClient, setAuthHooks } from "@/api/client";
import { AuthProvider } from "@/auth/AuthContext";
import { RequireAuth } from "@/auth/RequireAuth";
import { AuthError, type AuthClient, type AuthUser } from "@/auth/types";
import { validateAuthForm } from "@/auth/validate";
import { App } from "@/App";
import { LoginPage } from "@/pages/LoginPage";

/** In-memory identity provider: no network, no Firebase. */
function fakeClient(initial: AuthUser | null = null, overrides: Partial<AuthClient> = {}) {
  let user = initial;
  const listeners = new Set<(u: AuthUser | null) => void>();
  const emit = () => listeners.forEach((l) => l(user));
  const client: AuthClient = {
    configured: true,
    onChange(cb) {
      listeners.add(cb);
      queueMicrotask(() => cb(user));
      return () => listeners.delete(cb);
    },
    signIn: vi.fn(async (email: string) => {
      user = { uid: "u1", email };
      emit();
    }),
    signUp: vi.fn(async (email: string) => {
      user = { uid: "u2", email };
      emit();
    }),
    signOut: vi.fn(async () => {
      user = null;
      emit();
    }),
    sendPasswordReset: vi.fn(async () => undefined),
    getIdToken: vi.fn(async () => (user ? "token-123" : null)),
    ...overrides,
  };
  return client;
}

function renderRoutes(client: AuthClient, path: string) {
  return render(
    <AuthProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<div>HOME</div>} />
          <Route element={<RequireAuth />}>
            <Route path="/setup" element={<div>SETUP_SCREEN</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

const fill = (label: RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe("validateAuthForm", () => {
  it("checks email, password presence, length and confirmation", () => {
    expect(validateAuthForm("signin", "nope", "x", "")).toMatch(/valid email/);
    expect(validateAuthForm("signin", "a@b.co", "", "")).toMatch(/Enter your password/);
    expect(validateAuthForm("signin", "a@b.co", "x", "")).toBeNull();
    expect(validateAuthForm("register", "a@b.co", "short", "short")).toMatch(/at least 8/);
    expect(validateAuthForm("register", "a@b.co", "longenough1", "different1")).toMatch(/don't match/);
    expect(validateAuthForm("register", "a@b.co", "longenough1", "longenough1")).toBeNull();
    expect(validateAuthForm("reset", "a@b.co", "", "")).toBeNull();
  });
});

describe("protected routes", () => {
  it("sends signed-out visitors to /login", async () => {
    renderRoutes(fakeClient(null), "/setup");
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.queryByText("SETUP_SCREEN")).not.toBeInTheDocument();
  });

  it("shows a loading state first, then the page for a persisted signed-in user", async () => {
    renderRoutes(fakeClient({ uid: "u1", email: "a@b.co" }), "/setup");
    expect(screen.getByRole("status")).toHaveTextContent(/Checking your sign-in/);
    expect(await screen.findByText("SETUP_SCREEN")).toBeInTheDocument();
  });

  it("returns to the page the student wanted after signing in", async () => {
    const client = fakeClient(null);
    renderRoutes(client, "/setup");
    await screen.findByRole("heading", { name: "Sign in" });
    fill(/^Email/, "me@example.com");
    fill(/^Password/, "hunter2hunter2");
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("SETUP_SCREEN")).toBeInTheDocument();
    expect(client.signIn).toHaveBeenCalledWith("me@example.com", "hunter2hunter2", true);
  });
});

describe("LoginPage", () => {
  it("validates before calling the provider", async () => {
    const client = fakeClient(null);
    renderRoutes(client, "/login");
    await screen.findByRole("heading", { name: "Sign in" });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/valid email/);
    expect(client.signIn).not.toHaveBeenCalled();
  });

  it("shows provider errors without leaking internals", async () => {
    const client = fakeClient(null, {
      signIn: vi.fn(async () => {
        throw new AuthError("Incorrect email or password.", "auth/invalid-credential");
      }),
    });
    renderRoutes(client, "/login");
    await screen.findByRole("heading", { name: "Sign in" });
    fill(/^Email/, "me@example.com");
    fill(/^Password/, "wrong-password");
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Incorrect email or password.");
  });

  it("registers a new student after confirming the password", async () => {
    const client = fakeClient(null);
    renderRoutes(client, "/login");
    fireEvent.click(await screen.findByRole("button", { name: /Create an account/ }));
    fill(/^Email/, "new@example.com");
    fill(/^Password/, "longenough1");
    fill(/^Confirm password/, "mismatch-xx");
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/don't match/);
    expect(client.signUp).not.toHaveBeenCalled();

    fill(/^Confirm password/, "longenough1");
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    await waitFor(() => expect(client.signUp).toHaveBeenCalledWith("new@example.com", "longenough1", true));
  });

  it("sends a password reset and answers the same way for every address", async () => {
    const client = fakeClient(null);
    renderRoutes(client, "/login");
    fireEvent.click(await screen.findByRole("button", { name: /Forgot your password/ }));
    fill(/^Email/, "me@example.com");
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));
    expect(await screen.findByRole("status")).toHaveTextContent(/If an account exists/);
    expect(client.sendPasswordReset).toHaveBeenCalledWith("me@example.com");
  });

  it("tells the student when sign-in is not configured", async () => {
    renderRoutes(fakeClient(null, { configured: false }), "/login");
    expect(await screen.findByRole("alert")).toHaveTextContent(/isn't configured/);
    expect(screen.getByRole("button", { name: "Sign in" })).toBeDisabled();
  });
});

describe("App navigation", () => {
  it("offers Sign in when signed out and Sign out + My sessions when signed in", async () => {
    const { unmount } = render(<App authClient={fakeClient(null)} />);
    expect((await screen.findAllByRole("link", { name: "Sign in" })).length).toBeGreaterThan(0);
    unmount();

    const client = fakeClient({ uid: "u1", email: "a@b.co" });
    window.history.pushState({}, "", "/dsa"); // a signed-in student's pages use the sidebar; the landing page keeps the marketing header
    render(<App authClient={client} />);
    // Sign out is at the foot of the sidebar and every page, My sessions included, is listed in it.
    await screen.findByRole("link", { name: "AI Mentor" }); // the signed-in pills have replaced the public ones
    expect(await screen.findByRole("button", { name: "Sign out" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "My sessions" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(client.signOut).toHaveBeenCalled());
    expect((await screen.findAllByRole("link", { name: "Sign in" })).length).toBeGreaterThan(0);
  });
});

describe("API client authentication", () => {
  const originalFetch = global.fetch;
  const jsonResponse = (status: number, body: unknown) => ({
    ok: status >= 200 && status < 300,
    status,
    statusText: "x",
    headers: { get: (h: string) => (h === "content-type" ? "application/json" : null) },
    json: async () => body,
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    global.fetch = originalFetch;
    setAuthHooks(null);
  });

  it("sends the ID token only in the Authorization header", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { sessions: [] }));
    global.fetch = fetchMock;
    setAuthHooks({ getToken: async () => "token-123", onUnauthorized: vi.fn() });
    await apiClient("/sessions");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer token-123");
    expect(url).not.toContain("token-123");
  });

  it("sends no Authorization header when signed out", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, {}));
    global.fetch = fetchMock;
    setAuthHooks({ getToken: async () => null, onUnauthorized: vi.fn() });
    await apiClient("/roles");
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("reports an expired session when the server answers 401 to a signed request", async () => {
    const onUnauthorized = vi.fn();
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(401, { error: { code: "UNAUTHENTICATED", message: "Sign in to continue." } }));
    setAuthHooks({ getToken: async () => "token-123", onUnauthorized });
    await expect(apiClient("/sessions")).rejects.toMatchObject({ code: "UNAUTHENTICATED", status: 401 });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("signs the student out and explains why when the provider reports an expired token", async () => {
    const client = fakeClient({ uid: "u1", email: "a@b.co" });
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(401, { error: { code: "UNAUTHENTICATED", message: "Sign in to continue." } }));
    renderRoutes(client, "/login");
    await screen.findByText("HOME").catch(() => undefined); // signed-in users are bounced off /login
    await act(async () => {
      await apiClient("/sessions").catch(() => undefined);
    });
    expect(client.signOut).toHaveBeenCalled();
    expect(await screen.findByRole("status")).toHaveTextContent(/session expired/i);
  });

  it("does not treat a 401 without a token as an expiry", async () => {
    const onUnauthorized = vi.fn();
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(401, { error: { code: "UNAUTHENTICATED", message: "x" } }));
    setAuthHooks({ getToken: async () => null, onUnauthorized });
    await expect(apiClient("/sessions")).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });
});
