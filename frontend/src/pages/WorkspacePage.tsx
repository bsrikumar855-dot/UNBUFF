import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { RotateCcw } from "lucide-react";
import type { FixTask, Mode, TurnResponse } from "@/types/contract";
import { api } from "@/api/endpoints";
import { useSessionState } from "@/state/useSession";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { FixTaskCard } from "@/components/common/FixTaskCard";
import { ClaimList } from "@/components/workspace/ClaimList";
import { LevelTracker } from "@/components/workspace/LevelTracker";
import { QuestionPanel } from "@/components/workspace/QuestionPanel";
import { TurnResult } from "@/components/workspace/TurnResult";
import { buttonClasses } from "@/lib/buttonClasses";
import { getErrorMessage } from "@/lib/errors";
import { isWeak } from "@/lib/format";
import { routes } from "@/lib/routes";

type Busy = null | "grading" | "asking" | "teaching";

const BUSY_TEXT: Record<Exclude<Busy, null>, string> = {
  grading: "Checking your answer…",
  asking: "Thinking of a harder question…",
  teaching: "Preparing your fix task…",
};

export const RETEST_BANNER = "Welcome back — a new scenario. Let's see if it stuck.";

/** Interrogation workspace. Every state change comes from a TurnResponse; nothing is scored here. */
const WorkspacePage: React.FC = () => {
  const { sessionId = "" } = useParams<{ sessionId: string }>();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const { state, dispatch } = useSessionState();
  const [turn, setTurn] = useState<TurnResponse | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<unknown>(null);
  const [fixTask, setFixTask] = useState<FixTask | null>(null);
  const started = useRef(false);

  /** Keep the session's claim list and progress in sync with each response. */
  const applyTurn = useCallback(
    (t: TurnResponse) => {
      setTurn(t);
      dispatch({
        type: "UPDATE_CLAIMS",
        payload: {
          claims: state.claims.length
            ? state.claims.map((c) => (c.id === t.claim.id ? t.claim : c))
            : [t.claim],
          progress: t.progress,
        },
      });
    },
    [dispatch, state.claims],
  );

  const call = useCallback(
    async (payload: { claim_id: string; mode?: Mode; answer?: string }, kind: Busy) => {
      setBusy(kind);
      setError(null);
      try {
        const t = await api.interrogate({ session_id: sessionId, ...payload });
        setFixTask(null);
        applyTurn(t);
        if (t.turn === "done" && t.teach_now) {
          setBusy("teaching");
          setFixTask(await api.getFixTask({ session_id: sessionId, claim_id: t.claim.id }));
        }
      } catch (err) {
        setError(err);
      } finally {
        setBusy(null);
      }
    },
    [sessionId, applyTurn],
  );

  const startClaim = useCallback(
    (claimId: string, mode: Mode) => call({ claim_id: claimId, mode }, "asking"),
    [call],
  );

  // First visit / refresh: rehydrate from the report if needed, then start the right claim.
  useEffect(() => {
    if (started.current || !sessionId) return;
    started.current = true;
    const urlClaim = search.get("claim");
    const urlMode = search.get("mode") === "retest" ? "retest" : "assess";
    const go = async () => {
      let progress = state.sessionId === sessionId ? state.progress : null;
      if (!progress || state.claims.length === 0) {
        const report = await api.getReport(sessionId);
        dispatch({
          type: "SET_SESSION",
          payload: {
            sessionId,
            roleId: report.role.id,
            mode: report.mode,
            claims: report.claims,
            progress: report.progress,
          },
        });
        progress = report.progress;
      }
      const claimId = urlClaim ?? progress.next_claim_id;
      if (claimId) await startClaim(claimId, urlClaim ? urlMode : (progress.next_mode ?? "assess"));
    };
    go().catch(setError);
  }, [sessionId, search, state, dispatch, startClaim]);

  const openFixTask = async (claimId: string) => {
    setBusy("teaching");
    setError(null);
    try {
      setFixTask(await api.getFixTask({ session_id: sessionId, claim_id: claimId }));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(null);
    }
  };

  const progress = turn?.progress ?? state.progress;
  const done = turn?.turn === "done";
  const nextId = progress?.next_claim_id ?? null;
  const nextMode = progress?.next_mode ?? null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <h1 className="mb-4 text-2xl font-bold text-ink-primary">Interrogation</h1>
      {progress && (
        <p className="mb-4 text-sm text-ink-muted">
          {progress.claims_done} of {progress.claims_total} claims assessed
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)_14rem]">
        <ClaimList claims={state.claims} activeId={turn?.claim_id ?? null} />

        <section aria-label="Question" className="rounded-lg border border-line bg-white p-5">
          {turn?.mode === "retest" && !done && (
            <p className="mb-4 flex items-center gap-2 rounded-md bg-primary-soft px-3 py-2 text-sm text-primary-dark">
              <RotateCcw size={16} aria-hidden="true" />
              {RETEST_BANNER}
            </p>
          )}
          <div aria-live="polite">
            {turn && !done && turn.question && <QuestionPanel turn={turn} busy={busy !== null} onSubmit={(a) => call({ claim_id: turn.claim_id, answer: a }, "grading")} />}
            {turn && done && <TurnResult turn={turn} />}
          </div>

          {busy && <LoadingState message={BUSY_TEXT[busy]} className="mt-4" />}
          {error !== null && turn && (
            <div role="alert" className="mt-4 rounded-md border border-verdict-bluff-fg/30 bg-verdict-bluff-bg px-3 py-2 text-sm text-verdict-bluff-fg">
              {getErrorMessage(error)}
            </div>
          )}
          {!turn && !busy && error === null && nextId === null && (
            <p className="text-ink-secondary">Every claim is assessed.</p>
          )}

          {done && turn && (
            <div className="mt-5 grid gap-4">
              {fixTask ? (
                <FixTaskCard task={fixTask}>
                  <Button className="mt-4" onClick={() => setFixTask(null)}>
                    Got it, continue →
                  </Button>
                </FixTaskCard>
              ) : (
                isWeak(turn.claim) &&
                !turn.teach_now &&
                turn.claim.retest_status === "none" && (
                  <Button variant="secondary" onClick={() => openFixTask(turn.claim.id)} disabled={busy !== null}>
                    Open fix task (schedules a retest)
                  </Button>
                )
              )}
              {!fixTask && (
                <div className="grid gap-2">
                  {nextMode === "retest" && (
                    <p className="flex items-center gap-2 rounded-md bg-primary-soft px-3 py-2 text-sm text-primary-dark">
                      <RotateCcw size={16} aria-hidden="true" />
                      {RETEST_BANNER}
                    </p>
                  )}
                  {nextId ? (
                    <Button onClick={() => startClaim(nextId, nextMode ?? "assess")} disabled={busy !== null}>
                      {nextMode === "retest" ? "Start retest →" : "Next claim →"}
                    </Button>
                  ) : (
                    <Button onClick={() => navigate(routes.report(sessionId))}>See my report →</Button>
                  )}
                </div>
              )}
            </div>
          )}
          {error !== null && !turn && (
            <div className="mt-4">
              <ErrorState error={error} />
              <Link to={routes.setup} className={buttonClasses("secondary", "sm", "mt-3")}>
                Start over
              </Link>
            </div>
          )}
        </section>

        <LevelTracker current={turn && !done ? turn.level : null} levelsPassed={turn?.claim.levels_passed ?? 0} />
      </div>
    </div>
  );
};

export default WorkspacePage;
