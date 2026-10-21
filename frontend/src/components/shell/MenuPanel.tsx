import React from "react";
import { Link, useLocation } from "react-router-dom";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowUpRight, X } from "lucide-react";
import { m } from "motion/react";
import { cn } from "@/lib/cn";
import GlassSurface from "@/components/reactbits/GlassSurface";
import { routes } from "@/lib/routes";
import { useSessionState } from "@/state/useSession";
import { AccountMenu } from "./AccountMenu";
import { navGroups, type NavItem } from "./nav";

const CURVE = [0.22, 1, 0.36, 1] as const;

/** The five places most visits start from, set large. Everything else is listed smaller underneath. */
const FEATURED: { label: string; to: string; match: NavItem["match"] }[] = [
  { label: "Placement plan", to: routes.placement, match: (p) => p === "/placement" },
  {
    label: "DSA Arena",
    to: routes.dsa,
    match: (p) =>
      p === "/dsa" || p.startsWith("/dsa/questions") || p.startsWith("/dsa/companies"),
  },
  { label: "AI Mentor", to: routes.mentor(), match: (p) => p === "/mentor" },
  {
    label: "DSA patterns",
    to: routes.learnPatterns,
    match: (p) => p.startsWith("/learn/patterns"),
  },
  { label: "DBMS", to: routes.learnDbms, match: (p) => p.startsWith("/learn/dbms") },
];

/**
 * The navigation as a floating panel: a Close pill, the main places in large type, a card that leads into the mentor,
 * the remaining routes grouped and small, and the account at the foot. It is a modal dialog, so focus is trapped
 * while it is open and Escape or the Close pill returns to the page.
 */
export const MenuPanel: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
}> = ({ open, onOpenChange }) => {
  const { pathname } = useLocation();
  const { state } = useSessionState();
  const close = () => onOpenChange(false);
  const featured = new Set(FEATURED.map((f) => f.to));
  const groups = navGroups(state.sessionId)
    .map((g) => ({ ...g, items: g.items.filter((i) => !featured.has(i.to)) }))
    .filter((g) => g.items.length > 0);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-foreground/30 backdrop-blur-sm data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed bottom-3 left-3 top-3 z-50 flex w-[min(23rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-[2rem] border border-white/60 bg-surface-50/60 shadow-[0_30px_80px_-20px_rgba(20,16,10,0.45),inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur-2xl backdrop-saturate-150 focus:outline-hidden data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-out-to-left-6 data-[state=open]:slide-in-from-left-6 data-[state=open]:duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
        >
          <Dialog.Title className="sr-only">Navigation</Dialog.Title>
          <div className="px-4 pt-4">
            <Dialog.Close className="inline-flex min-h-10 items-center gap-2 rounded-full bg-redline px-4 font-mono text-sm font-semibold uppercase tracking-wide text-surface-50 transition-colors hover:bg-redline-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-primary">
              Close <X size={14} aria-hidden="true" />
            </Dialog.Close>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-4 pt-4">
            <nav aria-label="Primary">
              <ul className="flex flex-col">
                {FEATURED.map((f, i) => {
                  const active = f.match(pathname);
                  return (
                    <m.li
                      key={f.to}
                      initial={{ opacity: 0, x: -24, filter: "blur(6px)" }}
                      animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                      transition={{ duration: 0.6, delay: 0.12 + i * 0.06, ease: CURVE }}
                    >
                      <Link
                        to={f.to}
                        onClick={close}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "block py-1 font-mono text-[1.75rem] font-medium uppercase leading-tight tracking-tight transition-colors sm:text-3xl",
                          active
                            ? "text-redline underline decoration-2 underline-offset-8"
                            : "text-ink-primary hover:text-redline"
                        )}
                      >
                        {f.label}
                      </Link>
                    </m.li>
                  );
                })}
              </ul>

              <m.div
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.5, ease: CURVE }}
                className="relative mt-6"
              >
                <span
                  aria-hidden="true"
                  className="absolute -right-3 -top-3 size-20 rounded-full bg-redline/80 blur-[2px]"
                />
                <span
                  aria-hidden="true"
                  className="absolute -bottom-3 left-8 size-14 rounded-full bg-ink-primary/70"
                />
                <Link
                  to={routes.mentor()}
                  onClick={close}
                  className="relative block rounded-3xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-redline"
                >
                  <GlassSurface
                    width="100%"
                    height="auto"
                    borderRadius={24}
                    blur={14}
                    brightness={95}
                    opacity={0.85}
                    backgroundOpacity={0.3}
                    distortionScale={-90}
                    mixBlendMode="normal"
                    className="min-h-28"
                  >
                    <span className="flex w-full flex-col gap-1 p-5 text-left text-ink-primary">
                      <span className="font-mono text-xs uppercase tracking-wide text-ink-secondary">
                        Stuck on a problem?
                      </span>
                      <span className="flex items-start gap-2 text-xl font-semibold leading-snug">
                        Paste it. Get hints, not spoilers.
                        <ArrowUpRight
                          size={20}
                          aria-hidden="true"
                          className="mt-1 shrink-0"
                        />
                      </span>
                    </span>
                  </GlassSurface>
                </Link>
              </m.div>

              <div className="mt-8 flex flex-col gap-5">
                {groups.map((g) => (
                  <div key={g.id}>
                    <h2 className="eyebrow pb-1" id={`menu-${g.id}`}>
                      {g.label}
                    </h2>
                    <ul aria-labelledby={`menu-${g.id}`} className="flex flex-col">
                      {g.items.map((item) => {
                        const active = item.match(pathname);
                        return (
                          <li key={item.label}>
                            <Link
                              to={item.to}
                              onClick={close}
                              aria-current={active ? "page" : undefined}
                              className={cn(
                                "flex min-h-10 items-center gap-2.5 rounded-md px-2 text-[15px] transition-colors hover:bg-accent",
                                active
                                  ? "font-semibold text-redline"
                                  : "font-medium text-ink-secondary hover:text-foreground"
                              )}
                            >
                              <item.icon
                                size={16}
                                strokeWidth={1.75}
                                aria-hidden="true"
                                className={active ? "text-redline" : "text-ink-muted"}
                              />
                              {item.label}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            </nav>
          </div>

          <div className="border-t border-line px-4 py-3">
            <AccountMenu />
            <p className="mt-2 px-1 font-mono text-xs text-ink-muted">
              UNBLUFF · evidence, not claims
            </p>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
