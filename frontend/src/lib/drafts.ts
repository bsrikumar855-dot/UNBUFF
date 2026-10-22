/**
 * Code drafts live only in this browser, under a key that includes the signed-in uid, so one account never
 * loads another account's code. Everything is wrapped in try/catch: storage can be missing or blocked.
 */
import { rememberThisDevice } from "./remember";

const PREFIX = "unbluff:draft:";
/** Session storage on a device the student chose not to be remembered on, so closing the browser drops the drafts. */
const store = (): Storage => (rememberThisDevice() ? window.localStorage : window.sessionStorage);
const key = (uid: string, questionId: string, language: string) =>
  `${PREFIX}${uid}:${questionId}:${language}`;

export function loadDraft(
  uid: string,
  questionId: string,
  language: string
): string | null {
  try {
    return store().getItem(key(uid, questionId, language));
  } catch {
    return null;
  }
}

export function saveDraft(
  uid: string,
  questionId: string,
  language: string,
  source: string
): void {
  try {
    store().setItem(key(uid, questionId, language), source);
  } catch {
    // storage full or blocked: the draft just isn't kept
  }
}

export function removeDraft(uid: string, questionId: string, language: string): void {
  try {
    store().removeItem(key(uid, questionId, language));
  } catch {
    // ignore
  }
}

/** Removes every draft saved for this account on this browser, in either storage area (called on sign-out). */
export function clearDrafts(uid: string): void {
  for (const area of ["localStorage", "sessionStorage"] as const) {
    try {
      const storage = window[area];
      const mine = `${PREFIX}${uid}:`;
      const doomed: string[] = [];
      for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i);
        if (k && k.startsWith(mine)) doomed.push(k);
      }
      doomed.forEach((k) => storage.removeItem(k));
    } catch {
      // ignore
    }
  }
}
