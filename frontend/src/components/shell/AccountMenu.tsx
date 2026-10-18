import React from "react";
import { LogOut } from "lucide-react";
import { useAuth } from "@/auth/context";
import { useSignOut } from "./useSignOut";

/**
 * Who is signed in, and a plain, always-visible Sign out. Settings and mentor memory live in the navigation
 * (Account group), so the account block needs nothing hidden behind a menu.
 */
export const AccountMenu: React.FC = () => {
  const auth = useAuth();
  const signOut = useSignOut();
  const email = auth.user?.email ?? "Signed in";
  return (
    <div className="flex items-center gap-3 px-1">
      <span
        aria-hidden="true"
        className="grid size-9 shrink-0 place-items-center rounded-sm bg-ink-primary font-mono text-xs font-medium uppercase text-surface-50"
      >
        {email.slice(0, 1)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink-primary" title={email}>
          {email}
        </p>
        <p className="eyebrow">Student</p>
      </div>
      <button
        type="button"
        onClick={() => void signOut()}
        className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-ink-secondary hover:bg-surface-100 hover:text-ink-primary"
      >
        <LogOut size={14} aria-hidden="true" />
        Sign out
      </button>
    </div>
  );
};
