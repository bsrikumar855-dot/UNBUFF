import { createContext } from "react";
import type { SessionState, SessionAction } from "./SessionContext";
import type { InterrogationState, InterrogationAction } from "./InterrogationContext";

export interface SessionContextValue {
  state: SessionState;
  dispatch: React.Dispatch<SessionAction>;
}

export interface InterrogationContextValue {
  state: InterrogationState;
  dispatch: React.Dispatch<InterrogationAction>;
}

export const SessionContext = createContext<SessionContextValue | undefined>(undefined);
export const InterrogationContext = createContext<InterrogationContextValue | undefined>(undefined);
