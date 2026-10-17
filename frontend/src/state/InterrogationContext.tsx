import React, { useReducer, type ReactNode } from "react";
import type { TurnResponse, Mode } from "@/types/contract";
import { InterrogationContext } from "./contexts";

export interface InterrogationState {
  activeClaimId: string | null;
  activeMode: Mode;
  currentTurn: TurnResponse | null;
  isLoading: boolean;
  error: string | null;
  inlineTeachNow: boolean;
}

export type InterrogationAction =
  | {
      type: "SET_ACTIVE_CLAIM";
      payload: { claimId: string; mode?: Mode };
    }
  | {
      type: "START_REQUEST";
    }
  | {
      type: "SET_TURN_RESPONSE";
      payload: TurnResponse;
    }
  | {
      type: "SET_ERROR";
      payload: string;
    }
  | {
      type: "DISMISS_INLINE_TEACH";
    }
  | {
      type: "CLEAR_INTERROGATION";
    };

const initialState: InterrogationState = {
  activeClaimId: null,
  activeMode: "assess",
  currentTurn: null,
  isLoading: false,
  error: null,
  inlineTeachNow: false,
};

function interrogationReducer(
  state: InterrogationState,
  action: InterrogationAction
): InterrogationState {
  switch (action.type) {
    case "SET_ACTIVE_CLAIM":
      return {
        ...state,
        activeClaimId: action.payload.claimId,
        activeMode: action.payload.mode ?? "assess",
        currentTurn: null,
        error: null,
        inlineTeachNow: false,
      };
    case "START_REQUEST":
      return {
        ...state,
        isLoading: true,
        error: null,
      };
    case "SET_TURN_RESPONSE":
      return {
        ...state,
        isLoading: false,
        currentTurn: action.payload,
        error: null,
        // Trigger inline teach card if turn is done and teach_now flag is set by backend
        inlineTeachNow: Boolean(
          action.payload.turn === "done" && action.payload.teach_now
        ),
      };
    case "SET_ERROR":
      return {
        ...state,
        isLoading: false,
        error: action.payload,
      };
    case "DISMISS_INLINE_TEACH":
      return {
        ...state,
        inlineTeachNow: false,
      };
    case "CLEAR_INTERROGATION":
      return initialState;
    default:
      return state;
  }
}

export const InterrogationProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [state, dispatch] = useReducer(interrogationReducer, initialState);

  return (
    <InterrogationContext.Provider value={{ state, dispatch }}>
      {children}
    </InterrogationContext.Provider>
  );
};
