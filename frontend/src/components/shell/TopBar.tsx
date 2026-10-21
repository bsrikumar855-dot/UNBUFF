import React from "react";
import { Menu, Search } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import GlassSurface from "@/components/reactbits/GlassSurface";
import { Wordmark } from "./Wordmark";

/** The header at every width and for everyone: a Menu pill that opens the floating panel, the wordmark, and search. */
export const TopBar: React.FC<{
  onMenu: () => void;
  onSearch?: () => void;
  right?: React.ReactNode;
}> = ({ onMenu, onSearch, right }) => (
  <header className="sticky top-0 z-40 grid h-(--topbar-h) grid-cols-[1fr_auto_1fr] items-center border-b border-white/50 bg-card/70 px-3 backdrop-blur-xl backdrop-saturate-150 sm:px-5">
    <div>
      <GlassSurface
        width="auto"
        height={40}
        borderRadius={999}
        blur={10}
        brightness={95}
        opacity={0.9}
        backgroundOpacity={0.55}
        distortionScale={-60}
        mixBlendMode="normal"
        className="inline-flex"
      >
        <button
          type="button"
          onClick={onMenu}
          aria-haspopup="dialog"
          className="inline-flex min-h-10 items-center gap-2 rounded-full px-4 font-mono text-sm font-semibold uppercase tracking-wide text-ink-primary transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-105 active:scale-95"
        >
          <Menu size={16} aria-hidden="true" />
          Menu
        </button>
      </GlassSurface>
    </div>
    <Wordmark />
    <div className="flex items-center justify-end gap-2">
      {right}
      {onSearch && (
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
      )}
    </div>
  </header>
);
