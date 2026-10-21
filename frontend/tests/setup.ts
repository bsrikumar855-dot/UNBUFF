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

// jsdom has no ResizeObserver; the glass surface (React Bits) measures itself with one.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

// jsdom has no CSS.supports; the glass surface asks it whether the browser can do backdrop filters.
if (typeof globalThis.CSS === "undefined") (globalThis as unknown as { CSS: object }).CSS = {};
if (typeof globalThis.CSS.supports !== "function") globalThis.CSS.supports = () => false;

// jsdom has no Web Animations API; the pill navigation (React Bits) animates with element.animate().
if (typeof Element !== "undefined" && typeof Element.prototype.animate !== "function") {
  Element.prototype.animate = function () {
    const animation = {
      finished: Promise.resolve(),
      cancel() {},
      finish() {},
      play() {},
      pause() {},
      reverse() {},
      commitStyles() {},
      addEventListener() {},
      removeEventListener() {},
      onfinish: null,
      oncancel: null,
      playbackRate: 1,
      currentTime: 0,
    };
    return animation as unknown as Animation;
  };
  Element.prototype.getAnimations = () => [];
}
