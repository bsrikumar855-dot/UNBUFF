import { describe, expect, it } from "vitest";
import { DockerProvider, type DockerRunner, type RunResult } from "../src/code/docker.js";
import { resolveLanguages } from "../src/code/languages.js";
import { ExecutionError } from "../src/code/provider.js";

const limits = { cpuTimeSeconds: 2, memoryMb: 128 };
const ok = (over: Partial<RunResult> = {}): RunResult => ({ code: 0, stdout: "", stderr: "", timedOut: false, ms: 12, ...over });

function provider(results: RunResult[]) {
  const calls: string[][] = [];
  const runner: DockerRunner = async (args) => {
    calls.push(args);
    return results.shift() ?? ok();
  };
  return { p: new DockerProvider({ runner }), calls };
}

describe("DockerProvider", () => {
  it("offers all four product languages through the normal name matching", async () => {
    const { p } = provider([]);
    expect(resolveLanguages(await p.listLanguages()).map((l) => l.id)).toEqual(["python", "javascript", "cpp", "java"]);
  });

  it("runs an interpreted program in a locked-down container", async () => {
    const { p, calls } = provider([ok({ stdout: "hi\n" })]);
    const r = await p.execute({ providerLanguageId: 71, source: "print('hi')", stdin: "", limits });
    expect(r).toMatchObject({ outcome: "completed", stdout: "hi\n" });
    expect(calls).toHaveLength(1);
    const a = calls[0]!.join(" ");
    for (const flag of ["--network none", "--read-only", "--cap-drop ALL", "--pids-limit 128"]) expect(a).toContain(flag);
  });

  it("reports a compile error once and never runs the program", async () => {
    const { p, calls } = provider([ok({ code: 1, stderr: "main.cpp:1: error" })]);
    const r = await p.execute({ providerLanguageId: 54, source: "oops", stdin: "", limits });
    expect(r).toMatchObject({ outcome: "compile_error", compile_output: "main.cpp:1: error" });
    expect(calls).toHaveLength(1);
  });

  it("compiles then runs a compiled language", async () => {
    const { p, calls } = provider([ok(), ok({ stdout: "42\n" })]);
    const r = await p.execute({ providerLanguageId: 62, source: "class Main{}", stdin: "", limits });
    expect(r.outcome).toBe("completed");
    expect(calls).toHaveLength(2);
  });

  it("maps timeouts, crashes and docker failures to honest outcomes", async () => {
    const run = (res: RunResult) => provider([res]).p.execute({ providerLanguageId: 71, source: "x", stdin: "", limits });
    expect((await run(ok({ timedOut: true, code: null }))).outcome).toBe("time_limit_exceeded");
    expect((await run(ok({ code: 137, ms: 7000 }))).outcome).toBe("time_limit_exceeded"); // in-container timeout
    expect((await run(ok({ code: 137, ms: 300 }))).outcome).toBe("runtime_error"); // OOM kill
    expect((await run(ok({ code: 1, stderr: "Traceback" }))).outcome).toBe("runtime_error");
    expect((await run(ok({ code: 125 }))).outcome).toBe("internal_error");
  });

  it("rejects an unknown language", async () => {
    await expect(provider([]).p.execute({ providerLanguageId: 999, source: "x", stdin: "", limits })).rejects.toBeInstanceOf(ExecutionError);
  });
});
