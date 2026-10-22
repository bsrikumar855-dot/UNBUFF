import React, { useId, useState } from "react";
import { KeyRound } from "lucide-react";
import { useAuth } from "@/auth/context";
import { MIN_PASSWORD } from "@/auth/validate";
import { Button } from "@/components/ui/button";
import { GlassCard, TILE } from "@/components/ui/GlassCard";
import { cn } from "@/lib/cn";
import { getErrorMessage } from "@/lib/errors";
import { FIELD } from "./ProfilePanel";

const LABEL = "mb-1.5 block text-sm font-medium text-ink-secondary";

/** The sign-in email, changing the password (the current one is checked first) and a reset link by email. */
export const SecurityPanel: React.FC = () => {
  const auth = useAuth();
  const email = auth.user?.email ?? null;
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState<null | "change" | "reset">(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const ids = { current: useId(), next: useId(), confirm: useId() };

  const problem =
    next.length > 0 && next.length < MIN_PASSWORD
      ? `Use at least ${MIN_PASSWORD} characters.`
      : confirm.length > 0 && confirm !== next
        ? "The new passwords don't match."
        : next.length > 0 && next === current
          ? "Choose a password different from the current one."
          : null;
  const canChange = current.length > 0 && next.length >= MIN_PASSWORD && confirm === next && next !== current;

  const change = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canChange) return;
    setBusy("change");
    setMessage(null);
    try {
      await auth.changePassword(current, next);
      setCurrent("");
      setNext("");
      setConfirm("");
      setMessage({ kind: "ok", text: "Your password is changed." });
    } catch (err) {
      setMessage({ kind: "error", text: getErrorMessage(err) });
    } finally {
      setBusy(null);
    }
  };

  const reset = async () => {
    if (!email) return;
    setBusy("reset");
    setMessage(null);
    try {
      await auth.sendPasswordReset(email);
      setMessage({ kind: "ok", text: `We sent a password reset link to ${email}.` });
    } catch (err) {
      setMessage({ kind: "error", text: getErrorMessage(err) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <GlassCard id="security" icon={KeyRound} title="Sign-in and security" sub="Your sign-in email and password.">
      <p className={cn(TILE, "mb-5 px-4 py-3 text-sm text-ink-secondary")}>
        Signed in as <span className="font-medium text-ink-primary">{email ?? "—"}</span>
      </p>
      <form onSubmit={change} className="grid gap-4 sm:grid-cols-3" noValidate>
        <div>
          <label htmlFor={ids.current} className={LABEL}>
            Current password
          </label>
          <input id={ids.current} type="password" className={FIELD} value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
        </div>
        <div>
          <label htmlFor={ids.next} className={LABEL}>
            New password
          </label>
          <input id={ids.next} type="password" className={FIELD} value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" aria-describedby={problem ? `${ids.next}-err` : undefined} />
        </div>
        <div>
          <label htmlFor={ids.confirm} className={LABEL}>
            Confirm new password
          </label>
          <input id={ids.confirm} type="password" className={FIELD} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
        </div>
        {problem && (
          <p id={`${ids.next}-err`} className="text-xs text-verdict-bluff-fg sm:col-span-3">
            {problem}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2 sm:col-span-3">
          <Button type="submit" className="rounded-full" disabled={!canChange || busy !== null}>
            {busy === "change" ? "Changing…" : "Change password"}
          </Button>
          <Button type="button" variant="outline" className="rounded-full bg-white/70" disabled={!email || busy !== null} onClick={() => void reset()}>
            {busy === "reset" ? "Sending…" : "Email me a reset link"}
          </Button>
        </div>
      </form>
      {message && (
        <p
          role={message.kind === "error" ? "alert" : "status"}
          className={cn(
            "mt-4 rounded-2xl px-4 py-2.5 text-sm",
            message.kind === "error" ? "bg-verdict-bluff-bg text-verdict-bluff-fg" : cn(TILE, "text-ink-primary")
          )}
        >
          {message.text}
        </p>
      )}
    </GlassCard>
  );
};
