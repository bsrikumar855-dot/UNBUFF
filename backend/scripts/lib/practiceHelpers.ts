/** Shared building blocks for the first-party practice pack generators. Pure and deterministic. */

export interface Exercise {
  id: string;
  title: string;
  difficulty: "easy" | "medium" | "hard";
  topics: string[];
  statement: string;
  samples: string[]; // visible inputs
  tests: string[]; // hidden inputs
  solve: (input: string) => string; // reference solution (output without the trailing newline)
}

// ---------- deterministic randomness ----------
export function rng(seed: number): (n: number) => number {
  let s = seed >>> 0;
  return (n) => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return Math.floor((s / 4294967296) * n);
  };
}
export const ints = (r: (n: number) => number, n: number, lo: number, hi: number) => Array.from({ length: n }, () => lo + r(hi - lo + 1));
export const str = (r: (n: number) => number, n: number, alphabet: string) => Array.from({ length: n }, () => alphabet[r(alphabet.length)]).join("");
export const lines = (input: string) => input.split("\n").filter((l, i, a) => !(i === a.length - 1 && l === ""));

export const line = (...parts: (string | number)[]) => `${parts.join(" ")}\n`;
export const arr = (a: number[]) => `${a.join(" ")}\n`;
export const limitsNote = "Time limit 2 seconds, memory 128 MB.";
