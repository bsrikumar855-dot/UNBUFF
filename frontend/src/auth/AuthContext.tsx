import React, { useEffect, useMemo, useRef, useState } from "react";
import { setAuthHooks } from "@/api/client";
import { firebaseAuthClient } from "./firebaseClient";
import { AuthContext, type AuthContextValue } from "./context";
import { AuthError, type AuthClient, type AuthStatus, type AuthUser } from "./types";

const UNSUPPORTED = new AuthError("This isn't available for this sign-in method.", "app/unsupported");

export const AuthProvider: React.FC<{
  client?: AuthClient;
  children: React.ReactNode;
}> = ({ client = firebaseAuthClient, children }) => {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [signedOutOnPurpose, setSignedOutOnPurpose] = useState(false);
  const signedIn = useRef(false);

  useEffect(
    () =>
      client.onChange((u) => {
        signedIn.current = u !== null;
        if (u) setSignedOutOnPurpose(false);
        setUser(u);
        setStatus(u ? "signedIn" : "signedOut");
      }),
    [client]
  );

  // The API client attaches the ID token and tells us when the backend says 401.
  useEffect(() => {
    setAuthHooks({
      getToken: () => client.getIdToken(),
      onUnauthorized: () => {
        // Only a request that carried a token can mean "expired"; a signed-out 401 is just "sign in".
        if (!signedIn.current) return;
        setSessionExpired(true);
        void client.signOut();
      },
    });
    return () => setAuthHooks(null);
  }, [client]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      configured: client.configured,
      sessionExpired,
      signedOutOnPurpose,
      signIn: (e, p) => client.signIn(e, p),
      signUp: (e, p) => client.signUp(e, p),
      signOut: () => {
        setSignedOutOnPurpose(true);
        return client.signOut();
      },
      sendPasswordReset: (e) => client.sendPasswordReset(e),
      changePassword: (current, next) =>
        client.changePassword ? client.changePassword(current, next) : Promise.reject(UNSUPPORTED),
      verifyPassword: (password) =>
        client.verifyPassword ? client.verifyPassword(password) : Promise.reject(UNSUPPORTED),
      deleteAccount: () => (client.deleteAccount ? client.deleteAccount() : Promise.reject(UNSUPPORTED)),
      clearSessionExpired: () => setSessionExpired(false),
    }),
    [client, status, user, sessionExpired, signedOutOnPurpose]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
