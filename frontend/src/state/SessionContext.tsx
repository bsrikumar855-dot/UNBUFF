import React, { useReducer, type ReactNode } from "react";
import type {
  Claim,
  BlindSpot,
  Progress,
  SessionMode,
} from "@/types/contract";
import { SessionContext } from "./contexts";

export interface SessionState {
  sessionId: string | null;
  roleId: string | null;
  mode: SessionMode | null;
  claims: Claim[];
  blindSpots: BlindSpot[];
  progress: Progress | null;
}

export type SessionAction =
  | {
      type: "SET_SESSION";
      payload: {
        sessionId: string;
        roleId: string;
        mode?: SessionMode;
        claims?: Claim[];
        blindSpots?: BlindSpot[];
        progress?: Progress;
      };
    }
  | {
      type: "UPDATE_CLAIMS";
      payload: {
        claims: Claim[];
        blindSpots?: BlindSpot[];
        progress?: Progress;
      };
    }
  | {
      type: "UPDATE_PROGRESS";
      payload: Progress;
    }
  | {
      type: "CLEAR_SESSION";
    };

const initialState: SessionState = {
  sessionId: null,
  roleId: null,
  mode: null,
  claims: [],
  blindSpots: [],
  progress: null,
};

function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case "SET_SESSION":
      return {
        ...state,
        sessionId: action.payload.sessionId,
        roleId: action.payload.roleId,
        mode: action.payload.mode ?? state.mode,
        claims: action.payload.claims ?? state.claims,
        blindSpots: action.payload.blindSpots ?? state.blindSpots,
        progress: action.payload.progress ?? state.progress,
      };
    case "UPDATE_CLAIMS":
      return {
        ...state,
        claims: action.payload.claims,
        blindSpots: action.payload.blindSpots ?? state.blindSpots,
        progress: action.payload.progress ?? state.progress,
      };
    case "UPDATE_PROGRESS":
      return {
        ...state,
        progress: action.payload,
      };
    case "CLEAR_SESSION":
      return initialState;
    default:
      return state;
  }
}

export const SessionProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(sessionReducer, initialState);

  return (
    <SessionContext.Provider value={{ state, dispatch }}>
      {children}
    </SessionContext.Provider>
  );
};
