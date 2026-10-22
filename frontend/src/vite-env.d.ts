/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
  /** Local development only, e.g. http://127.0.0.1:9099 (Firebase Auth emulator). */
  readonly VITE_FIREBASE_AUTH_EMULATOR_URL?: string;
  /** reCAPTCHA Enterprise site key for Firebase App Check (unset: App Check is off). */
  readonly VITE_FIREBASE_APPCHECK_SITE_KEY?: string;
  /** App Check debug token for local development against an enforcing project. Never set it for a production build. */
  readonly VITE_FIREBASE_APPCHECK_DEBUG_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
