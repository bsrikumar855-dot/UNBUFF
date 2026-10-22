import React, { useCallback, useEffect, useState } from "react";
import { AnimatePresence, m } from "motion/react";
import { prefersReducedMotion } from "@/components/motion/ease";

const SEEN_KEY = "unbluff_intro_seen";
/** The wordmark has landed and the pen has drawn by about 1.7 s; the screen leaves no earlier than this. */
const MIN_VISIBLE_MS = 1900;
const CURVE = [0.76, 0, 0.24, 1] as const;
const RISE = [0.22, 1, 0.36, 1] as const;

function alreadySeen(): boolean {
  try {
    return window.sessionStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

function remember(): void {
  try {
    window.sessionStorage.setItem(SEEN_KEY, "1");
  } catch {
    /* private mode: the intro may play again on the next visit, which is harmless */
  }
}

/** Resolves once the page's fonts and resources have loaded (or after a short cap), so the reveal never shows a half-built page. */
function pageReady(): Promise<void> {
  const loaded = new Promise<void>((resolve) => {
    if (document.readyState === "complete") resolve();
    else window.addEventListener("load", () => resolve(), { once: true });
  });
  const fonts = document.fonts?.ready?.then(() => undefined) ?? Promise.resolve();
  const cap = new Promise<void>((resolve) => window.setTimeout(resolve, 6000));
  return Promise.race([Promise.all([loaded, fonts]).then(() => undefined), cap]);
}

/**
 * The opening screen, shown once per browser tab session: a red liquid-glass field, the UNBLUFF wordmark rising letter by
 * letter, and the red pen drawing under "BLUFF". It stays at least long enough to be seen, and leaves only when the page
 * (fonts included) is ready, sliding up on a curved edge to reveal the site. Anyone can skip it with a click, a key press
 * or Escape, and it is not shown at all to people who ask for reduced motion. It never claims progress it cannot measure.
 */
export const IntroLoader: React.FC = () => {
  const [show, setShow] = useState(() => !alreadySeen() && !prefersReducedMotion());
  const close = useCallback(() => {
    remember();
    setShow(false);
  }, []);

  // The page underneath is already built; keep it from scrolling while the intro covers it.
  useEffect(() => {
    if (!show) return;
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = before;
    };
  }, [show]);

  useEffect(() => {
    if (!show) return;
    let cancelled = false;
    const minimum = new Promise<void>((resolve) =>
      window.setTimeout(resolve, MIN_VISIBLE_MS)
    );
    void Promise.all([minimum, pageReady()]).then(() => !cancelled && close());
    const onKey = () => close();
    window.addEventListener("keydown", onKey);
    return () => {
      cancelled = true;
      window.removeEventListener("keydown", onKey);
    };
  }, [show, close]);

  const letters = "UNBLUFF".split("");
  return (
    <AnimatePresence>
      {show && (
        <m.div
          key="intro"
          role="status"
          aria-label="Loading UNBLUFF"
          onClick={close}
          initial={{ y: 0 }}
          exit={{ y: "-108%" }}
          transition={{ duration: 0.95, ease: CURVE }}
          className="fixed inset-0 z-1400 cursor-pointer select-none"
        >
          <div className="absolute inset-0 overflow-hidden bg-[linear-gradient(165deg,#ffb4a6_0%,#f4705e_36%,#d8402f_70%,#a3241a_100%)]">
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -left-32 -top-40 size-[44rem] rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.75),rgba(255,255,255,0)_66%)] blur-2xl motion-safe:animate-[liquid-drift-a_9s_ease-in-out_infinite]"
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -bottom-48 -right-32 size-[52rem] rounded-full bg-[radial-gradient(circle,rgba(110,14,8,0.7),rgba(110,14,8,0)_66%)] blur-2xl motion-safe:animate-[liquid-drift-b_11s_ease-in-out_infinite]"
            />
            <div className="relative flex h-full items-center justify-center px-6">
              <div className="relative text-[clamp(3rem,14vw,10rem)]" aria-hidden="true">
                <div className="flex font-semibold uppercase leading-[0.9] tracking-[-0.05em] text-white">
                  {letters.map((l, i) => (
                    <span
                      key={`${l}-${i}`}
                      className="inline-block overflow-hidden pb-[0.08em]"
                    >
                      <m.span
                        className="serif inline-block"
                        initial={{ y: "110%" }}
                        animate={{ y: "0%" }}
                        transition={{
                          duration: 0.85,
                          ease: RISE,
                          delay: 0.15 + i * 0.07,
                        }}
                      >
                        {l}
                      </m.span>
                    </span>
                  ))}
                </div>
                <m.span
                  className="absolute -bottom-[0.02em] right-0 block h-[0.06em] origin-left rounded-full bg-white"
                  style={{ width: "71.4%" }}
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: 0.7, ease: RISE, delay: 1 }}
                />
              </div>
            </div>
            <p
              className="absolute inset-x-0 bottom-8 text-center font-mono text-xs uppercase tracking-[0.2em] text-white/80"
              aria-hidden="true"
            >
              Evidence, not claims
            </p>
          </div>
          {/* The curved lower edge: a wide ellipse hanging below the screen, so the sheet leaves like a rolled curtain. */}
          <div
            aria-hidden="true"
            className="absolute left-[-10%] right-[-10%] top-[calc(100%-1px)] h-[16vh] rounded-b-[50%] bg-[#a3241a]"
          />
        </m.div>
      )}
    </AnimatePresence>
  );
};
