import React, { useCallback, useEffect, useState } from "react";
import { History } from "lucide-react";
import { GlassCard, TILE } from "@/components/ui/GlassCard";
import { Page, PageHeader } from "@/components/ui/Page";
import { Link } from "react-router-dom";
import { api } from "@/api/endpoints";
import type { SessionSummary } from "@/types/contract";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { buttonClasses } from "@/lib/buttonClasses";
import { cn } from "@/lib/cn";
import { routes } from "@/lib/routes";

/** The signed-in student's past sessions, with owner-only deletion of resume-derived data. */
const SessionsPage: React.FC = () => {
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<unknown>(null);

  const load = useCallback(() => {
    setError(null);
    setSessions(null);
    api
      .getSessions()
      .then((r) => setSessions(r.sessions))
      .catch((e: unknown) => setError(e));
  }, []);

  useEffect(load, [load]);

  const remove = async (id: string) => {
    setDeletingId(id);
    setDeleteError(null);
    try {
      await api.deleteSession(id);
      setSessions((prev) => (prev ? prev.filter((s) => s.session_id !== id) : prev));
      setConfirmId(null);
    } catch (e) {
      setDeleteError(e);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Page width="fluid" className="sm:px-5 lg:pl-5 lg:pr-6">
      <PageHeader
        eyebrow="Evidence"
        title={
          <>
            My <em>sessions</em>
          </>
        }
        description="Deleting a session permanently removes your resume text, answers and report for it."
      />

      <GlassCard
        id="sessions"
        icon={History}
        title="Your sessions"
        sub={sessions ? `${sessions.length} session${sessions.length === 1 ? "" : "s"}` : undefined}
      >
        {error !== null && <ErrorState error={error} onRetry={load} />}
        {error === null && sessions === null && (
          <LoadingState message="Loading your sessions…" />
        )}
        {deleteError !== null && <ErrorState error={deleteError} className="mb-4" />}

        {sessions !== null && sessions.length === 0 && (
          <p className="text-sm text-ink-secondary">
            No sessions yet.{" "}
            <Link to={routes.setup} className="text-redline underline">
              Start an audit
            </Link>
            .
          </p>
        )}

        {sessions !== null && sessions.length > 0 && (
          <ul className="flex flex-col gap-2.5">
            {sessions.map((s) => (
              <li
                key={s.session_id}
                className={cn(TILE, "flex flex-wrap items-center justify-between gap-3 px-4 py-3.5")}
              >
                <div className="text-sm">
                  <p className="font-medium text-ink-primary">
                    {s.role_id.replace(/_/g, " ")} · {s.mode}
                  </p>
                  <p className="text-ink-secondary">
                    {new Date(s.created_at).toLocaleString()} · {s.claims_done}/
                    {s.claims_total} claims checked
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    to={routes.report(s.session_id)}
                    className={buttonClasses("secondary", "sm", "rounded-full bg-white/70")}
                  >
                    Open report
                  </Link>
                  {confirmId === s.session_id ? (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-full bg-white/70"
                        disabled={deletingId === s.session_id}
                        onClick={() => void remove(s.session_id)}
                      >
                        {deletingId === s.session_id ? "Deleting…" : "Confirm delete"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="rounded-full"
                        onClick={() => setConfirmId(null)}
                      >
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="rounded-full"
                      onClick={() => setConfirmId(s.session_id)}
                    >
                      Delete
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </GlassCard>
    </Page>
  );
};

export default SessionsPage;
