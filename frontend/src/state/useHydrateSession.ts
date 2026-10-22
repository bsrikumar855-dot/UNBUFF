import { useEffect, useState } from "react";
import { api } from "@/api/endpoints";
import type { SessionDetailResponse } from "@/types/contract";
import { useSessionState } from "./useSession";

/**
 * Makes the in-memory session match `sessionId`. After a reload, a new tab or another device the state is empty, so the
 * session is fetched from the server (GET /api/sessions/:id: read-only, no LLM call). `ready` is true once the claims in
 * state belong to this session; `detail` is set when this hook did the fetch (it says which question is still open).
 */
export function useHydrateSession(sessionId: string | null) {
  const { state, dispatch } = useSessionState();
  const [error, setError] = useState<unknown>(null);
  const [detail, setDetail] = useState<SessionDetailResponse | null>(null);
  const ready =
    !!sessionId &&
    state.sessionId === sessionId &&
    (state.claims.length > 0 || detail?.session_id === sessionId);

  useEffect(() => {
    if (!sessionId || ready) return;
    let live = true;
    setError(null);
    api
      .getSession(sessionId)
      .then((d) => {
        if (!live) return;
        setDetail(d);
        dispatch({
          type: "SET_SESSION",
          payload: {
            sessionId: d.session_id,
            roleId: d.role_id,
            mode: d.mode,
            claims: d.claims,
            blindSpots: d.blind_spots,
            progress: d.progress,
          },
        });
      })
      .catch((e: unknown) => {
        if (live) setError(e);
      });
    return () => {
      live = false;
    };
  }, [sessionId, ready, dispatch]);

  return { ready, error, detail };
}
