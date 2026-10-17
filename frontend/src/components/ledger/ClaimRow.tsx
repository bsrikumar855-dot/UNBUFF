import React from "react";
import { Trash2 } from "lucide-react";
import type { ClaimInput, RoleSkill } from "@/types/contract";

interface ClaimRowProps {
  index: number;
  claim: ClaimInput;
  skills: RoleSkill[];
  onChange: (next: ClaimInput) => void;
  onDelete: () => void;
}

/** One editable claim: text, original resume line (read-only), skill mapping, delete. */
export const ClaimRow: React.FC<ClaimRowProps> = ({ index, claim, skills, onChange, onDelete }) => {
  const textId = `claim-text-${index}`;
  const skillId = `claim-skill-${index}`;
  return (
    <li className="grid gap-2 rounded-lg border border-line bg-white p-4">
      <label htmlFor={textId} className="text-xs font-semibold text-ink-muted">
        Claim {index + 1}
      </label>
      <input
        id={textId}
        value={claim.text}
        maxLength={300}
        onChange={(e) => onChange({ ...claim, text: e.target.value })}
        className="w-full rounded-md border border-line-strong px-3 py-2 text-sm"
      />
      {claim.resume_line && (
        <p className="text-xs italic text-ink-muted">From your resume: {claim.resume_line}</p>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1">
          <label htmlFor={skillId} className="text-xs font-semibold text-ink-muted">
            Skill
          </label>
          <select
            id={skillId}
            value={claim.skill_id ?? ""}
            onChange={(e) => onChange({ ...claim, skill_id: e.target.value || null })}
            className="rounded-md border border-line-strong bg-white px-3 py-2 text-sm"
          >
            {skills.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
            <option value="">Not relevant</option>
          </select>
        </div>
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete claim ${index + 1}: ${claim.text}`}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm text-verdict-bluff-fg hover:bg-verdict-bluff-bg"
        >
          <Trash2 size={16} aria-hidden="true" />
          Delete
        </button>
      </div>
    </li>
  );
};
