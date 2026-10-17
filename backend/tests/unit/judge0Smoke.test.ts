import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Judge0Provider } from "../../src/code/judge0.js";
import { parseExpectedIds, redactor, runSmoke, smokeConfigProblems } from "../../src/code/smoke.js";
import { REAL_LANGUAGE_LIST } from "../code/fakeProvider.js";

/**
 * A test double that speaks just enough of the Judge0 protocol. It does NOT execute anything: results come from the
 * rules below. These tests prove the smoke test's own logic (checks, exit decisions, redaction, time limits).
 * They say nothing about whether a real service works. That is what `npm run smoke:judge0` is for.
 */
type Rule = (source: string, languageId: number) => { status: number; stdout?: string; compile_output?: string };
const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const defaultRule: Rule = (source) => {
  if (/endl return|println\(2 \+ 3\)\n {4}\}/.test(source)) return { status: 6, compile_output: "error: syntax" };
  return { status: 3, stdout: "5\n" };
};

function service(opts: { rule?: Rule; languages?: unknown; neverFinish?: boolean; httpStatus?: number } = {}) {
  const jobs = new Map<string, { source: string; lang: number }>();
  const requests: { url: string; headers: Record<string, string> }[] = [];
  let n = 0;
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = new URL(String(url));
    requests.push({ url: String(url), headers: (init?.headers ?? {}) as Record<string, string> });
    if (opts.httpStatus) return json(opts.httpStatus, { error: "nope" });
    if (u.pathname === "/languages") return json(200, opts.languages ?? REAL_LANGUAGE_LIST);
    if (init?.method === "POST" && u.pathname === "/submissions") {
      const body = JSON.parse(init.body as string) as { source_code: string; language_id: number };
      const token = `tok-${String(++n).padStart(8, "0")}-aaaa`;
      jobs.set(token, { source: Buffer.from(body.source_code, "base64").toString("utf8"), lang: body.language_id });
      return json(201, { token });
    }
    const m = /^\/submissions\/([\w-]+)$/.exec(u.pathname);
    if (m && jobs.has(m[1]!)) {
      if (opts.neverFinish) return json(200, { status: { id: 2 } });
      const job = jobs.get(m[1]!)!;
      const r = (opts.rule ?? defaultRule)(job.source, job.lang);
      return json(200, { status: { id: r.status }, stdout: r.stdout ? b64(r.stdout) : null, compile_output: r.compile_output ? b64(r.compile_output) : null, time: "0.01", memory: 1000 });
    }
    return json(404, {});
  }) as typeof fetch;
  const provider = new Judge0Provider({ baseUrl: "https://judge.example.com", authToken: "SUPER-SECRET-TOKEN", fetchImpl, sleep: async () => undefined, pollIntervalMs: 1, executionDeadlineMs: 50 });
  return { provider, requests };
}

describe("runSmoke", () => {
  it("passes when the service lists languages and runs every program correctly", async () => {
    const { provider, requests } = service();
    const report = await runSmoke(provider);
    expect(report.ok).toBe(true);
    expect(report.languages.map((l) => [l.language, l.provider_id, l.status])).toEqual([
      ["python", 113, "passed"],
      ["javascript", 102, "passed"],
      ["cpp", 105, "passed"],
      ["java", 91, "passed"],
    ]);
    expect(report.checks.find((c) => c.name === "run python")?.detail).toMatch(/output "5"/);
    expect(report.checks.find((c) => c.name === "compile error cpp")?.ok).toBe(true);
    expect(requests[0]!.url).toBe("https://judge.example.com/languages"); // the language endpoint is queried first
  });

  it("fails when the program output is wrong, with the actual output in the report", async () => {
    const { provider } = service({ rule: () => ({ status: 3, stdout: "6\n" }) });
    const report = await runSmoke(provider, { languages: ["python"] });
    expect(report.ok).toBe(false);
    expect(report.checks.find((c) => c.name === "run python")).toMatchObject({ ok: false, detail: expect.stringContaining('"6"') });
  });

  it("fails when the execution status is not 'completed'", async () => {
    for (const status of [5, 6, 11, 13]) {
      const report = await runSmoke(service({ rule: () => ({ status }) }).provider, { languages: ["python"] });
      expect(report.ok, `status ${status}`).toBe(false);
    }
  });

  it("fails when python is missing from the service's language list", async () => {
    const { provider } = service({ languages: REAL_LANGUAGE_LIST.filter((l) => !l.name.startsWith("Python")) });
    const report = await runSmoke(provider);
    expect(report.ok).toBe(false);
    expect(report.languages[0]).toMatchObject({ language: "python", status: "not_offered" });
  });

  it("treats optional languages that the service lacks as information, but required when asked for explicitly", async () => {
    const without = REAL_LANGUAGE_LIST.filter((l) => !l.name.startsWith("Java"));
    expect((await runSmoke(service({ languages: without }).provider)).ok).toBe(true);
    const explicit = await runSmoke(service({ languages: without }).provider, { languages: ["python", "java"] });
    expect(explicit.ok).toBe(false);
  });

  it("checks C++ and Java compilation errors separately and fails if broken source is not reported as a compile error", async () => {
    const lenient: Rule = () => ({ status: 3, stdout: "5\n" }); // never reports a compile error
    const report = await runSmoke(service({ rule: lenient }).provider, { languages: ["python", "cpp", "java"] });
    expect(report.ok).toBe(false);
    expect(report.checks.filter((c) => c.name.startsWith("compile error")).map((c) => [c.name, c.ok])).toEqual([
      ["compile error cpp", false],
      ["compile error java", false],
    ]);
    expect(report.checks.find((c) => c.name === "run cpp")?.ok).toBe(true);
  });

  it("verifies pinned provider ids against the service response", async () => {
    const ok = await runSmoke(service().provider, { languages: ["python"], expectedIds: { python: 113 } });
    expect(ok.ok).toBe(true);
    const bad = await runSmoke(service().provider, { languages: ["python"], expectedIds: { python: 71 } });
    expect(bad.ok).toBe(false);
    expect(bad.checks.find((c) => c.name === "language python")?.detail).toMatch(/pinned id 71 does NOT match/);
    expect(bad.checks.some((c) => c.name === "run python")).toBe(false); // nothing is run on a mismatched id
  });

  it.each([401, 403, 500, 503])("fails cleanly when the service answers HTTP %i", async (httpStatus) => {
    const report = await runSmoke(service({ httpStatus }).provider);
    expect(report.ok).toBe(false);
    expect(report.checks[0]).toMatchObject({ name: "language lookup", ok: false });
  });

  it("fails on an invalid or empty language response", async () => {
    expect((await runSmoke(service({ languages: { languages: [] } }).provider)).ok).toBe(false);
    expect((await runSmoke(service({ languages: [] }).provider)).ok).toBe(false);
    expect((await runSmoke(service({ languages: [{ id: "x" }] }).provider)).ok).toBe(false);
  });

  it("never polls forever: a submission stuck in the queue fails the run with a timeout", async () => {
    let now = 0;
    const real = Date.now;
    Date.now = () => (now += 20);
    try {
      const report = await runSmoke(service({ neverFinish: true }).provider, { languages: ["python"] });
      expect(report.ok).toBe(false);
      expect(report.checks.find((c) => c.name === "run python")?.detail).toMatch(/timeout/);
    } finally {
      Date.now = real;
    }
  });

  it("enforces an overall time budget", async () => {
    const slow = { name: "slow", configured: true, listLanguages: () => new Promise<never>(() => undefined), execute: () => new Promise<never>(() => undefined) };
    const report = await runSmoke(slow, { timeoutMs: 30 });
    expect(report.ok).toBe(false);
    expect(report.checks.at(-1)).toMatchObject({ name: "overall time budget", ok: false });
  });

  it("redacts secrets from every reported detail and sends the token only as a header", async () => {
    const { provider, requests } = service({ httpStatus: 401 });
    const report = await runSmoke(provider, { redact: redactor(["SUPER-SECRET-TOKEN", "https://judge.example.com"]) });
    expect(JSON.stringify(report)).not.toMatch(/SUPER-SECRET-TOKEN/);
    const ok = service();
    await runSmoke(ok.provider);
    for (const r of ok.requests) {
      expect(r.url).not.toContain("SUPER-SECRET-TOKEN");
      expect(r.headers["X-Auth-Token"]).toBe("SUPER-SECRET-TOKEN");
    }
    expect(redactor(["abc"])("keep abc"), "secrets shorter than 4 characters are not redacted").toBe("keep abc");
    expect(redactor(["SECRET-1"])("a SECRET-1 b SECRET-1")).toBe("a [redacted] b [redacted]");
    void requests;
  });
});

describe("smoke configuration", () => {
  it("requires an explicit provider and a valid service URL", () => {
    expect(smokeConfigProblems({})).toEqual(expect.arrayContaining([expect.stringMatching(/EXECUTION_PROVIDER must be set to judge0/), expect.stringMatching(/JUDGE0_URL is required/)]));
    expect(smokeConfigProblems({ EXECUTION_PROVIDER: "none", JUDGE0_URL: "https://j.example.com" })[0]).toMatch(/judge0/);
    expect(smokeConfigProblems({ EXECUTION_PROVIDER: "judge0", JUDGE0_URL: "http://judge.example.com" })[0]).toMatch(/https/);
    expect(smokeConfigProblems({ EXECUTION_PROVIDER: "judge0", JUDGE0_URL: "https://u:p@judge.example.com" })[0]).toMatch(/credentials/);
    expect(smokeConfigProblems({ EXECUTION_PROVIDER: "judge0", JUDGE0_URL: "http://localhost:2358" })).toEqual([]);
    expect(smokeConfigProblems({ EXECUTION_PROVIDER: "judge0", JUDGE0_URL: "http://localhost:2358", NODE_ENV: "production" })[0]).toMatch(/https in production/);
    expect(smokeConfigProblems({ EXECUTION_PROVIDER: "judge0", JUDGE0_URL: "https://j.example.com", JUDGE0_AUTH_HEADER: "bad header" })[0]).toMatch(/header name/);
    expect(smokeConfigProblems({ EXECUTION_PROVIDER: "judge0", JUDGE0_URL: "https://j.example.com", JUDGE0_AUTH_TOKEN: "t" })).toEqual([]);
  });

  it("parses pinned ids", () => {
    expect(parseExpectedIds("python=100, cpp=105")).toEqual({ python: 100, cpp: 105 });
    expect(parseExpectedIds(undefined)).toEqual({});
    expect(() => parseExpectedIds("ruby=1")).toThrow(/invalid expected id/);
    expect(() => parseExpectedIds("python=abc")).toThrow();
  });
});

describe("judge0_smoke command", () => {
  const tsx = join(import.meta.dirname, "..", "..", "node_modules", "tsx", "dist", "cli.mjs");
  const script = join(import.meta.dirname, "..", "..", "scripts", "judge0_smoke.ts");
  const run = (env: Record<string, string>) => {
    const clean = { PATH: process.env.PATH ?? "", SystemRoot: process.env.SystemRoot ?? "", ...env };
    return spawnSync(process.execPath, [tsx, script], { env: clean, encoding: "utf8", timeout: 60_000 });
  };

  it("exits with code 2 and prints example commands when it is not configured", () => {
    const r = run({});
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/EXECUTION_PROVIDER must be set to judge0/);
    expect(r.stderr).toMatch(/npm run smoke:judge0/);
  }, 60_000);

  it("exits nonzero without leaking the token when the service cannot be reached", () => {
    const r = run({ EXECUTION_PROVIDER: "judge0", JUDGE0_URL: "http://127.0.0.1:1", JUDGE0_AUTH_TOKEN: "TOKEN-SHOULD-NOT-APPEAR" });
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/RESULT: FAIL/);
    expect(r.stdout + r.stderr).not.toContain("TOKEN-SHOULD-NOT-APPEAR");
    expect(r.stdout).toMatch(/value hidden/);
  }, 60_000);
});
