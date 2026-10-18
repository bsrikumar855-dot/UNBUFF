import React from "react";
import { Search } from "lucide-react";
import { Wordmark } from "./Wordmark";
import { NavList } from "./NavList";
import { AccountMenu } from "./AccountMenu";

/** Desktop navigation rail (lg and up): wordmark, command search, grouped routes, account. It scrolls on its own. */
export const Sidebar: React.FC<{ onSearch: () => void }> = ({ onSearch }) => (
  <aside className="sticky top-0 hidden h-screen w-[var(--sidebar-w)] shrink-0 flex-col border-r border-line bg-surface lg:flex">
    <div className="flex h-[var(--topbar-h)] items-center border-b border-line px-5">
      <Wordmark />
    </div>
    <div className="px-3 pt-3">
      <button
        type="button"
        onClick={onSearch}
        className="flex min-h-10 w-full items-center gap-2 rounded-md border border-line px-3 text-sm text-ink-muted hover:border-line-strong hover:text-ink-primary"
      >
        <Search size={14} aria-hidden="true" />
        <span>Go to…</span>
        <kbd className="ml-auto font-mono text-[10px] text-ink-subtle">Ctrl K</kbd>
      </button>
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto px-3 py-5">
      <NavList />
    </div>
    <div className="border-t border-line p-3">
      <AccountMenu />
    </div>
  </aside>
);
