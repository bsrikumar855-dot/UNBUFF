import React, { useCallback, useEffect, useState } from "react";
import { apiClient } from "@/api/client";
import type { HealthResponse } from "@/types/contract";
import { Button } from "@/components/ui/Button";

const WAKE_TIMEOUT_MS = 90_000;
const SLOW_AFTER_MS = 3_000;

type Phase = "checking" | "waking" | "ready" | "failed";

/**
 * The hosted backend sleeps when idle (Render free tier). On load we ping /api/health with a 90 s
 * timeout; if it takes more than 3 s we show a full-screen "waking up" status, and on failure an
 * alert with Retry. The app stays mounted underneath.
 */
export const ServerWakeGate: React.FC = () => {
  const [phase, setPhase] = useState<Phase>("checking");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let done = false;
    setPhase("checking");
    const slow = setTimeout(() => !done && setPhase("waking"), SLOW_AFTER_MS);
    apiClient<HealthResponse>("/health", { method: "GET", timeoutMs: WAKE_TIMEOUT_MS })
      .then(() => setPhase("ready"))
      .catch(() => setPhase("failed"))
      .finally(() => {
        done = true;
        clearTimeout(slow);
      });
    return () => {
      done = true;
      clearTimeout(slow);
    };
  }, [attempt]);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);

  if (phase === "checking" || phase === "ready") return null;
  return (
    <div className="fixed inset-0 z-[1300] flex items-center justify-center bg-surface-50/95 p-6">
      {phase === "waking" ? (
        <div role="status" className="max-w-sm text-center">
          <span
            className="mx-auto mb-4 block h-8 w-8 animate-spin rounded-full border-4 border-line-strong border-t-primary motion-reduce:animate-none"
            aria-hidden="true"
          />
          <p className="text-lg font-semibold text-ink-primary">Waking up the server… (~30–60s)</p>
          <p className="mt-1 text-sm text-ink-secondary">The free host sleeps when idle. This only happens once.</p>
        </div>
      ) : (
        <div role="alert" className="max-w-sm text-center">
          <p className="text-lg font-semibold text-ink-primary">We couldn&apos;t reach the server.</p>
          <p className="mt-1 mb-4 text-sm text-ink-secondary">Check your connection and try again.</p>
          <Button onClick={retry}>Retry</Button>
        </div>
      )}
    </div>
  );
};
