export type AuthMode = "signin" | "register" | "reset";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MIN_PASSWORD = 8;

/** Client-side form checks (the identity provider enforces the real rules). Returns an error message or null. */
export function validateAuthForm(
  mode: AuthMode,
  email: string,
  password: string,
  confirm: string
): string | null {
  if (!EMAIL_RE.test(email.trim())) return "Enter a valid email address.";
  if (mode === "reset") return null;
  if (password.length === 0) return "Enter your password.";
  if (mode === "register") {
    if (password.length < MIN_PASSWORD)
      return `Use at least ${MIN_PASSWORD} characters for your password.`;
    if (password !== confirm) return "The two passwords don't match.";
  }
  return null;
}
