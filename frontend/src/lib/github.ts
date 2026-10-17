import type {
  GithubCallbackReason,
  GithubCheckStatus,
  GithubFreshness,
  GithubSyncResponse,
} from "@/types/contract";

/** Why a connection attempt ended without a connection (the backend sends ?github=error&reason=...). */
export const CALLBACK_REASON_COPY: Record<GithubCallbackReason, string> = {
  access_denied: "You cancelled the authorization on GitHub, so nothing was connected.",
  invalid_state:
    "That connection attempt was not valid or had already been used. Start again from here.",
  expired_state: "That connection attempt expired after 10 minutes. Start again.",
  exchange_failed: "GitHub did not confirm the authorization. Try connecting again.",
  already_linked:
    "That GitHub account is already linked to another UNBLUFF student. Each GitHub account can be linked once.",
  excessive_permissions:
    "GitHub reported more access than this app accepts (it only ever reads public data), so the connection was refused. Revoke UNBLUFF in your GitHub settings under Applications, then connect again.",
  not_configured: "GitHub connection is not set up on this server.",
  github_unavailable: "GitHub could not be reached. Try again in a moment.",
};

export function isCallbackReason(v: string | null): v is GithubCallbackReason {
  return v !== null && v in CALLBACK_REASON_COPY;
}

/** The backend always sends GitHub's real authorization page; refuse to navigate anywhere else. */
export function isGithubAuthorizeUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return (
      u.protocol === "https:" &&
      u.hostname === "github.com" &&
      u.pathname === "/login/oauth/authorize"
    );
  } catch {
    return false;
  }
}

export const FRESHNESS_LABEL: Record<GithubFreshness, string> = {
  never_synced: "Not synchronised yet",
  fresh: "Up to date",
  stale: "May be out of date",
};

export const CHECK_STATUS_LABEL: Record<GithubCheckStatus, string> = {
  pass: "Done",
  fail: "Missing",
  unknown: "Couldn't check",
};

export function syncMessage(r: GithubSyncResponse): string {
  switch (r.outcome) {
    case "synced":
      return "Synchronised with GitHub just now.";
    case "partial":
      return r.unavailable_sections.length > 0
        ? `Synchronised, but GitHub did not return: ${r.unavailable_sections.join(", ")}. Older saved data for those is kept and labelled.`
        : "Synchronised. GitHub reported errors on some items, so a few may be missing.";
    case "cached":
      return r.connection.next_sync_allowed_at
        ? `Synchronised recently, so no new request was made. You can sync again after ${new Date(r.connection.next_sync_allowed_at).toLocaleTimeString()}.`
        : "Synchronised recently, so no new request was made.";
    case "in_progress":
      return "A synchronisation is already running.";
  }
}

/** 0 = none, 1..4 = quartiles of the busiest day. */
export function heatLevel(count: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0 || max <= 0) return 0;
  const r = count / max;
  return r > 0.75 ? 4 : r > 0.5 ? 3 : r > 0.25 ? 2 : 1;
}

export function monthLabel(period: string): string {
  const [y, m] = period.split("-");
  const d = new Date(Date.UTC(Number(y), Number(m) - 1, 1));
  return d.toLocaleDateString(undefined, {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export const formatWhen = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleString() : "never";
