import { randomUUID } from "node:crypto";
import { ApiError } from "../errors.js";
import type { Logger } from "../logger.js";
import type { Catalogue } from "../dsa/catalogue.js";
import type { DsaProgressService } from "../dsa/progressService.js";
import type {
  AnalyticsStatus,
  CodeExerciseResponse,
  CodeLanguageId,
  CodeLanguagesResponse,
  CodeRunRequest,
  CodeRunResponse,
  CodeSubmission,
  CodeSubmissionDetail,
  CodeSubmissionsResponse,
  CodeSubmitRequest,
  SubmissionVerdict,
} from "../types.js";
import { resolveLanguages, type ResolvedLanguage } from "./languages.js";
import { ExecutionError, type ExecuteResult, type ExecutionLimits, type ExecutionProvider } from "./provider.js";
import { DEFAULT_LIMITS, isAnalyticsEligible, type SuiteRegistry } from "./suites.js";
import type { SubmissionRecord, SubmissionStore } from "./submissionStore.js";

export const MAX_SOURCE_BYTES = 50_000;
export const MAX_STDIN_BYTES = 20_000;

export interface CodeServiceDeps {
  provider: ExecutionProvider;
  suites: SuiteRegistry;
  catalogue: () => Catalogue;
  progress: DsaProgressService;
  submissions: SubmissionStore;
  logger: Logger;
  now?: () => Date;
  /** Limits used for custom-input runs (graded exercises bring their own). */
  limits?: ExecutionLimits;
  /** Total time budget for judging one submission. */
  judgeDeadlineMs?: number;
  languageCacheMs?: number;
  testConcurrency?: number;
  /**
   * The operator's declaration that the execution service is a real, verified deployment. False (the default)
   * means every judged submission is excluded from analytics, because mocked or stand-in services cannot be
   * told apart from a real one by the code.
   */
  providerVerified?: boolean;
  /** Called after a judged submission is stored. Failures are logged and never fail the submission. */
  onJudged?: (record: SubmissionRecord) => Promise<void>;
  /**
   * TEST ONLY. Lets a mock provider's results count so the analytics pipeline can be exercised end to end. It is
   * not reachable from configuration, so a real deployment can never count mock results. Records made under it say so.
   */
  allowMockToCount?: boolean;
}

const LIMIT_RUNS_IN_FLIGHT = 2;
const LIMIT_SUBMITS_IN_FLIGHT = 1;

/** Output comparison: ignore trailing spaces on each line and trailing blank lines (and CRLF). */
export function normalizeOutput(s: string): string {
  return s
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.replace(/[ \t]+$/, ""))
    .join("\n")
    .replace(/\n+$/, "");
}

const byteLength = (s: string) => Buffer.byteLength(s, "utf8");

function toRunStatus(r: ExecuteResult): CodeRunResponse["status"] {
  return r.outcome === "completed" ? "completed" : r.outcome === "internal_error" ? "judge_error" : r.outcome;
}

export class CodeService {
  private readonly now: () => Date;
  private readonly limits: ExecutionLimits;
  private readonly judgeDeadlineMs: number;
  private readonly languageCacheMs: number;
  private readonly concurrency: number;
  private cache: { at: number; languages: ResolvedLanguage[] } | null = null;
  private readonly runsInFlight = new Map<string, number>();
  private readonly submitsInFlight = new Map<string, number>();

  constructor(private readonly deps: CodeServiceDeps) {
    this.now = deps.now ?? (() => new Date());
    this.limits = deps.limits ?? { cpuTimeSeconds: DEFAULT_LIMITS.cpu_time_seconds, memoryMb: DEFAULT_LIMITS.memory_mb };
    this.judgeDeadlineMs = deps.judgeDeadlineMs ?? 60_000;
    this.languageCacheMs = deps.languageCacheMs ?? 5 * 60_000;
    this.concurrency = deps.testConcurrency ?? 3;
  }

  // ---------- public data ----------

  /** Languages the execution service really offers. Empty (never guessed) when it is missing or unreachable. */
  async languages(): Promise<CodeLanguagesResponse> {
    try {
      const resolved = await this.resolved();
      return {
        languages: resolved.map(({ providerId: _p, ...rest }) => rest),
        execution_available: resolved.length > 0,
      };
    } catch {
      return { languages: [], execution_available: false };
    }
  }

  exercise(questionId: string): CodeExerciseResponse {
    if (!this.deps.catalogue().hasQuestion(questionId)) throw new ApiError("QUESTION_NOT_FOUND", `Question ${questionId} not found`);
    return this.deps.suites.publicExercise(questionId);
  }

  // ---------- run ----------

  async run(uid: string, req: CodeRunRequest): Promise<CodeRunResponse> {
    this.checkSizes(req.source, req.stdin);
    let stdin = req.stdin ?? "";
    let expected: string | null = null;
    let limits = this.limits;

    if (req.sample_index !== undefined) {
      if (!req.question_id) throw new ApiError("BAD_REQUEST", "sample_index needs a question_id");
      const suite = this.deps.suites.suite(req.question_id);
      const sample = suite?.samples[req.sample_index];
      if (!suite || !sample) throw new ApiError("BAD_REQUEST", "That sample does not exist");
      stdin = sample.input;
      expected = sample.expected_output;
      limits = { cpuTimeSeconds: suite.limits.cpu_time_seconds, memoryMb: suite.limits.memory_mb };
    }

    const language = await this.language(req.language);
    return this.guard(this.runsInFlight, uid, LIMIT_RUNS_IN_FLIGHT, async () => {
      const r = await this.execute(language, req.source, stdin, limits);
      return {
        status: toRunStatus(r),
        stdout: r.stdout,
        stderr: r.stderr,
        compile_output: r.compile_output,
        time_ms: r.time_ms,
        memory_kb: r.memory_kb,
        sample_passed: expected === null ? null : r.outcome === "completed" && normalizeOutput(r.stdout) === normalizeOutput(expected),
      };
    });
  }

  // ---------- submit ----------

  async submit(uid: string, req: CodeSubmitRequest): Promise<CodeSubmission> {
    this.checkSizes(req.source);
    if (!this.deps.catalogue().hasQuestion(req.question_id)) throw new ApiError("QUESTION_NOT_FOUND", `Question ${req.question_id} not found`);
    const suite = this.deps.suites.suite(req.question_id);
    if (!suite) {
      throw new ApiError("GRADING_UNAVAILABLE", "This question has no hidden test suite, so it cannot be judged. You can still run your code against the samples or your own input.");
    }
    const language = await this.language(req.language);
    const limits: ExecutionLimits = { cpuTimeSeconds: suite.limits.cpu_time_seconds, memoryMb: suite.limits.memory_mb };

    return this.guard(this.submitsInFlight, uid, LIMIT_SUBMITS_IN_FLIGHT, async () => {
      const deadline = Date.now() + this.judgeDeadlineMs;
      const results = await this.judge(language, req.source, suite.tests, limits, deadline);

      const total = suite.tests.length;
      let passed = 0;
      let verdict: SubmissionVerdict = "accepted";
      let failedTest: number | null = null;
      let compileOutput: string | null = null;
      for (let i = 0; i < total; i++) {
        const r = results[i];
        const ok = r !== undefined && r.outcome === "completed" && normalizeOutput(r.stdout) === normalizeOutput(suite.tests[i]!.expected_output);
        if (ok) {
          passed++;
          continue;
        }
        if (failedTest === null) {
          failedTest = i + 1;
          verdict = !r ? "judge_error" : r.outcome === "compile_error" ? "compile_error" : r.outcome === "runtime_error" ? "runtime_error" : r.outcome === "time_limit_exceeded" ? "time_limit_exceeded" : r.outcome === "internal_error" ? "judge_error" : "wrong_answer";
          if (r?.outcome === "compile_error") compileOutput = r.compile_output;
        }
      }
      const times = results.map((r) => r?.time_ms).filter((n): n is number => typeof n === "number");
      const mems = results.map((r) => r?.memory_kb).filter((n): n is number => typeof n === "number");

      let progressUpdated = false;
      if (verdict === "accepted") {
        try {
          await this.deps.progress.put(uid, req.question_id, { status: "solved" });
          progressUpdated = true;
        } catch (err) {
          this.deps.logger.error({ err: (err as Error).message }, "accepted submission but progress update failed");
        }
      }

      const demonstration = suite.is_demonstration || suite.source.license_status === "development_fixture";
      const providerVerified = this.deps.providerVerified === true;
      const mock = this.deps.provider.mock === true;
      const mockAllowed = mock && this.deps.allowMockToCount === true;
      const suiteEligible = isAnalyticsEligible(suite);
      const analyticsStatus: AnalyticsStatus =
        verdict === "judge_error"
          ? "excluded_judge_error"
          : demonstration
            ? "excluded_demonstration"
            : !suiteEligible
              ? "excluded_ineligible_suite"
              : mock && !mockAllowed
                ? "excluded_mock_execution"
                : !providerVerified
                  ? "excluded_unverified_provider"
                  : "counted";

      const record: SubmissionRecord = {
        id: `sub_${randomUUID()}`,
        owner_uid: uid,
        question_id: req.question_id,
        language: req.language,
        source: req.source,
        verdict,
        passed,
        total,
        failed_test: failedTest,
        compile_output: compileOutput,
        time_ms: times.length > 0 ? Math.max(...times) : null,
        memory_kb: mems.length > 0 ? Math.max(...mems) : null,
        test_revision: suite.revision,
        progress_updated: progressUpdated,
        created_at: this.now().toISOString(),
        analytics_status: analyticsStatus,
        provider: this.deps.provider.name,
        provider_verified: providerVerified,
        suite_license: suite.source.license_status,
        suite_eligible: suiteEligible,
        // A compile error is found by the first test alone and holds for every test, so it counts as judged for all of them.
        judged_tests: results[0]?.outcome === "compile_error" ? total : results.filter((r) => r !== undefined).length,
        provider_mock: mock,
        ...(mockAllowed ? { mock_counting_allowed: true } : {}),
      };
      await this.deps.submissions.save(record);
      try {
        await this.deps.onJudged?.(record);
      } catch (err) {
        // The submission is stored; statistics can be rebuilt from it (POST /api/me/dsa-analytics/refresh).
        this.deps.logger.error({ submission: record.id, err: (err as Error).message }, "analytics update failed after judging");
      }
      this.deps.logger.info({ submission: record.id, question: record.question_id, language: record.language, verdict, passed, total }, "submission judged");
      return toPublic(record);
    });
  }

  // ---------- history ----------

  async listSubmissions(uid: string, questionId?: string): Promise<CodeSubmissionsResponse> {
    const records = await this.deps.submissions.listByOwner(uid, questionId);
    return { submissions: records.sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 100).map(toPublic) };
  }

  async getSubmission(uid: string, id: string): Promise<CodeSubmissionDetail> {
    const record = await this.deps.submissions.get(id);
    // Unknown and someone else's are indistinguishable.
    if (!record || record.owner_uid !== uid) throw new ApiError("SUBMISSION_NOT_FOUND", `Submission ${id} not found`);
    const { owner_uid: _o, provider: _p, provider_verified: _v, suite_license: _l, suite_eligible: _e, judged_tests: _j, provider_mock: _m, mock_counting_allowed: _a, ...detail } = record;
    return { ...detail, analytics_status: record.analytics_status ?? "excluded_unknown_provenance" };
  }

  async deleteSubmission(uid: string, id: string): Promise<void> {
    const record = await this.deps.submissions.get(id);
    if (!record || record.owner_uid !== uid) throw new ApiError("SUBMISSION_NOT_FOUND", `Submission ${id} not found`);
    await this.deps.submissions.delete(id);
  }

  // ---------- internals ----------

  private checkSizes(source: string, stdin?: string): void {
    if (byteLength(source) > MAX_SOURCE_BYTES) throw new ApiError("BAD_REQUEST", `Source code is too large (max ${MAX_SOURCE_BYTES} bytes)`);
    if (stdin !== undefined && byteLength(stdin) > MAX_STDIN_BYTES) throw new ApiError("BAD_REQUEST", `Input is too large (max ${MAX_STDIN_BYTES} bytes)`);
  }

  private async resolved(): Promise<ResolvedLanguage[]> {
    if (this.cache && Date.now() - this.cache.at < this.languageCacheMs) return this.cache.languages;
    const languages = resolveLanguages(await this.deps.provider.listLanguages());
    this.cache = { at: Date.now(), languages };
    return languages;
  }

  private async language(id: CodeLanguageId): Promise<ResolvedLanguage> {
    if (!this.deps.provider.configured) throw unavailable();
    let list: ResolvedLanguage[];
    try {
      list = await this.resolved();
    } catch (err) {
      throw this.toApiError(err);
    }
    const language = list.find((l) => l.id === id);
    if (!language) throw new ApiError("BAD_REQUEST", `Language "${id}" is not available on the execution service`);
    return language;
  }

  private async execute(language: ResolvedLanguage, source: string, stdin: string, limits: ExecutionLimits): Promise<ExecuteResult> {
    try {
      return await this.deps.provider.execute({ providerLanguageId: language.providerId, source, stdin, limits });
    } catch (err) {
      throw this.toApiError(err);
    }
  }

  /**
   * Runs every test with bounded concurrency inside a total deadline. The first test runs alone, so a
   * compile error is found once instead of once per test. Results are index-aligned with `tests`;
   * tests never started because the deadline passed stay undefined (verdict: judge_error).
   */
  private async judge(
    language: ResolvedLanguage,
    source: string,
    tests: { input: string }[],
    limits: ExecutionLimits,
    deadline: number,
  ): Promise<(ExecuteResult | undefined)[]> {
    const results: (ExecuteResult | undefined)[] = new Array(tests.length).fill(undefined) as undefined[];
    const runOne = async (i: number) => {
      if (Date.now() >= deadline) return;
      results[i] = await this.execute(language, source, tests[i]!.input, limits);
    };
    await runOne(0);
    if (results[0]?.outcome === "compile_error") return results;
    let next = 1;
    const worker = async () => {
      while (next < tests.length && Date.now() < deadline) await runOne(next++);
    };
    await Promise.all(Array.from({ length: Math.min(this.concurrency, Math.max(tests.length - 1, 0)) }, worker));
    return results;
  }

  private async guard<T>(table: Map<string, number>, uid: string, max: number, fn: () => Promise<T>): Promise<T> {
    const current = table.get(uid) ?? 0;
    if (current >= max) throw new ApiError("RATE_LIMITED", "Another run is still in progress. Wait for it to finish.");
    table.set(uid, current + 1);
    try {
      return await fn();
    } finally {
      const left = (table.get(uid) ?? 1) - 1;
      if (left <= 0) table.delete(uid);
      else table.set(uid, left);
    }
  }

  private toApiError(err: unknown): ApiError {
    if (err instanceof ApiError) return err;
    if (err instanceof ExecutionError) return err.kind === "timeout" ? new ApiError("EXECUTION_UNAVAILABLE", "The code execution service took too long to respond. Try again.") : unavailable();
    this.deps.logger.error({ err: (err as Error).message }, "unexpected execution failure");
    return unavailable();
  }
}

function unavailable(): ApiError {
  return new ApiError("EXECUTION_UNAVAILABLE", "Code execution is not available right now.");
}

function toPublic(r: SubmissionRecord): CodeSubmission {
  const { owner_uid: _o, source: _s, provider: _p, provider_verified: _v, suite_license: _l, suite_eligible: _e, judged_tests: _j, provider_mock: _m, mock_counting_allowed: _a, ...rest } = r;
  return { ...rest, analytics_status: r.analytics_status ?? "excluded_unknown_provenance" };
}
