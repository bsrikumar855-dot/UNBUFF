import React from "react";
import {
  ShieldCheck,
  AlertTriangle,
  XOctagon,
  HelpCircle,
  CircleSlash,
  Clock,
  CheckCircle2,
  Wrench,
  EyeOff,
  MinusCircle,
  type LucideIcon,
} from "lucide-react";
import type { Verdict, SkillState } from "@/types/contract";
import { VERDICT_CONFIG, SKILL_STATE_CONFIG } from "@/styles/tokens";
import { cn } from "@/lib/cn";

const ICONS: Record<string, LucideIcon> = {
  ShieldCheck,
  AlertTriangle,
  XOctagon,
  HelpCircle,
  CircleSlash,
  Clock,
  CheckCircle2,
  Wrench,
  EyeOff,
  MinusCircle,
};

interface StatusBadgeProps {
  className?: string;
}

interface VerdictBadgeProps extends StatusBadgeProps {
  verdict: Verdict;
}

interface SkillStateBadgeProps extends StatusBadgeProps {
  state: SkillState;
}

/**
 * Renders icon + label + color together — verdicts and skill states must
 * never be communicated by color alone (CONTRACT.md §6).
 */
function StatusChip({
  label,
  iconName,
  fg,
  bg,
  textColor,
  className,
}: {
  label: string;
  iconName: string;
  fg: string;
  bg: string;
  textColor: string;
  className?: string;
}) {
  const Icon = ICONS[iconName] ?? Clock;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm border-l-2 px-2 py-1 text-xs font-medium",
        className
      )}
      style={{ borderLeftColor: fg, backgroundColor: bg, color: textColor }}
    >
      <Icon size={14} aria-hidden="true" style={{ color: fg }} />
      {label}
    </span>
  );
}

export const VerdictBadge: React.FC<VerdictBadgeProps> = ({ verdict, className }) => {
  const config = VERDICT_CONFIG[verdict];
  return <StatusChip {...config} className={className} />;
};

export const SkillStateBadge: React.FC<SkillStateBadgeProps> = ({
  state,
  className,
}) => {
  const config = SKILL_STATE_CONFIG[state];
  return <StatusChip {...config} className={className} />;
};
