import { randomBytes } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnDocker, type DockerRunner } from "../code/docker.js";

/**
 * The built-in LaTeX compiler. Compilation runs TeX on student-written source, which is untrusted input, so it never
 * runs in the API process: each compile gets a throwaway Docker container with no network, a read-only root, a
 * memory and process cap, shell escape off, and TeX's "paranoid" file mode (it cannot read or write outside the
 * work folder). Like the local code runner this is for DEVELOPMENT; config.ts refuses it in production. Build the
 * image with `docker build -t unbluff-latex:1 backend/scripts/latex`.
 */

export const MAX_LATEX_BYTES = 60_000; // a résumé is a few KB; the cap leaves room under the 100 kb JSON body limit after escaping
const MAX_PDF_BYTES = 5 * 1024 * 1024;
const LIMIT_SECONDS = 25;

export interface CompileResult {
  ok: boolean;
  /** The PDF, or null when compilation failed. */
  pdf: Buffer | null;
  /** The compiler's own error messages, trimmed. Empty on success. */
  log: string;
  pages: number | null;
  duration_ms: number;
}

export interface LatexCompiler {
  readonly name: string;
  readonly configured: boolean;
  compile(latex: string): Promise<CompileResult>;
}

/** No compiler is set up on this server. */
export class LatexUnavailableError extends Error {
  constructor() {
    super("No LaTeX compiler is configured on this server.");
    this.name = "LatexUnavailableError";
  }
}

export class UnavailableLatex implements LatexCompiler {
  readonly name = "none";
  readonly configured = false;
  async compile(): Promise<CompileResult> {
    throw new LatexUnavailableError();
  }
}

/** Pulls the useful part out of a TeX log: the "!" error lines with a little context, and the page count. */
export function summariseLog(log: string): { errors: string; pages: number | null } {
  const pages = /Output written on [^\n(]*\((\d+) pages?/.exec(log);
  const lines = log.split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    // "! Error" (classic) or "main.tex:12: Error" (-file-line-error): the message plus a little context.
    if (lines[i]!.startsWith("!") || /^(?:\.\/)?[\w./-]+\.tex:\d+: /.test(lines[i]!)) out.push(...lines.slice(i, i + 3).map((l) => l.trimEnd()), "");
    else if (/^(LaTeX|Package) .*(Warning|Error)/.test(lines[i]!) && /Error/.test(lines[i]!)) out.push(lines[i]!.trimEnd());
  }
  return { errors: out.join("\n").trim().slice(0, 2500), pages: pages ? Number(pages[1]) : null };
}

export class DockerLatexCompiler implements LatexCompiler {
  readonly name = "docker";
  readonly configured = true;

  constructor(private readonly opts: { image?: string; runner?: DockerRunner; workDir?: string } = {}) {}

  async compile(latex: string): Promise<CompileResult> {
    const started = Date.now();
    const done = (r: Omit<CompileResult, "duration_ms">): CompileResult => ({ ...r, duration_ms: Date.now() - started });
    if (Buffer.byteLength(latex, "utf8") > MAX_LATEX_BYTES) return done({ ok: false, pdf: null, log: `The source is larger than ${MAX_LATEX_BYTES / 1000} KB.`, pages: null });

    // Snap-packaged Docker cannot see /tmp, so the base directory is configurable (CODE_WORK_DIR), as for the code runner.
    const base = this.opts.workDir ?? process.env.CODE_WORK_DIR ?? tmpdir();
    await mkdir(base, { recursive: true });
    const dir = await mkdtemp(join(base, "unbluff-tex-"));
    try {
      await chmod(dir, 0o777); // the container user is not the host user
      await writeFile(join(dir, "main.tex"), latex, "utf8");
      const name = `unbluff-tex-${randomBytes(6).toString("hex")}`;
      const args = [
        "run", "--rm", "-i", "--init", "--name", name,
        "--network", "none",
        "--memory", "640m", "--memory-swap", "640m", "--cpus", "1", "--pids-limit", "96",
        "--read-only", "--tmpfs", "/tmp:rw,size=64m",
        "--cap-drop", "ALL",
        "-e", "openin_any=p", "-e", "openout_any=p", // TeX paranoid mode: no files outside the work folder
        "-e", "TEXMFVAR=/tmp/texmf-var", "-e", "TEXMFCONFIG=/tmp/texmf-config",
        "-v", `${dir}:/work:rw`, "-w", "/work",
        this.opts.image ?? "unbluff-latex:1",
        "timeout", "-s", "KILL", String(LIMIT_SECONDS),
        "pdflatex", "-no-shell-escape", "-interaction=nonstopmode", "-halt-on-error", "-file-line-error", "main.tex",
      ];
      const run = await (this.opts.runner ?? spawnDocker)(args, "", (LIMIT_SECONDS + 5) * 1000, name);
      const logText = await readFile(join(dir, "main.log"), "utf8").catch(() => run.stderr || run.stdout);
      const { errors, pages } = summariseLog(logText);

      const pdfPath = join(dir, "main.pdf");
      const size = await stat(pdfPath).then((s) => s.size).catch(() => 0);
      if (run.timedOut || (run.code === 137 && run.ms >= LIMIT_SECONDS * 1000)) return done({ ok: false, pdf: null, log: `Compilation took longer than ${LIMIT_SECONDS} seconds and was stopped.`, pages: null });
      if (run.code === 125 || run.code === 126 || run.code === 127) return done({ ok: false, pdf: null, log: "The LaTeX compiler could not be started. Is the unbluff-latex image built?", pages: null });
      if (run.code !== 0 || size === 0) return done({ ok: false, pdf: null, log: errors || "Compilation failed. No error message was produced.", pages: null });
      if (size > MAX_PDF_BYTES) return done({ ok: false, pdf: null, log: "The PDF is larger than 5 MB.", pages });
      return done({ ok: true, pdf: await readFile(pdfPath), log: errors, pages });
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
