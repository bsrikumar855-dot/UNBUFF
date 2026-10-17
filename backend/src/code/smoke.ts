import { judge0UrlProblem } from "../config.js";
import type { CodeLanguageId } from "../types.js";
import { resolveLanguages } from "./languages.js";
import { ExecutionError, type ExecutionProvider, type ProviderLanguage } from "./provider.js";

/**
 * Operator smoke test for a real execution service. It only talks to the service configured in the environment
 * (never a URL supplied by a request or a command-line flag), runs tiny fixed programs inside the service's own
 * sandbox (never on this machine), and reports honestly. A pass shows that THIS endpoint answered the Judge0 protocol
 * and executed the programs; it does not prove the endpoint is your intended hosted deployment. Verify that through
 * the host's configuration before the operator sets EXECUTION_PROVIDER_VERIFIED=true. This module never sets it.
 */

export interface SmokeCheck {
  name: string;
  ok: boolean;
  required: boolean;
  detail: string;
}

export interface SmokeLanguageResult {
  language: CodeLanguageId;
  provider_id: number | null;
  provider_name: string | null;
  status: "passed" | "failed" | "not_offered";
}

export interface SmokeReport {
  ok: boolean;
  checks: SmokeCheck[];
  languages: SmokeLanguageResult[];
}

const PROGRAMS: Record<CodeLanguageId, { source: string; brokenSource?: string }> = {
  python: { source: "print(2 + 3)\n" },
  javascript: { source: "console.log(2 + 3);\n" },
  cpp: {
    source: "#include <iostream>\nint main() { std::cout << 2 + 3 << std::endl; return 0; }\n",
    brokenSource: "#include <iostream>\nint main() { std::cout << 2 + 3 << std::endl return 0; }\n",
  },
  java: {
    source: "public class Main {\n    public static void main(String[] args) {\n        System.out.println(2 + 3);\n    }\n}\n",
    brokenSource: "public class Main {\n    public static void main(String[] args) {\n        System.out.println(2 + 3)\n    }\n}\n",
  },
};

export const ALL_LANGUAGES = Object.keys(PROGRAMS) as CodeLanguageId[];

/** Why the environment cannot run a smoke test (empty means it can). Values are never included, only names. */
export function smokeConfigProblems(env: NodeJS.ProcessEnv): string[] {
  const problems: string[] = [];
  if (env.EXECUTION_PROVIDER !== "judge0") problems.push("EXECUTION_PROVIDER must be set to judge0 (it is not set, or is another value)");
  const urlProblem = judge0UrlProblem(env.JUDGE0_URL, env.NODE_ENV === "production");
  if (urlProblem) problems.push(urlProblem);
  if (env.JUDGE0_AUTH_HEADER && !/^[A-Za-z0-9-]{1,60}$/.test(env.JUDGE0_AUTH_HEADER)) problems.push("JUDGE0_AUTH_HEADER must be a plain header name");
  return problems;
}

/** Parses "python=100,cpp=105" into pinned provider ids. Throws on malformed input. */
export function parseExpectedIds(raw: string | undefined): Partial<Record<CodeLanguageId, number>> {
  const out: Partial<Record<CodeLanguageId, number>> = {};
  for (const part of (raw ?? "").split(",").map((p) => p.trim()).filter(Boolean)) {
    const m = /^(python|javascript|cpp|java)=(\d+)$/.exec(part);
    if (!m) throw new Error(`invalid expected id "${part}" (use e.g. python=100,cpp=105)`);
    out[m[1] as CodeLanguageId] = Number(m[2]);
  }
  return out;
}

export interface SmokeOptions {
  /** Languages to check. Python is always checked and required; others only count as failures if listed here explicitly. */
  languages?: CodeLanguageId[];
  /** Pin the provider ids the operator expects, e.g. from the service's own documentation. */
  expectedIds?: Partial<Record<CodeLanguageId, number>>;
  /** Whole-run time budget. */
  timeoutMs?: number;
  /** Replaces secrets in any text before it is returned. */
  redact?: (s: string) => string;
}

const limits = { cpuTimeSeconds: 5, memoryMb: 128 };

export async function runSmoke(provider: ExecutionProvider, opts: SmokeOptions = {}): Promise<SmokeReport> {
  const redact = opts.redact ?? ((s: string) => s);
  const checks: SmokeCheck[] = [];
  const languages: SmokeLanguageResult[] = [];
  const add = (name: string, ok: boolean, detail: string, required = true) => void checks.push({ name, ok, required, detail: redact(detail) });
  const explicit = opts.languages !== undefined;
  const wanted = Array.from(new Set<CodeLanguageId>(["python", ...(opts.languages ?? ALL_LANGUAGES)]));

  const body = async () => {
    // 1. the supported-language endpoint
    let listed: ProviderLanguage[];
    try {
      listed = await provider.listLanguages();
    } catch (err) {
      add("language lookup", false, errorText(err));
      return;
    }
    if (listed.length === 0) return add("language lookup", false, "the service returned no languages");
    add("language lookup", true, `${listed.length} languages reported by the service`);

    // 2. names and ids
    const resolved = resolveLanguages(listed);
    for (const lang of wanted) {
      const hit = resolved.find((r) => r.id === lang);
      const required = lang === "python" || explicit;
      if (!hit) {
        languages.push({ language: lang, provider_id: null, provider_name: null, status: "not_offered" });
        add(`language ${lang}`, !required, required ? `no matching language in the service's list` : "not offered by this service (the product hides it)", required);
        continue;
      }
      const pinned = opts.expectedIds?.[lang];
      const idOk = pinned === undefined || pinned === hit.providerId;
      add(`language ${lang}`, idOk, `resolved to "${hit.name}" (id ${hit.providerId})${pinned === undefined ? "" : idOk ? `; matches pinned id ${pinned}` : `; pinned id ${pinned} does NOT match`}`);
      languages.push({ language: lang, provider_id: hit.providerId, provider_name: hit.name, status: idOk ? "passed" : "failed" });
    }

    // 3. execution
    for (const entry of languages) {
      if (entry.provider_id === null || entry.status === "failed") continue;
      const program = PROGRAMS[entry.language];
      const required = entry.language === "python" || explicit;
      try {
        const r = await provider.execute({ providerLanguageId: entry.provider_id, source: program.source, stdin: "", limits });
        const out = r.stdout.trim();
        const ok = r.outcome === "completed" && out === "5";
        add(`run ${entry.language}`, ok, ok ? `status completed, output "5"${r.time_ms !== null ? `, ${r.time_ms} ms` : ""}` : `expected completed with output "5", got ${r.outcome} with output ${JSON.stringify(out.slice(0, 80))}`, required);
        if (!ok) entry.status = "failed";
      } catch (err) {
        add(`run ${entry.language}`, false, errorText(err), required);
        entry.status = "failed";
        continue;
      }
      if (program.brokenSource) {
        try {
          const r = await provider.execute({ providerLanguageId: entry.provider_id, source: program.brokenSource, stdin: "", limits });
          const ok = r.outcome === "compile_error";
          add(`compile error ${entry.language}`, ok, ok ? "invalid source reported as a compilation error" : `invalid source was reported as ${r.outcome}`, required);
          if (!ok) entry.status = "failed";
        } catch (err) {
          add(`compile error ${entry.language}`, false, errorText(err), required);
          entry.status = "failed";
        }
      }
    }
  };

  const timeoutMs = opts.timeoutMs ?? 180_000;
  let timer: NodeJS.Timeout | undefined;
  const timedOut = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), timeoutMs);
  });
  const outcome = await Promise.race([body().then(() => "done" as const), timedOut]);
  clearTimeout(timer);
  if (outcome === "timeout") add("overall time budget", false, `the smoke test did not finish within ${Math.round(timeoutMs / 1000)} s`);

  return { ok: checks.every((c) => c.ok || !c.required) && checks.length > 0, checks, languages };
}

function errorText(err: unknown): string {
  if (err instanceof ExecutionError) return `${err.kind}: ${err.message}`;
  return err instanceof Error ? err.message : "unknown error";
}

/** Replaces every occurrence of the given secrets. Used on anything printed. */
export function redactor(secrets: (string | undefined)[]): (s: string) => string {
  const list = secrets.filter((s): s is string => typeof s === "string" && s.length >= 4);
  return (s) => list.reduce((acc, secret) => acc.split(secret).join("[redacted]"), s);
}
