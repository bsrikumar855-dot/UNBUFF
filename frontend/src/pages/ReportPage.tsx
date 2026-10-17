import React, { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import type { Report } from "@/types/contract";
import { api } from "@/api/endpoints";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { ReportView } from "@/components/report/ReportView";
import { buttonClasses } from "@/lib/buttonClasses";
import { DEMO_SESSION, routes } from "@/lib/routes";

/**
 * /report/:sessionId: fetches the report once per visit (and again after an action that changes
 * it, e.g. opening a fix task). /report/demo loads the contract's demo report.
 */
const ReportPage: React.FC = () => {
  const { sessionId = "" } = useParams<{ sessionId: string }>();
  const isDemo = sessionId === DEMO_SESSION;
  // The "View Demo Report" button already fetched it; reuse that instead of fetching twice.
  const handedOver = (useLocation().state as { report?: Report } | null)?.report ?? null;
  const [report, setReport] = useState<Report | null>(isDemo ? handedOver : null);
  const [error, setError] = useState<unknown>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (isDemo && handedOver && version === 0) return;
    let cancelled = false;
    setError(null);
    (isDemo ? api.getDemoReport() : api.getReport(sessionId))
      .then((r) => !cancelled && setReport(r))
      .catch((err: unknown) => !cancelled && setError(err));
    return () => {
      cancelled = true;
    };
  }, [sessionId, isDemo, version, handedOver]);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  if (error !== null && !report) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="mb-4 text-2xl font-bold text-ink-primary">Readiness report</h1>
        <ErrorState error={error} onRetry={refresh} />
        <Link to={routes.setup} className={buttonClasses("secondary", "md", "mt-4")}>
          Start a new audit
        </Link>
      </div>
    );
  }
  if (!report) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="mb-4 text-2xl font-bold text-ink-primary">Readiness report</h1>
        <LoadingState message="Building your report…" />
      </div>
    );
  }
  return <ReportView report={report} isDemo={isDemo} onChanged={refresh} />;
};

export default ReportPage;
