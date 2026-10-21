import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/auth/context";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CommandPalette } from "./CommandPalette";
import { RouteProgress } from "./RouteProgress";
import { MobileBar } from "./MobileBar";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { HeaderActions } from "./HeaderActions";

/** Routes that always use the marketing layout, even when signed in. */
const MARKETING = new Set(["/", "/login"]);

/**
 * Chooses the layout: the marketing header for the landing and sign-in pages and for signed-out visitors, and the
 * floating icon rail that opens on hover (a top bar and drawer on small screens) for signed-in students everywhere else. Owns the skip link, the main landmark
 * and the Ctrl/Cmd+K shortcut.
 */
export const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const auth = useAuth();
  const { pathname } = useLocation();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const rail = auth.status === "signedIn" && !MARKETING.has(pathname);

  useEffect(() => {
    if (!rail) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [rail]);

  // A route change moves focus to the new page, so keyboard and screen-reader users start at the top of the content.
  useEffect(() => {
    document.getElementById("main")?.focus({ preventScroll: true });
  }, [pathname]);

  return (
    <TooltipProvider>
      <a
        href="#main"
        className="sr-only z-2000 rounded-md bg-ink-primary px-4 py-2 text-sm font-medium text-surface-50 focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Skip to content
      </a>
      <RouteProgress />
      {rail ? (
        <div className="flex min-h-screen bg-surface-50 text-ink-primary">
          <Sidebar onSearch={() => setPaletteOpen(true)} />
          {/* The rail floats over the page when it opens, so the page keeps a fixed gutter for its closed width. */}
          <div className="flex min-w-0 flex-1 flex-col lg:pl-[4.75rem]">
            <MobileBar onSearch={() => setPaletteOpen(true)} />
            <main id="main" tabIndex={-1} className="min-w-0 flex-1 focus:outline-hidden">
              <div key={pathname} className="motion-safe:animate-route-in">
                {children}
              </div>
            </main>
          </div>
          <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
        </div>
      ) : (
        <div className="flex min-h-screen flex-col bg-surface-50 text-ink-primary">
          <TopBar right={<HeaderActions />} />
          <main id="main" tabIndex={-1} className="min-w-0 flex-1 focus:outline-hidden">
            <div key={pathname} className="motion-safe:animate-route-in">
              {children}
            </div>
          </main>
          <footer className="border-t border-line px-6 py-5">
            <div className="mx-auto flex max-w-352 flex-wrap items-center justify-between gap-2 text-xs text-ink-muted">
              <span className="eyebrow">UNBLUFF · evidence, not claims</span>
              <span>&copy; 2026</span>
            </div>
          </footer>
        </div>
      )}
    </TooltipProvider>
  );
};
