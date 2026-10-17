import { ExecutionError, type ExecuteInput, type ExecuteResult, type ExecutionProvider, type ProviderLanguage } from "../../src/code/provider.js";

/**
 * Deterministic stand-in for the execution service. It does NOT run code: the behaviour is chosen by a
 * marker word in the source. Tests using it prove our adapter/service logic, not that real code runs.
 */

/** Names copied from a real GET /languages response of a public Judge0 deployment (ids differ per deployment). */
export const REAL_LANGUAGE_LIST: ProviderLanguage[] = [
  { id: 76, name: "C++ (Clang 7.0.1)" },
  { id: 105, name: "C++ (GCC 14.1.0)" },
  { id: 52, name: "C++ (GCC 7.4.0)" },
  { id: 54, name: "C++ (GCC 9.2.0)" },
  { id: 91, name: "Java (JDK 17.0.6)" },
  { id: 62, name: "Java (OpenJDK 13.0.1)" },
  { id: 63, name: "JavaScript (Node.js 12.14.0)" },
  { id: 97, name: "JavaScript (Node.js 20.17.0)" },
  { id: 102, name: "JavaScript (Node.js 22.08.0)" },
  { id: 70, name: "Python (2.7.17)" },
  { id: 92, name: "Python (3.11.2)" },
  { id: 100, name: "Python (3.12.5)" },
  { id: 113, name: "Python (3.14.0)" },
  { id: 71, name: "Python (3.8.1)" },
  { id: 45, name: "Assembly (NASM 2.14.02)" },
];

const ok = (stdout: string, over: Partial<ExecuteResult> = {}): ExecuteResult => ({
  outcome: "completed",
  stdout,
  stderr: "",
  compile_output: "",
  time_ms: 12,
  memory_kb: 3000,
  ...over,
});

export interface FakeOptions {
  languages?: ProviderLanguage[];
  /** What a correct program prints for a given stdin (marker OK). */
  solve?: (stdin: string) => string;
}

/**
 * Source markers: OK (correct), WRONG (prints "wrong"), COMPILE, RUNTIME, SLOW (time limit), JUDGE (service
 * internal error), THROW (service unavailable), DOWN_AFTER_FIRST (fails from the second call on),
 * SLEEP (takes ~30 ms per execution), ECHO (prints stdin).
 */
export class FakeProvider implements ExecutionProvider {
  readonly name = "fake";
  readonly configured = true;
  calls: ExecuteInput[] = [];
  listCalls = 0;
  private readonly languages: ProviderLanguage[];
  private readonly solve: (stdin: string) => string;

  constructor(opts: FakeOptions = {}) {
    this.languages = opts.languages ?? REAL_LANGUAGE_LIST;
    this.solve = opts.solve ?? ((s) => s);
  }

  async listLanguages(): Promise<ProviderLanguage[]> {
    this.listCalls++;
    return this.languages;
  }

  async execute(input: ExecuteInput): Promise<ExecuteResult> {
    this.calls.push(input);
    const src = input.source;
    if (src.includes("SLEEP")) await new Promise((r) => setTimeout(r, 30));
    if (src.includes("THROW")) throw new ExecutionError("unavailable", "The code execution service is not available.");
    if (src.includes("DOWN_AFTER_FIRST") && this.calls.length > 1) throw new ExecutionError("timeout", "The execution service took too long to respond.");
    if (src.includes("COMPILE")) return ok("", { outcome: "compile_error", compile_output: "error: expected ';' before '}' token", time_ms: null, memory_kb: null });
    if (src.includes("RUNTIME")) return ok("", { outcome: "runtime_error", stderr: "Traceback: ZeroDivisionError" });
    if (src.includes("SLOW")) return ok("", { outcome: "time_limit_exceeded", time_ms: 2000 });
    if (src.includes("JUDGE")) return ok("", { outcome: "internal_error" });
    if (src.includes("WRONG")) return ok("wrong\n");
    if (src.includes("ECHO")) return ok(input.stdin);
    return ok(`${this.solve(input.stdin)}\n`, { time_ms: 5 + (input.stdin.length % 40) });
  }
}
