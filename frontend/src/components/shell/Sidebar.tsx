import React, { useId, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { LogOut, Search } from "lucide-react";
import { useAuth } from "@/auth/context";
import { useAccountProfile } from "@/hooks/useAccountProfile";
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
  "group/row relative flex h-10 w-full items-center rounded-full text-sm font-medium text-[#3b0f0a]/85 outline-none transition-colors hover:text-[#3b0f0a] focus-visible:ring-2 focus-visible:ring-[#3b0f0a]";

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
        ? "bg-white/70 text-redline backdrop-blur-md shadow-[inset_0_0_0_1px_rgba(255,255,255,0.8),inset_1px_1px_1px_rgba(255,255,255,1),inset_0_-6px_10px_-6px_rgba(200,50,36,0.3),0_8px_16px_-8px_rgba(150,30,20,0.55)]"
        : "text-[#3b0f0a]/75 group-hover/row:bg-white/35 group-hover/row:text-[#3b0f0a] group-hover/row:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.5),inset_1px_1px_1px_rgba(255,255,255,0.8)]"
    )}
  >
    {children}
    {active && (
      <span className="absolute -left-1 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full bg-redline" />
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
  const name = useAccountProfile().profile?.display_name ?? null;

  return (
    <aside
      aria-label="Sidebar"
      data-pinned={pinned ? "" : undefined}
      className="group/rail fixed bottom-3 left-3 top-3 z-40 hidden w-14 lg:block"
    >
      <div
        className={cn(
          // iOS-style liquid glass: a clear, lightly red-tinted pane that blurs and saturates what is behind it, with a bright
          // rim that is strongest at the top-left, a soft dark lower edge, and a refracted glow just inside the border.
          "relative isolate flex h-full w-14 flex-col overflow-hidden rounded-[1.75rem] backdrop-blur-[18px] backdrop-saturate-[1.9] backdrop-brightness-[1.06] bg-[linear-gradient(160deg,rgba(255,226,220,0.5)_0%,rgba(255,140,122,0.36)_45%,rgba(232,72,58,0.42)_100%)]",
          "shadow-[0_22px_44px_-20px_rgba(200,50,36,0.5),0_4px_12px_-6px_rgba(120,20,12,0.22),inset_0_0_0_1px_rgba(255,255,255,0.42),inset_1.5px_1.5px_1px_-0.5px_rgba(255,255,255,0.95),inset_-1px_-1px_1px_-0.5px_rgba(255,255,255,0.5),inset_0_0_22px_rgba(255,255,255,0.28),inset_0_-16px_30px_-18px_rgba(190,40,28,0.38)]",
          "transition-[width,box-shadow] delay-75 duration-500",
          EASE,
          "group-hover/rail:w-64 group-hover/rail:delay-0 group-hover/rail:shadow-[0_34px_64px_-24px_rgba(200,50,36,0.55),0_6px_16px_-8px_rgba(120,20,12,0.28),inset_0_0_0_1px_rgba(255,255,255,0.5),inset_1.5px_1.5px_1px_-0.5px_rgba(255,255,255,1),inset_-1px_-1px_1px_-0.5px_rgba(255,255,255,0.55),inset_0_0_26px_rgba(255,255,255,0.32),inset_0_-16px_30px_-18px_rgba(190,40,28,0.38)]",
          "group-focus-within/rail:w-64 group-focus-within/rail:delay-0",
          "group-data-[pinned]/rail:w-64 group-data-[pinned]/rail:delay-0",
          "motion-reduce:transition-none"
        )}
      >
        {/* Liquid light: two soft blobs drift under the glass, and a specular arc catches the top edge. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -left-8 -top-10 -z-10 size-56 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.7),rgba(255,255,255,0)_68%)] blur-xl motion-safe:animate-[liquid-drift-a_14s_ease-in-out_infinite]"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-12 -right-10 -z-10 size-64 rounded-full bg-[radial-gradient(circle,rgba(214,48,36,0.55),rgba(214,48,36,0)_68%)] blur-xl motion-safe:animate-[liquid-drift-b_18s_ease-in-out_infinite]"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-24 bg-[linear-gradient(180deg,rgba(255,255,255,0.4),rgba(255,255,255,0))]"
        />
        {/* A diagonal specular sheen, like light sliding across curved glass. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(115deg,rgba(255,255,255,0.38)_0%,rgba(255,255,255,0)_32%,rgba(255,255,255,0)_70%,rgba(255,255,255,0.18)_100%)]"
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
              className="grid size-10 shrink-0 place-items-center rounded-full bg-white/75 font-mono text-sm font-bold text-ink-primary backdrop-blur-md shadow-[inset_0_0_0_1px_rgba(255,255,255,0.8),inset_1px_1px_1px_rgba(255,255,255,1),0_4px_10px_-6px_rgba(24,24,27,0.3)] outline-none transition-transform duration-300 hover:scale-105 focus-visible:ring-2 focus-visible:ring-ink-primary"
            >
              U
            </button>
            <Link
              to={routes.home}
              aria-label="UNBLUFF home"
              tabIndex={-1}
              className={cn(
                LABEL,
                "ml-2 flex-none text-lg font-semibold uppercase tracking-[-0.04em] text-[#3b0f0a]"
              )}
            >
              Un
              <span className="relative">
                bluff
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 -bottom-0.5 h-[3px] bg-redline"
                />
              </span>
            </Link>
          </div>

          <div className="shrink-0 px-2 pt-2">
            <button
              type="button"
              onClick={onSearch}
              aria-label="Go to a screen"
              className={cn(ROW, "text-[#3b0f0a]/80")}
            >
              <Dot>
                <Search size={16} strokeWidth={1.75} />
              </Dot>
              <span className={cn(LABEL, "ml-2 flex items-center")}>
                Go to…
                <kbd className="ml-auto mr-4 font-mono text-[10px] text-[#3b0f0a]/60">
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
                      "eyebrow absolute inset-x-4 bottom-1 flex-none text-[#3b0f0a]/65!"
                    )}
                  >
                    {g.label}
                  </h2>
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-3 bottom-2.5 h-px bg-[#3b0f0a]/20 transition-opacity duration-200 group-hover/rail:opacity-0 group-focus-within/rail:opacity-0 group-data-[pinned]/rail:opacity-0"
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
                          className={cn(ROW, active && "text-[#3b0f0a]")}
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

          <div className="shrink-0 border-t border-white/50 px-2 py-2">
            <div className="flex items-center">
              <span
                role="img"
                aria-label={`Signed in as ${name ?? email}`}
                title={email}
                className="grid size-10 shrink-0 place-items-center rounded-full bg-white font-mono text-xs font-semibold uppercase text-redline shadow-[0_4px_10px_-6px_rgba(60,8,4,0.6)]"
              >
                {(name ?? email).slice(0, 1)}
              </span>
              <div className={cn(LABEL, "ml-2 flex items-center gap-1")}>
                <div className="min-w-0 flex-1">
                  <p
                    className="truncate text-sm font-medium text-[#3b0f0a]"
                    title={email}
                  >
                    {name ?? email}
                  </p>
                  <p className="eyebrow truncate text-[#3b0f0a]/65!" title={name ? email : undefined}>
                    {name ? email : "Student"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void signOut()}
                  className="mr-1 inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-[#3b0f0a]/85 outline-none transition-colors hover:bg-white/45 hover:text-[#3b0f0a] focus-visible:ring-2 focus-visible:ring-[#3b0f0a]"
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
