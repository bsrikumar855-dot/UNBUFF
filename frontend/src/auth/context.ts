import { createContext, useContext } from "react";
import type { AuthStatus, AuthUser } from "./types";

export interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  configured: boolean;
  /** Set when the backend rejected our token (expired/revoked); shown once on the sign-in page. */
  sessionExpired: boolean;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  sendPasswordReset(email: string): Promise<void>;
  clearSessionExpired(): void;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
