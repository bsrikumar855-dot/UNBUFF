import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/api/endpoints";
import { useSessionState } from "@/state/useSession";
import type { ExtractRequest } from "@/types/contract";

/**
 * POST /api/claims/extract — the frontend never extracts, interprets or
 * scores claims itself; it only submits the request and stores the
 * backend's response in the canonical session state (SessionContext, from
 * M0), then hands off to the Claim Ledger route.
 */
export function useExtractClaims() {
  const navigate = useNavigate();
  const { dispatch } = useSessionState();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const extract = useCallback(
    async (request: ExtractRequest) => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await api.extractClaims(request);
        dispatch({
          type: "SET_SESSION",
          payload: {
            sessionId: res.session_id,
            roleId: res.role_id,
            mode: res.mode,
            claims: res.claims,
            blindSpots: res.blind_spots,
            progress: res.progress,
          },
        });
        navigate("/ledger");
      } catch (err) {
        setError(err);
      } finally {
        setIsLoading(false);
      }
    },
    [dispatch, navigate]
  );

  return { isLoading, error, extract };
}
