import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/api/endpoints";
import { routes } from "@/lib/routes";

/**
 * Drives the "View Demo Report" flow through the existing API client and
 * router — no duplicated fetch logic, no second report data model. The
 * fetched Report travels to /report/:sessionId as router state; ReportPage
 * reads it if present and falls back to its placeholder otherwise (a direct
 * visit or refresh has no state, which the contract says is fine for demo).
 */
export function useDemoReport() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const viewDemoReport = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const report = await api.getDemoReport();
      // `isDemo` is local navigation-state metadata this hook attaches based
      // on which endpoint it called — it is not part of the Report contract
      // type (CONTRACT.md's Report has no such field) and is never invented
      // as API data.
      navigate(routes.demoReport, { state: { report } });
    } catch (err) {
      setError(err);
    } finally {
      setIsLoading(false);
    }
  }, [navigate]);

  return { isLoading, error, viewDemoReport };
}
