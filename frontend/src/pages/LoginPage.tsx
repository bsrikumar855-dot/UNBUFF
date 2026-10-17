import React, { useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/context";
import { validateAuthForm, type AuthMode as Mode } from "@/auth/validate";
import { Button } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/LoadingState";
import { routes } from "@/lib/routes";

const TITLES: Record<Mode, string> = {
  signin: "Sign in",
  register: "Create your account",
  reset: "Reset your password",
};

export const LoginPage: React.FC = () => {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (auth.sessionExpired) setNotice("Your session expired. Please sign in again.");
  }, [auth.sessionExpired]);

  if (auth.status === "loading") {
    return (
      <LoadingState
        message="Checking your sign-in…"
        className="mx-auto max-w-md px-4 py-10"
      />
    );
  }
  if (auth.status === "signedIn") return <Navigate to={from ?? routes.setup} replace />;

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setNotice(null);
    setPassword("");
    setConfirm("");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = validateAuthForm(mode, email, password, confirm);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const address = email.trim();
      if (mode === "signin") await auth.signIn(address, password);
      else if (mode === "register") await auth.signUp(address, password);
      else {
        await auth.sendPasswordReset(address);
        setNotice("If an account exists for that email, a reset link is on its way.");
        return;
      }
      auth.clearSessionExpired();
      navigate(from ?? routes.setup, { replace: true });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Something went wrong. Please try again."
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <h1 className="mb-1 text-2xl font-bold text-ink-primary">{TITLES[mode]}</h1>
      <p className="mb-6 text-sm text-ink-secondary">
        Your resume, answers and reports are private to your account.
      </p>

      {!auth.configured && (
        <p
          role="alert"
          className="mb-4 rounded-md border border-line bg-white p-3 text-sm text-ink-primary"
        >
          Sign-in isn&apos;t configured for this deployment yet (missing Firebase
          settings).
        </p>
      )}

      <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm font-medium text-ink-primary">
          Email
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-md border border-line-strong bg-white px-3 py-2 font-normal"
          />
        </label>

        {mode !== "reset" && (
          <label className="flex flex-col gap-1 text-sm font-medium text-ink-primary">
            Password
            <input
              type="password"
              autoComplete={mode === "register" ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-md border border-line-strong bg-white px-3 py-2 font-normal"
            />
          </label>
        )}

        {mode === "register" && (
          <label className="flex flex-col gap-1 text-sm font-medium text-ink-primary">
            Confirm password
            <input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="rounded-md border border-line-strong bg-white px-3 py-2 font-normal"
            />
          </label>
        )}

        {error && (
          <p role="alert" className="text-sm text-verdict-bluff-fg">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="text-sm text-ink-secondary">
            {notice}
          </p>
        )}

        <Button type="submit" disabled={busy || !auth.configured} aria-busy={busy}>
          {busy
            ? "Please wait…"
            : mode === "signin"
              ? "Sign in"
              : mode === "register"
                ? "Create account"
                : "Send reset link"}
        </Button>
      </form>

      <div className="mt-6 flex flex-col gap-2 text-sm">
        {mode !== "signin" && (
          <button
            type="button"
            className="text-left text-primary underline"
            onClick={() => switchMode("signin")}
          >
            Back to sign in
          </button>
        )}
        {mode === "signin" && (
          <>
            <button
              type="button"
              className="text-left text-primary underline"
              onClick={() => switchMode("register")}
            >
              New here? Create an account
            </button>
            <button
              type="button"
              className="text-left text-primary underline"
              onClick={() => switchMode("reset")}
            >
              Forgot your password?
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default LoginPage;
