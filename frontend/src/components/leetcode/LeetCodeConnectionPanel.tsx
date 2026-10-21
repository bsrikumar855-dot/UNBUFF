import React, { useCallback, useEffect, useId, useState } from "react";
import { Link } from "react-router-dom";
import { Link2 } from "lucide-react";
import { api } from "@/api/endpoints";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/ErrorState";
import { CardHead, GLASS, TILE } from "@/components/ui/GlassCard";
import { LoadingState } from "@/components/ui/LoadingState";
import {
  FRESHNESS_LABEL,
  SOURCE_LABEL,
  checkProfileInput,
  formatWhen,
  stateRows,
} from "@/lib/leetcode";
import { cn } from "@/lib/cn";
import { routes } from "@/lib/routes";
import type { LeetCodeConnection } from "@/types/contract";

export interface LeetCodeConnectionPanelProps {
  /** Called whenever the connection changes (linked, unlinked, data deleted), so a page can refresh what it shows. */
  onChanged?: (c: LeetCodeConnection) => void;
  /** On the Settings page the panel points to the LeetCode page for importing and insights. */
  showInsightsLink?: boolean;
  /** A connection the page already has, to avoid a second request. The panel still re-reads after each change. */
  initial?: LeetCodeConnection | null;
}

/**
 * Link a LeetCode username and see exactly what that does and does not mean. There is no sign-in with LeetCode:
 * LeetCode offers no official API or OAuth and forbids scraping, so UNBLUFF never contacts it. The five states are
 * always shown, and none of them is ever worded as "connected".
 */
export const LeetCodeConnectionPanel: React.FC<LeetCodeConnectionPanelProps> = ({
  onChanged,
  showInsightsLink = false,
  initial = null,
}) => {
  const inputId = useId();
  const [conn, setConn] = useState<LeetCodeConnection | null>(initial);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const [busy, setBusy] = useState<"link" | "unlink" | "lookup" | null>(null);
  const [lookupAvailable, setLookupAvailable] = useState(false);
  const [text, setText] = useState("");
  const [touched, setTouched] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    api
      .getLeetCodeConnection()
      .then((r) => {
        if (cancelled) return;
        setConn(r.connection);
        setText((t) => (t === "" ? (r.connection.username ?? "") : t));
      })
      .catch((e: unknown) => !cancelled && setLoadError(e));
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  // Optional: the operator may enable looking numbers up by username. Any failure here just means "not available".
  useEffect(() => {
    let cancelled = false;
    Promise.resolve()
      .then(() => api.getLeetCodeLookup())
      .then((r) => !cancelled && setLookupAvailable(r.available === true))
      .catch(() => !cancelled && setLookupAvailable(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const check = checkProfileInput(text);
  const unchanged =
    conn?.linked &&
    check.state === "valid" &&
    check.username.toLowerCase() === conn.username?.toLowerCase();

  /** Fetches the linked username's public numbers. Returns the refreshed connection, or null after showing why not. */
  const fetchNumbers = useCallback(
    async (prefix = ""): Promise<LeetCodeConnection | null> => {
      try {
        const r = await api.lookupLeetCode();
        const s = r.snapshot;
        setConn(r.connection);
        setNote(
          `${prefix}${r.status === "imported" ? "Saved" : "Already up to date:"} ${s.solved} solved` +
            (s.easy !== null ? ` (easy ${s.easy}, medium ${s.medium}, hard ${s.hard})` : "") +
            ", looked up from your public LeetCode profile. It is not verified as yours."
        );
        return r.connection;
      } catch (err) {
        setActionError(err);
        return null;
      }
    },
    []
  );

  const link = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setTouched(true);
      if (check.state !== "valid") return;
      setBusy("link");
      setActionError(null);
      try {
        const r = await api.linkLeetCode(text);
        setConn(r.connection);
        setText(r.connection.username ?? text);
        if (lookupAvailable) {
          setNote("Profile found and linked. Fetching your numbers…");
          const after = await fetchNumbers("Profile found and linked. ");
          onChanged?.(after ?? r.connection);
        } else {
          setNote(
            "Profile link saved. This does not prove the profile is yours and it does not import any numbers."
          );
          onChanged?.(r.connection);
        }
      } catch (err) {
        setActionError(err);
      } finally {
        setBusy(null);
      }
    },
    [check.state, text, onChanged, lookupAvailable, fetchNumbers]
  );

  const refresh = async () => {
    setBusy("lookup");
    setActionError(null);
    setNote(null);
    const after = await fetchNumbers();
    if (after) onChanged?.(after);
    setBusy(null);
  };

  const unlink = async (mode: "link" | "all") => {
    setBusy("unlink");
    setActionError(null);
    try {
      const r = await api.unlinkLeetCode(mode);
      setConn(r.connection);
      setText("");
      setTouched(false);
      setConfirming(false);
      setNote(
        mode === "all"
          ? `Link removed and ${r.deleted_snapshots} imported snapshot${r.deleted_snapshots === 1 ? "" : "s"} deleted.`
          : "Link removed. The numbers you imported were kept, still labelled as supplied by you."
      );
      onChanged?.(r.connection);
    } catch (err) {
      setActionError(err);
    } finally {
      setBusy(null);
    }
  };

  if (loadError !== null)
    return <ErrorState error={loadError} onRetry={() => setAttempt((a) => a + 1)} />;
  if (conn === null) return <LoadingState message="Checking your LeetCode link…" />;

  const imp = conn.imported;
  return (
    <section
      aria-labelledby="leetcode-conn-heading"
      className={cn(GLASS, "p-5 sm:p-7")}
    >
      <CardHead
        icon={Link2}
        id="leetcode-conn-heading"
        title="Link your public profile"
        sub="Connect your public LeetCode profile using only your username."
        className="mb-4"
      />
      {lookupAvailable ? (
        <p className="mt-2 text-sm text-ink-primary">
          <strong>This is not an official connection.</strong> LeetCode has no official
          sign-in or API for apps like this. Type your public username and UNBLUFF looks up
          your solved counts from LeetCode&apos;s public profile data when you ask. Nothing
          proves the profile is yours, and you can still type your own numbers instead.
        </p>
      ) : (
        <p className="mt-2 text-sm text-ink-primary">
          <strong>This is not a live connection.</strong> LeetCode has no official sign-in
          or API for apps like this and its terms forbid scraping, so UNBLUFF never contacts
          LeetCode. You link your public username and import numbers you supply yourself.
        </p>
      )}

      <ul
        aria-label="What is and is not true about this link"
        className="mt-4 grid gap-2.5 text-sm sm:grid-cols-2"
      >
        {stateRows(conn, lookupAvailable).map((r) => (
          <li
            key={r.key}
            className={cn(TILE, "flex gap-3 px-3.5 py-3")}
            data-state={r.key}
            data-on={r.on}
          >
            <span
              aria-hidden="true"
              className={cn(
                "mt-1.5 size-2.5 shrink-0 rounded-full",
                r.on && r.key === "unverified"
                  ? "bg-amber-500"
                  : r.on && (r.key === "linked" || r.key === "imported")
                    ? "bg-verified"
                    : "bg-ink-muted/50"
              )}
            />
            <span>
              <span className="font-medium text-ink-primary">{r.label}</span>
              <span className="block text-xs leading-snug text-ink-muted">
                {r.detail}
              </span>
            </span>
          </li>
        ))}
      </ul>

      {conn.linked && conn.profile_url && (
        <p className="mt-4 text-sm text-ink-primary">
          Linked username{" "}
          <a
            href={conn.profile_url}
            target="_blank"
            rel="noreferrer"
            className="font-medium underline underline-offset-4 hover:text-redline"
          >
            {conn.username}
          </a>
          <span className="text-ink-muted">
            {" "}
            · unverified · saved {formatWhen(conn.linked_at)}
          </span>
        </p>
      )}

      <form onSubmit={(e) => void link(e)} className="mt-4" noValidate>
        <label htmlFor={inputId} className="text-sm font-medium text-ink-primary">
          LeetCode username or profile address
        </label>
        <div className="mt-1.5 flex flex-wrap items-start gap-2">
          <input
            id={inputId}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={() => setTouched(true)}
            autoComplete="off"
            spellCheck={false}
            maxLength={300}
            placeholder="for example lee215 or https://leetcode.com/u/lee215/"
            aria-describedby={`${inputId}-hint`}
            aria-invalid={touched && check.state === "invalid"}
            className="min-h-11 w-full rounded-xl border border-line-strong bg-white/70 px-3.5 py-2 text-sm text-ink-primary"
          />
          <Button
            type="submit"
            className="rounded-full"
            disabled={busy !== null || check.state !== "valid" || Boolean(unchanged)}
          >
            <Link2 aria-hidden="true" />
            {busy === "link" ? "Saving…" : conn.linked ? "Update link" : "Link profile"}
          </Button>
        </div>
        <p
          id={`${inputId}-hint`}
          aria-live="polite"
          className="mt-1.5 text-xs text-ink-secondary"
        >
          {check.state === "valid" && (
            <>
              Profile address:{" "}
              <span className="break-all font-mono text-ink-primary">{check.url}</span>
            </>
          )}
          {check.state === "invalid" && touched && (
            <span className="text-ink-primary">{check.message}</span>
          )}
          {check.state === "invalid" && !touched && "Checking as you type."}
          {check.state === "empty" && "Only a public username is needed."}
        </p>
        <p className="mt-1 text-xs text-ink-muted">
          Never enter a LeetCode password, cookie or session token anywhere in UNBLUFF. It
          never asks for them.
        </p>
      </form>

      <div className="mt-4 border-t border-black/5 pt-3 text-sm text-ink-secondary">
        {imp.snapshot_count > 0 ? (
          <p>
            <strong className="text-ink-primary">Imported data:</strong>{" "}
            {imp.snapshot_count} snapshot{imp.snapshot_count === 1 ? "" : "s"}. Latest
            numbers captured {formatWhen(imp.last_captured_at)} (
            {FRESHNESS_LABEL[imp.freshness].toLowerCase()}
            {imp.age_days !== null
              ? `, ${imp.age_days} day${imp.age_days === 1 ? "" : "s"} old`
              : ""}
            ), imported {formatWhen(imp.last_imported_at)}
            {imp.last_source && imp.last_source.kind !== "public_lookup"
              ? `, ${SOURCE_LABEL[imp.last_source.kind].toLowerCase()}`
              : ""}
            {imp.last_source?.kind === "public_lookup"
              ? ". Looked up by username, not verified as yours."
              : ". Supplied by you, not synchronised with LeetCode."}
          </p>
        ) : (
          <p>No numbers imported yet. A saved link alone shows no statistics.</p>
        )}
        {showInsightsLink && (
          <p className="mt-1">
            <Link
              to={routes.leetcode}
              className="underline underline-offset-4 hover:text-redline"
            >
              Import numbers and see LeetCode insights
            </Link>
          </p>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {lookupAvailable && conn.linked && !confirming && (
          <Button size="sm" className="rounded-full" onClick={() => void refresh()} disabled={busy !== null}>
            {busy === "lookup" ? "Fetching…" : "Fetch my numbers from LeetCode"}
          </Button>
        )}
        {(conn.linked || imp.snapshot_count > 0) && !confirming && (
          <Button
            variant="ghost"
            size="sm"
            className="rounded-full"
            onClick={() => setConfirming(true)}
            disabled={busy !== null}
          >
            {conn.linked ? "Unlink LeetCode" : "Delete imported numbers"}
          </Button>
        )}
        {confirming && (
          <span
            role="group"
            aria-label="Confirm unlink"
            className="flex flex-wrap items-center gap-2 text-sm"
          >
            <span className="text-ink-secondary">
              {conn.linked
                ? "Remove the link, and…"
                : "Delete every snapshot you imported?"}
            </span>
            {conn.linked && (
              <Button
                size="sm"
                variant="outline"
                className="rounded-full bg-white/70"
                onClick={() => void unlink("link")}
                disabled={busy !== null}
              >
                Keep my imported numbers
              </Button>
            )}
            <Button size="sm" className="rounded-full" onClick={() => void unlink("all")} disabled={busy !== null}>
              {busy === "unlink"
                ? "Removing…"
                : conn.linked
                  ? "Delete them too"
                  : "Yes, delete them"}
            </Button>
            <Button size="sm" variant="ghost" className="rounded-full" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </span>
        )}
      </div>

      {note && (
        <p role="status" className="mt-3 text-sm text-ink-secondary">
          {note}
        </p>
      )}
      {actionError !== null && <ErrorState className="mt-3" error={actionError} />}
    </section>
  );
};
