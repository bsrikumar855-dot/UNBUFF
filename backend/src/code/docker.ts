import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ExecutionError, type ExecuteInput, type ExecuteResult, type ExecutionProvider, type ProviderLanguage } from "./provider.js";

/**
 * Local execution provider for development: runs each program in a throwaway Docker container with no network,
 * a memory cap, a pid cap, a read-only root filesystem and an unprivileged user. It exists because Judge0 needs
 * cgroup v1 and a dedicated host. It is refused when NODE_ENV=production (config.ts): giving a web server access
 * to the Docker socket is not an acceptable production sandbox. Build the image with
 * `docker build -t unbluff-runner:1 backend/scripts/runner`.
 */

interface Lang {
  id: number;
  /** Must match the patterns in languages.ts. */
  name: string;
  file: string;
  compile?: string[];
  run: string[];
}

const LANGS: Lang[] = [
  { id: 71, name: "Python (3.12)", file: "main.py", run: ["python3", "main.py"] },
  { id: 63, name: "JavaScript (Node.js 20)", file: "main.js", run: ["node", "main.js"] },
  { id: 54, name: "C++ (GCC 13)", file: "main.cpp", compile: ["g++", "-O2", "-std=c++17", "-o", "main", "main.cpp"], run: ["./main"] },
  { id: 62, name: "Java (OpenJDK 21)", file: "Main.java", compile: ["javac", "Main.java"], run: ["java", "-Xmx96m", "-Xss16m", "Main"] },
];

export interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  ms: number;
}

/** Runs `docker` with args and optional stdin. Injectable so tests never need a daemon. */
export type DockerRunner = (args: string[], stdin: string, wallMs: number, name: string) => Promise<RunResult>;

const MAX_BYTES = 64 * 1024;

export const spawnDocker: DockerRunner = (args, stdin, wallMs, name) =>
  new Promise((resolve, reject) => {
    const started = Date.now();
    const child = spawn("docker", args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const take = (cur: string, chunk: Buffer) => (cur.length >= MAX_BYTES ? cur : cur + chunk.toString("utf8"));
    child.stdout.on("data", (c: Buffer) => (stdout = take(stdout, c)));
    child.stderr.on("data", (c: Buffer) => (stderr = take(stderr, c)));
    const timer = setTimeout(() => {
      timedOut = true;
      // Backstop only: the in-container `timeout` normally ends the program first. Some Docker installs (snap + AppArmor)
      // refuse to signal containers, so fall back to freezing it rather than leaving it spinning.
      const rm = spawn("docker", ["rm", "-f", name], { stdio: "ignore" });
      rm.on("error", () => undefined);
      rm.on("close", (c) => {
        if (c !== 0) spawn("docker", ["pause", name], { stdio: "ignore" }).on("error", () => undefined);
      });
    }, wallMs);
    child.on("error", () => {
      clearTimeout(timer);
      reject(new ExecutionError("unavailable", "The code execution service is not available."));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut, ms: Date.now() - started });
    });
    child.stdin.on("error", () => undefined); // the program may exit without reading its input
    child.stdin.end(stdin);
  });

const clip = (s: string) => (s.length > MAX_BYTES ? `${s.slice(0, MAX_BYTES)}\n[output truncated]` : s);

export class DockerProvider implements ExecutionProvider {
  readonly name = "docker";
  readonly configured = true;

  constructor(
    private readonly opts: { image?: string; runner?: DockerRunner; workDir?: string } = {},
  ) {}

  private get image(): string {
    return this.opts.image ?? "unbluff-runner:1";
  }

  private get runner(): DockerRunner {
    return this.opts.runner ?? spawnDocker;
  }

  async listLanguages(): Promise<ProviderLanguage[]> {
    return LANGS.map(({ id, name }) => ({ id, name }));
  }

  private containerArgs(name: string, dir: string, mountMode: "ro" | "rw", memoryMb: number, cmd: string[]): string[] {
    return [
      "run", "--rm", "-i", "--init", "--name", name, // --init: the program must not be PID 1, or the in-container timeout cannot kill it
      "--network", "none",
      "--memory", `${memoryMb + 128}m`, "--memory-swap", `${memoryMb + 128}m`,
      "--cpus", "1", "--pids-limit", "128",
      "--read-only", "--tmpfs", "/tmp:rw,size=16m",
      "--cap-drop", "ALL",
      "-v", `${dir}:/work:${mountMode}`, "-w", "/work",
      this.image, ...cmd,
    ];
  }

  async execute(input: ExecuteInput): Promise<ExecuteResult> {
    const lang = LANGS.find((l) => l.id === input.providerLanguageId);
    if (!lang) throw new ExecutionError("rejected", "The code execution service rejected the request.");
    // Snap-packaged Docker cannot see /tmp, so the base directory is configurable (CODE_WORK_DIR).
    const base = this.opts.workDir ?? process.env.CODE_WORK_DIR ?? tmpdir();
    await mkdir(base, { recursive: true });
    const dir = await mkdtemp(join(base, "unbluff-run-"));
    try {
      await chmod(dir, 0o777); // the container user is not the host user
      await writeFile(join(dir, lang.file), input.source, "utf8");
      // Wall-clock allowance: the CPU limit, doubled, plus container and JVM start-up.
      const limitSeconds = input.limits.cpuTimeSeconds * 2 + (lang.id === 62 ? 4 : 2);
      const wallMs = limitSeconds * 1000 + 3000; // host-side backstop, after the in-container timeout
      const id = randomBytes(6).toString("hex");

      if (lang.compile) {
        const c = await this.runner(this.containerArgs(`unbluff-c-${id}`, dir, "rw", 512, ["timeout", "-s", "KILL", "20", ...lang.compile]), "", 30_000, `unbluff-c-${id}`);
        if (c.timedOut || c.code !== 0) {
          return {
            outcome: c.timedOut ? "time_limit_exceeded" : "compile_error",
            stdout: "", stderr: "",
            compile_output: clip(c.stderr || c.stdout),
            time_ms: null, memory_kb: null,
          };
        }
      }

      const r = await this.runner(this.containerArgs(`unbluff-r-${id}`, dir, "ro", input.limits.memoryMb, ["timeout", "-s", "KILL", String(limitSeconds), ...lang.run]), input.stdin, wallMs, `unbluff-r-${id}`);
      const base = { stdout: clip(r.stdout), stderr: clip(r.stderr), compile_output: "", time_ms: r.ms, memory_kb: null };
      // Exit 137 is SIGKILL: our in-container timeout (took the whole allowance) or the kernel's OOM killer.
      const killedByTimeout = r.code === 137 && r.ms >= limitSeconds * 1000;
      if (r.timedOut || killedByTimeout) return { ...base, outcome: "time_limit_exceeded" };
      if (r.code === 125 || r.code === 126 || r.code === 127) return { ...base, outcome: "internal_error" }; // docker itself failed
      if (r.code !== 0) return { ...base, outcome: "runtime_error", stderr: clip(r.stderr || (r.code === 137 ? "Killed (memory limit exceeded?)" : "")) };
      return { ...base, outcome: "completed" };
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
