import { join } from "node:path";
import { pino } from "pino";
import type { Claim, Criterion, CriterionResult, Verdict } from "../src/types.js";
import type { RawGrade } from "../src/core/rules.js";
import { CRITERIA } from "../src/core/evidence.js";
import { newClaim } from "../src/core/claims.js";
import { MockProvider } from "../src/llm/mock.js";
import { LlmError, type LLMProvider } from "../src/llm/provider.js";
import { RoleRegistry } from "../src/services/roles.js";
import { AssessmentService } from "../src/services/assessment.js";
import { MemoryStore } from "../src/store/memoryStore.js";

export const roles = RoleRegistry.fromDirectory(join(import.meta.dirname, "..", "data", "roles"));
export const role = roles.get("frontend_developer")!;
export const silentLogger = pino({ level: "silent" });

export function claim(id: string, skillId: string | null, verdict: Verdict, proficiency: number, extra: Partial<Claim> = {}): Claim {
  return { ...newClaim(id, { text: `claim ${id}`, resume_line: null, skill_id: skillId, source: "declared" }), verdict, proficiency, ...extra };
}

/** Raw LLM grade where the listed criteria pass with the given quote. */
export function rawGrade(passing: Criterion[], quote: string | null, flags: Partial<Pick<RawGrade, "admits_gap" | "needs_clarification">> = {}): RawGrade {
  const criteria = Object.fromEntries(
    CRITERIA.map((n): [Criterion, CriterionResult] => [
      n,
      passing.includes(n)
        ? { passed: true, evidence_quote: quote, missing_concept: null }
        : { passed: false, evidence_quote: null, missing_concept: `missing ${n}` },
    ]),
  ) as Record<Criterion, CriterionResult>;
  return { criteria, admits_gap: flags.admits_gap ?? false, needs_clarification: flags.needs_clarification ?? false };
}

export const ALL: Criterion[] = [...CRITERIA];

/** Mock provider whose grades come from a queue; `"invalid"` simulates LLM_INVALID_OUTPUT. */
export class ScriptedProvider extends MockProvider implements LLMProvider {
  calls = 0;
  constructor(private readonly grades: (RawGrade | "invalid")[]) {
    super();
  }
  override async grade(input: Parameters<LLMProvider["grade"]>[0]): Promise<RawGrade> {
    this.calls++;
    const next = this.grades.shift();
    if (next === undefined) return super.grade(input);
    if (next === "invalid") throw new LlmError("LLM_INVALID_OUTPUT", "schema mismatch");
    return next;
  }
}

export function service(llm: LLMProvider = new MockProvider()) {
  const store = new MemoryStore();
  let t = Date.parse("2026-09-26T10:00:00Z");
  const svc = new AssessmentService({ store, llm, roles, logger: silentLogger, now: () => new Date((t += 1000)) });
  return { svc, store };
}

/** Creates a session with a single declared React claim (CL-001, react_state). */
export async function reactSession(svc: AssessmentService) {
  const res = await svc.extract({ role_id: "frontend_developer", declared_skills: ["React"] });
  return res.session_id;
}

export const GOOD = "I built the cart with useState and useReducer, when state updates React re-renders the component and diffs the virtual DOM";
