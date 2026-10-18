import { useCallback } from "react";
import { useAuth } from "@/auth/context";
import { clearDrafts } from "@/lib/drafts";
import { useInterrogationState, useSessionState } from "@/state/useSession";

/** Signing out also clears this account's code drafts and in-memory audit state so the next person on the browser sees none of it. */
export function useSignOut(): () => Promise<void> {
  const auth = useAuth();
  const { dispatch } = useSessionState();
  const interrogation = useInterrogationState();
  return useCallback(async () => {
    const uid = auth.user?.uid;
    await auth.signOut();
    if (uid) clearDrafts(uid);
    dispatch({ type: "CLEAR_SESSION" });
    interrogation.dispatch({ type: "CLEAR_INTERROGATION" });
  }, [auth, dispatch, interrogation]);
}
