import type { AccountAdmin } from "../auth/verifier.js";

/** Transient conditions: the check could not reach Firebase, which says nothing about the configuration. */
const TRANSIENT = new Set(["app/network-error", "app/network-timeout", "auth/internal-error"]);

export type AdminCheck = { ok: true } | { ok: false; transient: boolean; code: string };

/**
 * Proves at startup that the backend can use Firebase Authentication's Admin API (needed by the revocation guard): it
 * looks up a uid that cannot exist and expects "user not found". Missing credentials or a missing IAM role show up here
 * instead of as revoked sessions silently staying valid.
 */
export async function checkAdminAccess(admin: AccountAdmin): Promise<AdminCheck> {
  try {
    await admin.getUser("unbluff-startup-probe-0000000000");
    return { ok: true }; // the probe uid exists?! Access works either way.
  } catch (err) {
    const code = typeof err === "object" && err !== null && "code" in err ? String((err as { code: unknown }).code) : "unknown";
    if (code === "auth/user-not-found") return { ok: true };
    return { ok: false, transient: TRANSIENT.has(code), code };
  }
}
