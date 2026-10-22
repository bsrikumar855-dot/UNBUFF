import { useCallback, useContext, useEffect, useSyncExternalStore } from "react";
import { api } from "@/api/endpoints";
import { AuthContext } from "@/auth/context";
import type { AccountProfile } from "@/types/contract";

/**
 * The signed-in student's account profile, shared by the sidebar and Settings. The cached copy is tagged with the uid
 * it belongs to and is never returned for any other uid; sign-out clears it.
 */
interface Entry {
  uid: string;
  profile: AccountProfile | null;
  error: unknown;
}

let entry: Entry | null = null;
let inflight: string | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function setCachedAccountProfile(uid: string, profile: AccountProfile): void {
  entry = { uid, profile, error: null };
  notify();
}

export function clearCachedAccountProfile(): void {
  entry = null;
  inflight = null;
  notify();
}

function load(uid: string): void {
  if (inflight === uid) return;
  inflight = uid;
  Promise.resolve()
    .then(() => api.getAccountProfile())
    .then((r) => {
      if (inflight !== uid) return; // signed out or switched account meanwhile
      entry = { uid, profile: r.profile, error: null };
    })
    .catch((error: unknown) => {
      if (inflight !== uid) return;
      entry = { uid, profile: null, error };
    })
    .finally(() => {
      if (inflight === uid) inflight = null;
      notify();
    });
}

export function useAccountProfile() {
  const uid = useContext(AuthContext)?.user?.uid ?? null;
  const snapshot = useSyncExternalStore(subscribe, () => entry);
  const mine = uid && snapshot?.uid === uid ? snapshot : null;

  useEffect(() => {
    if (uid && !mine) load(uid);
  }, [uid, mine]);

  const reload = useCallback(() => {
    if (!uid) return;
    entry = null;
    notify();
    load(uid);
  }, [uid]);

  return {
    profile: mine?.profile ?? null,
    error: mine?.error ?? null,
    loading: !!uid && !mine,
    reload,
  };
}
