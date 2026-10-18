import { useRouteNavigate } from "@/lib/viewTransition";
import React, { useMemo } from "react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useSessionState } from "@/state/useSession";
import { navGroups } from "./nav";

/**
 * Jump to any screen from the keyboard (Ctrl/Cmd+K): the shadcn/ui Command palette (cmdk), which supplies filtering,
 * arrow-key navigation, Enter to open and the combobox/listbox semantics. It only navigates and never performs an
 * action, so nothing can happen by accident.
 */
export const CommandPalette: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
}> = ({ open, onOpenChange }) => {
  const routeGo = useRouteNavigate();
  const { state } = useSessionState();
  const groups = useMemo(() => navGroups(state.sessionId), [state.sessionId]);

  const go = (to: string) => {
    onOpenChange(false);
    routeGo(to);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <DialogTitle className="sr-only">Go to a screen</DialogTitle>
      <DialogDescription className="sr-only">
        Type to filter screens, use the arrow keys, press Enter to open.
      </DialogDescription>
      <CommandInput placeholder="Go to a screen…" aria-label="Go to a screen" />
      <CommandList>
        <CommandEmpty>No screen matches.</CommandEmpty>
        {groups.map((g) => (
          <CommandGroup key={g.id} heading={g.label}>
            {g.items.map((item) => (
              <CommandItem
                key={item.label}
                value={`${item.label} ${g.label} ${item.hint}`}
                onSelect={() => go(item.to)}
                className="min-h-11 gap-3"
              >
                <item.icon
                  strokeWidth={1.75}
                  aria-hidden="true"
                  className="text-ink-muted"
                />
                <span className="font-medium">{item.label}</span>
                <span className="ml-auto hidden truncate text-xs text-ink-muted sm:block">
                  {item.hint}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
};
