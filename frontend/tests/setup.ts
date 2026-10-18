import "@testing-library/jest-dom";
import { configure } from "@testing-library/react";

// The first render of a lazily loaded page pays for importing the animation library under the full parallel suite; give
// asynchronous queries room for that instead of failing on a cold start.
configure({ asyncUtilTimeout: 4000 });

// jsdom has no IntersectionObserver, and the animation library's "when in view" effects require one. This inert stub never
// reports an intersection; it is marked so the product's own canObserve() still treats the test environment as "cannot
// animate", which keeps every number and heading in its final state.
class InertIntersectionObserver {
  static readonly __unbluffStub = true;
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}
if (typeof window !== "undefined" && typeof window.IntersectionObserver === "undefined") {
  (window as unknown as { IntersectionObserver: unknown }).IntersectionObserver = InertIntersectionObserver;
  (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = InertIntersectionObserver;
}
