import { initializeApp, type FirebaseApp } from "firebase/app";
import {
  EmailAuthProvider,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  deleteUser,
  reauthenticateWithCredential,
  updatePassword,
  getAuth,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type Auth,
} from "firebase/auth";
import { AuthError, type AuthClient } from "./types";

/** Firebase web config is public by design (it identifies the project; it is not a secret). */
function readConfig() {
  const env = import.meta.env;
  const apiKey = env.VITE_FIREBASE_API_KEY;
  const authDomain = env.VITE_FIREBASE_AUTH_DOMAIN;
  const projectId = env.VITE_FIREBASE_PROJECT_ID;
  const appId = env.VITE_FIREBASE_APP_ID;
  if (!apiKey || !authDomain || !projectId || !appId) return null;
  return { apiKey, authDomain, projectId, appId };
}

const FRIENDLY: Record<string, string> = {
  "auth/invalid-email": "That email address doesn't look right.",
  "auth/missing-password": "Enter your password.",
  "auth/weak-password": "Choose a stronger password (at least 8 characters).",
  "auth/email-already-in-use":
    "An account with this email already exists. Try signing in instead.",
  "auth/invalid-credential": "Incorrect email or password.",
  "auth/wrong-password": "Incorrect email or password.",
  "auth/user-not-found": "Incorrect email or password.",
  "auth/user-disabled": "This account has been disabled.",
  "auth/too-many-requests": "Too many attempts. Wait a few minutes and try again.",
  "auth/network-request-failed": "Network problem. Check your connection and try again.",
  "auth/operation-not-allowed": "Email/password sign-in isn't enabled for this project.",
  "auth/requires-recent-login": "For your security, sign out and sign in again, then retry.",
};

/** Maps a Firebase error to copy that is safe to show (never the raw SDK message). */
export function toAuthError(err: unknown): AuthError {
  const code =
    typeof err === "object" && err !== null && "code" in err
      ? String((err as { code: unknown }).code)
      : "unknown";
  return new AuthError(FRIENDLY[code] ?? "Something went wrong. Please try again.", code);
}

let cached: { app: FirebaseApp; auth: Auth } | null = null;

function getFirebase(): Auth | null {
  if (cached) return cached.auth;
  const config = readConfig();
  if (!config) return null;
  const app = initializeApp(config);
  const auth = getAuth(app);
  const emulator = import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_URL;
  if (emulator) connectAuthEmulator(auth, emulator, { disableWarnings: true });
  cached = { app, auth };
  return auth;
}

const NOT_CONFIGURED = new AuthError(
  "Sign-in isn't configured for this deployment yet (missing Firebase settings).",
  "app/not-configured"
);

/** Firebase-backed client. Sessions persist across reloads (the SDK's default IndexedDB persistence). */
export const firebaseAuthClient: AuthClient = {
  get configured() {
    return readConfig() !== null;
  },

  onChange(callback) {
    const auth = getFirebase();
    if (!auth) {
      callback(null);
      return () => undefined;
    }
    return onAuthStateChanged(auth, (u) =>
      callback(u ? { uid: u.uid, email: u.email } : null)
    );
  },

  async signIn(email, password) {
    const auth = getFirebase();
    if (!auth) throw NOT_CONFIGURED;
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      throw toAuthError(err);
    }
  },

  async signUp(email, password) {
    const auth = getFirebase();
    if (!auth) throw NOT_CONFIGURED;
    try {
      await createUserWithEmailAndPassword(auth, email, password);
    } catch (err) {
      throw toAuthError(err);
    }
  },

  async signOut() {
    const auth = getFirebase();
    if (auth) await firebaseSignOut(auth);
  },

  async sendPasswordReset(email) {
    const auth = getFirebase();
    if (!auth) throw NOT_CONFIGURED;
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (err) {
      // Don't reveal whether an address has an account.
      const mapped = toAuthError(err);
      if (mapped.code === "auth/user-not-found") return;
      throw mapped;
    }
  },

  async changePassword(currentPassword, newPassword) {
    const user = getFirebase()?.currentUser;
    if (!user?.email) throw NOT_CONFIGURED;
    try {
      // Firebase requires a recent sign-in for sensitive changes; re-checking the password also proves it's the owner.
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, currentPassword));
      await updatePassword(user, newPassword);
    } catch (err) {
      throw toAuthError(err);
    }
  },

  async verifyPassword(password) {
    const user = getFirebase()?.currentUser;
    if (!user?.email) throw NOT_CONFIGURED;
    try {
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
    } catch (err) {
      throw toAuthError(err);
    }
  },

  async deleteAccount() {
    const user = getFirebase()?.currentUser;
    if (!user) throw NOT_CONFIGURED;
    try {
      await deleteUser(user);
    } catch (err) {
      throw toAuthError(err);
    }
  },

  async getIdToken() {
    const user = getFirebase()?.currentUser;
    return user ? user.getIdToken() : null;
  },
};
