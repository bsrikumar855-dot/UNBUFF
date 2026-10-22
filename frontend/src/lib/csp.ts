/**
 * The exact list of origins the production page may connect to, written into the built index.html as a
 * `<meta http-equiv="Content-Security-Policy">` with only `connect-src`. The hosting header (firebase.json) keeps the full
 * policy with a broad `connect-src https:`; browsers enforce both policies, so the effective list is this one. Generating
 * it from the build's own settings means a custom API domain can never be locked out by a stale hand-written list.
 */
export interface CspEnv {
  VITE_API_URL?: string;
  VITE_FIREBASE_APPCHECK_SITE_KEY?: string;
  VITE_FIREBASE_AUTH_EMULATOR_URL?: string;
}

/** Firebase Authentication's REST endpoints used by the web SDK (sign-in, token refresh, account changes). */
const FIREBASE_AUTH = ["https://identitytoolkit.googleapis.com", "https://securetoken.googleapis.com"];
/** Firebase App Check token exchange and reCAPTCHA Enterprise. */
const APP_CHECK = ["https://content-firebaseappcheck.googleapis.com", "https://firebaseappcheck.googleapis.com", "https://www.google.com/recaptcha/", "https://www.gstatic.com/recaptcha/"];

const isLocal = (host: string) => host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host.endsWith(".localhost");

export function connectSrc(env: CspEnv, opts: { production: boolean }): string {
  const sources = ["'self'", ...FIREBASE_AUTH];
  const api = env.VITE_API_URL?.trim();
  if (api) {
    let url: URL;
    try {
      url = new URL(api);
    } catch {
      throw new Error(`VITE_API_URL is not a valid URL: ${api}`);
    }
    if (opts.production && url.protocol !== "https:" && !isLocal(url.hostname)) {
      throw new Error(`VITE_API_URL must use https for a production build (got ${url.origin})`);
    }
    sources.push(url.origin);
  }
  if (env.VITE_FIREBASE_APPCHECK_SITE_KEY) sources.push(...APP_CHECK);
  if (env.VITE_FIREBASE_AUTH_EMULATOR_URL) {
    if (opts.production) throw new Error("VITE_FIREBASE_AUTH_EMULATOR_URL must not be set for a production build");
    sources.push(new URL(env.VITE_FIREBASE_AUTH_EMULATOR_URL).origin);
  }
  return [...new Set(sources)].join(" ");
}

export function cspMetaTag(env: CspEnv, opts: { production: boolean }): string {
  return `<meta http-equiv="Content-Security-Policy" content="connect-src ${connectSrc(env, opts)}" />`;
}
