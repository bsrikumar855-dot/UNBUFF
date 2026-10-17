import type { Mode } from "@/types/contract";

/** The demo report lives at /report/demo and is served by GET /api/demo/report. */
export const DEMO_SESSION = "demo";

export const routes = {
  home: "/",
  setup: "/setup",
  ledger: "/ledger",
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
