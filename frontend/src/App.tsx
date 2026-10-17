import React, { Suspense, lazy } from "react";
import { BrowserRouter, Link, NavLink, Route, Routes } from "react-router-dom";
import { SessionProvider } from "@/state/SessionContext";
import { InterrogationProvider } from "@/state/InterrogationContext";
import { useSessionState } from "@/state/useSession";
import { LandingPage } from "@/pages/LandingPage";
import { SetupPage } from "@/pages/SetupPage";
import { LedgerPage } from "@/pages/LedgerPage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { DemoReportButton } from "@/components/common/DemoReportButton";
import { ServerWakeGate } from "@/components/common/ServerWakeGate";
import { LoadingState } from "@/components/ui/LoadingState";
import { buttonClasses } from "@/lib/buttonClasses";
import { cn } from "@/lib/cn";
import { routes } from "@/lib/routes";

// Heavier screens are code-split.
const WorkspacePage = lazy(() => import("@/pages/WorkspacePage"));
const ReportPage = lazy(() => import("@/pages/ReportPage"));
const RoadmapPage = lazy(() => import("@/pages/RoadmapPage"));

const navClass = ({ isActive }: { isActive: boolean }) =>
  cn("shrink-0 font-medium text-ink-muted transition-colors hover:text-ink-primary", isActive && "text-primary");

/** Session-scoped links appear once a session exists; the CTAs are always there. */
const AppNav: React.FC = () => {
  const { state } = useSessionState();
  const sid = state.sessionId;
  return (
    <nav aria-label="Primary" className="flex flex-wrap items-center gap-3 text-sm sm:gap-4">
      {sid && (
        <>
          <NavLink to={routes.ledger} className={navClass}>
            Ledger
          </NavLink>
          <NavLink to={routes.workspace(sid)} className={navClass}>
            Workspace
          </NavLink>
          <NavLink to={routes.report(sid)} className={navClass}>
            Report
          </NavLink>
        </>
      )}
      <NavLink to={routes.roadmap(sid)} className={navClass}>
        Roadmap
      </NavLink>
      <DemoReportButton variant="ghost" size="sm" />
      <Link to={routes.setup} className={buttonClasses("primary", "sm")}>
        Audit My Readiness
      </Link>
    </nav>
  );
};

export const AppRoutes: React.FC = () => (
  <Suspense fallback={<LoadingState message="Loading…" className="mx-auto max-w-2xl px-4 py-10" />}>
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/setup" element={<SetupPage />} />
      <Route path="/ledger" element={<LedgerPage />} />
      <Route path="/workspace/:sessionId" element={<WorkspacePage />} />
      <Route path="/report/:sessionId" element={<ReportPage />} />
      <Route path="/roadmap" element={<RoadmapPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  </Suspense>
);

export const App: React.FC = () => (
  <SessionProvider>
    <InterrogationProvider>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <div className="flex min-h-screen flex-col bg-surface-50 text-ink-primary">
          {/* Unit tests mock the API per test, so the wake-up ping only runs in the real app. */}
          {import.meta.env.MODE !== "test" && <ServerWakeGate />}
          <header className="border-b border-line bg-white px-4 py-4 sm:px-6">
            <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Link
                to={routes.home}
                className="flex shrink-0 items-center gap-2 text-lg font-bold tracking-tight text-ink-primary"
              >
                <span className="inline-block h-2 w-2 rounded-full bg-primary" aria-hidden="true" />
                UNBLUFF
              </Link>
              <AppNav />
            </div>
          </header>
          <main className="flex-1">
            <AppRoutes />
          </main>
          <footer className="border-t border-line px-6 py-4 text-center text-xs text-ink-subtle">
            UNBLUFF &copy; 2026 — Evidence-Driven Candidate Evaluation
          </footer>
        </div>
      </BrowserRouter>
    </InterrogationProvider>
  </SessionProvider>
);
