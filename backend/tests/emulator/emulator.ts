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

/** Creates a user in the Auth emulator and returns its uid and a genuine emulator-issued ID token. */
export async function createEmulatorUser(authHost: string, email: string, password = "test-password-123") {
  const res = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  if (!res.ok) throw new Error(`emulator signUp failed: ${res.status}`);
  const body = (await res.json()) as { localId: string; idToken: string };
  return { uid: body.localId, idToken: body.idToken };
}
