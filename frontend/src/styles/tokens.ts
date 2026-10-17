import type { Verdict, SkillState } from "@/types/contract";

export interface DisplayMeta {
  label: string;
  iconName: string;
  /** Exact UNBLUFF Design Bible locked hex — icon fill + left-border/dot accent only. */
  fg: string;
  /** Light tint behind the badge. */
  bg: string;
  /**
   * Label text color. Several locked accent colors (e.g. defended #059669,
   * shaky #D97706, pending #94A3B8) fall short of 4.5:1 on white as *text*,
   * even though they're fine as icon/border accents (3:1 non-text contrast).
   * Labels always render in this neutral ink instead, so the exact locked
   * color is preserved for the icon/accent while text stays readable.
   */
  textColor: string;
}

/**
 * Exact verdict/skill accent colors from the UNBLUFF Design Bible
 * ("CONTRACT-LOCKED" §6/§7). Used for icon fill and the left-border/dot
 * accent — never for label text (see DisplayMeta.textColor above).
 */
export const VERDICT_CONFIG: Record<Verdict, DisplayMeta> = {
  defended: {
    label: "Defended",
    iconName: "ShieldCheck",
    fg: "#059669",
    bg: "#DCFCE7",
    textColor: "#0F172A",
  },
  shaky: {
    label: "Shaky",
    iconName: "AlertTriangle",
    fg: "#D97706",
    bg: "#FEF3C7",
    textColor: "#0F172A",
  },
  bluff: {
    label: "Bluff",
    iconName: "XOctagon",
    fg: "#DC2626",
    bg: "#FEE2E2",
    textColor: "#0F172A",
  },
  honest_gap: {
    label: "Honest gap",
    iconName: "HelpCircle",
    fg: "#4F46E5",
    bg: "#EEF2FF",
    textColor: "#0F172A",
  },
  error: {
    label: "Not assessed (error)",
    iconName: "CircleSlash",
    fg: "#64748B",
    bg: "#F1F5F9",
    textColor: "#334155",
  },
  pending: {
    label: "Not yet assessed",
    iconName: "Clock",
    fg: "#94A3B8",
    bg: "#F1F5F9",
    textColor: "#334155",
  },
};

export const SKILL_STATE_CONFIG: Record<SkillState, DisplayMeta> = {
  ready: {
    label: "Ready",
    iconName: "CheckCircle2",
    fg: "#059669",
    bg: "#DCFCE7",
    textColor: "#0F172A",
  },
  needs_work: {
    label: "Needs work",
    iconName: "Wrench",
    fg: "#D97706",
    bg: "#FEF3C7",
    textColor: "#0F172A",
  },
  unverified: {
    label: "Unverified",
    iconName: "Clock",
    fg: "#94A3B8",
    bg: "#F1F5F9",
    textColor: "#334155",
  },
  blind_spot: {
    label: "Blind spot",
    iconName: "EyeOff",
    fg: "#0F172A",
    bg: "#F1F5F9",
    textColor: "#0F172A",
  },
  deprioritized: {
    label: "Low priority",
    iconName: "MinusCircle",
    fg: "#CBD5E1",
    bg: "#F1F5F9",
    textColor: "#64748B",
  },
};
