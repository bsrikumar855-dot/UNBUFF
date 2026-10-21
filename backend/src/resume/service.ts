import { ApiError } from "../errors.js";
import type { Logger } from "../logger.js";
import type { AtsResult, ResumeCompileResponse, ResumeDocument, ResumeResponse, ResumeSaveRequest, ResumeTemplatesResponse, Role } from "../types.js";
import { resumePlainText, scoreResume } from "./ats.js";
import { LatexUnavailableError, MAX_LATEX_BYTES, type LatexCompiler } from "./latex.js";
import type { ResumeStore } from "./store.js";
import { RESUME_TEMPLATES } from "./templates.js";

export const MAX_JD_CHARS = 8000;
const MENTOR_TEXT_CHARS = 2200;

export interface ResumeDeps {
  store: ResumeStore;
  compiler: LatexCompiler;
  /** Looks a role up by id; null when it does not exist. */
  role: (id: string) => Role | null;
  logger: Logger;
  now?: () => Date;
}

/**
 * The résumé builder: a LaTeX document per student, a deterministic ATS score computed fresh from it, a compiler,
 * and a compact summary the AI mentor may read. The score never goes stale because it is never stored.
 */
export class ResumeService {
  constructor(private readonly deps: ResumeDeps) {}

  private now(): Date {
    return this.deps.now ? this.deps.now() : new Date();
  }

  private validate(latex: string, jd?: string | null): void {
    if (typeof latex !== "string" || latex.trim().length === 0) throw new ApiError("BAD_REQUEST", "The résumé is empty.");
    if (Buffer.byteLength(latex, "utf8") > MAX_LATEX_BYTES) throw new ApiError("BAD_REQUEST", `The résumé is larger than ${MAX_LATEX_BYTES / 1000} KB.`);
    if (jd && jd.length > MAX_JD_CHARS) throw new ApiError("BAD_REQUEST", `The job description is longer than ${MAX_JD_CHARS} characters.`);
  }

  private roleOf(id: string | null | undefined): Role | null {
    if (!id) return null;
    const r = this.deps.role(id);
    if (!r) throw new ApiError("ROLE_NOT_FOUND", `Role ${id} not found`);
    return r;
  }

  /** Scores text without saving it, so the editor can show the score while the student types. */
  score(latex: string, roleId?: string | null, jobDescription?: string | null): AtsResult {
    this.validate(latex, jobDescription);
    return scoreResume({ latex, role: this.roleOf(roleId), jobDescription: jobDescription ?? null, now: this.now() });
  }

  async get(uid: string): Promise<ResumeResponse> {
    const rec = await this.deps.store.get(uid);
    const compiler_available = this.deps.compiler.configured;
    if (!rec) return { document: null, ats: null, compiler_available, max_bytes: MAX_LATEX_BYTES };
    const document: ResumeDocument = { latex: rec.latex, role_id: rec.role_id, job_description: rec.job_description, updated_at: rec.updated_at };
    const role = rec.role_id ? this.deps.role(rec.role_id) : null; // a role removed since saving just means no role keywords
    return { document, ats: scoreResume({ latex: rec.latex, role, jobDescription: rec.job_description, now: this.now() }), compiler_available, max_bytes: MAX_LATEX_BYTES };
  }

  async save(uid: string, req: ResumeSaveRequest): Promise<ResumeResponse> {
    this.validate(req.latex, req.job_description);
    this.roleOf(req.role_id);
    const jd = req.job_description?.trim() ? req.job_description.trim() : null;
    await this.deps.store.put({ owner_uid: uid, latex: req.latex, role_id: req.role_id ?? null, job_description: jd, updated_at: this.now().toISOString() });
    return this.get(uid);
  }

  async remove(uid: string): Promise<void> {
    await this.deps.store.delete(uid);
  }

  templates(): ResumeTemplatesResponse {
    return { templates: RESUME_TEMPLATES };
  }

  async compile(latex: string): Promise<ResumeCompileResponse> {
    this.validate(latex);
    try {
      const r = await this.deps.compiler.compile(latex);
      return { ok: r.ok, pdf_base64: r.pdf ? r.pdf.toString("base64") : null, log: r.log, pages: r.pages, duration_ms: r.duration_ms };
    } catch (e) {
      if (e instanceof LatexUnavailableError) throw new ApiError("LATEX_UNAVAILABLE", "The LaTeX compiler is not available on this server.");
      this.deps.logger.warn({ err: (e as Error).message }, "resume: compile failed unexpectedly");
      throw new ApiError("LATEX_UNAVAILABLE", "The LaTeX compiler could not run right now.");
    }
  }

  /**
   * What the AI mentor may read: the score, each check with its fix, keywords, and a bounded excerpt of the plain
   * text. The score is recomputed here, so the mentor can never quote an old one. Everything is data, not instructions.
   */
  async mentorContext(uid: string): Promise<{ text: string; used: boolean; score: number | null; updated_at: string | null }> {
    const rec = await this.deps.store.get(uid);
    if (!rec) {
      return { text: "(The student has NOT saved a résumé in UNBLUFF. You have no résumé text and no ATS score. Say so, do not guess either, and suggest they open the Résumé builder, pick a template and save it.)", used: false, score: null, updated_at: null };
    }
    const role = rec.role_id ? this.deps.role(rec.role_id) : null;
    const ats = scoreResume({ latex: rec.latex, role, jobDescription: rec.job_description, now: this.now() });
    const lines = [
      `ATS score (heuristic, computed by UNBLUFF from the saved résumé, saved ${rec.updated_at}): ${ats.score}/100, rating ${ats.rating}.`,
      `Measured against: ${role ? `the ${role.name} role` : "no target role"}${rec.job_description ? " and a pasted job description" : ""}.`,
      ats.disclaimer,
      "Checks:",
      ...ats.checks.map((c) => `- ${c.label}: ${c.score}/${c.max} (${c.status}). ${c.detail}${c.fix ? ` Fix: ${c.fix}` : ""}`),
      ats.keywords.matched.length ? `Keywords found: ${ats.keywords.matched.join(", ")}.` : "Keywords found: none measured.",
      ats.keywords.missing.length ? `Keywords not found: ${ats.keywords.missing.join(", ")}.` : "Keywords not found: none.",
      "Résumé text (excerpt, as an ATS would read it):",
      resumePlainText(rec.latex).slice(0, MENTOR_TEXT_CHARS),
    ];
    return { text: lines.join("\n"), used: true, score: ats.score, updated_at: rec.updated_at };
  }
}

