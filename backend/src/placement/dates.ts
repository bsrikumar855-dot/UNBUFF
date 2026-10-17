/** Calendar helpers on plain YYYY-MM-DD strings (UTC). Plans work in whole days, never in clock times. */

export const DAY_MS = 86_400_000;
export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

export const ymd = (d: Date): string => d.toISOString().slice(0, 10);
const parse = (s: string): number => Date.parse(`${s}T00:00:00Z`);

export function isValidYmd(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const t = parse(s);
  return Number.isFinite(t) && ymd(new Date(t)) === s;
}
export const addDays = (s: string, n: number): string => ymd(new Date(parse(s) + n * DAY_MS));
export const diffDays = (a: string, b: string): number => Math.round((parse(a) - parse(b)) / DAY_MS); // a - b
export const weekdayOf = (s: string): number => new Date(parse(s)).getUTCDay();
export const weekdayName = (s: string): string => WEEKDAYS[weekdayOf(s)]!;
/** ISO-like week key: the Monday on or before the date. */
export const weekStart = (s: string): string => addDays(s, -((weekdayOf(s) + 6) % 7));
