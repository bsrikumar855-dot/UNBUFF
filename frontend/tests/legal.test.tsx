import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AppRoutes } from "@/App";
import { AuthProvider } from "@/auth/AuthContext";
import { AppShell } from "@/components/shell/AppShell";
import { InterrogationProvider } from "@/state/InterrogationContext";
import { SessionProvider } from "@/state/SessionContext";
import type { AuthClient } from "@/auth/types";

const signUp = vi.fn(async () => undefined);
const client = (): AuthClient => ({
  configured: true,
  onChange(cb) {
    queueMicrotask(() => cb(null));
    return () => undefined;
  },
  signIn: vi.fn(),
  signUp,
  signOut: vi.fn(async () => undefined),
  sendPasswordReset: vi.fn(),
  getIdToken: vi.fn(async () => null),
});
const renderAt = (path: string) =>
  render(
    <AuthProvider client={client()}>
      <SessionProvider>
        <InterrogationProvider>
          <MemoryRouter initialEntries={[path]}>
            <AppRoutes />
          </MemoryRouter>
        </InterrogationProvider>
      </SessionProvider>
    </AuthProvider>
  );

describe("legal pages and consent", () => {
  it("serves Privacy and Terms without signing in, with a draft notice", async () => {
    renderAt("/privacy");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Privacy" })
    ).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent(/Draft for legal review/);
    expect(screen.getByText(/Google Gemini API/)).toBeInTheDocument();
  });

  it("serves the terms", async () => {
    renderAt("/terms");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Terms of use" })
    ).toBeInTheDocument();
  });

  it("links to both from the footer", async () => {
    render(
      <AuthProvider client={client()}>
        <MemoryRouter initialEntries={["/privacy"]}>
          <AppShell>
            <p>page</p>
          </AppShell>
        </MemoryRouter>
      </AuthProvider>
    );
    const nav = await screen.findByRole("navigation", { name: "Legal" });
    expect(nav).toHaveTextContent("Privacy");
    expect(nav).toHaveTextContent("Terms");
  });

  it("will not create an account until the student agrees to the terms", async () => {
    renderAt("/login");
    fireEvent.click(await screen.findByRole("button", { name: /Create an account/i }));
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "new@student.in" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "a-long-password-1" },
    });
    fireEvent.change(screen.getByLabelText("Confirm password"), {
      target: { value: "a-long-password-1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/agree to the Terms/);
    expect(signUp).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText(/I am 18 or older/));
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    await waitFor(() => expect(signUp).toHaveBeenCalled());
  });
});
