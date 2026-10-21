import React, { useCallback, useEffect, useRef, useState } from "react";
import { Check, Github, Lock, RefreshCw, Sparkles } from "lucide-react";
import { api } from "@/api/endpoints";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/ErrorState";
import { GLASS } from "@/components/ui/GlassCard";
import { LoadingState } from "@/components/ui/LoadingState";
import {
  FRESHNESS_LABEL,
  formatWhen,
  isGithubAuthorizeUrl,
  syncMessage,
} from "@/lib/github";
import { cn } from "@/lib/cn";
import type { GithubConnection } from "@/types/contract";

export interface GithubConnectionPanelProps {
  /** Start a synchronisation once as soon as the connection is known (used right after returning from GitHub). */
  autoSync?: boolean;
  onSynced?: () => void;
  onDisconnected?: () => void;
}

/**
 * Connect, synchronise and disconnect GitHub. Signing in to UNBLUFF and authorising GitHub are separate: nothing here
 * signs you out. Only public data is read, and the access token never reaches this page.
 */
export const GithubConnectionPanel: React.FC<GithubConnectionPanelProps> = ({
  autoSync = false,
  onSynced,
  onDisconnected,
}) => {
  const [conn, setConn] = useState<GithubConnection | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const [busy, setBusy] = useState<"connect" | "sync" | "disconnect" | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const autoSynced = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    api
      .getGithubConnection()
      .then((c) => !cancelled && setConn(c))
      .catch((e: unknown) => !cancelled && setLoadError(e));
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const sync = useCallback(async () => {
    setBusy("sync");
    setActionError(null);
    try {
      const r = await api.syncGithub();
      setConn(r.connection);
      setNote(syncMessage(r));
      onSynced?.();
    } catch (e) {
      setActionError(e);
      setAttempt((a) => a + 1); // the connection may have changed (for example it now needs reconnecting)
    } finally {
      setBusy(null);
    }
  }, [onSynced]);

  useEffect(() => {
    if (autoSync && conn?.status === "connected" && !autoSynced.current) {
      autoSynced.current = true;
      void sync();
    }
  }, [autoSync, conn, sync]);

  const connect = async () => {
    setBusy("connect");
    setActionError(null);
    try {
      const r = await api.connectGithub();
      if (!isGithubAuthorizeUrl(r.authorize_url))
        throw new Error("unexpected authorization address");
      window.location.assign(r.authorize_url);
    } catch (e) {
      setActionError(e);
      setBusy(null);
    }
  };

  const disconnect = async () => {
    setBusy("disconnect");
    setActionError(null);
    try {
      const r = await api.disconnectGithub();
      setConn(r.connection);
      setConfirming(false);
      setNote(
        r.revoked_at_github
          ? "Disconnected. Your saved GitHub data and the stored access were deleted, and access was revoked on GitHub."
          : "Disconnected and your saved GitHub data was deleted. GitHub could not be reached to revoke access; you can revoke UNBLUFF under Applications in your GitHub settings."
      );
      onDisconnected?.();
    } catch (e) {
      setActionError(e);
    } finally {
      setBusy(null);
    }
  };

  if (loadError !== null)
    return <ErrorState error={loadError} onRetry={() => setAttempt((a) => a + 1)} />;
  if (conn === null) return <LoadingState message="Checking your GitHub connection…" />;

  const waiting = conn.next_sync_allowed_at !== null;
  const pill = "rounded-full";
  return (
    <section aria-labelledby="github-conn-heading" className={cn(GLASS, "p-5 sm:p-7")}>
      {conn.status === "not_configured" && (
        <>
          <h2 id="github-conn-heading" className="serif text-heading font-medium text-ink-primary">
            GitHub
          </h2>
          <p className="mt-2 text-sm text-ink-secondary">
            GitHub connection is not set up on this server, so it cannot be used yet.
            Nothing else in UNBLUFF depends on it.
          </p>
        </>
      )}

      {conn.status === "disconnected" && (
        <div className="grid items-center gap-6 md:grid-cols-[14rem_minmax(0,1fr)]">
          <div className="hidden justify-center md:flex">
            <span
              aria-hidden="true"
              className="relative grid size-40 place-items-center rounded-full bg-redline-soft/60 text-ink-primary shadow-[inset_0_0_0_1px_rgba(179,41,26,0.1)]"
            >
              <Github size={76} strokeWidth={1.4} />
              <Sparkles size={20} className="absolute right-1 top-4 text-redline/70" />
            </span>
          </div>
          <div>
            <h2
              id="github-conn-heading"
              className="serif text-title font-medium text-ink-primary"
            >
              Connect your GitHub account
            </h2>
            <p className="mt-1.5 text-sm text-ink-secondary">
              Connect GitHub to see your contribution history and get project feedback from
              the AI mentor.
            </p>
            <ul className="mt-4 flex flex-col gap-2.5 text-sm text-ink-secondary">
              {[
                "Read-only: UNBLUFF can never change anything on GitHub.",
                "Public data only: no private repositories are requested or shown.",
                "You stay signed in to UNBLUFF; you can disconnect at any time and your saved GitHub data is deleted.",
              ].map((line) => (
                <li key={line} className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className="mt-px grid size-5 shrink-0 place-items-center rounded-full bg-redline-soft text-redline"
                  >
                    <Check size={12} strokeWidth={3} />
                  </span>
                  {line}
                </li>
              ))}
            </ul>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Button
                className={pill}
                onClick={() => void connect()}
                disabled={busy !== null}
              >
                <Github aria-hidden="true" />
                {busy === "connect" ? "Opening GitHub…" : "Connect GitHub"}
              </Button>
              <span className="inline-flex items-center gap-2 rounded-full bg-white/70 px-4 py-2 text-sm text-ink-secondary shadow-[inset_0_0_0_1px_rgba(24,24,27,0.08)]">
                <Lock size={14} aria-hidden="true" />
                Read-only access
              </span>
            </div>
          </div>
        </div>
      )}

      {(conn.status === "connected" || conn.status === "reauthorization_required") && (
        <>
          <div className="flex flex-wrap items-center gap-4">
            <span
              aria-hidden="true"
              className="grid size-12 shrink-0 place-items-center rounded-full bg-white text-ink-primary shadow-[inset_0_0_0_1px_rgba(24,24,27,0.08)]"
            >
              <Github size={24} strokeWidth={1.6} />
            </span>
            <div className="min-w-0 flex-1">
              <h2
                id="github-conn-heading"
                className="serif text-heading font-medium text-ink-primary"
              >
                GitHub connection
              </h2>
              <p className="mt-0.5 text-sm text-ink-primary">
                Connected as{" "}
                <a
                  href={conn.profile_url ?? undefined}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium underline underline-offset-4 hover:text-redline"
                >
                  @{conn.login}
                </a>
                <span className="text-ink-muted">
                  {" "}
                  · public data only · since {formatWhen(conn.connected_at)}
                </span>
              </p>
            </div>
          </div>

          {conn.status === "reauthorization_required" && (
            <div
              role="alert"
              className="mt-4 rounded-2xl bg-redline-soft/60 p-4 text-sm text-ink-primary shadow-[inset_0_0_0_1px_rgba(179,41,26,0.18)]"
            >
              GitHub no longer accepts the saved connection (it may have been revoked).
              Your saved data is still shown with its sync time. Connect again to refresh
              it.
              <div className="mt-2">
                <Button
                  size="sm"
                  className={pill}
                  onClick={() => void connect()}
                  disabled={busy !== null}
                >
                  {busy === "connect" ? "Opening GitHub…" : "Reconnect GitHub"}
                </Button>
              </div>
            </div>
          )}

          <p className="mt-3 text-sm text-ink-secondary">
            Last synchronised: {formatWhen(conn.last_synced_at)} ·{" "}
            <strong>{FRESHNESS_LABEL[conn.freshness]}</strong>
            {conn.sync_in_progress && " · synchronisation running"}
          </p>
          {conn.last_sync_error && conn.status === "connected" && (
            <p role="status" className="mt-1 text-sm text-ink-secondary">
              The last attempt did not fully succeed (
              {conn.last_sync_error.replace("_", " ")}). Saved data is unchanged.
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {conn.status === "connected" && (
              <Button
                variant="outline"
                size="sm"
                className={cn(pill, "bg-white/70")}
                onClick={() => void sync()}
                disabled={busy !== null || conn.sync_in_progress}
                title={
                  waiting
                    ? "A recent sync is being reused to protect GitHub's rate limit"
                    : undefined
                }
              >
                <RefreshCw aria-hidden="true" />
                {busy === "sync" ? "Synchronising…" : "Sync now"}
              </Button>
            )}
            {!confirming ? (
              <Button
                variant="ghost"
                size="sm"
                className={pill}
                onClick={() => setConfirming(true)}
                disabled={busy !== null}
              >
                Disconnect GitHub
              </Button>
            ) : (
              <span
                className="flex flex-wrap items-center gap-2 text-sm"
                role="group"
                aria-label="Confirm disconnect"
              >
                <span className="text-ink-secondary">
                  Delete your saved GitHub data and revoke access?
                </span>
                <Button
                  size="sm"
                  className={pill}
                  onClick={() => void disconnect()}
                  disabled={busy !== null}
                >
                  {busy === "disconnect" ? "Disconnecting…" : "Yes, disconnect"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className={pill}
                  onClick={() => setConfirming(false)}
                >
                  Keep it
                </Button>
              </span>
            )}
          </div>
        </>
      )}

      {note && (
        <p role="status" className="mt-3 text-sm text-ink-secondary">
          {note}
        </p>
      )}
      {actionError !== null && <ErrorState className="mt-3" error={actionError} />}
    </section>
  );
};
