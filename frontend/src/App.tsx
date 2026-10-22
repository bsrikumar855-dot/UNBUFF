import React, { Suspense, lazy } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "@/auth/AuthContext";
import { RequireAuth } from "@/auth/RequireAuth";
import type { AuthClient } from "@/auth/types";

import { SessionProvider } from "@/state/SessionContext";
import { InterrogationProvider } from "@/state/InterrogationContext";
import { LandingPage } from "@/pages/LandingPage";
import { SetupPage } from "@/pages/SetupPage";
import { LedgerPage } from "@/pages/LedgerPage";
import { DsaArenaPage } from "@/pages/DsaArenaPage";
import { LoginPage } from "@/pages/LoginPage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { ServerWakeGate } from "@/components/common/ServerWakeGate";
import { IntroLoader } from "@/components/common/IntroLoader";
import { LoadingState } from "@/components/ui/LoadingState";
import { AppShell } from "@/components/shell/AppShell";
import { MotionProvider } from "@/components/motion/MotionProvider";
import { Toaster } from "@/components/ui/sonner";

// Heavier screens are code-split.
const WorkspacePage = lazy(() => import("@/pages/WorkspacePage"));
const ReportPage = lazy(() => import("@/pages/ReportPage"));
const RoadmapPage = lazy(() => import("@/pages/RoadmapPage"));
const SessionsPage = lazy(() => import("@/pages/SessionsPage"));
const DsaQuestionsPage = lazy(() => import("@/pages/DsaQuestionsPage"));
const DsaQuestionPage = lazy(() => import("@/pages/DsaQuestionPage"));
const DsaProgressPage = lazy(() => import("@/pages/DsaProgressPage"));
const CodeWorkspacePage = lazy(() => import("@/pages/CodeWorkspacePage"));
const DsaAnalyticsPage = lazy(() => import("@/pages/DsaAnalyticsPage"));
const DsaRevisionPage = lazy(() => import("@/pages/DsaRevisionPage"));
const SettingsPage = lazy(() => import("@/pages/SettingsPage"));
const GithubInsightsPage = lazy(() => import("@/pages/GithubInsightsPage"));
const PlacementPage = lazy(() => import("@/pages/PlacementPage"));
const CareerPage = lazy(() => import("@/pages/CareerPage"));
const LeetCodeInsightsPage = lazy(() => import("@/pages/LeetCodeInsightsPage"));
const ResumeBuilderPage = lazy(() => import("@/pages/ResumeBuilderPage"));
const LearnPatternsPage = lazy(() => import("@/pages/LearnPatternsPage"));
const LearnPatternPage = lazy(() => import("@/pages/LearnPatternPage"));
const LearnDbmsPage = lazy(() => import("@/pages/LearnDbmsPage"));
const LearnDbmsTopicPage = lazy(() => import("@/pages/LearnDbmsTopicPage"));
const MentorPage = lazy(() => import("@/pages/MentorPage"));
const MentorMemoryPage = lazy(() => import("@/pages/MentorMemoryPage"));

export const AppRoutes: React.FC = () => (
  <Suspense
    fallback={
      <LoadingState message="Loading…" className="mx-auto max-w-2xl px-4 py-10" />
    }
  >
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      {/* Public: synthetic demo data only. Must be declared before the protected /report/:sessionId. */}
      <Route path="/report/demo" element={<ReportPage demo />} />
      <Route path="/roadmap" element={<RoadmapPage />} />
      {/* The DSA catalogue is public; progress controls inside it ask for sign-in. */}
      <Route path="/dsa" element={<DsaArenaPage />} />
      <Route path="/dsa/questions" element={<DsaQuestionsPage />} />
      <Route path="/dsa/companies/:companyId" element={<DsaQuestionsPage />} />
      <Route path="/dsa/questions/:questionId" element={<DsaQuestionPage />} />
      {/* Anyone can read the exercise; running, submitting and history require sign-in. */}
      <Route path="/dsa/questions/:questionId/code" element={<CodeWorkspacePage />} />
      {/* The lessons are public; marking progress and taking quizzes ask for sign-in. */}
      <Route path="/learn/patterns" element={<LearnPatternsPage />} />
      <Route path="/learn/patterns/:patternId" element={<LearnPatternPage />} />
      <Route path="/learn/dbms" element={<LearnDbmsPage />} />
      <Route path="/learn/dbms/:topicId" element={<LearnDbmsTopicPage />} />
      <Route element={<RequireAuth />}>
        <Route path="/setup" element={<SetupPage />} />
        <Route path="/ledger" element={<LedgerPage />} />
        <Route path="/ledger/:sessionId" element={<LedgerPage />} />
        <Route path="/workspace/:sessionId" element={<WorkspacePage />} />
        <Route path="/report/:sessionId" element={<ReportPage />} />
        <Route path="/sessions" element={<SessionsPage />} />
        <Route path="/dsa/progress" element={<DsaProgressPage />} />
        <Route path="/dsa/analytics" element={<DsaAnalyticsPage />} />
        <Route path="/dsa/revision" element={<DsaRevisionPage />} />
        <Route path="/mentor" element={<MentorPage />} />
        <Route path="/mentor/memory" element={<MentorMemoryPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/github" element={<GithubInsightsPage />} />
        <Route path="/leetcode" element={<LeetCodeInsightsPage />} />
        <Route path="/resume" element={<ResumeBuilderPage />} />
        <Route path="/placement" element={<PlacementPage />} />
        <Route path="/career" element={<CareerPage />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  </Suspense>
);

export const App: React.FC<{ authClient?: AuthClient }> = ({ authClient }) => (
  <AuthProvider client={authClient}>
    <SessionProvider>
      <InterrogationProvider>
        <BrowserRouter>
          {/* Unit tests mock the API per test, so the wake-up ping only runs in the real app. */}
          {import.meta.env.MODE !== "test" && <ServerWakeGate />}
          <MotionProvider>
            <AppShell>
              <AppRoutes />
            </AppShell>
            <Toaster position="bottom-right" />
            {/* Tests render the app directly and must not wait behind an intro. */}
            {import.meta.env.MODE !== "test" && <IntroLoader />}
          </MotionProvider>
        </BrowserRouter>
      </InterrogationProvider>
    </SessionProvider>
  </AuthProvider>
);
