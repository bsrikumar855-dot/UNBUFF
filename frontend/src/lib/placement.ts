import type {
  EvidenceConfidence,
  EvidenceProvenance,
  EvidenceRecency,
  PlacementExperience,
  PlacementPriority,
  PlacementTaskType,
  SkillStatus,
} from "@/types/contract";

export const TASK_TYPE_LABEL: Record<PlacementTaskType, string> = {
  dsa_practice: "DSA practice",
  dsa_revision: "DSA revision",
  dbms: "DBMS",
  technical_interview: "Technical interview",
  communication: "Communication",
  project: "Project",
  diagnostic: "First measurement",
  general: "General",
};

export const SKILL_STATUS_LABEL: Record<SkillStatus, string> = {
  strong: "Strong",
  developing: "Developing",
  weak: "Needs work",
  unassessed: "Not enough evidence",
};

export const PROVENANCE_LABEL: Record<EvidenceProvenance, string> = {
  verified: "Verified result",
  self_reported: "Self-reported",
  demonstration: "Demonstration only",
  unavailable: "No evidence yet",
};

export const CONFIDENCE_LABEL: Record<EvidenceConfidence, string> = {
  none: "no confidence",
  low: "low confidence",
  medium: "medium confidence",
  high: "high confidence",
};
export const RECENCY_LABEL: Record<EvidenceRecency, string> = {
  recent: "recent",
  aging: "ageing",
  stale: "old",
  none: "none",
};

export const PRIORITY_LABEL = (p: number): string =>
  p <= 1 ? "Urgent" : p === 2 ? "High" : p === 3 ? "Medium" : "Low";

export const WEEKDAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
];

export const EXPERIENCE_LABEL: Record<PlacementExperience, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

export const PRIORITY_CHOICES: { value: PlacementPriority; label: string }[] = [
  { value: "dsa", label: "Data structures and algorithms" },
  { value: "interview", label: "Technical interviews" },
  { value: "dbms", label: "Databases (DBMS and SQL)" },
  { value: "communication", label: "HR and communication" },
  { value: "projects", label: "Projects and portfolio" },
];

export const csv = (s: string): string[] =>
  s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

export const percent = (x: number): string => `${Math.round(x * 100)}%`;
export const minutesLabel = (m: number): string =>
  m >= 60 ? `${Math.round((m / 60) * 10) / 10} h` : `${m} min`;
