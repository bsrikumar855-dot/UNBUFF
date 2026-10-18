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
    <div className="mx-auto max-w-3xl p-4 pb-16 pt-8 sm:p-8 sm:pt-12">
      <StepProgress current={1} />

      <h1 className="serif mt-8 text-title font-medium text-ink-primary">
        Prepare your claims
      </h1>
      <p className="mt-3 max-w-xl leading-relaxed text-ink-secondary">
        Choose the role you&rsquo;re targeting and give UNBLUFF the resume you want to
        defend.
      </p>

      <section className="mt-8">
        <h2 className="eyebrow mb-3 border-b border-ink-primary pb-2 text-ink-primary">
          Role
        </h2>
        <RoleSelector value={roleId} onChange={setRoleId} />
      </section>

      <section className="mt-8">
        <h2 className="eyebrow mb-3 border-b border-ink-primary pb-2 text-ink-primary">
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
