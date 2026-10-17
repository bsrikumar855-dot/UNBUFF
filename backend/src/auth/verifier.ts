import { getApp, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

export interface TokenVerifier {
  /** Resolves with the verified uid, or rejects for any invalid or expired token. */
  verify(token: string): Promise<{ uid: string }>;
}

/**
 * Verifies Firebase ID tokens. Only the project id is needed: signature checks use Google's public
 * certificates, so no service-account secret is required for authentication. With
 * FIREBASE_AUTH_EMULATOR_HOST set (local dev) the Admin SDK accepts emulator tokens instead.
 */
export class FirebaseTokenVerifier implements TokenVerifier {
  private readonly verifyIdToken: (token: string) => Promise<{ uid: string }>;

  /** `verifyIdToken` is injectable for unit tests; production uses the Admin SDK. */
  constructor(projectId: string, verifyIdToken?: (token: string) => Promise<{ uid: string }>) {
    if (verifyIdToken) {
      this.verifyIdToken = verifyIdToken;
      return;
    }
    const app = getApps().length > 0 ? getApp() : initializeApp({ projectId });
    const auth = getAuth(app);
    this.verifyIdToken = (token) => auth.verifyIdToken(token);
  }

  verify(token: string): Promise<{ uid: string }> {
    return this.verifyIdToken(token);
  }
}
