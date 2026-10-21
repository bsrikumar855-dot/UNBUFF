import {
  ArrowLeftRight,
  BarChart3,
  Database,
  GitBranch,
  GitMerge,
  Grid3x3,
  Hash,
  KeyRound,
  Layers,
  ListTree,
  MoveHorizontal,
  Network,
  PanelTop,
  RotateCcw,
  Search,
  Shapes,
  ShieldCheck,
  Sigma,
  Table2,
  Terminal,
  type LucideIcon,
} from "lucide-react";

/** First matching keyword wins, so the more specific words come first. Decorative only: nothing depends on the picture. */
const pick = (text: string, table: [RegExp, LucideIcon][], fallback: LucideIcon): LucideIcon =>
  table.find(([re]) => re.test(text))?.[1] ?? fallback;

const PATTERN_ICONS: [RegExp, LucideIcon][] = [
  [/two.?pointer|opposite|read and write|fast.?slow|cycle/i, ArrowLeftRight],
  [/window/i, PanelTop],
  [/prefix|sum/i, Sigma],
  [/kadane|subarray/i, BarChart3],
  [/hash|map|frequency|count/i, Hash],
  [/interval|sweep|merge/i, MoveHorizontal],
  [/binary.?search|search/i, Search],
  [/stack|queue|monoton/i, Layers],
  [/tree|trie|heap/i, GitBranch],
  [/graph|bfs|dfs|union|topolog/i, Network],
  [/dp|dynamic|knapsack|memo/i, Grid3x3],
];

const DBMS_ICONS: [RegExp, LucideIcon][] = [
  [/key|constraint/i, KeyRound],
  [/join/i, GitMerge],
  [/transaction|acid|concurren|lock/i, ArrowLeftRight],
  [/index|b-?tree|query plan|optimi/i, ListTree],
  [/normal|schema|er |model|design/i, Table2],
  [/recover|log|backup/i, RotateCcw],
  [/isolation|security|integrity/i, ShieldCheck],
  [/sql|select|group|aggregate|subquer/i, Terminal],
];

export const patternIcon = (id: string, name: string): LucideIcon =>
  pick(`${id} ${name}`, PATTERN_ICONS, Shapes);
export const dbmsIcon = (id: string, name: string): LucideIcon =>
  pick(`${id} ${name}`, DBMS_ICONS, Database);
