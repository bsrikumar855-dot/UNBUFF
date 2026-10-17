import type { MemoryProvenance, MemoryType, MentorMode } from "@/types/contract";

export const MODES: { value: MentorMode; label: string; hint: string }[] = [
  { value: "dsa_coach", label: "DSA Coach", hint: "Learn concepts and solve problems with graduated hints." },
  { value: "code_explainer", label: "Code Explainer", hint: "Paste code to understand it or find a bug." },
  { value: "interview_practice", label: "Interview Practice", hint: "Technical and HR questions, one at a time." },
  { value: "placement_mentor", label: "Placement Mentor", hint: "Plan your preparation using your goals and verified practice." },
];

export const PROVENANCE_LABEL: Record<MemoryProvenance, string> = {
  student_provided: "You told the mentor",
  verified_record: "Verified by the app",
  model_summary: "Summary written by AI (may be wrong)",
  inferred: "Suggested by AI (not a fact)",
};

export const TYPE_LABEL: Record<MemoryType, string> = {
  profile: "Profile",
  learning: "Learning notes",
  summary: "Conversation summaries",
  goal: "Goals",
};

export const TYPE_EXPLAIN: Record<MemoryType, string> = {
  profile: "Preferences and goals you set. Kept until you delete them.",
  learning: "What you said you understand or find difficult. Kept for a limited time.",
  summary: "Short notes written by AI after longer conversations. Kept for a limited time.",
  goal: "Things you want to achieve. Kept until you delete them; goals tied to a question or topic are checked against your real practice.",
};

/** A fresh idempotency key for one message. */
export function newClientMessageId(): string {
  const c = globalThis.crypto;
  const raw = c && "randomUUID" in c ? c.randomUUID() : `${Date.now()}${Math.random().toString(36).slice(2)}`;
  return `cm_${raw.replace(/[^A-Za-z0-9]/g, "")}`.slice(0, 64);
}
