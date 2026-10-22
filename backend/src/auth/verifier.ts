import { cert, getApp, getApps, initializeApp } from "firebase-admin/app";
import { getAppCheck } from "firebase-admin/app-check";
import { getAuth, type Auth } from "firebase-admin/auth";
import type { AppCheckVerifier } from "../security/appCheck.js";

export interface VerifiedToken {
  uid: string;
  /** False only when the provider says the address is not verified. Test verifiers may leave it out. */
  email_verified?: boolean;
  /** When the student actually signed in (seconds since epoch), used for revocation checks. */
  auth_time?: number;
}

export interface TokenVerifier {
  /** Resolves with the verified uid, or rejects for any invalid or expired token. */
  verify(token: string): Promise<VerifiedToken>;
}

/** The Admin operations the revocation guard needs (a small seam so tests can fake them). */
export interface AccountAdmin {
  /** Rejects with code "auth/user-not-found" for a deleted account. */
  getUser(uid: string): Promise<{ disabled: boolean; tokensValidAfterTime?: string }>;
  revokeRefreshTokens(uid: string): Promise<void>;
}

export interface ServiceAccountCredentials {
  project_id?: string;
  client_email: string;
  private_key: string;
}

/**
 * Verifies Firebase ID tokens. Signature checks use Google's public certificates, so verification itself needs only the
 * project id. The revocation guard's user lookups do need credentials: the service-account JSON when given (e.g. Render),
 * otherwise Application Default Credentials (Cloud Run). With FIREBASE_AUTH_EMULATOR_HOST set (local dev) the Admin SDK
 * talks to the emulator instead.
 */
export class FirebaseTokenVerifier implements TokenVerifier {
  private readonly verifyIdToken: (token: string) => Promise<VerifiedToken>;
  private readonly auth: Auth | null = null;
  private readonly appCheckVerifier: AppCheckVerifier | null = null;

  /** `verifyIdToken` is injectable for unit tests; production uses the Admin SDK. */
  constructor(projectId: string, verifyIdToken?: (token: string) => Promise<VerifiedToken>, credentials?: ServiceAccountCredentials | null) {
    if (verifyIdToken) {
      this.verifyIdToken = verifyIdToken;
      return;
    }
    const app =
      getApps().length > 0
        ? getApp()
        : initializeApp({ projectId, ...(credentials ? { credential: cert({ projectId: credentials.project_id ?? projectId, clientEmail: credentials.client_email, privateKey: credentials.private_key }) } : {}) });
    const auth = getAuth(app);
    this.auth = auth;
    const appCheck = getAppCheck(app);
    this.appCheckVerifier = { verify: async (token) => void (await appCheck.verifyToken(token)) };
    this.verifyIdToken = async (token) => {
      const d = await auth.verifyIdToken(token);
      return { uid: d.uid, email_verified: d.email_verified === true, auth_time: d.auth_time };
    };
  }

  verify(token: string): Promise<VerifiedToken> {
    return this.verifyIdToken(token);
  }

  /** Firebase App Check token verification, or null when built with an injected verifier (tests). */
  appCheck(): AppCheckVerifier | null {
    return this.appCheckVerifier;
  }

  /** Admin operations for the revocation guard, or null when built with an injected verifier (tests). */
  admin(): AccountAdmin | null {
    const auth = this.auth;
    if (!auth) return null;
    return {
      getUser: async (uid) => {
        const u = await auth.getUser(uid);
        return { disabled: u.disabled, tokensValidAfterTime: u.tokensValidAfterTime };
      },
      revokeRefreshTokens: (uid) => auth.revokeRefreshTokens(uid),
    };
  }
}
