import React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { LoadingState } from "@/components/ui/LoadingState";
import { routes } from "@/lib/routes";
import { useAuth } from "./context";

/** Layout route: renders child routes for signed-in students, otherwise sends them to /login and back. */
export const RequireAuth: React.FC = () => {
  const { status, signedOutOnPurpose } = useAuth();
  const location = useLocation();

  if (status === "loading") {
    return (
      <LoadingState
        message="Checking your sign-in…"
        className="mx-auto max-w-2xl px-4 py-10"
      />
    );
  }
  // A deliberate sign-out leaves for the home page with no return address, so whoever signs in next on this browser is
  // never sent to the previous student's last page (e.g. one of their session ids).
  if (status === "signedOut" && signedOutOnPurpose) return <Navigate to={routes.home} replace />;
  if (status === "signedOut") {
    return (
      <Navigate
        to={routes.login}
        replace
        state={{ from: `${location.pathname}${location.search}` }}
      />
    );
  }
  return <Outlet />;
};
