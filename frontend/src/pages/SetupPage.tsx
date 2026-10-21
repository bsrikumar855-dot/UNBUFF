import React, { useState } from "react";
import { ArrowRight, FileText, ShieldCheck } from "lucide-react";
import { FlowShell } from "@/components/common/FlowShell";
import { RoleSelector } from "@/components/setup/RoleSelector";
import { ModeSelector } from "@/components/setup/ModeSelector";
import { ResumeInput } from "@/components/setup/ResumeInput";
import { ErrorState } from "@/components/ui/ErrorState";
import { GLASS } from "@/components/ui/GlassCard";
import { buttonClasses } from "@/lib/buttonClasses";
import { cn } from "@/lib/cn";
import { useExtractClaims } from "@/hooks/useExtractClaims";
import type { SessionMode } from "@/types/contract";

/** A numbered step of the form: a round number, a serif title and a line of purpose. */
const Numbered: React.FC<{
  n: number;
  title: string;
  sub: string;
  children: React.ReactNode;
}> = ({ n, title, sub, children }) => (
  <section className="px-5 py-6 sm:px-7">
    <div className="mb-4 flex items-start gap-4">
      <span
        aria-hidden="true"
        className="grid size-10 shrink-0 place-items-center rounded-full bg-redline-soft text-base font-semibold text-redline"
      >
        {n}
      </span>
      <div>
        <h2 className="serif text-heading font-medium leading-tight text-ink-primary">{title}</h2>
        <p className="mt-0.5 text-sm text-ink-secondary">{sub}</p>
      </div>
    </div>
    <div className="sm:pl-14">{children}</div>
  </section>
);

const NEXT = [
  "Extract key claims from your resume",
  "Identify potential weak areas for your target role",
  "Either teach you (Prepare) or challenge you (Interview Defense)",
  "Let you review, edit and confirm your claims",
];

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
    <FlowShell
      current={1}
      eyebrow="Evidence"
      title={
        <>
          Prepare your <em>claims</em>
        </>
      }
      description="Choose the role you’re targeting and give UNBLUFF the resume you want to defend."
      aside={
        <>
          <section className={cn(GLASS, "p-5")} aria-labelledby="next-title">
            <div className="flex items-start gap-3.5">
              <span
                aria-hidden="true"
                className="grid size-11 shrink-0 place-items-center rounded-full bg-white text-redline shadow-[inset_0_0_0_1px_rgba(24,24,27,0.08)]"
              >
                <FileText size={20} strokeWidth={1.75} />
              </span>
              <div>
                <h2 id="next-title" className="serif text-heading font-medium text-ink-primary">
                  What happens next?
                </h2>
                <p className="mt-0.5 text-sm text-ink-secondary">
                  After you click “Extract My Claims”, UNBLUFF will:
                </p>
              </div>
            </div>
            <ol className="mt-4 flex flex-col gap-3">
              {NEXT.map((line, i) => (
                <li key={line} className="flex items-center gap-3 text-sm text-ink-secondary">
                  <span
                    aria-hidden="true"
                    className="grid size-8 shrink-0 place-items-center rounded-full bg-white/80 text-sm font-semibold text-ink-primary shadow-[inset_0_0_0_1px_rgba(24,24,27,0.08)]"
                  >
                    {i + 1}
                  </span>
                  {line}
                </li>
              ))}
            </ol>
          </section>
          <section className={cn(GLASS, "p-5")} aria-labelledby="private-title">
            <div className="flex items-start gap-3.5">
              <span
                aria-hidden="true"
                className="grid size-11 shrink-0 place-items-center rounded-full bg-white text-redline shadow-[inset_0_0_0_1px_rgba(24,24,27,0.08)]"
              >
                <ShieldCheck size={20} strokeWidth={1.75} />
              </span>
              <div>
                <h2 id="private-title" className="serif text-heading font-medium text-ink-primary">
                  Who can see this
                </h2>
                <p className="mt-1 text-sm leading-relaxed text-ink-secondary">
                  Your resume text is used to extract claims for your session. Only you can
                  open your sessions, and you can delete a session from My sessions.
                </p>
              </div>
            </div>
          </section>
        </>
      }
    >
      <div className={cn(GLASS, "divide-y divide-black/5 overflow-hidden")}>
        <Numbered
          n={1}
          title="Target role"
          sub="This helps UNBLUFF focus on the right expectations and interview angles."
        >
          <RoleSelector value={roleId} onChange={setRoleId} />
        </Numbered>

        <Numbered
          n={2}
          title="Choose your mode"
          sub="Select how you want to use UNBLUFF for this resume."
        >
          <ModeSelector value={mode} onChange={setMode} />
        </Numbered>

        <Numbered
          n={3}
          title="Your resume"
          sub="Upload a PDF or paste your resume text below."
        >
          <ResumeInput value={resumeText} onChange={setResumeText} />
          {error !== null && (
            <ErrorState error={error} onRetry={handleSubmit} className="mt-4" />
          )}
          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit || isLoading}
              aria-busy={isLoading}
              className={buttonClasses(
                "primary",
                "md",
                "rounded-full bg-redline px-6 text-surface-50 hover:bg-redline-dark"
              )}
            >
              {isLoading ? "Extracting your claims…" : "Extract My Claims"}
              {!isLoading && <ArrowRight aria-hidden="true" />}
            </button>
          </div>
        </Numbered>
      </div>
    </FlowShell>
  );
};
