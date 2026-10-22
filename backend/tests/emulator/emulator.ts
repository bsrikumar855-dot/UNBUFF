/**
 * Shared helpers for the emulator suites. These tests only ever talk to the local Firebase emulators
 * (project id "demo-*"); they refuse to run if the emulator variables are missing, so they can never
 * reach a real project.
 */
export const PROJECT_ID = "demo-unbluff";

export function requireEmulators(): { firestoreHost: string; authHost: string } {
  const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST;
  const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  if (!firestoreHost || !authHost) {
    throw new Error("Run via `npm run test:emulator` (needs FIRESTORE_EMULATOR_HOST and FIREBASE_AUTH_EMULATOR_HOST).");
  }
  for (const host of [firestoreHost, authHost]) {
    if (!/^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(host)) throw new Error("Emulator hosts must be local.");
  }
  return { firestoreHost, authHost };
}

/**
 * Creates a user in the Auth emulator and returns its uid and a genuine emulator-issued ID token. By default the email is
 * marked verified (through the emulator's admin API) and the token is re-issued, as the app requires verified emails.
 */
export async function createEmulatorUser(authHost: string, email: string, password = "test-password-123", opts: { verified?: boolean } = {}) {
  const res = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  if (!res.ok) throw new Error(`emulator signUp failed: ${res.status}`);
  const body = (await res.json()) as { localId: string; idToken: string };
  if (opts.verified === false) return { uid: body.localId, idToken: body.idToken };
  const upd = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:update`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer owner" }, // the emulator's admin credential
    body: JSON.stringify({ localId: body.localId, emailVerified: true }),
  });
  if (!upd.ok) throw new Error(`emulator verify failed: ${upd.status}`);
  return { uid: body.localId, idToken: await emulatorSignIn(authHost, email, password) };
}

/** Signs in again and returns a fresh ID token (carries the current email_verified and auth_time). */
export async function emulatorSignIn(authHost: string, email: string, password = "test-password-123"): Promise<string> {
  const res = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  if (!res.ok) throw new Error(`emulator signIn failed: ${res.status}`);
  return ((await res.json()) as { idToken: string }).idToken;
}
