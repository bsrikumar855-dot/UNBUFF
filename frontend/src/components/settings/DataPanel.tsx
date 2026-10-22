import React, { useEffect, useId, useState } from "react";
import { Download, ShieldAlert, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { api } from "@/api/endpoints";
import { useAuth } from "@/auth/context";
import { useSignOut } from "@/components/shell/useSignOut";
import { Button } from "@/components/ui/button";
import { GlassCard, TILE } from "@/components/ui/GlassCard";
import { cn } from "@/lib/cn";
import { getErrorMessage } from "@/lib/errors";
import { routes } from "@/lib/routes";
import type { UsageResponse } from "@/types/contract";
import { FIELD } from "./ProfilePanel";

/** Must match the backend (routes/account.ts). The student types it, so deleting is never one click. */
export const DELETE_PHRASE = "DELETE MY DATA";
const LABEL = "mb-1.5 block text-sm font-medium text-ink-secondary";

type Step = "idle" | "verifying" | "deleting-data" | "deleting-account";
const STEP_TEXT: Record<Exclude<Step, "idle">, string> = {
  "verifying": "Checking your password…",
  "deleting-data": "Deleting your data…",
  "deleting-account": "Deleting your sign-in account…",
};

/** Download everything UNBLUFF stores about you, or delete all of it together with the sign-in account. */
export const DataPanel: React.FC = () => {
  const auth = useAuth();
  const signOut = useSignOut();
  const navigate = useNavigate();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [password, setPassword] = useState("");
  const [step, setStep] = useState<Step>("idle");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const ids = { phrase: useId(), password: useId() };
  const [usage, setUsage] = useState<UsageResponse | null>(null);

  useEffect(() => {
    let live = true;
    Promise.resolve()
      .then(() => api.getUsage())
      .then((u) => live && setUsage(u))
      .catch(() => undefined); // informational only
    return () => {
      live = false;
    };
  }, []);

  const download = async () => {
    setExporting(true);
    setExportError(null);
    try {
      const data = await api.exportAccount();
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `unbluff-export-${data.exported_at.slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(getErrorMessage(err));
    } finally {
      setExporting(false);
    }
  };

  const canDelete = phrase === DELETE_PHRASE && password.length > 0 && step === "idle";

  /** Password first (nothing is touched if it's wrong), then the server data, then the sign-in account. */
  const remove = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canDelete) return;
    setDeleteError(null);
    try {
      setStep("verifying");
      await auth.verifyPassword(password);
      setStep("deleting-data");
      await api.deleteAccountData(DELETE_PHRASE);
      setStep("deleting-account");
      try {
        await auth.deleteAccount();
      } catch (err) {
        // The data is already gone; the sign-in account can be removed by signing in again and repeating this.
        setDeleteError(`Your data is deleted, but the sign-in account could not be removed: ${getErrorMessage(err)}`);
        setStep("idle");
        return;
      }
      await signOut(); // clears local drafts and in-memory state; the account no longer exists
      navigate(routes.home, { replace: true });
      toast("Your account and all your data are deleted.");
    } catch (err) {
      setDeleteError(getErrorMessage(err));
      setStep("idle");
    }
  };

  return (
    <GlassCard id="data" icon={ShieldAlert} title="Your data" sub="Take a copy of everything, or delete all of it.">
      {usage && (
        <div className={cn(TILE, "mb-4 px-4 py-3.5 text-sm")}>
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-medium text-ink-primary">AI allowance today</p>
            <p className="text-ink-secondary">
              {usage.used} of {usage.limit} used · resets{" "}
              {new Date(usage.resets_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>
          <div
            role="meter"
            aria-label="AI allowance used today"
            aria-valuemin={0}
            aria-valuemax={usage.limit}
            aria-valuenow={usage.used}
            className="h-1.5 overflow-hidden rounded-full bg-surface-100"
          >
            <div className="h-full rounded-full bg-redline" style={{ width: `${Math.min(100, (usage.used / usage.limit) * 100)}%` }} />
          </div>
        </div>
      )}
      <div className={cn(TILE, "mb-4 flex flex-wrap items-center justify-between gap-3 px-4 py-3.5")}>
        <div className="text-sm">
          <p className="font-medium text-ink-primary">Download my data</p>
          <p className="text-ink-secondary">
            One JSON file with your profile, audits, answers, practice, mentor memory, plans and connections. Access tokens are never included.
          </p>
        </div>
        <Button variant="outline" className="rounded-full bg-white/70" onClick={() => void download()} disabled={exporting}>
          <Download aria-hidden="true" />
          {exporting ? "Preparing…" : "Download JSON"}
        </Button>
      </div>
      {exportError && (
        <p role="alert" className="mb-4 rounded-2xl bg-verdict-bluff-bg px-4 py-2.5 text-sm text-verdict-bluff-fg">
          {exportError}
        </p>
      )}

      <div className="rounded-2xl bg-redline-soft/40 px-4 py-3.5 shadow-[inset_0_0_0_1px_rgba(179,41,26,0.18)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm">
            <p className="font-medium text-ink-primary">Delete my account and all data</p>
            <p className="text-ink-secondary">
              Permanently removes every session, answer, report, plan, memory and connection, then your sign-in account. This cannot be undone.
            </p>
          </div>
          {!open && (
            <Button variant="outline" className="rounded-full bg-white/70" onClick={() => setOpen(true)}>
              <Trash2 aria-hidden="true" />
              Delete everything…
            </Button>
          )}
        </div>
        {open && (
          <form onSubmit={remove} className="mt-4 grid gap-4 sm:grid-cols-2" noValidate>
            <div>
              <label htmlFor={ids.phrase} className={LABEL}>
                Type <span className="font-mono text-ink-primary">{DELETE_PHRASE}</span> to confirm
              </label>
              <input id={ids.phrase} className={FIELD} value={phrase} onChange={(e) => setPhrase(e.target.value)} autoComplete="off" spellCheck={false} />
            </div>
            <div>
              <label htmlFor={ids.password} className={LABEL}>
                Your password
              </label>
              <input id={ids.password} type="password" className={FIELD} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
              <Button type="submit" className="rounded-full bg-redline text-surface-50 hover:bg-redline-dark" disabled={!canDelete}>
                {step === "idle" ? "Permanently delete" : STEP_TEXT[step]}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="rounded-full"
                disabled={step !== "idle"}
                onClick={() => {
                  setOpen(false);
                  setPhrase("");
                  setPassword("");
                  setDeleteError(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}
        {deleteError && (
          <p role="alert" className="mt-4 rounded-2xl bg-verdict-bluff-bg px-4 py-2.5 text-sm text-verdict-bluff-fg">
            {deleteError}
          </p>
        )}
      </div>
    </GlassCard>
  );
};
