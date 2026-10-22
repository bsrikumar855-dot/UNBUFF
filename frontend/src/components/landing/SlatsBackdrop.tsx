import React, { Suspense, lazy, useEffect, useState } from "react";

// WebGL, so it is code-split and only loaded in browsers that can run it.
const MicroSlats = lazy(() => import("@/components/reactbits/MicroSlats"));

function canRunWebGL(): boolean {
  try {
    return Boolean(document.createElement("canvas").getContext("webgl2"));
  } catch {
    return false;
  }
}

/**
 * A wall of tiny slats that rolls like a sea behind the hero (React Bits' Micro Slats), tinted in the app's red on the
 * paper colour so it reads as part of the same glass theme. It fades out towards the bottom edge, pauses for people who
 * ask for reduced motion, and is simply left out where WebGL is unavailable (the soft red light behind it remains).
 */
export const SlatsBackdrop: React.FC = () => {
  const [ready, setReady] = useState(false);
  const [still, setStill] = useState(false);
  useEffect(() => {
    setReady(canRunWebGL());
    setStill(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
  }, []);
  if (!ready) return null;
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10 opacity-70 [mask-image:linear-gradient(to_bottom,black_55%,transparent_100%)]"
    >
      <Suspense fallback={null}>
        <MicroSlats
          preset="swell"
          color="#E5604F"
          glintColor="#FFF1EC"
          backgroundColor="#F4F1EA"
          slatWidth={9}
          slatHeight={22}
          gap={3}
          roundness={0.8}
          speed={0.5}
          fog={0.7}
          contrast={1.1}
          interactive
          cursorStrength={0.8}
          paused={still}
        />
      </Suspense>
    </div>
  );
};
