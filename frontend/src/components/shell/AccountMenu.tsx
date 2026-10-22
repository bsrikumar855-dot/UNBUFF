import React from "react";
import { LogOut } from "lucide-react";
import { cn } from "@/lib/cn";
import { useAuth } from "@/auth/context";
import { useSignOut } from "./useSignOut";

/**
 * Who is signed in, and a plain, always-visible Sign out. The full form sits at the foot of the sidebar; the compact
 * form (an initial and the sign-out button) is for tight headers, and the button form is the sign-out button alone. Settings and mentor memory are pages in the
 * navigation like any other, so nothing here is hidden behind a menu.
 */
export const AccountMenu: React.FC<{ variant?: "full" | "compact" | "button" }> = ({
  variant = "full",
}) => {
  const auth = useAuth();
  const signOut = useSignOut();
  const email = auth.user?.email ?? "Signed in";
  const initial = (
    <span
      role="img"
      aria-label={`Signed in as ${email}`}
      title={email}
      className="grid size-9 shrink-0 place-items-center rounded-sm bg-ink-primary font-mono text-xs font-medium uppercase text-surface-50"
    >
      {email.slice(0, 1)}
    </span>
  );
  const button = (
    <button
      type="button"
      onClick={() => void signOut()}
      className={cn(
        "inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-ink-secondary transition-colors hover:bg-surface-100 hover:text-ink-primary",
        variant === "button" &&
          "rounded-full bg-white/60 px-4 text-ink-primary shadow-[inset_0_0_0_1px_rgba(24,24,27,0.08),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-md hover:bg-white/80"
      )}
    >
      <LogOut size={14} aria-hidden="true" />
      <span className={variant === "compact" ? "max-sm:sr-only" : undefined}>
        Sign out
      </span>
    </button>
  );
  if (variant === "button") return button;
  if (variant === "compact") {
    return (
      <div className="flex items-center gap-1.5">
        {initial}
        {button}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 px-1">
      {initial}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink-primary" title={email}>
          {email}
        </p>
        <p className="eyebrow">Student</p>
      </div>
      {button}
    </div>
  );
};
