import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Search } from "lucide-react";
import PillNav, { type PillNavItem } from "@/components/reactbits/PillNav";
import { useAuth } from "@/auth/context";
import { routes } from "@/lib/routes";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AccountMenu } from "./AccountMenu";

interface Entry extends PillNavItem {
  match?: (pathname: string) => boolean;
}

const PUBLIC: Entry[] = [
  { label: "DSA", href: routes.dsa, match: (p) => p === "/dsa" || p.startsWith("/dsa/") },
  {
    label: "Patterns",
    href: routes.learnPatterns,
    match: (p) => p.startsWith("/learn/patterns"),
  },
  { label: "DBMS", href: routes.learnDbms, match: (p) => p.startsWith("/learn/dbms") },
  { label: "Roadmap", href: routes.roadmap(), match: (p) => p === "/roadmap" },
];

/** React Bits' PillNav draws plain anchors; this hands its links to the router instead. */
const RouterLink = React.forwardRef<
  HTMLAnchorElement,
  { href: string } & React.ComponentProps<"a">
>(({ href, ...props }, ref) => <Link ref={ref} to={href} {...props} />);
RouterLink.displayName = "RouterLink";

/**
 * The marketing header: the landing page, sign-in and what a signed-out visitor can open. A pill navigation (a fill
 * rises through each link on hover, a dot slides to the page you are on) with the public places, and at the right the
 * call to action, or the account when someone is signed in. Signed-in students use the sidebar everywhere else. If the
 * pills do not fit, the component folds them into its own menu.
 */
export const TopBar: React.FC<{
  onSearch?: () => void;
  right?: React.ReactNode;
}> = ({ onSearch, right }) => {
  const { pathname } = useLocation();
  const { status } = useAuth();
  const items: PillNavItem[] = PUBLIC.map(({ match: _m, ...item }) => item);
  const active = PUBLIC.find((e) => e.match?.(pathname));

  return (
    <header className="sticky top-0 z-40 grid h-(--topbar-h) grid-cols-[minmax(0,1fr)_auto] items-center gap-3 overflow-x-clip bg-surface-50/55 px-3 backdrop-blur-xl backdrop-saturate-150 sm:px-5">
      {/* PillNav sizes itself to its parent, so give it a cell of its own that stops where the actions begin. */}
      <div className="min-w-0">
        <PillNav
          logo={<span className="font-mono text-sm font-bold text-ink-primary">U</span>}
          logoAlt="UNBLUFF home"
          logoHref={routes.home}
          items={items}
          activeHref={active?.href ?? ""}
          linkComponent={RouterLink}
          theme="light"
          layout="split"
          size="md"
          surface="glass"
          hoverEffect="fill"
          indicator="dot"
          highlightColor="#b3291a"
          highlightTextColor="#ffffff"
          textColor="#15130f"
          // jsdom has no layout, so "auto" would always collapse to the burger; tests exercise the full pills.
          collapse={import.meta.env.MODE === "test" ? "never" : "auto"}
          style={{ "--pn-surface": "rgba(246, 243, 236, 0.93)" } as React.CSSProperties}
          ariaLabel="Primary"
        />
      </div>
      <div className="flex items-center justify-end gap-2">
        {right}
        {onSearch && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onSearch}
                aria-label="Go to a screen"
                className="inline-flex size-11 items-center justify-center rounded-full text-ink-secondary transition-colors hover:bg-accent hover:text-foreground"
              >
                <Search size={18} aria-hidden="true" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Go to a screen (Ctrl K)</TooltipContent>
          </Tooltip>
        )}
        {status === "signedIn" && <AccountMenu variant="compact" />}
      </div>
    </header>
  );
};
