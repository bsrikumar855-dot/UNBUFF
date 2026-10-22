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
  // A mark's response is the full, newest saved state. A progress load that was in flight while a mark was being saved
  // (it started before the mark, or after it began but before it finished) may carry the older state, so it is
  // discarded instead of overwriting the newer one.
  const started = useRef(0);
  const finished = useRef(0);

  useEffect(() => {
    if (!signedIn) {
      setData(null);
      return;
    }
    let cancelled = false;
    const [startedThen, finishedThen] = [started.current, finished.current];
    api
      .getLearnProgress()
      .then((r) => {
        const untouched =
          started.current === startedThen &&
          finished.current === finishedThen &&
          started.current === finished.current;
        if (!cancelled && untouched) setData(r);
      })
      .catch((e: unknown) => !cancelled && setError(e));
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  const markPattern = useCallback(
    async (id: string, body: PatternProgressRequest): Promise<boolean> => {
      setError(null);
      started.current += 1;
      try {
        setData(await api.setPatternProgress(id, body));
        return true;
      } catch (e) {
        setError(e);
        // The load that this mark outranked may have been discarded; fetch the saved state again so the page is not left empty.
        api
          .getLearnProgress()
          .then(setData)
          .catch(() => undefined);
        return false;
      } finally {
        finished.current += 1;
      }
    },
    []
  );

  return { signedIn, data, error, markPattern, setData };
}
