import React, { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { Database, Map } from "lucide-react";
import type { Report } from "@/types/contract";
import { Dialog } from "@/components/ui/Dialog";
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
  const [drawer, setDrawer] = useState<{ title: string; claimIds: string[] } | null>(null);
  const openDrawer = useCallback((title: string, claimIds: string[]) => setDrawer({ title, claimIds }), []);
  const closeDrawer = useCallback(() => setDrawer(null), []);
  const drawerClaims = drawer ? report.claims.filter((c) => drawer.claimIds.includes(c.id)) : [];

  return (
    <div className="mx-auto grid max-w-6xl gap-5 px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-ink-primary">Readiness report</h1>
        {isDemo && (
          <span className="inline-flex items-center gap-1.5 rounded-sm bg-primary-soft px-2 py-1 text-xs font-semibold text-primary-dark">
            <Database size={14} aria-hidden="true" />
            Demo data
          </span>
        )}
        <span className="text-sm text-ink-muted">
          {report.role.name} · {report.mode === "prepare" ? "Teach me" : "Challenge me"} ·{" "}
          {report.progress.claims_done}/{report.progress.claims_total} claims assessed
        </span>
        <Link to={routes.roadmap(isDemo ? null : report.session_id)} className={buttonClasses("secondary", "sm", "ml-auto")}>
          <Map size={14} aria-hidden="true" />
          View 4-week roadmap
        </Link>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="grid content-start gap-5">
          <ScoreBlock readiness={report.readiness} coverage={report.coverage} />
          <PriorityList priorities={report.priorities} skills={report.skills} />
        </div>
        <ResumeHeatmap lines={report.resume_lines} claims={report.claims} onOpen={openDrawer} />
      </div>

      <CoverageGrid skills={report.skills} />
      {report.blind_spots.length > 0 && (
        <p className="text-sm text-ink-secondary">
          <span className="font-semibold">Blind spots</span> (required by the role, never claimed):{" "}
          {report.blind_spots.map((b) => b.name).join(", ")}
        </p>
      )}
      <PracticeSection claims={report.claims} sessionId={isDemo ? null : report.session_id} onChanged={onChanged} />
      <PlanList plan={report.plan} />

      <Dialog open={drawer !== null} title={drawer ? `Evidence: ${drawer.title}` : ""} onClose={closeDrawer}>
        {drawerClaims.map((c) => (
          <ClaimEvidence key={c.id} claim={c} />
        ))}
      </Dialog>
    </div>
  );
};
