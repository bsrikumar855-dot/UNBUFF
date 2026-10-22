import React, { useId, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { LogOut, Search } from "lucide-react";
import { useAuth } from "@/auth/context";
import { cn } from "@/lib/cn";
import { routes } from "@/lib/routes";
import { isPlainClick, useRouteNavigate } from "@/lib/viewTransition";
import { useSessionState } from "@/state/useSession";
import { navGroups } from "./nav";
import { useSignOut } from "./useSignOut";

const EASE = "ease-[cubic-bezier(0.22,1,0.36,1)]";
/** Shown only while the rail is open: fades in a beat after it starts widening, and out at once as it closes. */
const LABEL = cn(
  "min-w-0 flex-1 truncate whitespace-nowrap opacity-0 transition-[opacity,translate] duration-200 -translate-x-2",
  "group-hover/rail:translate-x-0 group-hover/rail:opacity-100 group-hover/rail:delay-150 group-hover/rail:duration-300",
  "group-focus-within/rail:translate-x-0 group-focus-within/rail:opacity-100 group-focus-within/rail:delay-150 group-focus-within/rail:duration-300",
  "group-data-[pinned]/rail:translate-x-0 group-data-[pinned]/rail:opacity-100 group-data-[pinned]/rail:delay-150",
  "motion-reduce:transition-none motion-reduce:delay-0"
);
const ROW =
  "group/row relative flex h-10 w-full items-center rounded-full text-sm font-medium text-white/80 outline-none transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-white";

/** A round icon, the width of the collapsed rail, so icons stay put while the rail widens around them. */
const Dot: React.FC<{ active?: boolean; children: React.ReactNode }> = ({
  active,
  children,
}) => (
  <span
    aria-hidden="true"
    className={cn(
      "relative grid size-10 shrink-0 place-items-center rounded-full transition-[background-color,color,box-shadow] duration-300",
      active
        ? "bg-white text-redline shadow-[inset_0_0_0_1px_rgba(255,255,255,0.6),0_6px_14px_-6px_rgba(60,8,4,0.55)]"
        : "text-white/75 group-hover/row:bg-white/20 group-hover/row:text-white group-hover/row:shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]"
    )}
  >
    {children}
    {active && (
      <span className="absolute -left-1 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full bg-white" />
    )}
  </span>
);

/**
 * The desktop navigation (lg and up): a curved, floating glass capsule down the left edge that shows one round icon per
 * page. Pointing at it, tabbing into it, or pressing the U widens it smoothly into the full list, with the names and
 * group headings, over the page (the page itself never moves). Moving away closes it again. Below lg the same pages are
 * in the top bar's drawer instead.
 */
export const Sidebar: React.FC<{ onSearch: () => void }> = ({ onSearch }) => {
  const { pathname } = useLocation();
  const go = useRouteNavigate();
  const { state } = useSessionState();
  const auth = useAuth();
  const signOut = useSignOut();
  const [pinned, setPinned] = useState(false);
  const regionId = useId();
  const groups = navGroups(state.sessionId);
  const email = auth.user?.email ?? "Signed in";

  return (
    <aside
      aria-label="Sidebar"
      data-pinned={pinned ? "" : undefined}
      className="group/rail fixed bottom-3 left-3 top-3 z-40 hidden w-14 lg:block"
    >
      <div
        className={cn(
          "relative isolate flex h-full w-14 flex-col overflow-hidden rounded-[1.75rem] backdrop-blur-xl backdrop-saturate-200 bg-[linear-gradient(165deg,rgba(226,68,48,0.94)_0%,rgba(184,40,27,0.93)_42%,rgba(112,18,12,0.96)_100%)]",
          "shadow-[0_18px_36px_-16px_rgba(140,22,12,0.7),0_6px_14px_-8px_rgba(100,14,8,0.5),inset_0_0_0_1px_rgba(255,255,255,0.28),inset_0_1px_0_rgba(255,255,255,0.55),inset_0_-14px_28px_-14px_rgba(70,6,2,0.6)]",
          "transition-[width,box-shadow] delay-75 duration-500",
          EASE,
          "group-hover/rail:w-64 group-hover/rail:delay-0 group-hover/rail:shadow-[0_30px_60px_-22px_rgba(140,22,12,0.75),0_8px_20px_-10px_rgba(100,14,8,0.5),inset_0_0_0_1px_rgba(255,255,255,0.32),inset_0_1px_0_rgba(255,255,255,0.6),inset_0_-14px_28px_-14px_rgba(70,6,2,0.6)]",
          "group-focus-within/rail:w-64 group-focus-within/rail:delay-0",
          "group-data-[pinned]/rail:w-64 group-data-[pinned]/rail:delay-0",
          "motion-reduce:transition-none"
        )}
      >
        {/* Liquid light: two soft blobs drift under the glass, and a specular arc catches the top edge. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -left-8 -top-10 -z-10 size-56 rounded-full bg-[radial-gradient(circle,rgba(255,150,120,0.75),rgba(255,150,120,0)_68%)] blur-xl motion-safe:animate-[liquid-drift-a_14s_ease-in-out_infinite]"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-12 -right-10 -z-10 size-64 rounded-full bg-[radial-gradient(circle,rgba(70,6,4,0.8),rgba(70,6,4,0)_68%)] blur-xl motion-safe:animate-[liquid-drift-b_18s_ease-in-out_infinite]"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-24 bg-[linear-gradient(180deg,rgba(255,255,255,0.32),rgba(255,255,255,0))]"
        />
        {/* Fixed width, so nothing re-wraps while the capsule widens; the capsule clips it. */}
        <div className="flex h-full w-64 flex-col">
          <div className="flex shrink-0 items-center gap-1 px-2 pt-2">
            <button
              type="button"
              onClick={() => setPinned((p) => !p)}
              aria-pressed={pinned}
              aria-controls={regionId}
              aria-label={
                pinned ? "Let the navigation collapse" : "Keep the navigation open"
              }
              className="grid size-10 shrink-0 place-items-center rounded-full bg-white font-mono text-sm font-bold text-ink-primary shadow-[inset_0_0_0_1px_rgba(24,24,27,0.08),0_4px_10px_-6px_rgba(24,24,27,0.3)] outline-none transition-transform duration-300 hover:scale-105 focus-visible:ring-2 focus-visible:ring-ink-primary"
            >
              U
            </button>
            <Link
              to={routes.home}
              aria-label="UNBLUFF home"
              tabIndex={-1}
              className={cn(
                LABEL,
                "ml-2 flex-none text-lg font-semibold uppercase tracking-[-0.04em] text-white"
              )}
            >
              Un
              <span className="relative">
                bluff
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 -bottom-0.5 h-[3px] bg-white"
                />
              </span>
            </Link>
          </div>

          <div className="shrink-0 px-2 pt-2">
            <button
              type="button"
              onClick={onSearch}
              aria-label="Go to a screen"
              className={cn(ROW, "text-white/80")}
            >
              <Dot>
                <Search size={16} strokeWidth={1.75} />
              </Dot>
              <span className={cn(LABEL, "ml-2 flex items-center")}>
                Go to…
                <kbd className="ml-auto mr-4 font-mono text-[10px] text-white/60">
                  Ctrl K
                </kbd>
              </span>
            </button>
          </div>

          <nav
            id={regionId}
            aria-label="Primary"
            className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {groups.map((g) => (
              <div key={g.id}>
                <div className="relative h-7">
                  <h2
                    id={`rail-${g.id}`}
                    className={cn(
                      LABEL,
                      "eyebrow absolute inset-x-4 bottom-1 flex-none text-white/65!"
                    )}
                  >
                    {g.label}
                  </h2>
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-3 bottom-2.5 h-px bg-white/30 transition-opacity duration-200 group-hover/rail:opacity-0 group-focus-within/rail:opacity-0 group-data-[pinned]/rail:opacity-0"
                  />
                </div>
                <ul aria-labelledby={`rail-${g.id}`} className="flex flex-col gap-0.5">
                  {g.items.map((item) => {
                    const active = item.match(pathname);
                    return (
                      <li key={item.label}>
                        <Link
                          to={item.to}
                          aria-current={active ? "page" : undefined}
                          onClick={(e) => {
                            if (
                              isPlainClick(e) &&
                              !active &&
                              typeof document.startViewTransition === "function"
                            ) {
                              e.preventDefault();
                              go(item.to);
                            }
                          }}
                          className={cn(ROW, active && "text-white")}
                        >
                          <Dot active={active}>
                            <item.icon size={17} strokeWidth={1.75} />
                          </Dot>
                          <span className={cn(LABEL, "ml-2", active && "font-semibold")}>
                            {item.label}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>

          <div className="shrink-0 border-t border-white/20 px-2 py-2">
            <div className="flex items-center">
              <span
                role="img"
                aria-label={`Signed in as ${email}`}
                title={email}
                className="grid size-10 shrink-0 place-items-center rounded-full bg-white font-mono text-xs font-semibold uppercase text-redline shadow-[0_4px_10px_-6px_rgba(60,8,4,0.6)]"
              >
                {email.slice(0, 1)}
              </span>
              <div className={cn(LABEL, "ml-2 flex items-center gap-1")}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white" title={email}>
                    {email}
                  </p>
                  <p className="eyebrow text-white/65!">Student</p>
                </div>
                <button
                  type="button"
                  onClick={() => void signOut()}
                  className="mr-1 inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-white/85 outline-none transition-colors hover:bg-white/20 hover:text-white focus-visible:ring-2 focus-visible:ring-white"
                >
                  <LogOut size={14} aria-hidden="true" />
                  Sign out
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
};
