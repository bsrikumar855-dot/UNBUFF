import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { DockerRunner, RunResult } from "../../src/code/docker.js";
import { DockerLatexCompiler, MAX_LATEX_BYTES, summariseLog, UnavailableLatex, LatexUnavailableError } from "../../src/resume/latex.js";

const base = process.env.CODE_WORK_DIR ?? undefined;
const ran = (o: Partial<RunResult> = {}): RunResult => ({ code: 0, stdout: "", stderr: "", timedOut: false, ms: 300, ...o });

/** A fake docker: finds the mounted work folder in the arguments and writes what TeX would have produced. */
function fake(opts: { pdf?: string; log?: string; result?: Partial<RunResult> }) {
  const seen: string[][] = [];
  const runner: DockerRunner = async (args) => {
    seen.push(args);
    const dir = args[args.indexOf("-v") + 1]!.split(":")[0]!;
    await mkdir(dir, { recursive: true });
    if (opts.pdf !== undefined) await writeFile(join(dir, "main.pdf"), opts.pdf);
    if (opts.log !== undefined) await writeFile(join(dir, "main.log"), opts.log);
    return ran(opts.result);
  };
  return { runner, seen, compiler: new DockerLatexCompiler({ runner, workDir: base }) };
}

describe("DockerLatexCompiler", () => {
  it("returns the PDF and page count, and runs TeX in a locked-down container", async () => {
    const f = fake({ pdf: "%PDF-1.5 fake", log: "Output written on main.pdf (2 pages, 1234 bytes)." });
    const r = await f.compiler.compile("\\documentclass{article}\\begin{document}x\\end{document}");
    expect(r).toMatchObject({ ok: true, pages: 2, log: "" });
    expect(r.pdf!.toString()).toBe("%PDF-1.5 fake");
    const a = f.seen[0]!.join(" ");
    for (const flag of ["--network none", "--read-only", "--cap-drop ALL", "--pids-limit 96", "--init", "-no-shell-escape", "openin_any=p", "openout_any=p", "timeout -s KILL 25"]) expect(a).toContain(flag);
  });

  it("reports TeX errors with their location and produces no PDF", async () => {
    const f = fake({ log: "./main.tex:3: Undefined control sequence.\nl.3 \\bad\n\nnext", result: { code: 1 } });
    const r = await f.compiler.compile("\\bad");
    expect(r.ok).toBe(false);
    expect(r.pdf).toBeNull();
    expect(r.log).toContain("main.tex:3: Undefined control sequence.");
  });

  it("explains a timeout, a missing image and an oversized source, and never throws for those", async () => {
    expect((await fake({ result: { timedOut: true, code: null } }).compiler.compile("x")).log).toMatch(/longer than 25 seconds/);
    expect((await fake({ result: { code: 137, ms: 26_000 } }).compiler.compile("x")).log).toMatch(/longer than 25 seconds/);
    expect((await fake({ result: { code: 125 } }).compiler.compile("x")).log).toMatch(/could not be started/);
    const big = await fake({ pdf: "x" }).compiler.compile("a".repeat(MAX_LATEX_BYTES + 1));
    expect(big).toMatchObject({ ok: false });
    expect(big.log).toMatch(/larger than/);
  });

  it("rejects a PDF over 5 MB", async () => {
    const r = await fake({ pdf: "x".repeat(5 * 1024 * 1024 + 1), log: "Output written on main.pdf (1 page, 9 bytes)." }).compiler.compile("x");
    expect(r).toMatchObject({ ok: false, pdf: null, pages: 1 });
  });
});

describe("summariseLog and the unavailable compiler", () => {
  it("keeps error lines in both TeX formats and reads the page count", () => {
    const log = "This is pdfTeX\n! Undefined control sequence.\nl.1 \\x\n\nwarning noise\n./main.tex:9: Missing $ inserted.\nl.9 a_b\nOutput written on main.pdf (1 page, 10 bytes).";
    const s = summariseLog(log);
    expect(s.pages).toBe(1);
    expect(s.errors).toContain("! Undefined control sequence.");
    expect(s.errors).toContain("./main.tex:9: Missing $ inserted.");
    expect(s.errors).not.toContain("warning noise");
    expect(summariseLog("nothing").pages).toBeNull();
  });

  it("an unconfigured compiler fails with a distinct error", async () => {
    const u = new UnavailableLatex();
    expect(u.configured).toBe(false);
    await expect(u.compile()).rejects.toBeInstanceOf(LatexUnavailableError);
  });
});
