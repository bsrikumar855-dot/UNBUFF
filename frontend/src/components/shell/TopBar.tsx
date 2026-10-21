import React from "react";
import { Menu, Search } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Wordmark } from "./Wordmark";

/** The signed-in header at every width: a Menu pill that opens the floating panel, the wordmark, and search. */
export const TopBar: React.FC<{ onMenu: () => void; onSearch: () => void }> = ({ onMenu, onSearch }) => (
  <header className="sticky top-0 z-40 grid h-(--topbar-h) grid-cols-[1fr_auto_1fr] items-center border-b border-border bg-card px-3 sm:px-5">
    <div>
      <button
        type="button"
        onClick={onMenu}
        aria-haspopup="dialog"
        className="inline-flex min-h-10 items-center gap-2 rounded-full border border-line-strong bg-surface-50 px-4 font-mono text-sm font-semibold uppercase tracking-wide text-ink-primary transition-colors hover:border-ink-primary hover:bg-accent"
      >
        <Menu size={16} aria-hidden="true" />
        Menu
      </button>
    </div>
    <Wordmark />
    <div className="flex justify-end">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onSearch}
            aria-label="Go to a screen"
            className="inline-flex size-11 items-center justify-center rounded-md text-ink-secondary transition-colors hover:bg-accent hover:text-foreground"
          >
            <Search size={18} aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Go to a screen (Ctrl K)</TooltipContent>
      </Tooltip>
    </div>
  </header>
);
