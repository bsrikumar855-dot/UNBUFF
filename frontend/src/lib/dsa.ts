import type { DsaDifficulty, DsaStatus } from "@/types/contract";

export const STATUS_LABEL: Record<DsaStatus, string> = {
  not_started: "Not started",
  attempted: "Attempted",
  solved: "Solved",
  needs_revision: "Needs revision",
};

export const STATUS_ORDER: DsaStatus[] = ["not_started", "attempted", "solved", "needs_revision"];

export const DIFFICULTY_LABEL: Record<DsaDifficulty, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
};

export const PAGE_SIZE = 20;

/** Reads a positive integer from a URL param, falling back when it is missing or invalid. */
export function positiveInt(value: string | null, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 ? n : fallback;
}
