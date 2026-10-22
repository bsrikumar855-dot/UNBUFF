import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Who the current request is for, available to code far below the route (e.g. the language-model wrapper that charges
 * the student's daily budget) without threading a uid through every call. Set only by requireAuth from a verified token.
 */
interface RequestContext {
  uid: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithUid<T>(uid: string, fn: () => T): T {
  return storage.run({ uid }, fn);
}

/** The verified uid of the request being served, or null outside a signed-in request. */
export function currentUid(): string | null {
  return storage.getStore()?.uid ?? null;
}
