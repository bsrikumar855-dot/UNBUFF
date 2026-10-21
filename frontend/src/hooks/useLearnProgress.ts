import { useCallback, useEffect, useState } from "react";
import { api } from "@/api/endpoints";
import { useAuth } from "@/auth/context";
import type { LearnProgressResponse, PatternProgressRequest } from "@/types/contract";

/** The signed-in student's learning progress. The lessons are public, so this does nothing while signed out. */
export function useLearnProgress() {
  const { status } = useAuth();
  const signedIn = status === "signedIn";
  const [data, setData] = useState<LearnProgressResponse | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!signedIn) {
      setData(null);
      return;
    }
    let cancelled = false;
    api.getLearnProgress().then((r) => !cancelled && setData(r)).catch((e: unknown) => !cancelled && setError(e));
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  const markPattern = useCallback(async (id: string, body: PatternProgressRequest): Promise<boolean> => {
    setError(null);
    try {
      setData(await api.setPatternProgress(id, body));
      return true;
    } catch (e) {
      setError(e);
      return false;
    }
  }, []);

  return { signedIn, data, error, markPattern, setData };
}
