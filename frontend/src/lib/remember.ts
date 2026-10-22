/**
 * "Keep me signed in on this device". When off (a shared or lab computer), Firebase keeps the sign-in only for this tab
 * and drafts are kept in session storage, so closing the browser leaves nothing behind. The choice itself is not
 * sensitive and is remembered per browser.
 */
const KEY = "unbluff:remember";

export function rememberThisDevice(): boolean {
  try {
    return window.localStorage.getItem(KEY) !== "0";
  } catch {
    return true;
  }
}

export function setRememberThisDevice(remember: boolean): void {
  try {
    window.localStorage.setItem(KEY, remember ? "1" : "0");
  } catch {
    // storage blocked: the default (remember) applies
  }
}
