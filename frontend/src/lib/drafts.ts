/**
 * Code drafts live only in this browser, under a key that includes the signed-in uid, so one account never
 * loads another account's code. Everything is wrapped in try/catch: storage can be missing or blocked.
 */
const PREFIX = "unbluff:draft:";
const key = (uid: string, questionId: string, language: string) =>
  `${PREFIX}${uid}:${questionId}:${language}`;

export function loadDraft(
  uid: string,
  questionId: string,
  language: string
): string | null {
  try {
    return window.localStorage.getItem(key(uid, questionId, language));
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
    window.localStorage.setItem(key(uid, questionId, language), source);
  } catch {
    // storage full or blocked: the draft just isn't kept
  }
}

export function removeDraft(uid: string, questionId: string, language: string): void {
  try {
    window.localStorage.removeItem(key(uid, questionId, language));
  } catch {
    // ignore
  }
}

/** Removes every draft saved for this account on this browser (called on sign-out). */
export function clearDrafts(uid: string): void {
  try {
    const mine = `${PREFIX}${uid}:`;
    const doomed: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(mine)) doomed.push(k);
    }
    doomed.forEach((k) => window.localStorage.removeItem(k));
  } catch {
    // ignore
  }
}
