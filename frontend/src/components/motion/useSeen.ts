import { useEffect, useState, type RefObject } from "react";
import { canObserve } from "./ease";

/**
 * True once the element has reached the viewport (and stays true): it is on screen, or the student has scrolled past it.
 * "Scrolled past" matters: an observer that only reports crossings never fires for an element a student jumped over
 * (the End key, a scrollbar drag, an in-page link), which would leave it invisible forever. So this uses one shared,
 * passive, frame-throttled scroll check that treats everything at or above the bottom edge of the viewport as seen.
 * Where the page cannot animate (jsdom, very old browsers) it is true immediately, so content never waits for it.
 *
 * `rootMargin` keeps its old meaning for the bottom edge only: "0px 0px -8% 0px" waits until the element is 8% of the
 * viewport height inside it.
 */
type Entry = { el: Element; inset: number; done: () => void };
const pending = new Set<Entry>();
let listening = false;
let frame = 0;

function check() {
  frame = 0;
  const h = window.innerHeight;
  for (const e of [...pending]) {
    if (!e.el.isConnected) {
      pending.delete(e);
      continue;
    }
    if (e.el.getBoundingClientRect().top < h * (1 - e.inset)) {
      pending.delete(e);
      e.done();
    }
  }
  if (pending.size === 0) stop();
}
const schedule = () => {
  if (!frame) frame = requestAnimationFrame(check);
};
function start() {
  if (listening) return;
  listening = true;
  window.addEventListener("scroll", schedule, { capture: true, passive: true });
  window.addEventListener("resize", schedule, { passive: true });
}
function stop() {
  if (!listening) return;
  listening = false;
  window.removeEventListener("scroll", schedule, { capture: true } as EventListenerOptions);
  window.removeEventListener("resize", schedule);
}

const bottomInset = (rootMargin: string): number => {
  const parts = rootMargin.trim().split(/\s+/);
  const bottom = parts[2] ?? parts[0] ?? "0px";
  const m = /^-(\d+(?:\.\d+)?)%$/.exec(bottom);
  return m ? Number(m[1]) / 100 : 0;
};

export function useSeen(ref: RefObject<Element>, rootMargin = "0px 0px -8% 0px"): boolean {
  const [seen, setSeen] = useState(!canObserve());
  useEffect(() => {
    const el = ref.current;
    if (seen || !el || !canObserve()) return;
    const entry: Entry = { el, inset: bottomInset(rootMargin), done: () => setSeen(true) };
    pending.add(entry);
    start();
    schedule(); // an element already on screen (or above it) is seen on the next frame
    return () => {
      pending.delete(entry);
      if (pending.size === 0) stop();
    };
  }, [ref, rootMargin, seen]);
  return seen;
}
