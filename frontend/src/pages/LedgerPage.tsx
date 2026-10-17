import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { EyeOff } from "lucide-react";
import type { ClaimInput, RoleSkill } from "@/types/contract";
import { api } from "@/api/endpoints";
import { useSessionState } from "@/state/useSession";
import { ClaimRow } from "@/components/ledger/ClaimRow";
import { ErrorState } from "@/components/ui/ErrorState";
import { buttonClasses } from "@/lib/buttonClasses";
import { routes } from "@/lib/routes";

/** Claim Ledger: the student edits/deletes extracted claims, then confirms the full list. */
export const LedgerPage: React.FC = () => {
  const { state, dispatch } = useSessionState();
  const navigate = useNavigate();
  const [rows, setRows] = useState<ClaimInput[]>(() =>
    state.claims.map(({ id, text, resume_line, skill_id }) => ({ id, text, resume_line, skill_id })),
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
      <div className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="mb-3 text-2xl font-bold">Claim ledger</h1>
        <p className="mb-4 text-ink-secondary">No session yet. Start by adding your resume.</p>
        <Link to={routes.setup} className={buttonClasses("primary")}>
          Go to setup
        </Link>
      </div>
    );
  }
  const sessionId = state.sessionId;
  const canStart = rows.length > 0 && rows.every((r) => r.text.trim().length > 0) && !busy;

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.confirmClaims({ session_id: sessionId, claims: rows });
      dispatch({ type: "UPDATE_CLAIMS", payload: { claims: res.claims, blindSpots: res.blind_spots, progress: res.progress } });
      navigate(routes.workspace(sessionId));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-2 text-2xl font-bold text-ink-primary">Claim ledger</h1>
      <p className="mb-6 text-ink-secondary">
        Check what we extracted. Edit wording, fix the skill, or delete anything you don&apos;t want probed.
      </p>

      {state.blindSpots.length > 0 && (
        <section aria-labelledby="blind-heading" className="mb-6">
          <h2 id="blind-heading" className="mb-2 text-sm font-semibold text-ink-muted">
            Required by the role but never claimed
          </h2>
          <ul className="flex flex-wrap gap-2">
            {state.blindSpots.map((b) => (
              <li
                key={b.skill_id}
                className="inline-flex items-center gap-1.5 rounded-sm bg-skill-blind_spot-bg px-2 py-1 text-xs font-medium text-skill-blind_spot-fg"
              >
                <EyeOff size={14} aria-hidden="true" />
                Blind spot: {b.name}
              </li>
            ))}
          </ul>
        </section>
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
      {rows.length === 0 && <p className="mb-4 text-ink-muted">Keep at least one claim to continue.</p>}

      {error !== null && <ErrorState error={error} onRetry={confirm} className="mb-4" />}
      <button type="button" onClick={confirm} disabled={!canStart} aria-busy={busy} className={buttonClasses("primary")}>
        {busy ? "Saving your claims…" : "Start interrogation"}
      </button>
    </div>
  );
};
