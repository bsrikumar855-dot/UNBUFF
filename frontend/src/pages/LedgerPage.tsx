import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, EyeOff } from "lucide-react";
import type { ClaimInput, RoleSkill } from "@/types/contract";
import { api } from "@/api/endpoints";
import { useSessionState } from "@/state/useSession";
import { ClaimRow } from "@/components/ledger/ClaimRow";
import { FlowShell } from "@/components/common/FlowShell";
import { ErrorState } from "@/components/ui/ErrorState";
import { GlassCard } from "@/components/ui/GlassCard";
import { buttonClasses } from "@/lib/buttonClasses";
import { routes } from "@/lib/routes";

/** Claim Ledger: the student edits/deletes extracted claims, then confirms the full list. */
export const LedgerPage: React.FC = () => {
  const { state, dispatch } = useSessionState();
  const navigate = useNavigate();
  const [rows, setRows] = useState<ClaimInput[]>(() =>
    state.claims.map(({ id, text, resume_line, skill_id }) => ({
      id,
      text,
      resume_line,
      skill_id,
    }))
  );
  const [skills, setSkills] = useState<RoleSkill[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!state.roleId) return;
    api
      .getRole(state.roleId)
      .then((r) => setSkills(r.skills))
      .catch(setError);
  }, [state.roleId]);

  if (!state.sessionId) {
    return (
      <FlowShell
        current={2}
        eyebrow="Evidence"
        title={
          <>
            Claim <em>ledger</em>
          </>
        }
      >
        <p className="mb-4 text-ink-secondary">
          No session yet. Start by adding your resume.
        </p>
        <Link to={routes.setup} className={buttonClasses("primary", "md", "rounded-full")}>
          Go to setup
        </Link>
      </FlowShell>
    );
  }
  const sessionId = state.sessionId;
  const canStart =
    rows.length > 0 && rows.every((r) => r.text.trim().length > 0) && !busy;

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.confirmClaims({ session_id: sessionId, claims: rows });
      dispatch({
        type: "UPDATE_CLAIMS",
        payload: {
          claims: res.claims,
          blindSpots: res.blind_spots,
          progress: res.progress,
        },
      });
      navigate(routes.workspace(sessionId));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <FlowShell
      current={2}
      eyebrow="Evidence"
      title={
        <>
          Claim <em>ledger</em>
        </>
      }
      description="Check what we extracted. Edit wording, fix the skill, or delete anything you don’t want probed."
    >

      {state.blindSpots.length > 0 && (
        <GlassCard
          id="blind"
          icon={EyeOff}
          title="Required by the role but never claimed"
          sub="Skills the role needs that your resume does not mention."
          className="mb-5"
        >
          <ul className="flex flex-wrap gap-2">
            {state.blindSpots.map((b) => (
              <li
                key={b.skill_id}
                className="inline-flex items-center gap-1.5 rounded-full bg-skill-blind_spot-bg px-3 py-1 text-xs font-medium text-skill-blind_spot-fg"
              >
                <EyeOff size={14} aria-hidden="true" />
                Blind spot: {b.name}
              </li>
            ))}
          </ul>
        </GlassCard>
      )}

      <ul className="mb-6 grid gap-3" aria-label="Claims">
        {rows.map((row, i) => (
          <ClaimRow
            key={row.id ?? `new-${i}`}
            index={i}
            claim={row}
            skills={skills}
            onChange={(next) => setRows((rs) => rs.map((r, j) => (j === i ? next : r)))}
            onDelete={() => setRows((rs) => rs.filter((_, j) => j !== i))}
          />
        ))}
      </ul>
      {rows.length === 0 && (
        <p className="mb-4 text-ink-muted">Keep at least one claim to continue.</p>
      )}

      {error !== null && <ErrorState error={error} onRetry={confirm} className="mb-4" />}
      <button
        type="button"
        onClick={confirm}
        disabled={!canStart}
        aria-busy={busy}
        className={buttonClasses("primary", "md", "rounded-full bg-redline px-6 text-surface-50 hover:bg-redline-dark")}
      >
        {busy ? "Saving your claims…" : "Start interrogation"}
        {!busy && <ArrowRight aria-hidden="true" />}
      </button>
    </FlowShell>
  );
};
