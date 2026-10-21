import React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/auth/context";
import { buttonClasses } from "@/lib/buttonClasses";
import { routes } from "@/lib/routes";

/** The call to action at the right of the header on the landing, sign-in and signed-out pages. */
export const HeaderActions: React.FC = () => {
  const auth = useAuth();
  if (auth.status === "signedIn") {
    return (
      <Link to={routes.placement} className={buttonClasses("primary", "sm")}>
        Open my plan
      </Link>
    );
  }
  return (
    <>
      {auth.status === "signedOut" && (
        <Link to={routes.login} className={`${buttonClasses("ghost", "sm")} hidden sm:inline-flex`}>
          Sign in
        </Link>
      )}
      <Link to={routes.setup} className={`${buttonClasses("primary", "sm")} whitespace-nowrap`}>
        <span className="hidden sm:inline">Audit My Readiness</span>
        <span className="sm:hidden">Audit</span>
      </Link>
    </>
  );
};
