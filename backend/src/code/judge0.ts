import { z } from "zod";
import type { Logger } from "../logger.js";
import { ExecutionError, type ExecuteInput, type ExecuteResult, type ExecutionProvider, type Outcome, type ProviderLanguage } from "./provider.js";

/**
 * Judge0 adapter (https://ce.judge0.com/). Student code runs in Judge0's isolated sandbox, never in this
 * process. API facts used here come from the official docs: POST /submissions (base64_encoded, wait=false)
 * returns a token, GET /submissions/{token} reports status ids (1 In Queue, 2 Processing, 3 Accepted,
 * 5 Time Limit Exceeded, 6 Compilation Error, 7-12 and 14 runtime errors, 13 Internal Error), GET /languages
 * lists the languages this deployment really has.
 */

export interface Judge0Options {
  baseUrl: string;
  authToken?: string;
  /** Header carrying the token. Judge0's default is X-Auth-Token, but administrators can rename it. */
  authHeader?: string;
  logger?: Logger;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /** Longest we wait for one program to finish (queue + run). */
  executionDeadlineMs?: number;
  /** Timeout for each HTTP request to Judge0. */
  requestTimeoutMs?: number;
  pollIntervalMs?: number;
  maxOutputChars?: number;
}

const LanguagesSchema = z.array(z.object({ id: z.number().int().positive(), name: z.string().min(1).max(200) }).passthrough());
const CreateSchema = z.object({ token: z.string().regex(/^[A-Za-z0-9-]{8,64}$/) });
const nullableText = z.string().nullable().optional();
const ResultSchema = z.object({
  status: z.object({ id: z.number().int(), description: z.string().optional() }),
  stdout: nullableText,
  stderr: nullableText,
  compile_output: nullableText,
  message: nullableText,
  time: z.union([z.string(), z.number()]).nullable().optional(),
  memory: z.number().nullable().optional(),
});

const decode = (v: string | null | undefined): string => (v ? Buffer.from(v, "base64").toString("utf8") : "");

function outcomeOf(statusId: number): Outcome {
  if (statusId === 3 || statusId === 4) return "completed"; // we never send expected_output, but 4 would still mean "ran"
  if (statusId === 5) return "time_limit_exceeded";
  if (statusId === 6) return "compile_error";
  if (statusId === 13) return "internal_error";
  return "runtime_error"; // 7-12 (signals / non-zero exit) and 14 (exec format error)
}

export class Judge0Provider implements ExecutionProvider {
  readonly name = "judge0";
  readonly configured = true;
  readonly mock = false;
  private readonly base: string;
  private readonly headers: Record<string, string>;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly deadlineMs: number;
  private readonly requestTimeoutMs: number;
  private readonly pollMs: number;
  private readonly maxChars: number;
  private readonly logger?: Logger;

  constructor(opts: Judge0Options) {
    this.base = opts.baseUrl.replace(/\/+$/, "");
    this.headers = { "Content-Type": "application/json", Accept: "application/json" };
    if (opts.authToken) this.headers[opts.authHeader ?? "X-Auth-Token"] = opts.authToken;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.deadlineMs = opts.executionDeadlineMs ?? 30_000;
    this.requestTimeoutMs = opts.requestTimeoutMs ?? 8_000;
    this.pollMs = opts.pollIntervalMs ?? 400;
    this.maxChars = opts.maxOutputChars ?? 20_000;
    this.logger = opts.logger;
  }

  async listLanguages(): Promise<ProviderLanguage[]> {
    const body = await this.request("GET", "/languages");
    const parsed = LanguagesSchema.safeParse(body);
    if (!parsed.success) throw new ExecutionError("invalid_response", "The execution service returned an unexpected response.");
    return parsed.data.map((l) => ({ id: l.id, name: l.name }));
  }

  async execute(input: ExecuteInput): Promise<ExecuteResult> {
    const cpu = input.limits.cpuTimeSeconds;
    const created = await this.request("POST", "/submissions?base64_encoded=true&wait=false", {
      source_code: Buffer.from(input.source, "utf8").toString("base64"),
      language_id: input.providerLanguageId,
      stdin: Buffer.from(input.stdin, "utf8").toString("base64"),
      cpu_time_limit: cpu,
      wall_time_limit: Math.min(cpu * 3 + 1, 30),
      memory_limit: input.limits.memoryMb * 1024,
      enable_network: false,
    });
    const token = CreateSchema.safeParse(created);
    if (!token.success) throw new ExecutionError("invalid_response", "The execution service returned an unexpected response.");

    const started = Date.now();
    for (;;) {
      const raw = await this.request("GET", `/submissions/${token.data.token}?base64_encoded=true&fields=stdout,stderr,compile_output,message,status,time,memory`);
      const r = ResultSchema.safeParse(raw);
      if (!r.success) throw new ExecutionError("invalid_response", "The execution service returned an unexpected response.");
      const id = r.data.status.id;
      if (id > 2) return this.toResult(r.data);
      if (Date.now() - started >= this.deadlineMs) throw new ExecutionError("timeout", "The execution service took too long to respond.");
      await this.sleep(this.pollMs);
    }
  }

  private toResult(r: z.infer<typeof ResultSchema>): ExecuteResult {
    const seconds = r.time === null || r.time === undefined ? null : Number(r.time);
    const clip = (s: string) => (s.length > this.maxChars ? `${s.slice(0, this.maxChars)}\n[output truncated]` : s);
    const outcome = outcomeOf(r.status.id);
    if (outcome === "internal_error") this.logger?.warn({ status_id: r.status.id }, "execution service reported an internal error");
    return {
      outcome,
      stdout: clip(decode(r.stdout)),
      stderr: clip(decode(r.stderr) || (outcome === "runtime_error" ? decode(r.message) : "")),
      compile_output: clip(decode(r.compile_output)),
      time_ms: seconds !== null && Number.isFinite(seconds) ? Math.round(seconds * 1000) : null,
      memory_kb: typeof r.memory === "number" ? Math.round(r.memory) : null,
    };
  }

  /** One HTTP call with a timeout. Failures become generic ExecutionErrors; details go to the log, never to clients. */
  private async request(method: "GET" | "POST", path: string, body?: unknown): Promise<unknown> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.base}${path}`, {
        method,
        headers: this.headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.requestTimeoutMs),
        redirect: "error",
      });
    } catch (err) {
      const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
      this.logger?.warn({ method, timed_out: timedOut }, "execution service request failed");
      throw new ExecutionError(timedOut ? "timeout" : "unavailable", "The code execution service is not reachable right now.");
    }
    if (res.status === 401 || res.status === 403) {
      this.logger?.error({ status: res.status }, "execution service rejected our credentials");
      throw new ExecutionError("unavailable", "The code execution service is not available.");
    }
    if (res.status === 422) {
      this.logger?.error({ status: res.status }, "execution service rejected the request (limits or language not allowed)");
      throw new ExecutionError("rejected", "The code execution service rejected the request.");
    }
    if (!res.ok) {
      this.logger?.warn({ status: res.status }, "execution service returned an error status");
      throw new ExecutionError("unavailable", "The code execution service is not available.");
    }
    try {
      return (await res.json()) as unknown;
    } catch {
      throw new ExecutionError("invalid_response", "The execution service returned an unexpected response.");
    }
  }
}
