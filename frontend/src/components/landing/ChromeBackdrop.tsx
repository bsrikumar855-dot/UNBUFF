import React, { Suspense, lazy, useEffect, useRef, useState } from "react";

// WebGL, so it is code-split and only loaded in browsers that can run it.
const LiquidChrome = lazy(() => import("@/components/reactbits/LiquidChrome"));

function canRunWebGL(): boolean {
  try {
    return Boolean(document.createElement("canvas").getContext("webgl2"));
  } catch {
    return false;
  }
}

/**
 * Soft ribbons of liquid chrome swirling behind the hero (React Bits' Liquid Chrome), tinted in the app's red and
 * kept light so the headline stays readable. The cursor ripples it. It fades out towards the bottom edge, stays still
 * for people who ask for reduced motion, is left out where WebGL is unavailable, and is dropped if the graphics
 * context is lost (the soft red light behind it remains).
 */
export const ChromeBackdrop: React.FC = () => {
  const [ready, setReady] = useState(false);
  const [still, setStill] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setReady(canRunWebGL());
    setStill(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
  }, []);
  useEffect(() => {
    if (!ready) return;
    let canvas: HTMLCanvasElement | null = null;
    const lose = () => setReady(false);
    const timer = window.setTimeout(() => {
      canvas = box.current?.querySelector("canvas") ?? null;
      if (!canvas) return;
      canvas.addEventListener("webglcontextlost", lose);
      if (canvas.getContext("webgl2")?.isContextLost()) lose();
    }, 2500);
    return () => {
      window.clearTimeout(timer);
      canvas?.removeEventListener("webglcontextlost", lose);
    };
  }, [ready]);
  if (!ready) return null;
  return (
    <div
      ref={box}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10 opacity-50 [mask-image:linear-gradient(to_bottom,black_55%,transparent_100%)]"
    >
      <Suspense fallback={null}>
        <LiquidChrome
          color="#E5604F"
          lightMode
          speed={still ? 0 : 0.2}
          amplitude={0.3}
          interactive
          maxDevicePixelRatio={1}
          className="h-full w-full"
        />
      </Suspense>
    </div>
  );
};
