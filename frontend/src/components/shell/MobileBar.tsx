import React, { useState } from "react";
import { Menu, Search } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Wordmark } from "./Wordmark";
import { NavList } from "./NavList";
import { AccountMenu } from "./AccountMenu";

const iconButton =
  "inline-flex size-11 items-center justify-center rounded-md text-foreground transition-colors hover:bg-surface-100";

/** Below lg the rail becomes a sticky top bar and a left sheet with the same grouped navigation. */
export const MobileBar: React.FC<{ onSearch: () => void }> = ({ onSearch }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <header className="sticky top-0 z-40 flex h-[var(--topbar-h)] items-center gap-1 border-b border-border bg-card px-3 lg:hidden">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label="Open navigation"
              className={iconButton}
            >
              <Menu size={20} aria-hidden="true" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Open navigation</TooltipContent>
        </Tooltip>
        <Wordmark className="ml-1" />
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onSearch}
              aria-label="Go to a screen"
              className={`${iconButton} ml-auto text-ink-secondary`}
            >
              <Search size={18} aria-hidden="true" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Go to a screen</TooltipContent>
        </Tooltip>
      </header>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="flex w-[min(20rem,88vw)] flex-col gap-0 p-0">
          <SheetTitle className="serif border-b border-border px-5 py-4 text-xl font-semibold">
            Navigation
          </SheetTitle>
          <SheetDescription className="sr-only">Primary navigation</SheetDescription>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
            <NavList onNavigate={() => setOpen(false)} />
          </div>
          <div className="border-t border-border p-3">
            <AccountMenu />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
};
