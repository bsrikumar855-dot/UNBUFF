/**
 * UNBLUFF first-party practice pack, part three: twenty more original exercises (fp_031 to fp_050).
 * Written for this project; none is copied or adapted from a third-party problem set, and no company is associated
 * with any of them. Each has a reference solution (used only to produce expected outputs) and, in `crossChecks3`, a
 * deliberately different implementation that the tests use to confirm every expected output a second way.
 */
import { arr, ints, line, limitsNote, lines, rng, str, type Exercise } from "./practiceHelpers.js";

const MOD = 1_000_000_007n;
const nums = (l: string) => l.split(" ").map(Number);
const sized = (a: number[]) => line(a.length) + arr(a);
const shuffled = (r: (n: number) => number, a: number[]): number[] => {
  const out = a.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = r(i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
};

/** A small binary heap, only for the reference solutions. */
class Heap {
  private readonly a: number[] = [];
  constructor(private readonly before: (x: number, y: number) => boolean) {}
  get size() {
    return this.a.length;
  }
  peek(): number {
    return this.a[0]!;
  }
  push(v: number) {
    const a = this.a;
    a.push(v);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.before(a[i]!, a[p]!)) break;
      [a[i], a[p]] = [a[p]!, a[i]!];
      i = p;
    }
  }
  pop(): number {
    const a = this.a;
    const top = a[0]!;
    const last = a.pop()!;
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && this.before(a[l]!, a[m]!)) m = l;
        if (r < a.length && this.before(a[r]!, a[m]!)) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m]!, a[i]!];
        i = m;
      }
    }
    return top;
  }
}

// ---------- 31. Warmer Days ----------
const warmer = (input: string): string => {
  const t = nums(lines(input)[1]!);
  const out = new Array<number>(t.length).fill(0);
  const stack: number[] = [];
  for (let i = 0; i < t.length; i++) {
    while (stack.length > 0 && t[stack.at(-1)!]! < t[i]!) {
      const j = stack.pop()!;
      out[j] = i - j;
    }
    stack.push(i);
  }
  return out.join(" ");
};
const warmerCheck = (input: string): string => {
  const t = nums(lines(input)[1]!);
  return t.map((x, i) => {
    for (let j = i + 1; j < t.length; j++) if (t[j]! > x) return j - i;
    return 0;
  }).join(" ");
};

// ---------- 32. Balance Point ----------
const pivot = (input: string): string => {
  const a = nums(lines(input)[1]!);
  const total = a.reduce((x, y) => x + y, 0);
  let left = 0;
  for (let i = 0; i < a.length; i++) {
    if (left === total - left - a[i]!) return String(i);
    left += a[i]!;
  }
  return "-1";
};
const pivotCheck = (input: string): string => {
  const a = nums(lines(input)[1]!);
  for (let i = 0; i < a.length; i++) {
    let l = 0;
    let r = 0;
    for (let j = 0; j < i; j++) l += a[j]!;
    for (let j = i + 1; j < a.length; j++) r += a[j]!;
    if (l === r) return String(i);
  }
  return "-1";
};

// ---------- 33. Lone Number ----------
const lone = (input: string): string => {
  let x = 0;
  for (const v of nums(lines(input)[1]!)) x ^= v;
  return String(x);
};
const loneCheck = (input: string): string => {
  const m = new Map<number, number>();
  for (const v of nums(lines(input)[1]!)) m.set(v, (m.get(v) ?? 0) + 1);
  for (const [k, c] of m) if (c % 2 === 1) return String(k);
  return "";
};
const loneInput = (r: (n: number) => number, pairs: number, lo: number, hi: number): string => {
  const base = new Set<number>();
  while (base.size < pairs + 1) base.add(lo + r(hi - lo + 1));
  const vals = [...base];
  const single = vals.pop()!;
  return sized(shuffled(r, [...vals, ...vals, single]));
};

// ---------- 34. Bit Total ----------
const bitTotal = (input: string): string => {
  const n = Number(lines(input)[0]);
  let total = 0;
  for (let b = 0; 2 ** b <= n; b++) {
    const cycle = 2 ** (b + 1);
    const full = Math.floor((n + 1) / cycle) * 2 ** b;
    const rest = Math.max(0, ((n + 1) % cycle) - 2 ** b);
    total += full + rest;
  }
  return String(total);
};
const bitTotalCheck = (input: string): string => {
  const n = Number(lines(input)[0]);
  let total = 0;
  for (let i = 1; i <= n; i++) {
    let x = i;
    while (x > 0) {
      total += x & 1;
      x >>= 1;
    }
  }
  return String(total);
};

// ---------- 35. Fewest Coins ----------
const fewestCoins = (input: string): string => {
  const l = lines(input);
  const amount = Number(l[0]!.split(" ")[1]);
  const coins = nums(l[1]!);
  const dp = new Array<number>(amount + 1).fill(Infinity);
  dp[0] = 0;
  for (let s = 1; s <= amount; s++) for (const c of coins) if (c <= s) dp[s] = Math.min(dp[s]!, dp[s - c]! + 1);
  return String(dp[amount] === Infinity ? -1 : dp[amount]);
};
const fewestCoinsCheck = (input: string): string => {
  const l = lines(input);
  const amount = Number(l[0]!.split(" ")[1]);
  const coins = nums(l[1]!);
  const dist = new Map<number, number>([[0, 0]]);
  let frontier = [0];
  while (frontier.length > 0 && !dist.has(amount)) {
    const next: number[] = [];
    for (const s of frontier) {
      for (const c of coins) {
        const t = s + c;
        if (t <= amount && !dist.has(t)) {
          dist.set(t, dist.get(s)! + 1);
          next.push(t);
        }
      }
    }
    frontier = next;
  }
  return String(dist.get(amount) ?? -1);
};
const coinsInput = (amount: number, coins: number[]) => line(coins.length, amount) + arr(coins);

// ---------- 36. Equal Halves ----------
const equalHalves = (input: string): string => {
  const a = nums(lines(input)[1]!);
  const total = a.reduce((x, y) => x + y, 0);
  if (total % 2 === 1) return "NO";
  const half = total / 2;
  const can = new Array<boolean>(half + 1).fill(false);
  can[0] = true;
  for (const v of a) for (let s = half; s >= v; s--) if (can[s - v]) can[s] = true;
  return can[half] ? "YES" : "NO";
};
const equalHalvesCheck = (input: string): string => {
  const a = nums(lines(input)[1]!);
  const total = a.reduce((x, y) => x + y, 0);
  let sums = new Set<number>([0]);
  for (const v of a) sums = new Set([...sums, ...[...sums].map((s) => s + v)]);
  return total % 2 === 0 && sums.has(total / 2) ? "YES" : "NO";
};

// ---------- 37. Ship Capacity ----------
const daysNeeded = (w: number[], cap: number): number => {
  let days = 1;
  let load = 0;
  for (const x of w) {
    if (load + x > cap) {
      days++;
      load = 0;
    }
    load += x;
  }
  return days;
};
const shipCapacity = (input: string): string => {
  const l = lines(input);
  const d = Number(l[0]!.split(" ")[1]);
  const w = nums(l[1]!);
  let lo = Math.max(...w);
  let hi = w.reduce((x, y) => x + y, 0);
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (daysNeeded(w, mid) <= d) hi = mid;
    else lo = mid + 1;
  }
  return String(lo);
};
const shipCapacityCheck = (input: string): string => {
  const l = lines(input);
  const d = Number(l[0]!.split(" ")[1]);
  const w = nums(l[1]!);
  for (let cap = Math.max(...w); ; cap++) {
    let days = 1;
    let load = 0;
    for (const x of w) {
      if (load + x > cap) {
        days++;
        load = x;
      } else load += x;
    }
    if (days <= d) return String(cap);
  }
};
const shipInput = (w: number[], d: number) => line(w.length, d) + arr(w);

// ---------- 38. Most Frequent ----------
const mostFrequent = (input: string): string => {
  const l = lines(input);
  const k = Number(l[0]!.split(" ")[1]);
  const m = new Map<number, number>();
  for (const v of nums(l[1]!)) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m.entries()].sort((x, y) => y[1] - x[1] || x[0] - y[0]).slice(0, k).map((e) => e[0]).join(" ");
};
const mostFrequentCheck = (input: string): string => {
  const l = lines(input);
  const k = Number(l[0]!.split(" ")[1]);
  const a = nums(l[1]!);
  const distinct = [...new Set(a)];
  const count = (v: number) => a.filter((x) => x === v).length;
  const picked: number[] = [];
  while (picked.length < k) {
    let best: number | null = null;
    for (const v of distinct) {
      if (picked.includes(v)) continue;
      if (best === null || count(v) > count(best) || (count(v) === count(best) && v < best)) best = v;
    }
    picked.push(best!);
  }
  return picked.join(" ");
};
const freqInput = (a: number[], k: number) => line(a.length, k) + arr(a);

// ---------- 39. Busiest Moment ----------
const busiest = (input: string): string => {
  const events: [number, number][] = [];
  for (const row of lines(input).slice(1)) {
    const [s, e] = nums(row) as [number, number];
    events.push([s, 1], [e, -1]);
  }
  events.sort((x, y) => x[0] - y[0] || x[1] - y[1]); // an ending at t comes before a start at t
  let cur = 0;
  let best = 0;
  for (const [, delta] of events) {
    cur += delta;
    best = Math.max(best, cur);
  }
  return String(best);
};
const busiestCheck = (input: string): string => {
  const iv = lines(input).slice(1).map((r) => nums(r) as [number, number]);
  let best = 0;
  for (const [x] of iv) best = Math.max(best, iv.filter(([s, e]) => s <= x && x < e).length);
  return String(best);
};
const intervalsInput = (iv: [number, number][]) => line(iv.length) + iv.map(([s, e]) => line(s, e)).join("");

// ---------- 40. Friend Groups ----------
const groups = (input: string): string => {
  const l = lines(input);
  const [n, m] = nums(l[0]!) as [number, number];
  const parent = Array.from({ length: n + 1 }, (_v, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]!]!;
      x = parent[x]!;
    }
    return x;
  };
  let count = n;
  for (let i = 0; i < m; i++) {
    const [a, b] = nums(l[1 + i]!) as [number, number];
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) {
      parent[ra] = rb;
      count--;
    }
  }
  return String(count);
};
const groupsCheck = (input: string): string => {
  const l = lines(input);
  const [n, m] = nums(l[0]!) as [number, number];
  const adj: number[][] = Array.from({ length: n + 1 }, () => []);
  for (let i = 0; i < m; i++) {
    const [a, b] = nums(l[1 + i]!) as [number, number];
    adj[a]!.push(b);
    adj[b]!.push(a);
  }
  const seen = new Array<boolean>(n + 1).fill(false);
  let comps = 0;
  for (let s = 1; s <= n; s++) {
    if (seen[s]) continue;
    comps++;
    const queue = [s];
    seen[s] = true;
    for (let h = 0; h < queue.length; h++) {
      for (const t of adj[queue[h]!]!) if (!seen[t]) {
        seen[t] = true;
        queue.push(t);
      }
    }
  }
  return String(comps);
};
const pairsInput = (n: number, e: [number, number][]) => line(n, e.length) + e.map(([a, b]) => line(a, b)).join("");
const randomPairs = (r: (n: number) => number, n: number, m: number): [number, number][] => Array.from({ length: m }, () => [1 + r(n), 1 + r(n)] as [number, number]);

// ---------- 41. Longest Mirror ----------
const longestMirror = (input: string): string => {
  const s = lines(input)[0]!;
  let best = 1;
  for (let c = 0; c < s.length; c++) {
    for (const [a, b] of [[c, c], [c, c + 1]] as const) {
      let i = a;
      let j = b;
      while (i >= 0 && j < s.length && s[i] === s[j]) {
        best = Math.max(best, j - i + 1);
        i--;
        j++;
      }
    }
  }
  return String(best);
};
const longestMirrorCheck = (input: string): string => {
  const s = lines(input)[0]!;
  let best = 1;
  for (let i = 0; i < s.length; i++) {
    for (let j = i; j < s.length; j++) {
      const sub = s.slice(i, j + 1);
      if (sub === [...sub].reverse().join("")) best = Math.max(best, sub.length);
    }
  }
  return String(best);
};

// ---------- 42. Decode Count ----------
const decodeCount = (input: string): string => {
  const s = lines(input)[0]!;
  let prev2 = 1n;
  let prev1 = s[0] === "0" ? 0n : 1n;
  for (let i = 1; i < s.length; i++) {
    let cur = 0n;
    if (s[i] !== "0") cur += prev1;
    const two = Number(s.slice(i - 1, i + 1));
    if (s[i - 1] !== "0" && two >= 10 && two <= 26) cur += prev2;
    prev2 = prev1;
    prev1 = cur % MOD;
  }
  return String(prev1 % MOD);
};
const decodeCountCheck = (input: string): string => {
  const s = lines(input)[0]!;
  const memo = new Map<number, bigint>();
  const go = (i: number): bigint => {
    if (i === s.length) return 1n;
    if (s[i] === "0") return 0n;
    const hit = memo.get(i);
    if (hit !== undefined) return hit;
    let total = go(i + 1);
    if (i + 1 < s.length && Number(s.slice(i, i + 2)) <= 26) total += go(i + 2);
    total %= MOD;
    memo.set(i, total);
    return total;
  };
  return String(go(0));
};

// ---------- 43. Fewest Jumps ----------
const fewestJumps = (input: string): string => {
  const a = nums(lines(input)[1]!);
  if (a.length === 1) return "0";
  let jumps = 0;
  let end = 0;
  let far = 0;
  for (let i = 0; i < a.length - 1; i++) {
    far = Math.max(far, i + a[i]!);
    if (i === end) {
      if (far <= i) return "-1";
      jumps++;
      end = far;
      if (end >= a.length - 1) break;
    }
  }
  return String(end >= a.length - 1 ? jumps : -1);
};
const fewestJumpsCheck = (input: string): string => {
  const a = nums(lines(input)[1]!);
  const dp = new Array<number>(a.length).fill(Infinity);
  dp[0] = 0;
  for (let i = 0; i < a.length; i++) {
    if (dp[i] === Infinity) continue;
    for (let j = i + 1; j <= Math.min(a.length - 1, i + a[i]!); j++) dp[j] = Math.min(dp[j]!, dp[i]! + 1);
  }
  const last = dp[a.length - 1]!;
  return String(last === Infinity ? -1 : last);
};

// ---------- 44. Target Subsets ----------
const targetSubsets = (input: string): string => {
  const l = lines(input);
  const target = Number(l[0]!.split(" ")[1]);
  const a = nums(l[1]!);
  const go = (i: number, sum: number): number => (i === a.length ? (sum === target ? 1 : 0) : go(i + 1, sum) + go(i + 1, sum + a[i]!));
  return String(go(0, 0));
};
const targetSubsetsCheck = (input: string): string => {
  const l = lines(input);
  const target = Number(l[0]!.split(" ")[1]);
  const a = nums(l[1]!);
  let count = 0;
  for (let mask = 0; mask < 2 ** a.length; mask++) {
    let sum = 0;
    for (let b = 0; b < a.length; b++) if (mask & (1 << b)) sum += a[b]!;
    if (sum === target) count++;
  }
  return String(count);
};
const subsetInput = (a: number[], target: number) => line(a.length, target) + arr(a);

// ---------- 45. Next Arrangement ----------
const nextArrangement = (input: string): string => {
  const a = nums(lines(input)[1]!);
  let i = a.length - 2;
  while (i >= 0 && a[i]! >= a[i + 1]!) i--;
  if (i >= 0) {
    let j = a.length - 1;
    while (a[j]! <= a[i]!) j--;
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  const tail = a.splice(i + 1).reverse();
  return [...a, ...tail].join(" ");
};
const nextArrangementCheck = (input: string): string => {
  const a = nums(lines(input)[1]!);
  for (let i = a.length - 2; i >= 0; i--) {
    const suffix = a.slice(i + 1);
    const bigger = suffix.filter((x) => x > a[i]!);
    if (bigger.length === 0) continue;
    const pick = Math.min(...bigger);
    const rest = [...suffix, a[i]!];
    rest.splice(rest.indexOf(pick), 1);
    rest.sort((x, y) => x - y);
    return [...a.slice(0, i), pick, ...rest].join(" ");
  }
  return [...a].sort((x, y) => x - y).join(" ");
};

// ---------- 46. Spreading Spoilage ----------
const gridLines = (input: string) => {
  const l = lines(input);
  const [r, c] = nums(l[0]!) as [number, number];
  return { r, c, grid: l.slice(1, 1 + r).map(nums) };
};
const spoilage = (input: string): string => {
  const { r, c, grid } = gridLines(input);
  let fresh = 0;
  let queue: [number, number][] = [];
  for (let y = 0; y < r; y++) for (let x = 0; x < c; x++) {
    if (grid[y]![x] === 1) fresh++;
    else if (grid[y]![x] === 2) queue.push([y, x]);
  }
  let minutes = 0;
  while (fresh > 0 && queue.length > 0) {
    const next: [number, number][] = [];
    for (const [y, x] of queue) {
      for (const [dy, dx] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const ny = y + dy;
        const nx = x + dx;
        if (ny >= 0 && ny < r && nx >= 0 && nx < c && grid[ny]![nx] === 1) {
          grid[ny]![nx] = 2;
          fresh--;
          next.push([ny, nx]);
        }
      }
    }
    queue = next;
    minutes++;
  }
  return String(fresh === 0 ? minutes : -1);
};
const spoilageCheck = (input: string): string => {
  const { r, c, grid } = gridLines(input);
  const has1 = () => grid.some((row) => row.includes(1));
  let minutes = 0;
  while (has1()) {
    const turn: [number, number][] = [];
    for (let y = 0; y < r; y++) for (let x = 0; x < c; x++) {
      if (grid[y]![x] !== 1) continue;
      const touches = [[y + 1, x], [y - 1, x], [y, x + 1], [y, x - 1]].some(([a, b]) => grid[a!]?.[b!] === 2);
      if (touches) turn.push([y, x]);
    }
    if (turn.length === 0) return "-1";
    for (const [y, x] of turn) grid[y]![x] = 2;
    minutes++;
  }
  return String(minutes);
};
const gridInput = (g: number[][]) => line(g.length, g[0]!.length) + g.map(arr).join("");
const randomCells = (r: (n: number) => number, h: number, w: number, weights: [number, number, number]) => {
  const total = weights[0] + weights[1] + weights[2];
  return Array.from({ length: h }, () => Array.from({ length: w }, () => {
    const v = r(total);
    return v < weights[0] ? 0 : v < weights[0] + weights[1] ? 1 : 2;
  }));
};

// ---------- 47. Cheapest Network ----------
const cheapestNetwork = (input: string): string => {
  const l = lines(input);
  const [n, m] = nums(l[0]!) as [number, number];
  const edges = l.slice(1, 1 + m).map((row) => nums(row) as [number, number, number]).sort((x, y) => x[2] - y[2]);
  const parent = Array.from({ length: n + 1 }, (_v, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x]!)));
  let total = 0;
  let used = 0;
  for (const [a, b, w] of edges) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) {
      parent[ra] = rb;
      total += w;
      used++;
    }
  }
  return String(used === n - 1 ? total : -1);
};
const cheapestNetworkCheck = (input: string): string => {
  const l = lines(input);
  const [n, m] = nums(l[0]!) as [number, number];
  const w = Array.from({ length: n + 1 }, () => new Array<number>(n + 1).fill(Infinity));
  for (const row of l.slice(1, 1 + m)) {
    const [a, b, c] = nums(row) as [number, number, number];
    if (c < w[a]![b]!) {
      w[a]![b] = c;
      w[b]![a] = c;
    }
  }
  const best = new Array<number>(n + 1).fill(Infinity);
  const inTree = new Array<boolean>(n + 1).fill(false);
  best[1] = 0;
  let total = 0;
  for (let step = 0; step < n; step++) {
    let u = -1;
    for (let v = 1; v <= n; v++) if (!inTree[v] && (u === -1 || best[v]! < best[u]!)) u = v;
    if (best[u]! === Infinity) return "-1";
    inTree[u] = true;
    total += best[u]!;
    for (let v = 1; v <= n; v++) if (!inTree[v] && w[u]![v]! < best[v]!) best[v] = w[u]![v]!;
  }
  return String(total);
};
const weighted = (n: number, e: [number, number, number][]) => line(n, e.length) + e.map(([a, b, c]) => line(a, b, c)).join("");
const randomConnected = (r: (n: number) => number, n: number, extra: number, maxW: number): [number, number, number][] => {
  const e: [number, number, number][] = [];
  for (let v = 2; v <= n; v++) e.push([1 + r(v - 1), v, 1 + r(maxW)]);
  for (let i = 0; i < extra; i++) e.push([1 + r(n), 1 + r(n), 1 + r(maxW)]);
  return e;
};

// ---------- 48. Widest Skyline ----------
const widestSkyline = (input: string): string => {
  const h = [...nums(lines(input)[1]!), 0];
  const stack: number[] = [];
  let best = 0;
  for (let i = 0; i < h.length; i++) {
    while (stack.length > 0 && h[stack.at(-1)!]! >= h[i]!) {
      const height = h[stack.pop()!]!;
      const left = stack.length === 0 ? -1 : stack.at(-1)!;
      best = Math.max(best, height * (i - left - 1));
    }
    stack.push(i);
  }
  return String(best);
};
const widestSkylineCheck = (input: string): string => {
  const h = nums(lines(input)[1]!);
  let best = 0;
  for (let i = 0; i < h.length; i++) {
    let low = h[i]!;
    for (let j = i; j < h.length; j++) {
      low = Math.min(low, h[j]!);
      best = Math.max(best, low * (j - i + 1));
    }
  }
  return String(best);
};

// ---------- 49. Shared Subsequence ----------
const sharedLength = (input: string): string => {
  const [a, b] = lines(input) as [string, string];
  let prev = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const cur = new Array<number>(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j++) cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1]! + 1 : Math.max(prev[j]!, cur[j - 1]!);
    prev = cur;
  }
  return String(prev[b.length]);
};
const sharedLengthCheck = (input: string): string => {
  const [a, b] = lines(input) as [string, string];
  const memo = new Map<number, number>();
  const go = (i: number, j: number): number => {
    if (i === a.length || j === b.length) return 0;
    const key = i * 1000 + j;
    const hit = memo.get(key);
    if (hit !== undefined) return hit;
    const v = a[i] === b[j] ? 1 + go(i + 1, j + 1) : Math.max(go(i + 1, j), go(i, j + 1));
    memo.set(key, v);
    return v;
  };
  return String(go(0, 0));
};

// ---------- 50. Running Median ----------
const runningMedian = (input: string): string => {
  const a = nums(lines(input)[1]!);
  const low = new Heap((x, y) => x > y); // max-heap: the smaller half
  const high = new Heap((x, y) => x < y); // min-heap: the larger half
  const out: number[] = [];
  for (const v of a) {
    if (low.size === 0 || v <= low.peek()) low.push(v);
    else high.push(v);
    if (low.size > high.size + 1) high.push(low.pop());
    else if (high.size > low.size) low.push(high.pop());
    out.push(low.peek());
  }
  return out.join(" ");
};
const runningMedianCheck = (input: string): string => {
  const a = nums(lines(input)[1]!);
  const sorted: number[] = [];
  return a.map((v) => {
    sorted.push(v);
    sorted.sort((x, y) => x - y);
    return sorted[Math.floor((sorted.length - 1) / 2)];
  }).join(" ");
};

export function threeExercises(): Exercise[] {
  const r31 = rng(31 * 7919);
  const r32 = rng(32 * 7919);
  const r33 = rng(33 * 7919);
  const r36 = rng(36 * 7919);
  const r37 = rng(37 * 7919);
  const r38 = rng(38 * 7919);
  const r39 = rng(39 * 7919);
  const r40 = rng(40 * 7919);
  const r41 = rng(41 * 7919);
  const r42 = rng(42 * 7919);
  const r43 = rng(43 * 7919);
  const r44 = rng(44 * 7919);
  const r45 = rng(45 * 7919);
  const r46 = rng(46 * 7919);
  const r47 = rng(47 * 7919);
  const r48 = rng(48 * 7919);
  const r49 = rng(49 * 7919);
  const r50 = rng(50 * 7919);
  const ex: Exercise[] = [
    {
      id: "fp_031_warmer_days",
      title: "Warmer Days",
      difficulty: "medium",
      topics: ["Stack", "Arrays"],
      statement: `The first line has n (1 <= n <= 2000). The second line has n daily temperatures between -50 and 60. For each day, find how many days you must wait until a strictly warmer day arrives. If no later day is warmer, the answer for that day is 0. Print the n answers on one line separated by single spaces. ${limitsNote}`,
      samples: [sized([20, 25, 22, 30]), sized([5, 4, 3])],
      tests: [
        sized([7]),
        sized([1, 2, 3, 4, 5]),
        sized([5, 4, 3, 2, 1]),
        sized([3, 3, 3]),
        sized([-5, -5, 0, -5, 10]),
        sized([30, 40, 50, 60, 20, 10, 70]),
        sized(ints(r31, 40, -10, 10)),
        sized(ints(r31, 500, -50, 60)),
        sized(ints(r31, 2000, -50, 60)),
        sized(Array.from({ length: 2000 }, (_v, i) => 60 - Math.floor(i / 40))),
      ],
      solve: warmer,
    },
    {
      id: "fp_032_balance_point",
      title: "Balance Point",
      difficulty: "easy",
      topics: ["Arrays", "Prefix Sums"],
      statement: `The first line has n (1 <= n <= 2000). The second line has n integers between -1000 and 1000. Find the smallest position i (counting from 0) such that the sum of the numbers before position i equals the sum of the numbers after position i (the number at i itself is not counted). An empty side counts as 0. Print i, or -1 if there is no such position. ${limitsNote}`,
      samples: [sized([1, 7, 3, 6, 5, 6]), sized([1, 2, 3])],
      tests: [
        sized([5]),
        sized([0, 0, 0]),
        sized([2, 1, -1]),
        sized([-1, -1, 0, 1, 1]),
        sized([1, -1, 1, -1, 1]),
        sized([10, -10]),
        sized(ints(r32, 30, -5, 5)),
        sized(ints(r32, 1000, -3, 3)),
        sized(ints(r32, 2000, -1000, 1000)),
        sized([...new Array<number>(999).fill(1), 0, ...new Array<number>(999).fill(1)]),
      ],
      solve: pivot,
    },
    {
      id: "fp_033_lone_number",
      title: "Lone Number",
      difficulty: "easy",
      topics: ["Bit Manipulation", "Hash Table"],
      statement: `The first line has an odd n (1 <= n <= 999). The second line has n integers between -1000000000 and 1000000000. Every value appears exactly twice, except one value that appears once. Print that value. ${limitsNote}`,
      samples: [sized([4, 1, 2, 1, 2]), sized([-3])],
      tests: [
        sized([0]),
        sized([7, 7, 8]),
        sized([-5, 9, -5]),
        sized([1000000000, 3, 1000000000]),
        sized([-1000000000, -1000000000, 0]),
        loneInput(r33, 4, -9, 9),
        loneInput(r33, 50, -1000, 1000),
        loneInput(r33, 200, -1000000000, 1000000000),
        loneInput(r33, 499, -1000000000, 1000000000),
      ],
      solve: lone,
    },
    {
      id: "fp_034_bit_total",
      title: "Bit Total",
      difficulty: "medium",
      topics: ["Bit Manipulation", "Math"],
      statement: `One line has n (1 <= n <= 1000000). Write each whole number from 1 to n in binary. Print the total number of 1 digits across all of them. ${limitsNote}`,
      samples: ["5\n", "1\n"],
      tests: ["2\n", "3\n", "7\n", "8\n", "10\n", "255\n", "256\n", "1000\n", "65535\n", "123456\n", "1000000\n"],
      solve: bitTotal,
    },
    {
      id: "fp_035_fewest_coins",
      title: "Fewest Coins",
      difficulty: "medium",
      topics: ["Dynamic Programming"],
      statement: `The first line has n and amount (1 <= n <= 12, 0 <= amount <= 5000). The second line has n different coin values between 1 and 5000, and every coin can be used any number of times. Print the smallest number of coins that add up to exactly amount, or -1 if it cannot be done. ${limitsNote}`,
      samples: [coinsInput(11, [1, 2, 5]), coinsInput(3, [2])],
      tests: [
        coinsInput(0, [3]),
        coinsInput(1, [1]),
        coinsInput(7, [2, 4]),
        coinsInput(6, [1, 3, 4]),
        coinsInput(100, [1, 5, 10, 25]),
        coinsInput(63, [1, 21, 37, 50]),
        coinsInput(999, [7, 13]),
        coinsInput(5000, [1, 2, 5, 10, 20, 50, 100, 200]),
        coinsInput(4999, [5000, 2500, 1000]),
        coinsInput(3999, [3, 11, 17, 29, 101]),
      ],
      solve: fewestCoins,
    },
    {
      id: "fp_036_equal_halves",
      title: "Equal Halves",
      difficulty: "medium",
      topics: ["Dynamic Programming", "Arrays"],
      statement: `The first line has n (1 <= n <= 100). The second line has n integers between 1 and 100. Decide whether the numbers can be split into two groups, every number in exactly one group, so that both groups have the same sum. Print YES or NO. ${limitsNote}`,
      samples: [sized([1, 5, 11, 5]), sized([1, 2, 3, 5])],
      tests: [
        sized([4]),
        sized([2, 2]),
        sized([1, 1, 1]),
        sized([100, 1, 1, 98]),
        sized([3, 3, 3, 4, 5]),
        sized(ints(r36, 10, 1, 10)),
        sized(ints(r36, 40, 1, 30)),
        sized(ints(r36, 100, 1, 100)),
        sized(new Array<number>(99).fill(100).concat([1])),
        sized(new Array<number>(100).fill(99)),
      ],
      solve: equalHalves,
    },
    {
      id: "fp_037_ship_capacity",
      title: "Ship Capacity",
      difficulty: "medium",
      topics: ["Binary Search", "Arrays"],
      statement: `The first line has n and d (1 <= d <= n <= 500). The second line has n package weights between 1 and 50, in the order they must be shipped. Each day you ship a block of consecutive packages without changing the order, and the total weight of a day's block cannot exceed the ship's capacity. Print the smallest capacity that lets you ship all packages within d days. ${limitsNote}`,
      samples: [shipInput([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 5), shipInput([3, 2, 2, 4, 1, 4], 3)],
      tests: [
        shipInput([9], 1),
        shipInput([4, 4, 4, 4], 4),
        shipInput([4, 4, 4, 4], 1),
        shipInput([1, 1, 1, 50], 2),
        shipInput([50, 1, 1, 1], 2),
        shipInput([10, 20, 30, 40, 50], 3),
        shipInput(ints(r37, 30, 1, 10), 4),
        shipInput(ints(r37, 200, 1, 50), 7),
        shipInput(ints(r37, 500, 1, 50), 25),
        shipInput(ints(r37, 500, 1, 50), 500),
        shipInput(new Array<number>(500).fill(50), 1),
      ],
      solve: shipCapacity,
    },
    {
      id: "fp_038_most_frequent",
      title: "Most Frequent",
      difficulty: "medium",
      topics: ["Hash Table", "Sorting"],
      statement: `The first line has n and k (1 <= n <= 2000, and k is at least 1 and at most the number of different values). The second line has n integers between -1000 and 1000. Print the k values that appear most often, most frequent first. If two values appear equally often, the smaller value comes first. Separate the k values with single spaces. ${limitsNote}`,
      samples: [freqInput([1, 1, 1, 2, 2, 3], 2), freqInput([4], 1)],
      tests: [
        freqInput([5, 5, 6, 6], 2),
        freqInput([-1, -1, -2, -2, 3], 3),
        freqInput([9, 8, 7, 9, 8, 9], 3),
        freqInput([1, 2, 3, 4, 5], 5),
        freqInput([2, 2, 2, 2], 1),
        freqInput(ints(r38, 40, -3, 3), 4),
        freqInput(ints(r38, 300, -20, 20), 10),
        freqInput(ints(r38, 2000, -1000, 1000), 25),
        freqInput(ints(r38, 2000, -5, 5), 11),
      ],
      solve: mostFrequent,
    },
    {
      id: "fp_039_busiest_moment",
      title: "Busiest Moment",
      difficulty: "medium",
      topics: ["Intervals", "Sorting"],
      statement: `The first line has n (1 <= n <= 1000). Each of the next n lines has two integers s and e (0 <= s < e <= 1000000): a meeting that starts at time s and ends at time e. A meeting is running from s up to, but not including, e, so a meeting that ends at time t does not overlap one that starts at time t. Print the greatest number of meetings running at the same time. ${limitsNote}`,
      samples: [intervalsInput([[0, 30], [5, 10], [15, 20]]), intervalsInput([[1, 2], [2, 3]])],
      tests: [
        intervalsInput([[0, 1]]),
        intervalsInput([[1, 5], [1, 5], [1, 5]]),
        intervalsInput([[1, 3], [3, 5], [5, 7]]),
        intervalsInput([[0, 100], [10, 20], [15, 30], [25, 40]]),
        intervalsInput([[5, 6], [1, 10], [2, 3], [4, 8]]),
        intervalsInput(Array.from({ length: 30 }, () => { const s = r39(50); return [s, s + 1 + r39(20)] as [number, number]; })),
        intervalsInput(Array.from({ length: 300 }, () => { const s = r39(1000); return [s, s + 1 + r39(200)] as [number, number]; })),
        intervalsInput(Array.from({ length: 1000 }, () => { const s = r39(999000); return [s, s + 1 + r39(1000)] as [number, number]; })),
        intervalsInput(Array.from({ length: 1000 }, (_v, i) => [i, 1000000 - i] as [number, number])),
      ],
      solve: busiest,
    },
    {
      id: "fp_040_friend_groups",
      title: "Friend Groups",
      difficulty: "medium",
      topics: ["Graphs", "Union Find"],
      statement: `The first line has n and m (1 <= n <= 1000, 0 <= m <= 1500). People are numbered 1 to n. Each of the next m lines has two numbers a and b, meaning a and b are friends (a person may be listed as their own friend, and pairs may repeat). Friendship spreads: a friend of a friend is in the same group. Print how many separate groups there are. ${limitsNote}`,
      samples: [pairsInput(5, [[1, 2], [2, 3], [4, 5]]), pairsInput(3, [])],
      tests: [
        pairsInput(1, []),
        pairsInput(1, [[1, 1]]),
        pairsInput(4, [[1, 2], [1, 2], [2, 1]]),
        pairsInput(6, [[1, 2], [3, 4], [5, 6], [2, 3], [4, 5]]),
        pairsInput(10, [[1, 10], [10, 5], [2, 9], [9, 8]]),
        pairsInput(50, randomPairs(r40, 50, 20)),
        pairsInput(500, randomPairs(r40, 500, 300)),
        pairsInput(1000, randomPairs(r40, 1000, 500)),
        pairsInput(1000, randomPairs(r40, 1000, 1500)),
        pairsInput(1000, Array.from({ length: 999 }, (_v, i) => [i + 1, i + 2] as [number, number])),
      ],
      solve: groups,
    },
    {
      id: "fp_041_longest_mirror",
      title: "Longest Mirror",
      difficulty: "medium",
      topics: ["Strings", "Two Pointers"],
      statement: `One line has a non-empty string of lowercase letters (length at most 300). A mirror is a block of consecutive letters that reads the same forwards and backwards. Print the length of the longest mirror in the string. ${limitsNote}`,
      samples: ["babad\n", "abcd\n"],
      tests: [
        "a\n",
        "aa\n",
        "ab\n",
        "racecar\n",
        "abba\n",
        "forgeeksskeegfor\n",
        "abacdfgdcaba\n",
        `${str(r41, 40, "ab")}\n`,
        `${str(r41, 120, "abc")}\n`,
        `${"a".repeat(300)}\n`,
        `${str(r41, 300, "abcdefghijklmnopqrstuvwxyz")}\n`,
      ],
      solve: longestMirror,
    },
    {
      id: "fp_042_decode_count",
      title: "Decode Count",
      difficulty: "medium",
      topics: ["Dynamic Programming", "Strings"],
      statement: `One line has a string of digits (length 1 to 100). A message is encoded by replacing A with 1, B with 2, and so on up to Z with 26. Count how many different messages could have produced the digits. A letter is never written with a leading zero, so "06" is not valid. Print the count modulo 1000000007 (print 0 if the digits cannot be decoded at all). ${limitsNote}`,
      samples: ["12\n", "226\n"],
      tests: [
        "1\n",
        "0\n",
        "06\n",
        "10\n",
        "27\n",
        "100\n",
        "2101\n",
        "11111\n",
        `${"1".repeat(40)}\n`,
        `${str(r42, 30, "0123456789")}\n`,
        `${str(r42, 100, "12")}\n`,
        `${str(r42, 100, "1234567890")}\n`,
      ],
      solve: decodeCount,
    },
    {
      id: "fp_043_fewest_jumps",
      title: "Fewest Jumps",
      difficulty: "medium",
      topics: ["Greedy", "Dynamic Programming"],
      statement: `The first line has n (1 <= n <= 2000). The second line has n integers between 0 and 100. You start on position 0. From position i you may jump forward any distance from 1 up to the number at position i. Print the fewest jumps needed to land exactly on position n - 1 (0 if n is 1), or -1 if it cannot be reached. ${limitsNote}`,
      samples: [sized([2, 3, 1, 1, 4]), sized([3, 2, 1, 0, 4])],
      tests: [
        sized([0]),
        sized([1, 1, 1, 1]),
        sized([5, 0, 0, 0, 0, 0]),
        sized([1, 0, 1]),
        sized([4, 1, 1, 3, 1, 1, 1]),
        sized(ints(r43, 30, 0, 4)),
        sized(ints(r43, 500, 1, 10)),
        sized(ints(r43, 2000, 1, 100)),
        sized(ints(r43, 2000, 0, 3)),
        sized(new Array<number>(2000).fill(1)),
      ],
      solve: fewestJumps,
    },
    {
      id: "fp_044_target_subsets",
      title: "Target Subsets",
      difficulty: "medium",
      topics: ["Backtracking", "Bit Manipulation"],
      statement: `The first line has n and target (1 <= n <= 20, -200 <= target <= 200). The second line has n integers between -20 and 20. Count the ways to choose some of the numbers (by position, so equal values at different positions count as different choices, and choosing none is allowed) so that their sum equals target. Print the count. ${limitsNote}`,
      samples: [subsetInput([1, 2, 3], 3), subsetInput([0, 0], 0)],
      tests: [
        subsetInput([5], 5),
        subsetInput([5], 0),
        subsetInput([1, 1, 1, 1], 2),
        subsetInput([-1, 1, -2, 2], 0),
        subsetInput([4, 4, 4], 8),
        subsetInput(ints(r44, 10, -5, 5), 3),
        subsetInput(ints(r44, 15, -20, 20), 0),
        subsetInput(ints(r44, 18, -10, 10), 7),
        subsetInput(new Array<number>(20).fill(1), 10),
        subsetInput(ints(r44, 20, -20, 20), -13),
      ],
      solve: targetSubsets,
    },
    {
      id: "fp_045_next_arrangement",
      title: "Next Arrangement",
      difficulty: "medium",
      topics: ["Arrays", "Two Pointers"],
      statement: `The first line has n (1 <= n <= 1000). The second line has n digits (each 0 to 9, repeats allowed). Imagine all different orders of these digits listed from smallest to largest, comparing them like words. Print the order that comes right after the given one. If the given order is the last in the list, print the first (the smallest) instead. Separate the digits with single spaces. ${limitsNote}`,
      samples: [sized([1, 2, 3]), sized([3, 2, 1])],
      tests: [
        sized([5]),
        sized([1, 1]),
        sized([1, 3, 2]),
        sized([2, 3, 1]),
        sized([1, 5, 1]),
        sized([0, 0, 1, 0]),
        sized([9, 9, 8, 7]),
        sized(ints(r45, 12, 0, 9)),
        sized(ints(r45, 100, 0, 2)),
        sized(ints(r45, 1000, 0, 9)),
        sized(Array.from({ length: 1000 }, (_v, i) => 9 - Math.floor(i / 100))),
      ],
      solve: nextArrangement,
    },
    {
      id: "fp_046_spreading_spoilage",
      title: "Spreading Spoilage",
      difficulty: "medium",
      topics: ["Breadth-First Search", "Matrix"],
      statement: `The first line has r and c (1 <= r, c <= 50). Each of the next r lines has c numbers: 0 is an empty cell, 1 is fresh fruit and 2 is spoiled fruit. Every minute, each fresh fruit that touches a spoiled fruit above, below, left or right becomes spoiled. Print how many minutes pass until no fresh fruit is left, 0 if there was none to begin with, or -1 if some fresh fruit can never spoil. ${limitsNote}`,
      samples: [gridInput([[2, 1, 1], [1, 1, 0], [0, 1, 1]]), gridInput([[0, 2]])],
      tests: [
        gridInput([[0]]),
        gridInput([[1]]),
        gridInput([[2]]),
        gridInput([[2, 1, 1, 1, 1]]),
        gridInput([[2, 0, 1]]),
        gridInput([[1, 2], [2, 1]]),
        gridInput(randomCells(r46, 5, 5, [2, 6, 1])),
        gridInput(randomCells(r46, 20, 25, [2, 10, 1])),
        gridInput(randomCells(r46, 50, 50, [1, 20, 1])),
        gridInput(randomCells(r46, 50, 50, [3, 12, 1])),
        gridInput([[2, ...new Array<number>(49).fill(1)]].concat(Array.from({ length: 49 }, () => new Array<number>(50).fill(1)))),
      ],
      solve: spoilage,
    },
    {
      id: "fp_047_cheapest_network",
      title: "Cheapest Network",
      difficulty: "hard",
      topics: ["Graphs", "Union Find", "Greedy"],
      statement: `The first line has n and m (1 <= n <= 500, 0 <= m <= 1200). Towns are numbered 1 to n. Each of the next m lines has a, b and w (1 <= w <= 1000): a cable that can join towns a and b at cost w (several cables may join the same pair). Choose cables so that every town can reach every other town, spending as little as possible. Print the total cost, or -1 if the towns cannot all be connected. ${limitsNote}`,
      samples: [weighted(4, [[1, 2, 1], [2, 3, 2], [3, 4, 3], [1, 4, 10]]), weighted(3, [[1, 2, 5]])],
      tests: [
        weighted(1, []),
        weighted(2, [[1, 2, 7], [1, 2, 3]]),
        weighted(3, [[1, 1, 1], [1, 2, 4], [2, 3, 6], [1, 3, 5]]),
        weighted(4, [[1, 2, 1], [3, 4, 1]]),
        weighted(5, [[1, 2, 2], [2, 3, 2], [3, 4, 2], [4, 5, 2], [5, 1, 1]]),
        weighted(30, randomConnected(r47, 30, 20, 20)),
        weighted(200, randomConnected(r47, 200, 400, 1000)),
        weighted(500, randomConnected(r47, 500, 700, 1000)),
        weighted(500, randomConnected(r47, 400, 601, 50)),
        weighted(500, randomConnected(r47, 500, 701, 5)),
      ],
      solve: cheapestNetwork,
    },
    {
      id: "fp_048_widest_skyline",
      title: "Widest Skyline",
      difficulty: "hard",
      topics: ["Stack", "Arrays"],
      statement: `The first line has n (1 <= n <= 2000). The second line has n bar heights between 0 and 1000, standing side by side, each one unit wide. Find the largest rectangle that fits entirely inside the bars (its width is a run of neighbouring bars and its height cannot be taller than the shortest bar in that run). Print its area. ${limitsNote}`,
      samples: [sized([2, 1, 5, 6, 2, 3]), sized([4])],
      tests: [
        sized([0]),
        sized([0, 0, 0]),
        sized([5, 5, 5, 5]),
        sized([1, 2, 3, 4, 5]),
        sized([5, 4, 3, 2, 1]),
        sized([2, 4, 2, 4]),
        sized(ints(r48, 30, 0, 9)),
        sized(ints(r48, 500, 0, 1000)),
        sized(ints(r48, 2000, 0, 1000)),
        sized(new Array<number>(2000).fill(1000)),
        sized(Array.from({ length: 2000 }, (_v, i) => (i % 2 === 0 ? 1000 : 1))),
      ],
      solve: widestSkyline,
    },
    {
      id: "fp_049_shared_subsequence",
      title: "Shared Subsequence",
      difficulty: "medium",
      topics: ["Dynamic Programming", "Strings"],
      statement: `Two lines each have a non-empty string of lowercase letters (length at most 300). A subsequence is what remains after deleting some letters (maybe none) without reordering the rest. Print the length of the longest string that is a subsequence of both. ${limitsNote}`,
      samples: ["abcde\nace\n", "abc\ndef\n"],
      tests: [
        "a\na\n",
        "a\nb\n",
        "abc\nabc\n",
        "abc\ncba\n",
        "aaaa\naa\n",
        "abcbdab\nbdcaba\n",
        `${str(r49, 30, "abc")}\n${str(r49, 25, "abc")}\n`,
        `${str(r49, 150, "abcd")}\n${str(r49, 140, "abcd")}\n`,
        `${str(r49, 300, "ab")}\n${str(r49, 300, "ab")}\n`,
        `${"a".repeat(300)}\n${"a".repeat(300)}\n`,
      ],
      solve: sharedLength,
    },
    {
      id: "fp_050_running_median",
      title: "Running Median",
      difficulty: "hard",
      topics: ["Heap", "Sorting"],
      statement: `The first line has n (1 <= n <= 2000). The second line has n integers between -1000000 and 1000000, arriving one at a time. After each number arrives, find the middle value of all numbers received so far, when they are sorted. If the count is even, use the lower of the two middle values. Print the n answers on one line separated by single spaces. ${limitsNote}`,
      samples: [sized([5, 2, 8, 1]), sized([7])],
      tests: [
        sized([-3]),
        sized([1, 1, 1, 1]),
        sized([1, 2, 3, 4, 5, 6]),
        sized([6, 5, 4, 3, 2, 1]),
        sized([10, -10, 10, -10]),
        sized(ints(r50, 30, -9, 9)),
        sized(ints(r50, 500, -1000, 1000)),
        sized(ints(r50, 2000, -1000000, 1000000)),
        sized(Array.from({ length: 2000 }, (_v, i) => (i % 2 === 0 ? i : -i))),
      ],
      solve: runningMedian,
    },
  ];
  return ex;
}

/** Second, deliberately different implementations, keyed by exercise id. */
export const crossChecks3: Record<string, (input: string) => string> = {
  fp_031_warmer_days: warmerCheck,
  fp_032_balance_point: pivotCheck,
  fp_033_lone_number: loneCheck,
  fp_034_bit_total: bitTotalCheck,
  fp_035_fewest_coins: fewestCoinsCheck,
  fp_036_equal_halves: equalHalvesCheck,
  fp_037_ship_capacity: shipCapacityCheck,
  fp_038_most_frequent: mostFrequentCheck,
  fp_039_busiest_moment: busiestCheck,
  fp_040_friend_groups: groupsCheck,
  fp_041_longest_mirror: longestMirrorCheck,
  fp_042_decode_count: decodeCountCheck,
  fp_043_fewest_jumps: fewestJumpsCheck,
  fp_044_target_subsets: targetSubsetsCheck,
  fp_045_next_arrangement: nextArrangementCheck,
  fp_046_spreading_spoilage: spoilageCheck,
  fp_047_cheapest_network: cheapestNetworkCheck,
  fp_048_widest_skyline: widestSkylineCheck,
  fp_049_shared_subsequence: sharedLengthCheck,
  fp_050_running_median: runningMedianCheck,
};
