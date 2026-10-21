import type { Mode } from "@/types/contract";

/** The demo report lives at /report/demo and is served by GET /api/demo/report. */
export const DEMO_SESSION = "demo";

export const routes = {
  home: "/",
  setup: "/setup",
  ledger: "/ledger",
  login: "/login",
  sessions: "/sessions",
  dsa: "/dsa",
  dsaQuestions: "/dsa/questions",
  dsaProgress: "/dsa/progress",
  dsaAnalytics: "/dsa/analytics",
  dsaRevision: "/dsa/revision",
  mentor: (questionId?: string) => (questionId ? `/mentor?question=${encodeURIComponent(questionId)}` : "/mentor"),
  mentorMemory: "/mentor/memory",
  settings: "/settings",
  placement: "/placement",
  career: "/career",
  github: "/github",
  leetcode: "/leetcode",
  resume: "/resume",
  learnPatterns: "/learn/patterns",
  learnPattern: (id: string) => `/learn/patterns/${encodeURIComponent(id)}`,
  learnDbms: "/learn/dbms",
  learnDbmsTopic: (id: string) => `/learn/dbms/${encodeURIComponent(id)}`,
  dsaCode: (questionId: string) => `/dsa/questions/${encodeURIComponent(questionId)}/code`,
  dsaCompany: (companyId: string) => `/dsa/companies/${encodeURIComponent(companyId)}`,
  dsaQuestion: (questionId: string) => `/dsa/questions/${encodeURIComponent(questionId)}`,
  report: (sessionId: string) => `/report/${encodeURIComponent(sessionId)}`,
  demoReport: `/report/${DEMO_SESSION}`,
  roadmap: (sessionId?: string | null) => (sessionId ? `/roadmap?session=${encodeURIComponent(sessionId)}` : "/roadmap"),
  workspace: (sessionId: string, claimId?: string, mode?: Mode) => {
    const base = `/workspace/${encodeURIComponent(sessionId)}`;
    if (!claimId) return base;
    const q = new URLSearchParams({ claim: claimId, ...(mode ? { mode } : {}) });
    return `${base}?${q.toString()}`;
  },
};
