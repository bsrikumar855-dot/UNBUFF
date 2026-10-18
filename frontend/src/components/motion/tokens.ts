import { EASE } from "./ease";

/**
 * The motion scale, in one place. Everything animates with one easing curve (EASE, a quick start and a long settle) and
 * these durations, so no screen moves at a speed of its own.
 *
 *   instant  120 ms  press and hover feedback on controls
 *   fast     200 ms  menus, toggles, small state changes
 *   base     320 ms  content entering: list rows, blocks, results
 *   slow     520 ms  rules drawing, section entrances
 *   hero     800 ms  the one editorial moment per marketing section (kinetic type)
 *
 * Only transform, opacity and (for the scan reveal) clip-path are animated. Distances are small so nothing travels far.
 */
export const DUR = { instant: 0.12, fast: 0.2, base: 0.32, slow: 0.52, hero: 0.8 } as const;
export const RISE = { sm: 8, md: 14, lg: 28 } as const;
export const STAGGER = { tight: 0.02, base: 0.045, loose: 0.08 } as const;
/** A list never staggers more than this many items: row nine appears with row eight, so long lists are not slow. */
export const MAX_STAGGER = 8;

export const settle = (duration: number, delay = 0) => ({ duration, ease: EASE, delay }) as const;
/** Delay for the n-th item of a group. */
export const stepDelay = (index: number, step: number = STAGGER.base) => Math.min(Math.max(index, 0), MAX_STAGGER) * step;
