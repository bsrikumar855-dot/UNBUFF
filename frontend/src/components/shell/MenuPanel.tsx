import React from "react";
import { Link, useLocation } from "react-router-dom";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { m } from "motion/react";
import { useAuth } from "@/auth/context";
import { cn } from "@/lib/cn";
import { routes } from "@/lib/routes";
import { useSessionState } from "@/state/useSession";
import { AccountMenu } from "./AccountMenu";
import { navGroups } from "./nav";

const CURVE = [0.22, 1, 0.36, 1] as const;

interface Entry {
  label: string;
  to: string;
  active: boolean;
}
interface Group {
  id: string;
  label: string;
  items: Entry[];
}

/**
 * One pill, in the same language as the header's pill navigation: a glass chip whose red fill rises through it on
 * hover or keyboard focus, with a dot where the current page is.
 */
const Pill: React.FC<{ entry: Entry; onNavigate: () => void }> = ({
  entry,
  onNavigate,
}) => (
  <Link
    to={entry.to}
    onClick={onNavigate}
    aria-current={entry.active ? "page" : undefined}
    className={cn(
      "group relative isolate inline-flex min-h-10 items-center gap-2 overflow-hidden rounded-full px-4 text-[14px] font-medium leading-none",
      "bg-white/75 text-ink-primary shadow-[inset_0_0_0_1px_rgba(24,24,27,0.07),inset_0_1px_0_rgba(255,255,255,0.95),0_6px_14px_-8px_rgba(24,24,27,0.25)]",
      "transition-colors duration-300 hover:text-white focus-visible:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-primary"
    )}
  >
    <span
      aria-hidden="true"
      className="absolute inset-0 -z-10 translate-y-full rounded-[inherit] bg-redline transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-y-0 group-focus-visible:translate-y-0"
    />
    {entry.label}
    {entry.active && (
      <span
        aria-hidden="true"
        className="size-1.5 rounded-full bg-redline transition-colors group-hover:bg-white group-focus-visible:bg-white"
      />
    )}
  </Link>
);

/**
 * The full navigation, opened by the header's More pill. It drops down from the header as a glass sheet and is made of
 * the same pills as the header, grouped by purpose, with the account at the foot. It is a modal dialog: focus is
 * trapped while it is open, and Escape, the close button or choosing a page returns to the page.
 */
export const MenuPanel: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
}> = ({ open, onOpenChange }) => {
  const { pathname } = useLocation();
  const { state } = useSessionState();
  const auth = useAuth();
  const signedIn = auth.status === "signedIn";
  const close = () => onOpenChange(false);

  const groups: Group[] = signedIn
    ? navGroups(state.sessionId).map((g) => ({
        id: g.id,
        label: g.label,
        items: g.items.map((i) => ({
          label: i.label,
          to: i.to,
          active: i.match(pathname),
        })),
      }))
    : [
        {
          id: "explore",
          label: "Explore",
          items: [
            {
              label: "DSA Arena",
              to: routes.dsa,
              active: pathname === "/dsa" || pathname.startsWith("/dsa/"),
            },
            {
              label: "DSA patterns",
              to: routes.learnPatterns,
              active: pathname.startsWith("/learn/patterns"),
            },
            {
              label: "DBMS",
              to: routes.learnDbms,
              active: pathname.startsWith("/learn/dbms"),
            },
            { label: "Roadmap", to: routes.roadmap(), active: pathname === "/roadmap" },
          ],
        },
        {
          id: "start",
          label: "Start",
          items: [
            { label: "Sign in", to: routes.login, active: pathname === "/login" },
            {
              label: "Audit My Readiness",
              to: routes.setup,
              active: pathname === "/setup",
            },
          ],
        },
      ];

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-foreground/10 data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-3 right-3 top-[calc(var(--topbar-h)-0.25rem)] z-50 flex max-h-[calc(100dvh-var(--topbar-h)-1rem)] flex-col overflow-hidden rounded-[1.75rem] bg-[rgba(246,243,236,0.93)] shadow-[0_22px_44px_-22px_rgba(24,24,27,0.3),0_6px_16px_-10px_rgba(24,24,27,0.16),inset_0_0_0_1px_rgba(24,24,27,0.07),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-xl backdrop-saturate-150 focus:outline-hidden data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-out-to-top-3 data-[state=open]:slide-in-from-top-3 data-[state=open]:duration-500 sm:left-5 sm:right-auto sm:w-[min(34rem,calc(100vw-2.5rem))]"
        >
          <div className="flex items-center justify-between px-5 pb-1 pt-4">
            <Dialog.Title className="eyebrow">All pages</Dialog.Title>
            <Dialog.Close
              aria-label="Close"
              className="inline-grid size-10 place-items-center rounded-full bg-white/75 text-ink-primary shadow-[inset_0_0_0_1px_rgba(24,24,27,0.07),inset_0_1px_0_rgba(255,255,255,0.95)] transition-colors hover:bg-redline hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-primary"
            >
              <X size={16} aria-hidden="true" />
            </Dialog.Close>
          </div>

          <nav
            aria-label="All pages"
            className="min-h-0 flex-1 overflow-y-auto px-5 pb-4 pt-2"
          >
            <div className="flex flex-col gap-5">
              {groups.map((g, gi) => (
                <m.section
                  key={g.id}
                  aria-labelledby={`menu-${g.id}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.08 + gi * 0.06, ease: CURVE }}
                >
                  <h2 id={`menu-${g.id}`} className="eyebrow pb-2">
                    {g.label}
                  </h2>
                  <ul className="flex flex-wrap gap-2">
                    {g.items.map((item) => (
                      <li key={item.label}>
                        <Pill entry={item} onNavigate={close} />
                      </li>
                    ))}
                  </ul>
                </m.section>
              ))}
            </div>
          </nav>

          <div className="border-t border-black/5 px-5 py-3">
            {signedIn && <AccountMenu />}
            <p className="px-1 pt-1 font-mono text-xs text-ink-muted">
              UNBLUFF · evidence, not claims
            </p>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
