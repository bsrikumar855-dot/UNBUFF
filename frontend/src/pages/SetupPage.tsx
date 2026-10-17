import React, { useState } from "react";
import { StepProgress } from "@/components/common/StepProgress";
import { RoleSelector } from "@/components/setup/RoleSelector";
import { ModeSelector } from "@/components/setup/ModeSelector";
import { ResumeInput } from "@/components/setup/ResumeInput";
import { ErrorState } from "@/components/ui/ErrorState";
import { buttonClasses } from "@/lib/buttonClasses";
import { useExtractClaims } from "@/hooks/useExtractClaims";
import type { SessionMode } from "@/types/contract";

export const SetupPage: React.FC = () => {
  const [roleId, setRoleId] = useState<string | null>(null);
  const [mode, setMode] = useState<SessionMode | null>(null);
  const [resumeText, setResumeText] = useState("");
  const { isLoading, error, extract } = useExtractClaims();

  const canSubmit = Boolean(roleId) && Boolean(mode) && resumeText.trim().length > 0;

  function handleSubmit() {
    if (!canSubmit || !roleId || !mode) return;
    void extract({ role_id: roleId, mode, resume_text: resumeText });
  }

  return (
    <div className="mx-auto max-w-2xl p-4 pb-16 pt-8 sm:p-8">
      <StepProgress current={1} />

      <h1 className="mt-6 text-2xl font-bold tracking-tight text-ink-primary sm:text-3xl">
        Prepare your claims
      </h1>
      <p className="mt-2 text-ink-secondary">
        Choose the role you&rsquo;re targeting and give UNBLUFF the resume you want to
        defend.
      </p>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-subtle">
          Role
        </h2>
        <RoleSelector value={roleId} onChange={setRoleId} />
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-subtle">
          Mode
        </h2>
        <ModeSelector value={mode} onChange={setMode} />
      </section>

      <section className="mt-8">
        <ResumeInput value={resumeText} onChange={setResumeText} />
      </section>

      {error !== null && (
        <ErrorState error={error} onRetry={handleSubmit} className="mt-6" />
      )}

      <div className="mt-8 flex justify-end">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit || isLoading}
          aria-busy={isLoading}
          className={buttonClasses("primary", "md")}
        >
          {isLoading ? "Extracting your claims…" : "Extract My Claims"}
        </button>
      </div>
    </div>
  );
};
