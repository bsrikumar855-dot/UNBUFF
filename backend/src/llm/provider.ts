import type { Claim, Level, LlmMode, QA, Role, RoleSkill } from "../types.js";
import type { RawGrade } from "../core/rules.js";

/** Language layer only: the provider never returns a score, verdict or pass/fail decision. */

export interface ExtractedClaim {
  text: string;
  resume_line: string;
  skill_id: string | null;
}

export interface QuestionContext {
  role: Role;
  skill: RoleSkill | null;
  claim: Claim;
  level: Level;
  history: QA[];
}

export interface LLMProvider {
  readonly mode: LlmMode;
  readonly model: string | null;
  extractClaims(input: { role: Role; resumeText: string }): Promise<ExtractedClaim[]>;
  question(input: QuestionContext): Promise<string>;
  clarify(input: QuestionContext & { vaguePoints: string[] }): Promise<string>;
  retestQuestion(
    input: QuestionContext & { missingConcepts: string[]; rootCause: string | null; previousQuestions: string[] },
  ): Promise<string>;
  grade(input: QuestionContext & { question: string; answer: string }): Promise<RawGrade>;
  fixTask(input: {
    role: Role;
    claim: Claim;
    missingConcepts: string[];
    rootCause: string | null;
  }): Promise<{ explanation: string; exercise: string }>;
  rewrite(input: { claim: Claim; evidenceSummary: string }): Promise<string>;
}

export type LlmErrorCode = "LLM_INVALID_OUTPUT" | "LLM_TIMEOUT";

export class LlmError extends Error {
  constructor(
    readonly code: LlmErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "LlmError";
  }
}

/** Level criteria for a claim's skill (generic fallback for deprioritized claims). */
export function levelCriteria(skill: RoleSkill | null, level: Level): string[] {
  if (skill) return skill.levels[`L${level}`];
  return [
    ["Says concretely what they did and their personal part"],
    ["Explains how it worked step by step"],
    ["Explains why it was done this way and what the alternatives were"],
  ][level - 1] as string[];
}
