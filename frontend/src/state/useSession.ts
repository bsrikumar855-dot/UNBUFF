import { useContext } from "react";
import {
  SessionContext,
  InterrogationContext,
  type SessionContextValue,
  type InterrogationContextValue,
} from "./contexts";

export function useSessionState(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useSessionState must be used within a SessionProvider");
  }
  return context;
}

export function useInterrogationState(): InterrogationContextValue {
  const context = useContext(InterrogationContext);
  if (!context) {
    throw new Error(
      "useInterrogationState must be used within an InterrogationProvider"
    );
  }
  return context;
}

/**
 * High-level hook unifying session and interrogation context access.
 */
export function useSession() {
  const session = useSessionState();
  const interrogation = useInterrogationState();

  return {
    session: session.state,
    sessionDispatch: session.dispatch,
    interrogation: interrogation.state,
    interrogationDispatch: interrogation.dispatch,
  };
}
