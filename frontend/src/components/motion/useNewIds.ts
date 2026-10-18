import { useRef } from "react";

/**
 * For a list that grows over time (a conversation): returns a function telling whether an item arrived after the list
 * was first shown. Items present when the list became ready are "old" and never animate, so reopening a conversation or
 * scrolling back through it replays nothing; only what arrives afterwards does. `scope` identifies which list this is
 * (a conversation id): when it changes, the new list's current items are old again. `ready` is false while the list is
 * still loading.
 */
export function useNewIds(ids: string[], scope: string, ready = true): (id: string) => boolean {
  const state = useRef<{ scope: string; seen: Set<string> } | null>(null);
  if (ready && (state.current === null || state.current.scope !== scope)) state.current = { scope, seen: new Set(ids) };
  return (id: string) => state.current !== null && state.current.scope === scope && !state.current.seen.has(id);
}
