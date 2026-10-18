import React, { useCallback, useState, useRef } from "react";
import { Link } from "react-router-dom";
import { Database, Map } from "lucide-react";
import type { Report } from "@/types/contract";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { buttonClasses } from "@/lib/buttonClasses";
import { routes } from "@/lib/routes";
import { ClaimEvidence } from "./ClaimEvidence";
import { PracticeSection } from "./PracticeSection";
import { ResumeHeatmap } from "./ResumeHeatmap";
import { ScoreBlock } from "./ScoreBlock";
import { CoverageGrid, PlanList, PriorityList } from "./SkillSections";

interface ReportViewProps {
  report: Report;
  isDemo: boolean;
  onChanged: () => void;
}

/** Pure presentation of a Report. All numbers and states come from the backend. */
export const ReportView: React.FC<ReportViewProps> = ({ report, isDemo, onChanged }) => {
  const [drawer, setDrawer] = useState<{ title: string; claimIds: string[] } | null>(
    null
  );
  const opener = useRef<HTMLElement | null>(null);
  const openDrawer = useCallback((title: string, claimIds: string[]) => {
    opener.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setDrawer({ title, claimIds });
  }, []);
  const closeDrawer = useCallback(() => setDrawer(null), []);
  const drawerClaims = drawer
    ? report.claims.filter((c) => drawer.claimIds.includes(c.id))
    : [];

  return (
    <div className="mx-auto grid max-w-[88rem] gap-8 px-4 py-8 sm:px-8 sm:py-10">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="serif text-title font-medium text-ink-primary">
          Readiness report
        </h1>
        {isDemo && (
          <span className="inline-flex items-center gap-1.5 rounded-sm border border-redline/50 px-2 py-1 font-mono text-[11px] font-medium uppercase tracking-wide text-redline">
            <Database size={14} aria-hidden="true" />
            Demo data
          </span>
        )}
        <span className="text-sm text-ink-muted">
          {report.role.name} · {report.mode === "prepare" ? "Teach me" : "Challenge me"} ·{" "}
          {report.progress.claims_done}/{report.progress.claims_total} claims assessed
        </span>
        <Link
          to={routes.roadmap(isDemo ? null : report.session_id)}
          className={buttonClasses("secondary", "sm", "ml-auto")}
        >
          <Map size={14} aria-hidden="true" />
          View 4-week roadmap
        </Link>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="grid content-start gap-5">
          <ScoreBlock readiness={report.readiness} coverage={report.coverage} />
          <PriorityList priorities={report.priorities} skills={report.skills} />
        </div>
        <ResumeHeatmap
          lines={report.resume_lines}
          claims={report.claims}
          onOpen={openDrawer}
        />
      </div>

      <CoverageGrid skills={report.skills} />
      {report.blind_spots.length > 0 && (
        <p className="text-sm text-ink-secondary">
          <span className="font-semibold">Blind spots</span> (required by the role, never
          claimed): {report.blind_spots.map((b) => b.name).join(", ")}
        </p>
      )}
      <PracticeSection
        claims={report.claims}
        sessionId={isDemo ? null : report.session_id}
        onChanged={onChanged}
      />
      <PlanList plan={report.plan} />

      <Sheet open={drawer !== null} onOpenChange={(o) => !o && closeDrawer()}>
        <SheetContent
          side="right"
          aria-modal="true"
          className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-xl"
          // Radix only knows its own Trigger; this drawer is opened from a resume line, so return focus there.
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            opener.current?.focus();
          }}
        >
          <SheetTitle className="serif border-b border-border px-5 py-4 text-xl font-semibold">
            {drawer ? `Evidence: ${drawer.title}` : ""}
          </SheetTitle>
          <SheetDescription className="sr-only">
            The answers and evidence behind this verdict.
          </SheetDescription>
          <div className="px-5 py-4">
            {drawerClaims.map((c) => (
              <ClaimEvidence key={c.id} claim={c} />
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};
