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
      <Link
        to={routes.placement}
        className={buttonClasses(
          "primary",
          "sm",
          "rounded-full bg-[linear-gradient(135deg,#f0604e_0%,#c9362a_100%)] text-white shadow-[0_10px_20px_-10px_rgba(201,54,42,0.7),inset_0_1px_0_rgba(255,255,255,0.45)] hover:brightness-110"
        )}
      >
        Open my plan
      </Link>
    );
  }
  return (
    <>
      {auth.status === "signedOut" && (
        <Link
          to={routes.login}
          className={buttonClasses("ghost", "sm", "hidden rounded-full sm:inline-flex")}
        >
          Sign in
        </Link>
      )}
      <Link
        to={routes.setup}
        className={buttonClasses(
          "primary",
          "sm",
          "whitespace-nowrap rounded-full bg-[linear-gradient(135deg,#f0604e_0%,#c9362a_100%)] text-white shadow-[0_10px_20px_-10px_rgba(201,54,42,0.7),inset_0_1px_0_rgba(255,255,255,0.45)] hover:brightness-110"
        )}
      >
        <span className="hidden sm:inline">Audit My Readiness</span>
        <span className="sm:hidden">Audit</span>
      </Link>
    </>
  );
};
