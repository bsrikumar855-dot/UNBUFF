import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MailCheck } from "lucide-react";
import { useSignOut } from "@/components/shell/useSignOut";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/GlassCard";
import { buttonClasses } from "@/lib/buttonClasses";
import { getErrorMessage } from "@/lib/errors";
import { routes } from "@/lib/routes";
import { useAuth } from "./context";

const RESEND_COOLDOWN_S = 60;

/**
 * Shown instead of a private page until the student verifies their email address (the backend refuses student features
 * until then). The link is sent at sign-up; this screen can resend it and re-check once it has been followed.
 */
export const VerifyEmailGate: React.FC = () => {
  const auth = useAuth();
  const signOut = useSignOut();
  const [busy, setBusy] = useState<null | "send" | "check">(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const resend = async () => {
    setBusy("send");
    setMessage(null);
    try {
      await auth.sendVerificationEmail();
      setCooldown(RESEND_COOLDOWN_S);
      setMessage({ kind: "ok", text: `We sent a new link to ${auth.user?.email ?? "your email"}.` });
    } catch (err) {
      setMessage({ kind: "error", text: getErrorMessage(err) });
    } finally {
      setBusy(null);
    }
  };

  const check = async () => {
    setBusy("check");
    setMessage(null);
    try {
      await auth.refreshUser(); // a verified address lets this gate go away on its own
      setMessage({ kind: "error", text: "Not verified yet. Open the link in the email, then try again." });
    } catch (err) {
      setMessage({ kind: "error", text: getErrorMessage(err) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-10">
      <GlassCard id="verify-email" icon={MailCheck} title="Verify your email" sub="One step before your audits, practice and mentor.">
        <p className="mb-4 text-sm text-ink-secondary">
          We sent a verification link to <span className="font-medium text-ink-primary">{auth.user?.email}</span>. Open it,
          then come back and continue. Check your spam folder if it isn't there.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button className="rounded-full" onClick={() => void check()} disabled={busy !== null}>
            {busy === "check" ? "Checking…" : "I've verified, continue"}
          </Button>
          <Button variant="outline" className="rounded-full bg-white/70" onClick={() => void resend()} disabled={busy !== null || cooldown > 0}>
            {busy === "send" ? "Sending…" : cooldown > 0 ? `Resend in ${cooldown}s` : "Resend the link"}
          </Button>
          <Button variant="ghost" className="rounded-full" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
        {message && (
          <p role={message.kind === "error" ? "alert" : "status"} className="mt-4 text-sm text-ink-secondary">
            {message.text}
          </p>
        )}
        <p className="mt-5 text-xs text-ink-muted">
          Used the wrong address?{" "}
          <Link to={routes.settings} className={buttonClasses("link", "sm", "h-auto p-0 text-xs")}>
            Settings
          </Link>{" "}
          lets you download or delete this account.
        </p>
      </GlassCard>
    </div>
  );
};
