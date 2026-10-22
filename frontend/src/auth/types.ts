export interface AuthUser {
  uid: string;
  email: string | null;
  /** False until the student follows the link in the verification email. Absent means "not reported" (treated as verified). */
  emailVerified?: boolean;
}

/**
 * The only surface the app uses from the identity provider. The real implementation wraps the Firebase
 * client SDK; tests inject a fake. The client never decides who a user is — the backend verifies the
 * ID token this hands out.
 */
export interface AuthClient {
  /** True when the Firebase web config is present. When false every auth action fails with a clear message. */
  readonly configured: boolean;
  /** Calls back with the persisted user (or null) once known, then on every change. Returns an unsubscribe. */
  onChange(callback: (user: AuthUser | null) => void): () => void;
  /** `remember` false keeps the sign-in for this tab only (shared computers). */
  signIn(email: string, password: string, remember?: boolean): Promise<void>;
  /** Also sends the verification email. */
  signUp(email: string, password: string, remember?: boolean): Promise<void>;
  signOut(): Promise<void>;
  sendPasswordReset(email: string): Promise<void>;
  /** A Firebase App Check token for this web app, or null when App Check isn't configured. */
  getAppCheckToken?(): Promise<string | null>;
  /** A fresh (auto-refreshed) ID token, or null when signed out. */
  getIdToken(): Promise<string | null>;
  /** Re-checks the current password, then sets a new one. Optional so lightweight test fakes need not implement it. */
  changePassword?(currentPassword: string, newPassword: string): Promise<void>;
  sendVerificationEmail?(): Promise<void>;
  /** Re-reads the account (e.g. after the email link was followed) and refreshes the ID token. */
  refreshUser?(): Promise<void>;
  /** Re-checks the password (a recent sign-in is required before deleting the account). */
  verifyPassword?(password: string): Promise<void>;
  /** Permanently deletes the sign-in account. Call verifyPassword first; the app deletes its own data in between. */
  deleteAccount?(): Promise<void>;
}

export type AuthStatus = "loading" | "signedIn" | "signedOut";

export class AuthError extends Error {
  constructor(
    message: string,
    readonly code: string
  ) {
    super(message);
    this.name = "AuthError";
  }
}
