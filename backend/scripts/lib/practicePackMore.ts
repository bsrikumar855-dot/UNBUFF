/**
 * UNBLUFF first-party practice pack, part two: twenty more original exercises (fp_011 to fp_030).
 * Every statement, sample and test is written for this project. They teach classic techniques, but none is copied or
 * adapted from any third-party problem set, and no company is associated with any of them. Each has a reference
 * solution (used only to produce expected outputs) and, in `crossChecks`, a deliberately different brute-force
 * implementation that the tests use to confirm every expected output a second way.
 */
import { arr, ints, line, limitsNote, lines, rng, str, type Exercise } from "./practiceHelpers.js";

const MOD = 1_000_000_007n;
const nums = (l: string) => l.split(" ").map(Number);
const shuffled = (r: (n: number) => number, a: number[]): number[] => {
  const out = a.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = r(i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
};

// ---------- 11. Max Gap ----------
const maxGap = (input: string): string => {
  const a = nums(lines(input)[1]!).sort((x, y) => x - y);
  let best = 0;
  for (let i = 1; i < a.length; i++) best = Math.max(best, a[i]! - a[i - 1]!);
  return String(best);
};
const maxGapCheck = (input: string): string => {
  const a = nums(lines(input)[1]!);
  let best = 0;
  for (let i = 0; i < a.length; i++) {
    let next = Infinity;
    for (let j = 0; j < a.length; j++) if (a[j]! > a[i]! && a[j]! < next) next = a[j]!;
    if (next !== Infinity) best = Math.max(best, next - a[i]!);
  }
  return String(best);
};

// ---------- 12. Mirror Phrase ----------
const mirror = (input: string): string => {
  const kept = lines(input)[0]!.toLowerCase().replace(/[^a-z0-9]/g, "");
  return kept === [...kept].reverse().join("") ? "YES" : "NO";
};
const mirrorCheck = (input: string): string => {
  const s = lines(input)[0]!.toLowerCase();
  const ok = (c: string) => /[a-z0-9]/.test(c);
  let i = 0;
  let j = s.length - 1;
  while (i < j) {
    if (!ok(s[i]!)) i++;
    else if (!ok(s[j]!)) j--;
    else if (s[i] !== s[j]) return "NO";
    else {
      i++;
      j--;
    }
  }
  return "YES";
};

// ---------- 13. Missing Number ----------
const missing = (input: string): string => {
  const l = lines(input);
  const n = Number(l[0]);
  const sum = nums(l[1]!).reduce((x, y) => x + y, 0);
  return String((n * (n + 1)) / 2 - sum);
};
const missingCheck = (input: string): string => {
  const l = lines(input);
  const n = Number(l[0]);
  const seen = new Set(nums(l[1]!));
  for (let v = 1; v <= n; v++) if (!seen.has(v)) return String(v);
  return "0";
};

// ---------- 14. Range Sums ----------
const rangeSums = (input: string): string => {
  const l = lines(input);
  const [n, q] = nums(l[0]!) as [number, number];
  const a = nums(l[1]!);
  const pre = [0];
  for (let i = 0; i < n; i++) pre.push(pre[i]! + a[i]!);
  const out: number[] = [];
  for (let k = 0; k < q; k++) {
    const [lo, hi] = nums(l[2 + k]!) as [number, number];
    out.push(pre[hi]! - pre[lo - 1]!);
  }
  return out.join("\n");
};
const rangeSumsCheck = (input: string): string => {
  const l = lines(input);
  const [, q] = nums(l[0]!) as [number, number];
  const a = nums(l[1]!);
  return Array.from({ length: q }, (_v, k) => {
    const [lo, hi] = nums(l[2 + k]!) as [number, number];
    let s = 0;
    for (let i = lo - 1; i < hi; i++) s += a[i]!;
    return s;
  }).join("\n");
};

// ---------- 15. Stair Ways ----------
const stairWays = (input: string): string => {
  const n = Number(lines(input)[0]);
  let a = 1n;
  let b = 1n;
  for (let i = 1; i < n; i++) [a, b] = [b, (a + b) % MOD];
  return String(n === 0 ? 1n : b);
};
const stairWaysCheck = (input: string): string => {
  // ways(n) = Fibonacci(n + 1), by fast doubling: a different route to the same number
  const fib = (k: bigint): [bigint, bigint] => {
    if (k === 0n) return [0n, 1n];
    const [a, b] = fib(k / 2n);
    const c = (a * ((2n * b - a + MOD) % MOD)) % MOD;
    const d = (a * a + b * b) % MOD;
    return k % 2n === 0n ? [c, d] : [d, (c + d) % MOD];
  };
  return String(fib(BigInt(lines(input)[0]!) + 1n)[0]);
};

// ---------- 16. Anagram Check ----------
const anagram = (input: string): string => {
  const [a, b] = lines(input) as [string, string];
  return [...a].sort().join("") === [...b].sort().join("") ? "YES" : "NO";
};
const anagramCheck = (input: string): string => {
  const [a, b] = lines(input) as [string, string];
  if (a.length !== b.length) return "NO";
  const count = new Array<number>(26).fill(0);
  for (const ch of a) count[ch.charCodeAt(0) - 97]! += 1;
  for (const ch of b) count[ch.charCodeAt(0) - 97]! -= 1;
  return count.every((c) => c === 0) ? "YES" : "NO";
};

// ---------- 17. Peak Count ----------
const peaks = (input: string): string => {
  const a = nums(lines(input)[1]!);
  let c = 0;
  for (let i = 1; i + 1 < a.length; i++) if (a[i]! > a[i - 1]! && a[i]! > a[i + 1]!) c++;
  return String(c);
};
const peaksCheck = (input: string): string => {
  const a = nums(lines(input)[1]!);
  return String(a.filter((x, i) => i > 0 && i < a.length - 1 && x > a[i - 1]! && x > a[i + 1]!).length);
};

// ---------- 18. Best Stretch ----------
const bestStretch = (input: string): string => {
  const a = nums(lines(input)[1]!);
  let best = a[0]!;
  let cur = a[0]!;
  for (let i = 1; i < a.length; i++) {
    cur = Math.max(a[i]!, cur + a[i]!);
    best = Math.max(best, cur);
  }
  return String(best);
};
const bestStretchCheck = (input: string): string => {
  const a = nums(lines(input)[1]!);
  let best = -Infinity;
  for (let i = 0; i < a.length; i++) {
    let s = 0;
    for (let j = i; j < a.length; j++) {
      s += a[j]!;
      if (s > best) best = s;
    }
  }
  return String(best);
};

// ---------- 19. Rotate Right ----------
const rotate = (input: string): string => {
  const l = lines(input);
  const [n, k] = nums(l[0]!) as [number, number];
  const a = nums(l[1]!);
  const s = k % n;
  return [...a.slice(n - s), ...a.slice(0, n - s)].join(" ");
};
const rotateCheck = (input: string): string => {
  const l = lines(input);
  const [n, k] = nums(l[0]!) as [number, number];
  const a = nums(l[1]!);
  for (let step = 0; step < k % n; step++) a.unshift(a.pop()!);
  return a.join(" ");
};

// ---------- 20. Triple Zero ----------
const tripleZero = (input: string): string => {
  const a = nums(lines(input)[1]!).sort((x, y) => x - y);
  let count = 0;
  for (let i = 0; i < a.length - 2; i++) {
    if (i > 0 && a[i] === a[i - 1]) continue;
    let lo = i + 1;
    let hi = a.length - 1;
    while (lo < hi) {
      const s = a[i]! + a[lo]! + a[hi]!;
      if (s < 0) lo++;
      else if (s > 0) hi--;
      else {
        count++;
        const x = a[lo]!;
        const y = a[hi]!;
        while (lo < hi && a[lo] === x) lo++;
        while (lo < hi && a[hi] === y) hi--;
      }
    }
  }
  return String(count);
};
const tripleZeroCheck = (input: string): string => {
  const a = nums(lines(input)[1]!);
  const found = new Set<string>();
  for (let i = 0; i < a.length; i++)
    for (let j = i + 1; j < a.length; j++)
      for (let k = j + 1; k < a.length; k++) if (a[i]! + a[j]! + a[k]! === 0) found.add([a[i]!, a[j]!, a[k]!].sort((x, y) => x - y).join(","));
  return String(found.size);
};

// ---------- 21. Longest Unique Stretch ----------
const uniqueStretch = (input: string): string => {
  const s = lines(input)[0]!;
  const last = new Map<string, number>();
  let start = 0;
  let best = 0;
  for (let i = 0; i < s.length; i++) {
    const at = last.get(s[i]!);
    if (at !== undefined && at >= start) start = at + 1;
    last.set(s[i]!, i);
    best = Math.max(best, i - start + 1);
  }
  return String(best);
};
const uniqueStretchCheck = (input: string): string => {
  const s = lines(input)[0]!;
  let best = 0;
  for (let i = 0; i < s.length; i++) {
    const seen = new Set<string>();
    for (let j = i; j < s.length && !seen.has(s[j]!); j++) seen.add(s[j]!);
    best = Math.max(best, seen.size);
  }
  return String(best);
};

// ---------- 22. Merge Overlaps ----------
const mergeOverlaps = (input: string): string => {
  const l = lines(input);
  const iv = Array.from({ length: Number(l[0]) }, (_v, i) => nums(l[1 + i]!) as [number, number]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const out: [number, number][] = [];
  for (const [a, b] of iv) {
    const last = out[out.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return [String(out.length), ...out.map(([a, b]) => `${a} ${b}`)].join("\n");
};
const mergeOverlapsCheck = (input: string): string => {
  const l = lines(input);
  const iv = Array.from({ length: Number(l[0]) }, (_v, i) => nums(l[1 + i]!) as [number, number]);
  // union-find over every pair that shares a point, then take each group's lowest start and highest end
  const parent = iv.map((_x, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x]!)));
  for (let i = 0; i < iv.length; i++) for (let j = i + 1; j < iv.length; j++) if (iv[i]![0] <= iv[j]![1] && iv[j]![0] <= iv[i]![1]) parent[find(i)] = find(j);
  const groups = new Map<number, [number, number]>();
  iv.forEach(([a, b], i) => {
    const root = find(i);
    const g = groups.get(root);
    groups.set(root, g ? [Math.min(g[0], a), Math.max(g[1], b)] : [a, b]);
  });
  const out = [...groups.values()].sort((a, b) => a[0] - b[0]);
  return [String(out.length), ...out.map(([a, b]) => `${a} ${b}`)].join("\n");
};

// ---------- 23. Tree Depth ----------
const treeDepth = (input: string): string => {
  const l = lines(input);
  const n = Number(l[0]);
  const parent = n > 1 ? nums(l[1]!) : [];
  const depth = new Array<number>(n + 1).fill(0);
  depth[1] = 1;
  for (let v = 2; v <= n; v++) depth[v] = depth[parent[v - 2]!]! + 1;
  return String(Math.max(...depth.slice(1)));
};
const treeDepthCheck = (input: string): string => {
  const l = lines(input);
  const n = Number(l[0]);
  const parent = n > 1 ? nums(l[1]!) : [];
  let best = 1;
  for (let v = 2; v <= n; v++) {
    let steps = 1;
    for (let u = v; u !== 1; u = parent[u - 2]!) steps++;
    best = Math.max(best, steps);
  }
  return String(best);
};

// ---------- 24. Cheapest Route ----------
const cheapestRoute = (input: string): string => {
  const l = lines(input);
  const [n, m, s, t] = nums(l[0]!) as [number, number, number, number];
  const adj: [number, number][][] = Array.from({ length: n + 1 }, () => []);
  for (let i = 0; i < m; i++) {
    const [u, v, w] = nums(l[1 + i]!) as [number, number, number];
    adj[u]!.push([v, w]);
    adj[v]!.push([u, w]);
  }
  const dist = new Array<number>(n + 1).fill(Infinity);
  const done = new Array<boolean>(n + 1).fill(false);
  dist[s] = 0;
  for (let round = 0; round < n; round++) {
    let u = -1;
    for (let v = 1; v <= n; v++) if (!done[v] && (u === -1 || dist[v]! < dist[u]!)) u = v;
    if (u === -1 || dist[u] === Infinity) break;
    done[u] = true;
    for (const [v, w] of adj[u]!) if (dist[u]! + w < dist[v]!) dist[v] = dist[u]! + w;
  }
  return String(dist[t] === Infinity ? -1 : dist[t]);
};
const cheapestRouteCheck = (input: string): string => {
  const l = lines(input);
  const [n, m, s, t] = nums(l[0]!) as [number, number, number, number];
  const edges = Array.from({ length: m }, (_v, i) => nums(l[1 + i]!) as [number, number, number]);
  const dist = new Array<number>(n + 1).fill(Infinity);
  dist[s] = 0;
  for (let pass = 0; pass < n; pass++)
    for (const [u, v, w] of edges) {
      if (dist[u]! + w < dist[v]!) dist[v] = dist[u]! + w;
      if (dist[v]! + w < dist[u]!) dist[u] = dist[v]! + w;
    }
  return String(dist[t] === Infinity ? -1 : dist[t]);
};

// ---------- 25. Knapsack Value ----------
const knapsack = (input: string): string => {
  const l = lines(input);
  const [n, cap] = nums(l[0]!) as [number, number];
  const best = new Array<number>(cap + 1).fill(0);
  for (let i = 0; i < n; i++) {
    const [w, v] = nums(l[1 + i]!) as [number, number];
    for (let c = cap; c >= w; c--) best[c] = Math.max(best[c]!, best[c - w]! + v);
  }
  return String(best[cap]);
};
const knapsackCheck = (input: string): string => {
  const l = lines(input);
  const [n, cap] = nums(l[0]!) as [number, number];
  const items = Array.from({ length: n }, (_v, i) => nums(l[1 + i]!) as [number, number]);
  const memo = new Map<number, number>();
  const f = (i: number, c: number): number => {
    if (i === n) return 0;
    const key = i * 100000 + c;
    if (memo.has(key)) return memo.get(key)!;
    const [w, v] = items[i]!;
    const r = Math.max(f(i + 1, c), w <= c ? v + f(i + 1, c - w) : 0);
    memo.set(key, r);
    return r;
  };
  return String(f(0, cap));
};

// ---------- 26. Course Plan ----------
const coursePlan = (input: string): string => {
  const l = lines(input);
  const [n, m] = nums(l[0]!) as [number, number];
  const adj: number[][] = Array.from({ length: n + 1 }, () => []);
  const indeg = new Array<number>(n + 1).fill(0);
  for (let i = 0; i < m; i++) {
    const [a, b] = nums(l[1 + i]!) as [number, number];
    adj[a]!.push(b);
    indeg[b]! += 1;
  }
  const queue: number[] = [];
  for (let v = 1; v <= n; v++) if (indeg[v] === 0) queue.push(v);
  let taken = 0;
  for (let h = 0; h < queue.length; h++) {
    taken++;
    for (const v of adj[queue[h]!]!) if (--indeg[v]! === 0) queue.push(v);
  }
  return taken === n ? "YES" : "NO";
};
const coursePlanCheck = (input: string): string => {
  const l = lines(input);
  const [n, m] = nums(l[0]!) as [number, number];
  const adj: number[][] = Array.from({ length: n + 1 }, () => []);
  for (let i = 0; i < m; i++) {
    const [a, b] = nums(l[1 + i]!) as [number, number];
    adj[a]!.push(b);
  }
  const state = new Array<number>(n + 1).fill(0); // 0 new, 1 on the current path, 2 finished
  const hasCycle = (u: number): boolean => {
    state[u] = 1;
    for (const v of adj[u]!) if (state[v] === 1 || (state[v] === 0 && hasCycle(v))) return true;
    state[u] = 2;
    return false;
  };
  for (let v = 1; v <= n; v++) if (state[v] === 0 && hasCycle(v)) return "NO";
  return "YES";
};

// ---------- 27. Spiral Order ----------
const spiral = (input: string): string => {
  const l = lines(input);
  const [r, c] = nums(l[0]!) as [number, number];
  const g = Array.from({ length: r }, (_v, i) => nums(l[1 + i]!));
  const out: number[] = [];
  let top = 0;
  let bottom = r - 1;
  let left = 0;
  let right = c - 1;
  while (top <= bottom && left <= right) {
    for (let j = left; j <= right; j++) out.push(g[top]![j]!);
    top++;
    for (let i = top; i <= bottom; i++) out.push(g[i]![right]!);
    right--;
    if (top <= bottom) {
      for (let j = right; j >= left; j--) out.push(g[bottom]![j]!);
      bottom--;
    }
    if (left <= right) {
      for (let i = bottom; i >= top; i--) out.push(g[i]![left]!);
      left++;
    }
  }
  return out.join(" ");
};
const spiralCheck = (input: string): string => {
  const l = lines(input);
  const [r, c] = nums(l[0]!) as [number, number];
  const g = Array.from({ length: r }, (_v, i) => nums(l[1 + i]!));
  const seen = Array.from({ length: r }, () => new Array<boolean>(c).fill(false));
  const dirs = [[0, 1], [1, 0], [0, -1], [-1, 0]] as const;
  const out: number[] = [];
  let x = 0;
  let y = 0;
  let d = 0;
  for (let k = 0; k < r * c; k++) {
    out.push(g[x]![y]!);
    seen[x]![y] = true;
    const nx = x + dirs[d]![0];
    const ny = y + dirs[d]![1];
    if (nx < 0 || ny < 0 || nx >= r || ny >= c || seen[nx]![ny]) d = (d + 1) % 4;
    x += dirs[d]![0];
    y += dirs[d]![1];
  }
  return out.join(" ");
};

// ---------- 28. Rising Chain ----------
const risingChain = (input: string): string => {
  const a = nums(lines(input)[1]!);
  const tails: number[] = [];
  for (const x of a) {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (tails[mid]! < x) lo = mid + 1;
      else hi = mid;
    }
    tails[lo] = x;
  }
  return String(tails.length);
};
const risingChainCheck = (input: string): string => {
  const a = nums(lines(input)[1]!);
  const best = new Array<number>(a.length).fill(1);
  for (let i = 0; i < a.length; i++) for (let j = 0; j < i; j++) if (a[j]! < a[i]!) best[i] = Math.max(best[i]!, best[j]! + 1);
  return String(Math.max(...best));
};

// ---------- 29. Window Maximums ----------
const windowMaximums = (input: string): string => {
  const l = lines(input);
  const k = nums(l[0]!)[1]!;
  const a = nums(l[1]!);
  const dq: number[] = [];
  const out: number[] = [];
  a.forEach((x, i) => {
    while (dq.length > 0 && a[dq[dq.length - 1]!]! <= x) dq.pop();
    dq.push(i);
    if (dq[0]! <= i - k) dq.shift();
    if (i >= k - 1) out.push(a[dq[0]!]!);
  });
  return out.join(" ");
};
const windowMaximumsCheck = (input: string): string => {
  const l = lines(input);
  const k = nums(l[0]!)[1]!;
  const a = nums(l[1]!);
  const out: number[] = [];
  for (let s = 0; s + k <= a.length; s++) out.push(Math.max(...a.slice(s, s + k)));
  return out.join(" ");
};

// ---------- 30. Rain Trap ----------
const rainTrap = (input: string): string => {
  const h = nums(lines(input)[1]!);
  let lo = 0;
  let hi = h.length - 1;
  let leftMax = 0;
  let rightMax = 0;
  let water = 0;
  while (lo < hi) {
    if (h[lo]! < h[hi]!) {
      leftMax = Math.max(leftMax, h[lo]!);
      water += leftMax - h[lo]!;
      lo++;
    } else {
      rightMax = Math.max(rightMax, h[hi]!);
      water += rightMax - h[hi]!;
      hi--;
    }
  }
  return String(water);
};
const rainTrapCheck = (input: string): string => {
  const h = nums(lines(input)[1]!);
  const left: number[] = [];
  const right: number[] = new Array<number>(h.length).fill(0);
  h.forEach((x, i) => left.push(Math.max(x, left[i - 1] ?? 0)));
  for (let i = h.length - 1; i >= 0; i--) right[i] = Math.max(h[i]!, right[i + 1] ?? 0);
  let water = 0;
  for (let i = 0; i < h.length; i++) water += Math.min(left[i]!, right[i]!) - h[i]!;
  return String(water);
};

// ---------- input builders ----------
const rows = (a: number[][]) => a.map((r) => arr(r)).join("");
const sizedArray = (a: number[]) => line(a.length) + arr(a);
const windowInput = (a: number[], k: number) => line(a.length, k) + arr(a);
const edgesInput = (head: (string | number)[], edges: number[][]) => line(...head) + edges.map((e) => line(...e)).join("");
const intervals = (iv: [number, number][]) => line(iv.length) + iv.map(([a, b]) => line(a, b)).join("");

export function moreExercises(): Exercise[] {
  const r = (seed: number) => rng(seed);
  const r11 = r(1101);
  const r13 = r(1303);
  const r14 = r(1404);
  const r17 = r(1707);
  const r18 = r(1808);
  const r20 = r(2010);
  const r21 = r(2111);
  const r22 = r(2212);
  const r23 = r(2313);
  const r24 = r(2414);
  const r25 = r(2515);
  const r26 = r(2616);
  const r27 = r(2717);
  const r28 = r(2818);
  const r29 = r(2919);
  const r30 = r(3030);
  const r12 = r(1202);
  const r16 = r(1606);
  const r19 = r(1909);

  const perm = (n: number, seed: number, drop: number) => shuffled(r(seed), Array.from({ length: n }, (_v, i) => i + 1)).filter((x) => x !== drop);
  const dag = (n: number, m: number, rr: (n: number) => number): number[][] => {
    const label = shuffled(rr, Array.from({ length: n }, (_v, i) => i + 1));
    return Array.from({ length: m }, () => {
      const a = rr(n - 1);
      const b = a + 1 + rr(n - 1 - a);
      return [label[a]!, label[b]!];
    });
  };
  const weighted = (n: number, m: number, rr: (n: number) => number): number[][] => Array.from({ length: m }, () => [1 + rr(n), 1 + rr(n), 1 + rr(20)]);

  const ex: Exercise[] = [
    {
      id: "fp_011_max_gap",
      title: "Max Gap",
      difficulty: "easy",
      topics: ["Arrays", "Sorting"],
      statement: `The first line has n (2 <= n <= 1500). The second line has n integers between -1000000000 and 1000000000. Put the numbers in increasing order. Print the largest difference between two neighbours in that order (0 if all the numbers are equal). ${limitsNote}`,
      samples: [sizedArray([8, 1, 4]), sizedArray([5, 5])],
      tests: [
        sizedArray([1, 2]),
        sizedArray([2, 1]),
        sizedArray([7, 7, 7, 7]),
        sizedArray([-1000000000, 1000000000]),
        sizedArray([3, 9, 4, 4, 10, 1]),
        sizedArray([-5, -2, -9, 0]),
        sizedArray(ints(r11, 50, -20, 20)),
        sizedArray(ints(r11, 400, -1000000, 1000000)),
        sizedArray(ints(r11, 1500, -1000000000, 1000000000)),
      ],
      solve: maxGap,
    },
    {
      id: "fp_012_mirror_phrase",
      title: "Mirror Phrase",
      difficulty: "easy",
      topics: ["Strings", "Two Pointers"],
      statement: `One line holds a phrase of letters, digits, spaces and punctuation (length 1 to 2000, at least one letter or digit). Ignore everything except letters and digits, and ignore upper and lower case. Print YES if what is left reads the same forwards and backwards, otherwise NO. ${limitsNote}`,
      samples: ["Never odd or even!\n", "Hello, world\n"],
      tests: [
        "a\n",
        "Ab, ba.\n",
        "Ab, bc.\n",
        "A1b2 2B1a\n",
        "12321\n",
        "12345\n",
        "!!x!!\n",
        "Was it a car or a cat I saw?\n",
        `${str(r12, 30, "ab ,")}x${str(r12, 30, "ab ,")}\n`,
        `${"ab".repeat(900)}c${"ba".repeat(900)}\n`,
      ],
      solve: (i) => mirror(i),
    },
    {
      id: "fp_013_missing_number",
      title: "Missing Number",
      difficulty: "easy",
      topics: ["Arrays", "Hash Table"],
      statement: `The first line has n (2 <= n <= 3000). The second line has n - 1 different integers, each between 1 and n. Exactly one number from 1 to n is absent. Print it. ${limitsNote}`,
      samples: [line(5) + arr([1, 2, 4, 5]), line(2) + arr([2])],
      tests: [
        line(2) + arr([1]),
        line(3) + arr([3, 1]),
        line(4) + arr([2, 3, 4]),
        line(4) + arr([1, 2, 3]),
        line(10) + arr(perm(10, 1, 7)),
        line(100) + arr(perm(100, 2, 1)),
        line(100) + arr(perm(100, 3, 100)),
        line(1000) + arr(perm(1000, 4, 333)),
        line(3000) + arr(perm(3000, 5, 2777)),
        line(50) + arr(ints(r13, 1, 1, 1).concat(perm(50, 6, 25).filter((x) => x !== 1))),
      ],
      solve: missing,
    },
    {
      id: "fp_014_range_sums",
      title: "Range Sums",
      difficulty: "easy",
      topics: ["Arrays"],
      statement: `The first line has n and q. The second line has n integers between -1000 and 1000. Each of the next q lines has two integers l and r (1 <= l <= r <= n). For each query print, on its own line, the sum of the numbers from position l to position r, counting positions from 1. n is at most 1500 and q at most 800. ${limitsNote}`,
      samples: [line(5, 3) + arr([1, 2, 3, 4, 5]) + line(1, 5) + line(2, 3) + line(4, 4), line(1, 1) + arr([-7]) + line(1, 1)],
      tests: [
        line(1, 1) + arr([0]) + line(1, 1),
        line(3, 2) + arr([-1, -1, -1]) + line(1, 3) + line(2, 2),
        line(4, 3) + arr([1000, -1000, 1000, -1000]) + line(1, 4) + line(1, 1) + line(3, 4),
        line(6, 4) + arr([5, 4, 3, 2, 1, 0]) + line(1, 6) + line(6, 6) + line(2, 5) + line(3, 3),
        line(10, 5) + arr(ints(r14, 10, -9, 9)) + [[1, 10], [1, 1], [10, 10], [4, 7], [2, 9]].map((q) => line(...q)).join(""),
        line(200, 30) + arr(ints(r14, 200, -1000, 1000)) + Array.from({ length: 30 }, () => { const a = 1 + r14(200); return line(a, a + r14(201 - a)); }).join(""),
        line(1500, 40) + arr(ints(r14, 1500, -1000, 1000)) + Array.from({ length: 40 }, () => { const a = 1 + r14(1500); return line(a, a + r14(1501 - a)); }).join(""),
        line(8, 2) + arr([1, 1, 1, 1, 1, 1, 1, 1]) + line(3, 6) + line(8, 8),
      ],
      solve: rangeSums,
    },
    {
      id: "fp_015_stair_ways",
      title: "Stair Ways",
      difficulty: "easy",
      topics: ["Dynamic Programming"],
      statement: `A staircase has n steps (1 <= n <= 100000). You climb from the ground, going up either 1 or 2 steps at a time, and must land exactly on step n. Print how many different sequences of moves do that, modulo 1000000007. ${limitsNote}`,
      samples: ["3\n", "1\n"],
      tests: ["2\n", "4\n", "5\n", "10\n", "30\n", "50\n", "91\n", "1000\n", "5000\n", "100000\n"],
      solve: stairWays,
    },
    {
      id: "fp_016_anagram_check",
      title: "Anagram Check",
      difficulty: "easy",
      topics: ["Strings", "Hash Table", "Sorting"],
      statement: `Two lines each hold a non-empty string of lowercase letters (length at most 9000). Print YES if the second string uses exactly the same letters as the first, the same number of times each, in any order; otherwise NO. ${limitsNote}`,
      samples: ["listen\nsilent\n", "abc\nabd\n"],
      tests: [
        "a\na\n",
        "a\nb\n",
        "ab\nba\n",
        "ab\nabc\n",
        "aab\nabb\n",
        "abcabc\ncbacba\n",
        "zzzz\nzzzz\n",
        `${"ab".repeat(4000)}\n${"ba".repeat(4000)}\n`,
        `${"a".repeat(8000)}b\n${"a".repeat(8000)}c\n`,
        (() => { const s = str(r16, 500, "abcde"); return `${s}\n${shuffled(r16, [...s].map((c) => c.charCodeAt(0))).map((c) => String.fromCharCode(c)).join("")}\n`; })(),
      ],
      solve: anagram,
    },
    {
      id: "fp_017_peak_count",
      title: "Peak Count",
      difficulty: "easy",
      topics: ["Arrays"],
      statement: `The first line has n (1 <= n <= 3000). The second line has n integers between -1000 and 1000. A position is a peak when it is neither the first nor the last and its value is strictly greater than both of its neighbours. Print the number of peaks. ${limitsNote}`,
      samples: [sizedArray([1, 3, 2, 4, 1]), sizedArray([2, 2, 2])],
      tests: [
        sizedArray([5]),
        sizedArray([1, 2]),
        sizedArray([1, 2, 1]),
        sizedArray([1, 2, 2, 1]),
        sizedArray([1, 2, 3, 4, 5]),
        sizedArray([5, 1, 5, 1, 5, 1, 5]),
        sizedArray([-3, -1, -3, -1, -3]),
        sizedArray(ints(r17, 100, -5, 5)),
        sizedArray(ints(r17, 3000, -1000, 1000)),
        sizedArray(Array.from({ length: 3000 }, (_v, i) => (i % 2 === 0 ? 0 : 1))),
      ],
      solve: peaks,
    },
    {
      id: "fp_018_best_stretch",
      title: "Best Stretch",
      difficulty: "medium",
      topics: ["Arrays", "Dynamic Programming"],
      statement: `The first line has n (1 <= n <= 3000). The second line has n integers between -1000 and 1000. Choose a non-empty block of consecutive numbers. Print the largest sum such a block can have. ${limitsNote}`,
      samples: [sizedArray([2, -5, 3, 4, -1]), sizedArray([-4, -2])],
      tests: [
        sizedArray([7]),
        sizedArray([-7]),
        sizedArray([1, 2, 3]),
        sizedArray([-1, -2, -3]),
        sizedArray([5, -9, 6]),
        sizedArray([-2, 1, -3, 4, -1, 2, 1, -5, 4]),
        sizedArray([0, 0, 0]),
        sizedArray(ints(r18, 60, -10, 10)),
        sizedArray(ints(r18, 800, -1000, 1000)),
        sizedArray(ints(r18, 3000, -1000, 1000)),
      ],
      solve: bestStretch,
    },
    {
      id: "fp_019_rotate_right",
      title: "Rotate Right",
      difficulty: "medium",
      topics: ["Arrays", "Two Pointers"],
      statement: `The first line has n (1 <= n <= 3000) and k (0 <= k <= 1000000000). The second line has n integers between -1000 and 1000. Move every number k positions to the right, where numbers pushed off the end come back around to the front. Print the resulting list on one line, separated by single spaces. ${limitsNote}`,
      samples: [line(5, 2) + arr([1, 2, 3, 4, 5]), line(3, 3) + arr([7, 8, 9])],
      tests: [
        line(1, 5) + arr([4]),
        line(4, 0) + arr([1, 2, 3, 4]),
        line(4, 1) + arr([1, 2, 3, 4]),
        line(4, 3) + arr([1, 2, 3, 4]),
        line(4, 4) + arr([1, 2, 3, 4]),
        line(4, 6) + arr([1, 2, 3, 4]),
        line(6, 1000000000) + arr([6, 5, 4, 3, 2, 1]),
        line(50, 17) + arr(ints(r19, 50, -9, 9)),
        line(2000, 1234) + arr(ints(r19, 2000, -1000, 1000)),
        line(3000, 999999937) + arr(ints(r19, 3000, -100, 100)),
      ],
      solve: rotate,
    },
    {
      id: "fp_020_triple_zero",
      title: "Triple Zero",
      difficulty: "medium",
      topics: ["Arrays", "Sorting", "Two Pointers"],
      statement: `The first line has n (3 <= n <= 300). The second line has n integers between -100 and 100. Count the different sets of three values a <= b <= c that add up to 0 and can be picked from three different positions. Two sets are the same when they hold the same three values. Print the count. ${limitsNote}`,
      samples: [sizedArray([-1, 0, 1, 2, -1, -4]), sizedArray([1, 2, 3])],
      tests: [
        sizedArray([0, 0, 0]),
        sizedArray([0, 0, 1]),
        sizedArray([0, 0, 0, 0, 0]),
        sizedArray([-1, 1, 0]),
        sizedArray([-2, 0, 1, 1, 2]),
        sizedArray([-4, -2, -2, 0, 2, 2, 4]),
        sizedArray([3, 3, 3, -6, -6]),
        sizedArray(ints(r20, 40, -10, 10)),
        sizedArray(ints(r20, 120, -30, 30)),
        sizedArray(ints(r20, 300, -100, 100)),
      ],
      solve: tripleZero,
    },
    {
      id: "fp_021_longest_unique_stretch",
      title: "Longest Unique Stretch",
      difficulty: "medium",
      topics: ["Strings", "Hash Table", "Sliding Window"],
      statement: `One line holds a non-empty string of lowercase letters (length at most 19000). Print the length of the longest block of consecutive letters in which no letter appears twice. ${limitsNote}`,
      samples: ["abcabcbb\n", "aaaa\n"],
      tests: [
        "a\n",
        "ab\n",
        "aa\n",
        "abba\n",
        "abcdefg\n",
        "pwwkew\n",
        "tmmzuxt\n",
        "abcdefghijklmnopqrstuvwxyz\n",
        `${"abcdefghijklmnopqrstuvwxyz".repeat(700)}\n`,
        `${str(r21, 2000, "abcdefgh")}\n`,
        `${str(r21, 19000, "abcdefghijklmnopqrstuvwxyz")}\n`,
      ],
      solve: uniqueStretch,
    },
    {
      id: "fp_022_merge_overlaps",
      title: "Merge Overlaps",
      difficulty: "medium",
      topics: ["Intervals", "Sorting"],
      statement: `The first line has n (1 <= n <= 1000). Each of the next n lines has two integers a and b (0 <= a <= b <= 1000000) describing the closed range from a to b, ends included. Merge every group of ranges that share at least one point, directly or through others. Print the number of merged ranges, then each merged range as "a b" on its own line, in increasing order. ${limitsNote}`,
      samples: [intervals([[1, 3], [2, 6], [8, 10]]), intervals([[4, 5], [1, 4]])],
      tests: [
        intervals([[2, 2]]),
        intervals([[1, 2], [3, 4]]),
        intervals([[1, 2], [2, 3]]),
        intervals([[1, 10], [2, 3], [4, 5]]),
        intervals([[5, 6], [1, 2], [3, 4]]),
        intervals([[-5, -1], [-3, 2], [10, 12], [11, 11]]),
        intervals([[1, 4], [4, 4], [0, 0], [0, 1]]),
        intervals(Array.from({ length: 40 }, () => { const a = r22(100); return [a, a + r22(8)] as [number, number]; })),
        intervals(Array.from({ length: 300 }, () => { const a = r22(5000); return [a, a + r22(15)] as [number, number]; })),
        intervals(Array.from({ length: 1000 }, () => { const a = r22(900000); return [a, a + r22(1500)] as [number, number]; })),
      ],
      solve: mergeOverlaps,
    },
    {
      id: "fp_023_tree_depth",
      title: "Tree Depth",
      difficulty: "medium",
      topics: ["Graphs"],
      statement: `A tree has n nodes numbered 1 to n, and node 1 is the root (1 <= n <= 3000). When n > 1, the second line has n - 1 integers: the i-th is the parent of node i + 1, and every parent has a smaller number than its child. The depth of the root is 1 and a child is one deeper than its parent. Print the greatest depth of any node. ${limitsNote}`,
      samples: [line(5) + arr([1, 1, 2, 3]), line(1)],
      tests: [
        line(2) + arr([1]),
        line(5) + arr([1, 2, 3, 4]),
        line(5) + arr([1, 1, 1, 1]),
        line(7) + arr([1, 1, 2, 2, 3, 3]),
        line(8) + arr([1, 2, 2, 4, 4, 5, 7]),
        line(60) + arr(Array.from({ length: 59 }, (_v, i) => 1 + r23(i + 1))),
        line(1500) + arr(Array.from({ length: 1499 }, (_v, i) => 1 + r23(i + 1))),
        line(3000) + arr(Array.from({ length: 2999 }, (_v, i) => Math.max(1, i + 1 - r23(3)))),
        line(3000) + arr(Array.from({ length: 2999 }, (_v, i) => i + 1)),
        line(3000) + arr(Array.from({ length: 2999 }, () => 1)),
      ],
      solve: treeDepth,
    },
    {
      id: "fp_024_cheapest_route",
      title: "Cheapest Route",
      difficulty: "medium",
      topics: ["Graphs"],
      statement: `A country has n cities numbered 1 to n and m two-way roads. The first line has n, m, s and t. Each of the next m lines has u, v and w: a road between cities u and v that costs w to use (1 <= w <= 1000). Print the smallest total cost of a trip from s to t, or -1 if no trip exists. Roads may repeat. n is at most 500 and m at most 1500. ${limitsNote}`,
      samples: [edgesInput([4, 4, 1, 4], [[1, 2, 5], [2, 4, 5], [1, 3, 1], [3, 4, 20]]), edgesInput([3, 1, 1, 3], [[1, 2, 4]])],
      tests: [
        edgesInput([1, 0, 1, 1], []),
        edgesInput([2, 1, 1, 2], [[1, 2, 9]]),
        edgesInput([2, 2, 1, 2], [[1, 2, 9], [2, 1, 3]]),
        edgesInput([4, 2, 1, 4], [[1, 2, 1], [3, 4, 1]]),
        edgesInput([5, 6, 1, 5], [[1, 2, 2], [2, 3, 2], [3, 5, 2], [1, 4, 1], [4, 5, 10], [2, 5, 7]]),
        edgesInput([5, 5, 5, 1], [[1, 1, 1], [1, 2, 3], [2, 3, 3], [3, 5, 3], [1, 5, 100]]),
        edgesInput([30, 60, 2, 29], weighted(30, 60, r24)),
        edgesInput([100, 120, 1, 100], weighted(100, 120, r24)),
        edgesInput([500, 1500, 7, 450], weighted(500, 1500, r24)),
        edgesInput([200, 150, 3, 150], weighted(200, 150, r24)),
      ],
      solve: cheapestRoute,
    },
    {
      id: "fp_025_knapsack_value",
      title: "Knapsack Value",
      difficulty: "medium",
      topics: ["Dynamic Programming"],
      statement: `The first line has n (1 <= n <= 100) and cap (1 <= cap <= 1000). Each of the next n lines has an item's weight and value (both between 1 and 1000). Choose some of the items, each at most once, with total weight at most cap. Print the largest total value you can get. ${limitsNote}`,
      samples: [edgesInput([3, 5], [[2, 3], [3, 4], [4, 5]]), edgesInput([1, 3], [[4, 9]])],
      tests: [
        edgesInput([1, 1], [[1, 1]]),
        edgesInput([2, 10], [[5, 6], [5, 6]]),
        edgesInput([3, 4], [[4, 10], [2, 6], [2, 6]]),
        edgesInput([4, 7], [[1, 1], [3, 4], [4, 5], [5, 7]]),
        edgesInput([5, 100], [[50, 60], [40, 50], [30, 40], [20, 25], [10, 12]]),
        edgesInput([3, 50], [[10, 60], [20, 100], [30, 120]]),
        edgesInput([12, 30], Array.from({ length: 12 }, () => [1 + r25(15), 1 + r25(20)])),
        edgesInput([60, 400], Array.from({ length: 60 }, () => [1 + r25(150), 1 + r25(1000)])),
        edgesInput([100, 1000], Array.from({ length: 100 }, () => [1 + r25(400), 1 + r25(1000)])),
        edgesInput([100, 1000], Array.from({ length: 100 }, () => [1 + r25(1000), 1 + r25(1000)])),
      ],
      solve: knapsack,
    },
    {
      id: "fp_026_course_plan",
      title: "Course Plan",
      difficulty: "medium",
      topics: ["Graphs"],
      statement: `A school offers n courses numbered 1 to n and has m rules. The first line has n and m. Each of the next m lines has a and b, meaning course a must be finished before course b can start. Print YES if some order lets a student finish all n courses while obeying every rule, otherwise NO. n is at most 2000 and m at most 1800. ${limitsNote}`,
      samples: [edgesInput([3, 2], [[1, 2], [2, 3]]), edgesInput([2, 2], [[1, 2], [2, 1]])],
      tests: [
        edgesInput([1, 0], []),
        edgesInput([1, 1], [[1, 1]]),
        edgesInput([2, 1], [[2, 1]]),
        edgesInput([3, 3], [[1, 2], [2, 3], [3, 1]]),
        edgesInput([4, 4], [[1, 2], [1, 3], [2, 4], [3, 4]]),
        edgesInput([5, 5], [[1, 2], [2, 3], [3, 4], [4, 2], [4, 5]]),
        edgesInput([6, 0], []),
        edgesInput([40, 60], dag(40, 60, r26)),
        edgesInput([500, 1200], dag(500, 1200, r26)),
        edgesInput([2000, 1800], dag(2000, 1798, r26).concat([[7, 8], [8, 7]])),
        edgesInput([300, 400], dag(300, 399, r26).concat([[1, 1]])),
      ],
      solve: coursePlan,
    },
    {
      id: "fp_027_spiral_order",
      title: "Spiral Order",
      difficulty: "medium",
      topics: ["Matrix"],
      statement: `The first line has r and c (1 <= r, c <= 50). Each of the next r lines has c integers between -1000 and 1000. Starting at the top-left number, walk clockwise around the grid, going right along the top row, down the last column, left along the bottom row and up the first column, then continue inward the same way. Print every number in the order visited, on one line separated by single spaces. ${limitsNote}`,
      samples: [line(2, 3) + rows([[1, 2, 3], [4, 5, 6]]), line(1, 1) + rows([[9]])],
      tests: [
        line(1, 4) + rows([[1, 2, 3, 4]]),
        line(4, 1) + rows([[1], [2], [3], [4]]),
        line(2, 2) + rows([[1, 2], [3, 4]]),
        line(3, 3) + rows([[1, 2, 3], [4, 5, 6], [7, 8, 9]]),
        line(3, 4) + rows([[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12]]),
        line(4, 3) + rows([[1, 2, 3], [4, 5, 6], [7, 8, 9], [10, 11, 12]]),
        line(5, 5) + rows(Array.from({ length: 5 }, () => ints(r27, 5, -9, 9))),
        line(7, 2) + rows(Array.from({ length: 7 }, () => ints(r27, 2, -50, 50))),
        line(30, 45) + rows(Array.from({ length: 30 }, () => ints(r27, 45, -1000, 1000))),
        line(50, 50) + rows(Array.from({ length: 50 }, () => ints(r27, 50, -1000, 1000))),
      ],
      solve: spiral,
    },
    {
      id: "fp_028_rising_chain",
      title: "Rising Chain",
      difficulty: "hard",
      topics: ["Dynamic Programming", "Binary Search"],
      statement: `The first line has n (1 <= n <= 2000). The second line has n integers. Pick some of them, keeping their original left-to-right order, so that each picked value is strictly larger than the one before. Print the greatest number of values you can pick. ${limitsNote}`,
      samples: [sizedArray([3, 1, 4, 1, 5, 9, 2, 6]), sizedArray([5, 5, 5])],
      tests: [
        sizedArray([1]),
        sizedArray([1, 2, 3, 4, 5]),
        sizedArray([5, 4, 3, 2, 1]),
        sizedArray([2, 2, 3, 3, 4, 4]),
        sizedArray([10, 9, 2, 5, 3, 7, 101, 18]),
        sizedArray([0, 8, 4, 12, 2, 10, 6, 14, 1, 9, 5, 13, 3, 11, 7, 15]),
        sizedArray(ints(r28, 30, -20, 20)),
        sizedArray(ints(r28, 500, -1000000000, 1000000000)),
        sizedArray(ints(r28, 2000, -1000, 1000)),
        sizedArray(Array.from({ length: 2000 }, (_v, i) => i)),
      ],
      solve: risingChain,
    },
    {
      id: "fp_029_window_maximums",
      title: "Window Maximums",
      difficulty: "hard",
      topics: ["Sliding Window", "Arrays"],
      statement: `The first line has n and k (1 <= k <= n <= 2000). The second line has n integers between -1000000 and 1000000. For every window of k consecutive numbers, from left to right, find the largest number in it. Print all n - k + 1 answers on one line separated by single spaces. ${limitsNote}`,
      samples: [windowInput([1, 3, -1, -3, 5, 3, 6, 7], 3), windowInput([4, 2], 1)],
      tests: [
        windowInput([9], 1),
        windowInput([1, 2, 3, 4, 5], 5),
        windowInput([5, 4, 3, 2, 1], 2),
        windowInput([2, 2, 2, 2], 3),
        windowInput([-5, -1, -9, -3], 2),
        windowInput([1, 3, 2, 5, 4, 6], 4),
        windowInput(ints(r29, 60, -9, 9), 7),
        windowInput(ints(r29, 1000, -1000, 1000), 100),
        windowInput(ints(r29, 2000, -1000000, 1000000), 1),
        windowInput(ints(r29, 2000, -1000000, 1000000), 1000),
        windowInput(Array.from({ length: 2000 }, (_v, i) => i), 77),
      ],
      solve: windowMaximums,
    },
    {
      id: "fp_030_rain_trap",
      title: "Rain Trap",
      difficulty: "hard",
      topics: ["Two Pointers", "Arrays"],
      statement: `The first line has n (1 <= n <= 3000). The second line has n heights between 0 and 1000: the heights of walls standing side by side, each one unit wide. After heavy rain, water collects between walls and cannot flow past the first or last wall. Print how many units of water are held in total. ${limitsNote}`,
      samples: [sizedArray([3, 0, 2, 0, 4]), sizedArray([1, 2, 3])],
      tests: [
        sizedArray([5]),
        sizedArray([0, 0, 0]),
        sizedArray([5, 0, 5]),
        sizedArray([0, 5, 0]),
        sizedArray([4, 2, 0, 3, 2, 5]),
        sizedArray([0, 1, 0, 2, 1, 0, 1, 3, 2, 1, 2, 1]),
        sizedArray([5, 4, 3, 2, 1, 2, 3, 4, 5]),
        sizedArray(ints(r30, 40, 0, 9)),
        sizedArray(ints(r30, 500, 0, 1000)),
        sizedArray(ints(r30, 3000, 0, 1000)),
        sizedArray([1000, ...new Array<number>(2998).fill(0), 1000]),
      ],
      solve: rainTrap,
    },
  ];
  return ex;
}

/** Second, deliberately different implementations (mostly brute force), keyed by exercise id. */
export const crossChecks: Record<string, (input: string) => string> = {
  fp_011_max_gap: maxGapCheck,
  fp_012_mirror_phrase: mirrorCheck,
  fp_013_missing_number: missingCheck,
  fp_014_range_sums: rangeSumsCheck,
  fp_015_stair_ways: stairWaysCheck,
  fp_016_anagram_check: anagramCheck,
  fp_017_peak_count: peaksCheck,
  fp_018_best_stretch: bestStretchCheck,
  fp_019_rotate_right: rotateCheck,
  fp_020_triple_zero: tripleZeroCheck,
  fp_021_longest_unique_stretch: uniqueStretchCheck,
  fp_022_merge_overlaps: mergeOverlapsCheck,
  fp_023_tree_depth: treeDepthCheck,
  fp_024_cheapest_route: cheapestRouteCheck,
  fp_025_knapsack_value: knapsackCheck,
  fp_026_course_plan: coursePlanCheck,
  fp_027_spiral_order: spiralCheck,
  fp_028_rising_chain: risingChainCheck,
  fp_029_window_maximums: windowMaximumsCheck,
  fp_030_rain_trap: rainTrapCheck,
};
