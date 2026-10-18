import React, { useId } from "react";
import { Link, useLocation } from "react-router-dom";
import { LayoutGroup, m } from "motion/react";
import { SPRING_GLIDE } from "@/components/motion/ease";
import { cn } from "@/lib/cn";
import { isPlainClick, useRouteNavigate } from "@/lib/viewTransition";
import { useSessionState } from "@/state/useSession";
import { navGroups } from "./nav";

/**
 * The grouped product navigation, shared by the desktop sidebar and the mobile sheet. The highlight and the red bar are
 * single shared elements that glide from the old active item to the new one when the route changes (a shared-layout
 * animation); each instance has its own layout group so the rail and the sheet never animate into each other.
 */
export const NavList: React.FC<{ onNavigate?: () => void }> = ({ onNavigate }) => {
  const { pathname } = useLocation();
  const go = useRouteNavigate();
  const { state } = useSessionState();
  const group = useId();
  const groups = navGroups(state.sessionId);
  return (
    <LayoutGroup id={group}>
      <nav aria-label="Primary" className="flex flex-col gap-6">
        {groups.map((g) => (
          <div key={g.id}>
            <h2 className="eyebrow px-3 pb-1.5" id={`nav-${g.id}`}>
              {g.label}
            </h2>
            <ul aria-labelledby={`nav-${g.id}`} className="flex flex-col">
              {g.items.map((item) => {
                const active = item.match(pathname);
                return (
                  <li key={item.label}>
                    <Link
                      to={item.to}
                      onClick={(e) => {
                        onNavigate?.();
                        // Cross-fade the page content on a plain click; a new-tab click or a click on the current page is left alone.
                        if (isPlainClick(e) && !active && typeof document.startViewTransition === "function") {
                          e.preventDefault();
                          go(item.to);
                        }
                      }}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group relative isolate flex min-h-10 items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                        active ? "font-semibold text-foreground" : "font-medium text-ink-secondary hover:text-foreground"
                      )}
                    >
                      {active ? (
                        <>
                          <m.span
                            aria-hidden="true"
                            layoutId="nav-highlight"
                            transition={SPRING_GLIDE}
                            className="absolute inset-0 -z-10 rounded-md bg-accent"
                          />
                          <m.span
                            aria-hidden="true"
                            layoutId="nav-bar"
                            transition={SPRING_GLIDE}
                            className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-redline"
                          />
                        </>
                      ) : (
                        <span
                          aria-hidden="true"
                          className="absolute inset-0 -z-10 rounded-md bg-accent/0 transition-colors duration-150 group-hover:bg-accent/60"
                        />
                      )}
                      <item.icon
                        size={16}
                        strokeWidth={1.75}
                        aria-hidden="true"
                        className={cn(
                          "transition-transform duration-200 group-hover:translate-x-0.5",
                          active ? "text-redline" : "text-ink-muted"
                        )}
                      />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </LayoutGroup>
  );
};
