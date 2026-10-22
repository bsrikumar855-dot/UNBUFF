import React, { Suspense, lazy, useEffect, useRef, useState } from "react";

// WebGL, so it is code-split and only loaded in browsers that can run it.
const FluxLines = lazy(() => import("@/components/reactbits/FluxLines"));

function canRunWebGL(): boolean {
  try {
    return Boolean(document.createElement("canvas").getContext("webgl2"));
  } catch {
    return false;
  }
}

/**
 * Glowing flux lines tracing a slow, churning fluid behind the hero (React Bits' Flux Lines), drawn in the app's red on
 * the paper colour so it belongs to the same glass theme. The cursor curls the lines. It fades out towards the bottom
 * edge, stays still for people who ask for reduced motion, and is left out where WebGL is unavailable (the soft red
 * light behind it remains).
 */
export const FluxBackdrop: React.FC = () => {
  const [ready, setReady] = useState(false);
  const [still, setStill] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setReady(canRunWebGL());
    setStill(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
  }, []);
  // If the graphics context is lost (a very slow or busy GPU), drop the effect rather than show a blank canvas.
  useEffect(() => {
    if (!ready) return;
    let canvas: HTMLCanvasElement | null = null;
    const lose = () => setReady(false);
    const timer = window.setTimeout(() => {
      canvas = box.current?.querySelector("canvas") ?? null;
      if (!canvas) return;
      canvas.addEventListener("webglcontextlost", lose);
      if (canvas.getContext("webgl2")?.isContextLost()) lose();
    }, 1500);
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
      className="pointer-events-none absolute inset-0 -z-10 [mask-image:linear-gradient(to_bottom,black_60%,transparent_100%)]"
    >
      <Suspense fallback={null}>
        <FluxLines
          colors={["#FF5A45", "#E5604F", "#F08A78"]}
          lightMode
          transparent
          speed={0.45}
          scale={1.5}
          glow={1.2}
          lineWidth={1.1}
          flowDirection="down"
          opacity={0.6}
          mouseInteraction
          mouseStrength={1}
          dpr={1}
          paused={still}
          className="h-full w-full"
        />
      </Suspense>
    </div>
  );
};
