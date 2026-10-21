import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Search } from "lucide-react";
import PillNav, { type PillNavItem } from "@/components/reactbits/PillNav";
import { useAuth } from "@/auth/context";
import { routes } from "@/lib/routes";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface Entry extends PillNavItem {
  match?: (pathname: string) => boolean;
}

const SIGNED_IN: Entry[] = [
  {
    label: "Plan",
    href: routes.placement,
    match: (p) => p === "/placement" || p === "/setup",
  },
  { label: "DSA", href: routes.dsa, match: (p) => p === "/dsa" || p.startsWith("/dsa/") },
  { label: "Mentor", href: routes.mentor(), match: (p) => p.startsWith("/mentor") },
  { label: "Learn", href: routes.learnPatterns, match: (p) => p.startsWith("/learn") },
  { label: "Career", href: routes.career, match: (p) => p.startsWith("/career") },
];

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
 * The header at every width and for everyone: a pill navigation (a fill rises through each link on hover, a dot slides
 * to the page you are on) whose last pill, More, opens the full navigation panel; and, at the right, search or the
 * call to action. Narrow screens collapse the pills into the component's own menu.
 */
export const TopBar: React.FC<{
  onMenu: () => void;
  onSearch?: () => void;
  right?: React.ReactNode;
}> = ({ onMenu, onSearch, right }) => {
  const { pathname } = useLocation();
  const { status } = useAuth();
  const entries = status === "signedIn" ? SIGNED_IN : PUBLIC;
  const items: PillNavItem[] = [
    ...entries.map(({ match: _m, ...item }) => item),
    { label: "More" },
  ];
  const active = entries.find((e) => e.match?.(pathname));

  return (
    <header className="sticky top-0 z-40 grid h-(--topbar-h) grid-cols-[minmax(0,1fr)_auto] items-center gap-3 bg-surface-50/55 px-3 backdrop-blur-xl backdrop-saturate-150 sm:px-5">
      <PillNav
        logo={<span className="font-mono text-sm font-bold text-ink-primary">U</span>}
        logoAlt="UNBLUFF home"
        logoHref={routes.home}
        items={items}
        activeHref={active?.href ?? ""}
        linkComponent={RouterLink}
        onItemClick={(item) => {
          if (item.label === "More") onMenu();
        }}
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
      </div>
    </header>
  );
};
