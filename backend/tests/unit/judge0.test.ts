import { describe, expect, it, vi } from "vitest";
import { Judge0Provider } from "../../src/code/judge0.js";
import { ExecutionError } from "../../src/code/provider.js";
import { resolveLanguages } from "../../src/code/languages.js";
import { REAL_LANGUAGE_LIST } from "../code/fakeProvider.js";

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

interface Call {
  url: string;
  init: RequestInit;
}

function provider(responses: (Response | Error)[], opts: Partial<ConstructorParameters<typeof Judge0Provider>[0]> = {}) {
  const calls: Call[] = [];
  const queue = [...responses];
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const next = queue.shift();
    if (!next) throw new Error("unexpected extra request");
    if (next instanceof Error) throw next;
    return next;
  }) as unknown as typeof fetch;
  const warnings: unknown[][] = [];
  const logger = { warn: (...a: unknown[]) => warnings.push(a), error: (...a: unknown[]) => warnings.push(a), info: vi.fn() } as never;
  const p = new Judge0Provider({
    baseUrl: "https://judge.example.com/",
    authToken: "SECRET-TOKEN",
    fetchImpl,
    sleep: async () => undefined,
    pollIntervalMs: 1,
    logger,
    ...opts,
  });
  return { p, calls, warnings };
}

const input = { providerLanguageId: 100, source: "print(1)", stdin: "héllo\n", limits: { cpuTimeSeconds: 2, memoryMb: 128 } };
const done = (over: Record<string, unknown> = {}) =>
  json(200, { status: { id: 3, description: "Accepted" }, stdout: b64("1\n"), stderr: null, compile_output: null, message: null, time: "0.012", memory: 3100, ...over });

describe("language resolution (no hard-coded ids)", () => {
  it("picks the newest matching version from what the service actually lists", () => {
    const langs = resolveLanguages(REAL_LANGUAGE_LIST);
    expect(langs.map((l) => [l.id, l.name, l.providerId])).toEqual([
      ["python", "Python (3.14.0)", 113],
      ["javascript", "JavaScript (Node.js 22.08.0)", 102],
      ["cpp", "C++ (GCC 14.1.0)", 105],
      ["java", "Java (JDK 17.0.6)", 91],
    ]);
    for (const l of langs) expect(l.starter_code.length).toBeGreaterThan(20);
  });

  it("follows the deployment: other ids and versions resolve to different providerIds, and missing languages are omitted", () => {
    const langs = resolveLanguages([
      { id: 1, name: "Python (3.9.1)" },
      { id: 2, name: "Python (3.10.0)" },
      { id: 3, name: "Python (2.7.17)" },
      { id: 4, name: "C++ (Clang 7.0.1)" },
    ]);
    expect(langs).toEqual([expect.objectContaining({ id: "python", providerId: 2, name: "Python (3.10.0)" })]);
    expect(resolveLanguages([])).toEqual([]);
  });
});

describe("Judge0Provider", () => {
  it("creates a submission, polls until finished and maps the result", async () => {
    const { p, calls } = provider([
      json(201, { token: "abcd1234-ef56-7890" }),
      json(200, { status: { id: 1, description: "In Queue" } }),
      json(200, { status: { id: 2, description: "Processing" } }),
      done(),
    ]);
    const r = await p.execute(input);
    expect(r).toEqual({ outcome: "completed", stdout: "1\n", stderr: "", compile_output: "", time_ms: 12, memory_kb: 3100 });
    expect(calls).toHaveLength(4);

    const create = calls[0]!;
    expect(create.url).toBe("https://judge.example.com/submissions?base64_encoded=true&wait=false");
    const sent = JSON.parse(create.init.body as string) as Record<string, unknown>;
    expect(sent).toMatchObject({ language_id: 100, cpu_time_limit: 2, memory_limit: 128 * 1024, enable_network: false });
    expect(Buffer.from(sent.source_code as string, "base64").toString("utf8")).toBe("print(1)");
    expect(Buffer.from(sent.stdin as string, "base64").toString("utf8")).toBe("héllo\n");
    expect(sent).not.toHaveProperty("expected_output");
    expect(calls[1]!.url).toContain("/submissions/abcd1234-ef56-7890?base64_encoded=true&fields=");
  });

  it("sends the credential only as a request header, never in a URL or body, and refuses redirects", async () => {
    const { p, calls } = provider([json(201, { token: "abcd1234-ef56-7890" }), done()], { authHeader: "X-Custom-Auth" });
    await p.execute(input);
    for (const c of calls) {
      expect((c.init.headers as Record<string, string>)["X-Custom-Auth"]).toBe("SECRET-TOKEN");
      expect(c.url).not.toContain("SECRET-TOKEN");
      expect(String(c.init.body ?? "")).not.toContain("SECRET-TOKEN");
      expect(c.init.redirect).toBe("error");
    }
  });

  it.each([
    [3, "completed"],
    [4, "completed"],
    [5, "time_limit_exceeded"],
    [6, "compile_error"],
    [7, "runtime_error"],
    [8, "runtime_error"],
    [9, "runtime_error"],
    [10, "runtime_error"],
    [11, "runtime_error"],
    [12, "runtime_error"],
    [13, "internal_error"],
    [14, "runtime_error"],
  ])("maps Judge0 status %i to %s", async (id, outcome) => {
    const { p } = provider([json(201, { token: "abcd1234-ef56-7890" }), done({ status: { id } })]);
    expect((await p.execute(input)).outcome).toBe(outcome);
  });

  it("decodes compile output and stderr, tolerates missing fields, and truncates huge output", async () => {
    const { p } = provider(
      [json(201, { token: "abcd1234-ef56-7890" }), done({ status: { id: 6 }, stdout: null, compile_output: b64("main.c:1: error"), time: null, memory: null })],
      { maxOutputChars: 100 },
    );
    expect(await p.execute(input)).toMatchObject({ outcome: "compile_error", compile_output: "main.c:1: error", stdout: "", time_ms: null, memory_kb: null });

    const big = provider([json(201, { token: "abcd1234-ef56-7890" }), done({ stdout: b64("x".repeat(500)) })], { maxOutputChars: 100 });
    const r = await big.p.execute(input);
    expect(r.stdout.length).toBeLessThan(140);
    expect(r.stdout).toContain("[output truncated]");
  });

  it("gives up with a timeout when the submission never leaves the queue", async () => {
    let now = 0;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const responses = [json(201, { token: "abcd1234-ef56-7890" }), ...Array.from({ length: 50 }, () => json(200, { status: { id: 1 } }))];
    const { p } = provider(responses, { executionDeadlineMs: 1000, sleep: async (ms) => void (now += ms * 400) });
    await expect(p.execute(input)).rejects.toMatchObject({ kind: "timeout" });
    vi.restoreAllMocks();
  });

  it.each([
    ["a malformed token", [json(201, { token: "../../etc/passwd" })]],
    ["a missing token", [json(201, {})]],
    ["a result without a status", [json(201, { token: "abcd1234-ef56-7890" }), json(200, { stdout: b64("x") })]],
    ["a non-object result", [json(201, { token: "abcd1234-ef56-7890" }), json(200, "nope")]],
    ["a non-JSON body", [new Response("<html>oops</html>", { status: 200 })]],
  ])("rejects %s from the service as an invalid response", async (_name, responses) => {
    const { p } = provider(responses as Response[]);
    await expect(p.execute(input)).rejects.toMatchObject({ name: "ExecutionError", kind: "invalid_response" });
  });

  it.each([
    [401, "unavailable"],
    [403, "unavailable"],
    [429, "unavailable"],
    [500, "unavailable"],
    [503, "unavailable"],
    [422, "rejected"],
  ])("maps HTTP %i from the service to a generic %s error", async (status, kind) => {
    const { p, warnings } = provider([json(status, { error: "internal detail: redis://10.0.0.5" })]);
    try {
      await p.execute(input);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ExecutionError);
      expect((e as ExecutionError).kind).toBe(kind);
      expect((e as Error).message).not.toMatch(/redis|10\.0\.0|judge\.example|SECRET/);
    }
    expect(JSON.stringify(warnings)).not.toContain("SECRET-TOKEN");
  });

  it("treats network failures and request timeouts as unavailable/timeout without leaking the host", async () => {
    const netErr = provider([new TypeError("fetch failed: connect ECONNREFUSED 10.0.0.5:2358")]);
    await expect(netErr.p.execute(input)).rejects.toMatchObject({ kind: "unavailable", message: expect.not.stringMatching(/10\.0\.0|ECONNREFUSED/) });
    const timeout = Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
    await expect(provider([timeout]).p.execute(input)).rejects.toMatchObject({ kind: "timeout" });
  });

  it("lists languages after validating the response shape", async () => {
    const ok = provider([json(200, [{ id: 100, name: "Python (3.12.5)", is_archived: false }])]);
    expect(await ok.p.listLanguages()).toEqual([{ id: 100, name: "Python (3.12.5)" }]);
    expect(ok.calls[0]!.url).toBe("https://judge.example.com/languages");
    await expect(provider([json(200, [{ id: "x" }])]).p.listLanguages()).rejects.toMatchObject({ kind: "invalid_response" });
    await expect(provider([json(200, { languages: [] })]).p.listLanguages()).rejects.toMatchObject({ kind: "invalid_response" });
  });
});
