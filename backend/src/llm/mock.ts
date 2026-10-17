import type { Criterion, CriterionResult, Level } from "../types.js";
import type { RawGrade } from "../core/rules.js";
import { MAX_CLAIMS, matchSkillByKeywords } from "../core/claims.js";
import { CRITERIA } from "../core/evidence.js";
import { levelCriteria, type ExtractedClaim, type LLMProvider } from "./provider.js";

const LEVEL_QUESTIONS: Record<Level, (claim: string) => string> = {
  1: (c) => `Regarding "${c}": what exactly did you build, and which part did you personally do?`,
  2: (c) => `For "${c}": walk me through how it works internally, step by step.`,
  3: (c) => `For "${c}": why did you design it this way, what alternatives did you consider, and what broke?`,
};

const SHORT_ANSWER_CHARS = 40;

/** Deterministic fake LLM for LLM_MODE=mock and tests. No network, no key. */
export class MockProvider implements LLMProvider {
  readonly mode = "mock" as const;
  readonly model = null;

  async extractClaims({ role, resumeText }: Parameters<LLMProvider["extractClaims"]>[0]) {
    const out: ExtractedClaim[] = [];
    for (const raw of resumeText.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;
      const skillId = matchSkillByKeywords(line, role.skills);
      if (skillId) out.push({ text: line, resume_line: line, skill_id: skillId });
      if (out.length >= MAX_CLAIMS) break;
    }
    return out;
  }

  async question({ claim, level }: Parameters<LLMProvider["question"]>[0]) {
    return LEVEL_QUESTIONS[level](claim.text);
  }

  async clarify({ claim, level, vaguePoints }: Parameters<LLMProvider["clarify"]>[0]) {
    const target = vaguePoints[0] ?? "the specific details";
    return `(L${level} follow-up on "${claim.text}") Be concrete: ${target}?`;
  }

  async retestQuestion({ claim, level, missingConcepts, rootCause }: Parameters<LLMProvider["retestQuestion"]>[0]) {
    const topic = rootCause ?? missingConcepts[0] ?? claim.text;
    return `Scenario (L${level}): a teammate's version of "${claim.text}" breaks in production. Using ${topic}, how would you debug and fix it?`;
  }

  async grade({ answer, skill, level }: Parameters<LLMProvider["grade"]>[0]): Promise<RawGrade> {
    const concept = levelCriteria(skill, level)[0] ?? null;
    const rootCause = skill?.prerequisites[0] ?? null; // deterministic: most fundamental prerequisite
    if (/i don'?t know/i.test(answer)) {
      return {
        criteria: allCriteria(() => ({ passed: false, evidence_quote: null, missing_concept: concept })),
        admits_gap: true,
        needs_clarification: false,
        root_cause: rootCause,
      };
    }
    if (answer.trim().length < SHORT_ANSWER_CHARS) {
      const failing: Criterion[] = ["accuracy", "mechanism"];
      return {
        criteria: allCriteria((name) =>
          failing.includes(name)
            ? { passed: false, evidence_quote: null, missing_concept: concept }
            : { passed: true, evidence_quote: answer.trim(), missing_concept: null },
        ),
        admits_gap: false,
        needs_clarification: false,
        root_cause: rootCause,
      };
    }
    const quote = answer.trim().split(/\s+/).slice(0, 8).join(" ");
    return {
      criteria: allCriteria(() => ({ passed: true, evidence_quote: quote, missing_concept: null })),
      admits_gap: false,
      needs_clarification: false,
      root_cause: null,
    };
  }

  async fixTask({ claim, missingConcepts, rootCause }: Parameters<LLMProvider["fixTask"]>[0]) {
    const concepts = missingConcepts.length > 0 ? missingConcepts : [claim.text];
    const root = rootCause ? `Start with the root cause, **${rootCause}**. ` : "";
    return {
      explanation: `${root}You could not yet show: **${concepts.join("; ")}**. Review how this works in the context of "${claim.text}" and be ready to explain it step by step.`,
      exercise: `Build a 30-line example that demonstrates ${rootCause ?? concepts[0]}, then explain each step in writing as if to an interviewer.`,
    };
  }

  async rewrite({ claim }: Parameters<LLMProvider["rewrite"]>[0]) {
    return `Worked with ${claim.text.replace(/^(built|implemented|made|wrote|optimized|used)\s+/i, "").replace(/\.$/, "")} (learning the internals)`;
  }
}

function allCriteria(fn: (name: Criterion) => CriterionResult): Record<Criterion, CriterionResult> {
  return Object.fromEntries(CRITERIA.map((n) => [n, fn(n)])) as Record<Criterion, CriterionResult>;
}
