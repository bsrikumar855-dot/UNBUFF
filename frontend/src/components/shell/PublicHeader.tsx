import React from "react";
import { Link, NavLink } from "react-router-dom";
import { useAuth } from "@/auth/context";
import { DemoReportButton } from "@/components/common/DemoReportButton";
import { buttonClasses } from "@/lib/buttonClasses";
import { cn } from "@/lib/cn";
import { routes } from "@/lib/routes";
import { useSessionState } from "@/state/useSession";
import { Wordmark } from "./Wordmark";
import { useSignOut } from "./useSignOut";

const link = ({ isActive }: { isActive: boolean }) =>
  cn(
    "inline-flex min-h-10 items-center border-b-2 px-0.5 text-sm font-medium transition-colors",
    isActive
      ? "border-redline text-ink-primary"
      : "border-transparent text-ink-muted hover:text-ink-primary"
  );

/** Marketing and signed-out header: just enough navigation to look around and to start. */
export const PublicHeader: React.FC = () => {
  const auth = useAuth();
  const signOut = useSignOut();
  const { state } = useSessionState();
  return (
    <header className="border-b border-line bg-surface-50">
      <div className="mx-auto flex max-w-352 flex-wrap items-center gap-x-6 gap-y-1 px-4 py-2.5 sm:px-8">
        <Wordmark />
        <nav
          aria-label="Primary"
          className="order-3 flex w-full items-center gap-5 sm:order-0 sm:w-auto sm:flex-1"
        >
          <NavLink to={routes.roadmap(state.sessionId)} className={link}>
            Roadmap
          </NavLink>
          <NavLink to={routes.dsa} className={link}>
            DSA Arena
          </NavLink>
          {auth.status === "signedIn" ? (
            <>
              <NavLink to={routes.mentor()} className={link}>
                AI Mentor
              </NavLink>
              <NavLink to={routes.sessions} className={link}>
                My sessions
              </NavLink>
            </>
          ) : (
            <DemoReportButton variant="ghost" size="sm" />
          )}
        </nav>
        <div className="ml-auto flex items-center gap-2 sm:ml-0">
          {auth.status === "signedIn" ? (
            <>
              <button
                type="button"
                onClick={() => void signOut()}
                className={buttonClasses("ghost", "sm")}
              >
                Sign out
              </button>
              <Link to={routes.placement} className={buttonClasses("primary", "sm")}>
                Open my plan
              </Link>
            </>
          ) : (
            <>
              {auth.status === "signedOut" && (
                <Link to={routes.login} className={buttonClasses("ghost", "sm")}>
                  Sign in
                </Link>
              )}
              <Link to={routes.setup} className={buttonClasses("primary", "sm")}>
                Audit My Readiness
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
};
