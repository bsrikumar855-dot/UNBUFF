export interface AuthUser {
  uid: string;
  email: string | null;
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
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  sendPasswordReset(email: string): Promise<void>;
  /** A fresh (auto-refreshed) ID token, or null when signed out. */
  getIdToken(): Promise<string | null>;
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
