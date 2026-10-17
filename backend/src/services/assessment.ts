import { randomUUID } from "node:crypto";
import type {
  Claim,
  ClaimInput,
  ClaimsResponse,
  FixTask,
  Level,
  Mode,
  QA,
  Report,
  Role,
  RoleSkill,
  SessionMode,
  TurnResponse,
} from "../types.js";
import { ApiError } from "../errors.js";
import type { Logger } from "../logger.js";
import {
  clampText,
  claimId,
  MAX_CLAIM_TEXT,
  MAX_CLAIMS,
  MAX_RESUME_LINE,
  matchSkillByKeywords,
  newClaim,
  normalizeResume,
} from "../core/claims.js";
import { isVerbatimQuote, normalizeText } from "../core/evidence.js";
import { buildReport } from "../core/report.js";
import {
  canStart,
  evidenceFromGrade,
  finalizeGrade,
  isWeakVerdict,
  missingConcepts,
  retestStartLevel,
  vaguePoints,
} from "../core/rules.js";
import { blindSpots, progress, skillProficiency } from "../core/scoring.js";
import {
  forcedDueClaimId,
  interleavedClaims,
  onClaimCompleted,
  retestBlockReason,
  scheduleRetest,
} from "../core/schedule.js";
import {
  decideTurn,
  ERROR_SCORE,
  resolveAssess,
  resolveRetest,
  startCursor,
  type Cursor,
  type Outcome,
} from "../core/stateMachine.js";
import { levelCriteria, LlmError, type LLMProvider, type QuestionContext } from "../llm/provider.js";
import type { Session, SessionStore } from "../store/SessionStore.js";
import type { RoleRegistry } from "./roles.js";

export interface AssessmentDeps {
  store: SessionStore;
  llm: LLMProvider;
  roles: RoleRegistry;
  logger: Logger;
  now?: () => Date;
}

export interface ExtractInput {
  role_id: string;
  mode?: SessionMode;
  resume_text?: string | null;
  declared_skills?: string[];
}

export interface InterrogateInput {
  session_id: string;
  claim_id: string;
  mode?: Mode;
  answer?: string | null;
}

/**
 * Orchestrator: loads a session, asks the LLM for language, lets the pure core decide,
 * saves. All requests for one session run one at a time (no double LLM calls on races).
 */
export class AssessmentService {
  private readonly locks = new Map<string, Promise<unknown>>();
  private readonly now: () => Date;

  constructor(private readonly deps: AssessmentDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  // ---------- claims ----------

  async extract(input: ExtractInput): Promise<ClaimsResponse> {
    const role = this.role(input.role_id);
    const resume = input.resume_text?.trim() ? normalizeResume(input.resume_text) || null : null;
    const chips = dedupe((input.declared_skills ?? []).map((s) => s.trim()).filter(Boolean));
    if (!resume && chips.length === 0) {
      throw new ApiError("BAD_REQUEST", "Provide resume_text or at least one declared skill");
    }

    const extracted = resume ? await this.callLlm(() => this.deps.llm.extractClaims({ role, resumeText: resume })) : [];
    const validSkills = new Set(role.skills.map((s) => s.id));
    const seen = new Set<string>();
    const claims: Claim[] = [];
    let dropped = 0;
    let seq = 1;

    for (const c of extracted) {
      const line = resume ? findResumeLine(resume, c.resume_line) : null;
      const key = normalizeText(c.text);
      if (!line || seen.has(key)) {
        dropped += line ? 0 : 1;
        continue;
      }
      seen.add(key);
      claims.push(
        newClaim(claimId(seq++), {
          text: clampText(c.text, MAX_CLAIM_TEXT),
          resume_line: clampText(line, MAX_RESUME_LINE),
          skill_id: c.skill_id && validSkills.has(c.skill_id) ? c.skill_id : null,
          source: "resume",
        }),
      );
    }
    for (const chip of chips) {
      const text = clampText(`Knows ${chip}`, MAX_CLAIM_TEXT);
      if (seen.has(normalizeText(text))) continue;
      seen.add(normalizeText(text));
      claims.push(
        newClaim(claimId(seq++), {
          text,
          resume_line: null,
          skill_id: matchSkillByKeywords(chip, role.skills),
          source: "declared",
        }),
      );
    }
    if (dropped > 0) this.deps.logger.warn({ dropped }, "extract: dropped claims whose resume_line is not in the resume");

    const capped = claims.slice(0, MAX_CLAIMS);
    const session: Session = {
      id: `s_${randomUUID()}`,
      role_id: role.id,
      mode: input.mode ?? "defense",
      created_at: this.now().toISOString(),
      resume_text: resume,
      declared_skills: chips,
      claims: capped,
      next_seq: seq,
      cursors: {},
      history: [],
      guard_flips: 0,
      completions: 0,
      schedule: {},
    };
    await this.deps.store.save(session);
    return claimsResponse(session, role);
  }

  confirm(sessionId: string, inputs: ClaimInput[]): Promise<ClaimsResponse> {
    return this.withSession(sessionId, async (session, role) => {
      const validSkills = new Set(role.skills.map((s) => s.id));
      const byId = new Map(session.claims.map((c) => [c.id, c]));
      const next: Claim[] = [];
      for (const input of inputs) {
        if (input.skill_id !== null && !validSkills.has(input.skill_id)) {
          throw new ApiError("BAD_REQUEST", `Unknown skill_id "${input.skill_id}" for role ${role.id}`);
        }
        const fields = {
          text: input.text.trim(),
          resume_line: input.resume_line?.trim() || null,
          skill_id: input.skill_id,
        };
        if (input.id === null) {
          next.push(newClaim(claimId(session.next_seq++), { ...fields, source: fields.resume_line ? "resume" : "declared" }));
          continue;
        }
        const existing = byId.get(input.id);
        if (!existing) throw new ApiError("CLAIM_NOT_FOUND", `Claim ${input.id} not found`);
        if (next.some((c) => c.id === input.id)) throw new ApiError("BAD_REQUEST", `Duplicate claim id ${input.id}`);
        const unchanged = existing.text === fields.text && existing.skill_id === fields.skill_id;
        if (unchanged) {
          next.push({ ...existing, resume_line: fields.resume_line });
        } else {
          next.push(newClaim(existing.id, { ...fields, source: existing.source }));
          delete session.cursors[existing.id];
          delete session.schedule[existing.id];
        }
      }
      // Drop cursors and history for removed claims.
      const kept = new Set(next.map((c) => c.id));
      for (const id of Object.keys(session.cursors)) if (!kept.has(id)) delete session.cursors[id];
      for (const id of Object.keys(session.schedule)) if (!kept.has(id)) delete session.schedule[id];
      session.history = session.history.filter((h) => kept.has(h.claim_id));
      session.claims = next;
      refreshSchedule(session);
      return claimsResponse(session, role);
    });
  }

  // ---------- interrogation ----------

  interrogate(input: InterrogateInput): Promise<TurnResponse> {
    return this.withSession(input.session_id, async (session, role) => {
      const claim = findClaim(session, input.claim_id);
      const cursor = session.cursors[claim.id];
      const skill = role.skills.find((s) => s.id === claim.skill_id) ?? null;

      if (input.answer === undefined || input.answer === null) {
        if (cursor) return this.resumeTurn(session, claim, cursor);
        return this.startClaim(session, role, skill, claim, input.mode ?? "assess");
      }
      if (!cursor) {
        throw new ApiError("BAD_REQUEST", `Claim ${claim.id} has no open question; start it first (omit "answer")`);
      }
      return this.answerTurn(session, role, skill, claim, cursor, input.answer);
    });
  }

  private resumeTurn(session: Session, claim: Claim, cursor: Cursor): TurnResponse {
    const open = openQuestion(claim);
    return turn(session, claim, cursor.mode, open.kind === "clarify" ? "clarify" : "question", cursor.level, open.question, null);
  }

  private async startClaim(
    session: Session,
    role: Role,
    skill: RoleSkill | null,
    claim: Claim,
    mode: Mode,
  ): Promise<TurnResponse> {
    if (!canStart(mode, claim.verdict)) {
      const allowed = mode === "assess" ? "pending or error" : "shaky, bluff or honest_gap";
      throw new ApiError("BAD_REQUEST", `Cannot ${mode} claim ${claim.id} with verdict "${claim.verdict}" (needs ${allowed})`);
    }
    if (mode === "retest") {
      const blocked = retestBlockReason(claim);
      if (blocked) throw new ApiError("BAD_REQUEST", blocked);
    }
    const level: Level = mode === "assess" ? 1 : retestStartLevel(claim.verdict, claim.levels_passed);
    const interleaved = mode === "retest" ? interleavedClaims(session.schedule[claim.id], session.completions) : 0;
    if (mode === "assess") Object.assign(claim, newClaim(claim.id, claim), { qa: [] });

    const ctx: QuestionContext = { role, skill, claim, level, history: claim.qa };
    let question: string;
    try {
      question =
        mode === "assess"
          ? await this.deps.llm.question(ctx)
          : await this.deps.llm.retestQuestion({
              ...ctx,
              missingConcepts: claim.missing_concepts.length > 0 ? claim.missing_concepts : levelCriteria(skill, level),
              rootCause: claim.root_cause,
              previousQuestions: claim.qa.map((q) => q.question),
            });
    } catch (err) {
      return this.handleLlmFailure(session, claim, mode, err, null);
    }
    claim.qa.push(this.qa(level, mode === "retest" ? "retest" : "question", mode, question));
    session.cursors[claim.id] = startCursor(mode, level, interleaved);
    return turn(session, claim, mode, "question", level, question, null);
  }

  private async answerTurn(
    session: Session,
    role: Role,
    skill: RoleSkill | null,
    claim: Claim,
    cursor: Cursor,
    answer: string,
  ): Promise<TurnResponse> {
    const open = openQuestion(claim);
    const ctx: QuestionContext = { role, skill, claim, level: cursor.level, history: claim.qa };

    let raw;
    try {
      raw = await this.deps.llm.grade({ ...ctx, question: open.question, answer });
    } catch (err) {
      return this.handleLlmFailure(session, claim, cursor.mode, err, null);
    }
    const grade = finalizeGrade(raw, answer, cursor.level, skill?.prerequisites ?? []);
    open.answer = answer;
    open.grade = grade;
    claim.evidence.push(...evidenceFromGrade(cursor.level, grade));
    if (grade.guard_flips.length > 0) {
      session.guard_flips += grade.guard_flips.length;
      this.deps.logger.info(
        { session: session.id, claim: claim.id, flips: grade.guard_flips, session_total: session.guard_flips },
        "evidence guard flipped criteria",
      );
    }

    const decision = decideTurn(cursor, grade);
    if (decision.turn === "done") {
      this.finishClaim(session, skill, claim, cursor, decision.outcome, grade);
      const teachNow = session.mode === "prepare" && isWeakVerdict(claim.verdict);
      return turn(session, claim, cursor.mode, "done", null, null, grade, teachNow);
    }

    const next = decision.cursor;
    const nextCtx = { ...ctx, level: next.level };
    let question: string;
    try {
      if (decision.turn === "clarify") {
        question = await this.deps.llm.clarify({ ...nextCtx, vaguePoints: vaguePoints(grade) });
      } else if (cursor.mode === "retest") {
        question = await this.deps.llm.retestQuestion({
          ...nextCtx,
          missingConcepts: levelCriteria(skill, next.level),
          rootCause: null, // higher retest levels target that level's criteria
          previousQuestions: claim.qa.map((q) => q.question),
        });
      } else {
        question = await this.deps.llm.question(nextCtx);
      }
    } catch (err) {
      return this.handleLlmFailure(session, claim, cursor.mode, err, grade);
    }
    const kind = decision.turn === "clarify" ? "clarify" : cursor.mode === "retest" ? "retest" : "question";
    claim.qa.push(this.qa(next.level, kind, cursor.mode, question));
    session.cursors[claim.id] = next;
    return turn(session, claim, cursor.mode, decision.turn, next.level, question, grade);
  }

  private finishClaim(
    session: Session,
    skill: RoleSkill | null,
    claim: Claim,
    cursor: Cursor,
    outcome: Outcome,
    grade: ReturnType<typeof finalizeGrade>,
  ): void {
    const failedLevel = outcome.kind === "passed_all" ? null : outcome.level;
    const missing = failedLevel ? missingConcepts(failedLevel, grade, levelCriteria(skill, failedLevel)) : [];

    if (cursor.mode === "assess") {
      Object.assign(claim, resolveAssess(outcome));
    } else {
      Object.assign(claim, resolveRetest(claim, outcome, cursor.interleaved_claims));
      claim.retest_status = "done";
      claim.retest_unlocks_after = null;
      delete session.schedule[claim.id];
    }
    claim.missing_concepts = missing;
    claim.root_cause = failedLevel ? grade.root_cause : null;
    // Verdict/evidence changed: cached language outputs are stale.
    claim.fix_task = null;
    claim.rewrite = null;
    delete session.cursors[claim.id];
    markCompleted(session, claim.id);

    if (claim.skill_id) {
      session.history.push({
        at: this.now().toISOString(),
        mode: cursor.mode,
        claim_id: claim.id,
        skill_id: claim.skill_id,
        proficiency: skillProficiency(claim.skill_id, session.claims),
      });
    }
  }

  /**
   * Assess: an LLM failure ends the claim with verdict `error` (not counted anywhere, restartable).
   * Retest: nothing is saved; the client gets 502/504 and can resend the same request.
   */
  private handleLlmFailure(
    session: Session,
    claim: Claim,
    mode: Mode,
    err: unknown,
    grade: TurnResponse["grade"],
  ): TurnResponse {
    if (!(err instanceof LlmError)) throw err;
    this.deps.logger.warn({ session: session.id, claim: claim.id, code: err.code, mode }, "LLM failure during interrogation");
    if (mode === "retest") throw new ApiError(err.code, "The AI examiner failed to respond. Please try again.");
    Object.assign(claim, ERROR_SCORE);
    delete session.cursors[claim.id];
    markCompleted(session, claim.id);
    return turn(session, claim, mode, "done", null, null, grade);
  }

  // ---------- fix task + report ----------

  fixTask(sessionId: string, id: string): Promise<FixTask> {
    return this.withSession(sessionId, async (session, role) => {
      const claim = findClaim(session, id);
      if (!isWeakVerdict(claim.verdict)) {
        throw new ApiError("BAD_REQUEST", `Fix tasks are only for shaky, bluff or honest_gap claims (${claim.id} is "${claim.verdict}")`);
      }
      if (!claim.fix_task) claim.fix_task = await this.callLlm(() => this.generateFixTask(role, claim));
      // Opening the fix task schedules a delayed, interleaved retest.
      const scheduled = scheduleRetest(claim, session.schedule, session.completions);
      if (scheduled) {
        Object.assign(claim, scheduled.patch);
        session.schedule[claim.id] = scheduled.entry;
        refreshSchedule(session);
      }
      return claim.fix_task;
    });
  }

  report(sessionId: string): Promise<Report> {
    return this.withSession(sessionId, async (session, role) => {
      // Generate missing language outputs for weak claims once; cached on the claim afterwards.
      const jobs: (() => Promise<void>)[] = [];
      for (const claim of session.claims.filter((c) => isWeakVerdict(c.verdict))) {
        if (!claim.fix_task) {
          jobs.push(async () => void (claim.fix_task = await this.generateFixTask(role, claim)));
        }
        if (!claim.rewrite && claim.resume_line) {
          jobs.push(async () => void (claim.rewrite = await this.deps.llm.rewrite({ claim, evidenceSummary: evidenceSummary(claim) })));
        }
      }
      const { done, skipped } = await runLimited(jobs, REPORT_LLM_CONCURRENCY);
      if (skipped > 0) {
        this.deps.logger.warn({ session: session.id, done, skipped }, "report: LLM enrichment stopped early; using templates, will retry on next fetch");
      }
      return buildReport({ ...session, session_id: session.id }, role, this.now().toISOString());
    });
  }

  private async generateFixTask(role: Role, claim: Claim): Promise<FixTask> {
    const concepts = claim.missing_concepts.length > 0 ? claim.missing_concepts : [claim.text];
    const out = await this.deps.llm.fixTask({ role, claim, missingConcepts: concepts, rootCause: claim.root_cause });
    return { claim_id: claim.id, skill_id: claim.skill_id, root_cause: claim.root_cause, missing_concepts: concepts, ...out };
  }

  // ---------- helpers ----------

  private role(id: string): Role {
    const role = this.deps.roles.get(id);
    if (!role) throw new ApiError("ROLE_NOT_FOUND", `Role ${id} not found`);
    return role;
  }

  private qa(level: Level, kind: QA["kind"], mode: Mode, question: string): QA {
    return { level, kind, mode, question, answer: null, grade: null, asked_at: this.now().toISOString() };
  }

  /** Converts LLM failures outside interrogation into contract errors (502/504). */
  private async callLlm<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof LlmError) throw new ApiError(err.code, "The AI service failed to respond. Please try again.");
      throw err;
    }
  }

  /** Serialises work per session, then saves. Errors abort without saving. */
  private async withSession<T>(sessionId: string, fn: (s: Session, r: Role) => Promise<T>): Promise<T> {
    const previous = this.locks.get(sessionId) ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(async () => {
      const session = await this.deps.store.get(sessionId);
      if (!session) throw new ApiError("SESSION_NOT_FOUND", `Session ${sessionId} not found`);
      const result = await fn(session, this.role(session.role_id));
      await this.deps.store.save(session);
      return result;
    });
    this.locks.set(sessionId, run);
    try {
      return await run;
    } finally {
      if (this.locks.get(sessionId) === run) this.locks.delete(sessionId);
    }
  }
}

// ---------- module helpers ----------

/** A claim's assess/retest reached "done": count down other scheduled retests, then re-check rule 3. */
function markCompleted(session: Session, claimId: string): void {
  session.completions++;
  const patches = onClaimCompleted(session.claims, claimId);
  for (const c of session.claims) {
    const patch = patches.get(c.id);
    if (patch) Object.assign(c, patch);
  }
  refreshSchedule(session);
}

/** Rule 3: nothing pending or due but retests scheduled, so the oldest becomes due now. */
function refreshSchedule(session: Session): void {
  const id = forcedDueClaimId(session.claims, session.schedule);
  const claim = id ? session.claims.find((c) => c.id === id) : undefined;
  if (claim) {
    claim.retest_status = "due";
    claim.retest_unlocks_after = 0;
  }
}

/** Report-time LLM calls in flight at once (protects per-minute quota for interrogation). */
export const REPORT_LLM_CONCURRENCY = 2;

/**
 * Runs jobs with bounded concurrency. After the first failure no new jobs start (a failure is
 * usually quota or an outage, so hammering on is pointless); in-flight jobs finish.
 */
export async function runLimited(jobs: (() => Promise<void>)[], limit: number): Promise<{ done: number; skipped: number }> {
  let next = 0;
  let done = 0;
  let failed = false;
  const worker = async () => {
    while (!failed && next < jobs.length) {
      const job = jobs[next++] as () => Promise<void>;
      try {
        await job();
        done++;
      } catch {
        failed = true;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, jobs.length) }, worker));
  return { done, skipped: jobs.length - done };
}

function dedupe(items: string[]): string[] {
  const seen = new Set<string>();
  return items.filter((i) => {
    const k = i.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** The actual resume line the LLM's resume_line refers to, or null if it isn't in the resume. */
function findResumeLine(resume: string, resumeLine: string): string | null {
  const target = normalizeText(resumeLine);
  if (!target) return null;
  for (const raw of resume.split(/\r?\n/)) {
    const line = raw.trim();
    const n = normalizeText(line);
    if (n && (n === target || n.includes(target) || (target.includes(n) && n.length >= 12))) return line;
  }
  return isVerbatimQuote(resumeLine, resume) ? resumeLine.trim() : null;
}

function findClaim(session: Session, id: string): Claim {
  const claim = session.claims.find((c) => c.id === id);
  if (!claim) throw new ApiError("CLAIM_NOT_FOUND", `Claim ${id} not found`);
  return claim;
}

function openQuestion(claim: Claim): QA {
  const open = claim.qa[claim.qa.length - 1];
  if (!open || open.answer !== null) throw new ApiError("INTERNAL", `Claim ${claim.id} has no open question`);
  return open;
}

function evidenceSummary(claim: Claim): string {
  const shown = claim.evidence.filter((e) => e.passed).map((e) => `L${e.level} ${e.criterion}: "${e.quote}"`);
  const passed = `Levels passed: ${claim.levels_passed} of 3.`;
  return shown.length > 0 ? `${passed} Demonstrated: ${shown.join("; ")}` : `${passed} Could not demonstrate any level.`;
}

function claimsResponse(session: Session, role: Role): ClaimsResponse {
  return {
    session_id: session.id,
    role_id: role.id,
    mode: session.mode,
    claims: session.claims,
    blind_spots: blindSpots(role, session.claims),
    progress: progress(session.claims),
  };
}

function turn(
  session: Session,
  claim: Claim,
  mode: Mode,
  turnType: TurnResponse["turn"],
  level: Level | null,
  question: string | null,
  grade: TurnResponse["grade"],
  teachNow = false,
): TurnResponse {
  const prog = progress(session.claims);
  return {
    session_id: session.id,
    claim_id: claim.id,
    mode,
    turn: turnType,
    level,
    question,
    grade,
    claim,
    progress: prog,
    next_mode: prog.next_mode,
    teach_now: teachNow,
    // Backward-compatible aliases (CONTRACT.md §4).
    last_grade: grade,
    verdict: claim.verdict,
    levels_passed: claim.levels_passed,
    next_claim_id: prog.next_claim_id,
    retest: claim.retest,
  };
}
