/**
 * Everything the application knows about running code goes through this interface, so the execution
 * service (Judge0 today) can change without touching routes or the frontend.
 */

export interface ProviderLanguage {
  id: number;
  name: string;
}

export interface ExecutionLimits {
  cpuTimeSeconds: number;
  memoryMb: number;
}

export interface ExecuteInput {
  providerLanguageId: number;
  source: string;
  stdin: string;
  limits: ExecutionLimits;
}

/** What happened to the program itself. Comparing output with an expectation is the caller's job. */
export type Outcome = "completed" | "compile_error" | "runtime_error" | "time_limit_exceeded" | "internal_error";

export interface ExecuteResult {
  outcome: Outcome;
  stdout: string;
  stderr: string;
  compile_output: string;
  time_ms: number | null;
  memory_kb: number | null;
}

export interface ExecutionProvider {
  readonly name: string;
  /** False when no service is configured: every call fails honestly instead of faking a result. */
  readonly configured: boolean;
  /** True for mock or test providers. Their results can never count toward analytics in a real deployment. */
  readonly mock?: boolean;
  listLanguages(): Promise<ProviderLanguage[]>;
  execute(input: ExecuteInput): Promise<ExecuteResult>;
}

export type ExecutionErrorKind = "unavailable" | "timeout" | "invalid_response" | "rejected";

/** The service could not give us a trustworthy result. Never contains infrastructure details or credentials. */
export class ExecutionError extends Error {
  constructor(
    readonly kind: ExecutionErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "ExecutionError";
  }
}

/** Used when EXECUTION_PROVIDER is unset or "none". */
export class UnavailableProvider implements ExecutionProvider {
  readonly name = "none";
  readonly configured = false;

  async listLanguages(): Promise<ProviderLanguage[]> {
    return [];
  }

  async execute(): Promise<ExecuteResult> {
    throw new ExecutionError("unavailable", "No code execution service is configured.");
  }
}
