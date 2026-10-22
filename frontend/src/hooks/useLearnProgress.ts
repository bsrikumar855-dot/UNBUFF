import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/api/endpoints";
import { useAuth } from "@/auth/context";
import type { LearnProgressResponse, PatternProgressRequest } from "@/types/contract";

/** The signed-in student's learning progress. The lessons are public, so this does nothing while signed out. */
export function useLearnProgress() {
  const { status } = useAuth();
  const signedIn = status === "signedIn";
  const [data, setData] = useState<LearnProgressResponse | null>(null);
  const [error, setError] = useState<unknown>(null);
  // Bumped by every mark. A progress load that was already in flight when a mark was saved is older than that mark,
  // so its answer is discarded instead of overwriting the newer saved state.
  const marks = useRef(0);

  useEffect(() => {
    if (!signedIn) {
      setData(null);
      return;
    }
    let cancelled = false;
    const startedAt = marks.current;
    api
      .getLearnProgress()
      .then((r) => !cancelled && marks.current === startedAt && setData(r))
      .catch((e: unknown) => !cancelled && setError(e));
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  const markPattern = useCallback(async (id: string, body: PatternProgressRequest): Promise<boolean> => {
    setError(null);
    marks.current += 1;
    try {
      setData(await api.setPatternProgress(id, body));
      return true;
    } catch (e) {
      setError(e);
      // The load that this mark outranked may have been discarded; fetch the saved state again so the page is not left empty.
      api.getLearnProgress().then(setData).catch(() => undefined);
      return false;
    }
  }, []);

  return { signedIn, data, error, markPattern, setData };
}
