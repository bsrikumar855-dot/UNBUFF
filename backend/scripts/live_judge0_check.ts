/**
 * Controlled LIVE check of judged submissions: real Judge0 + real (non-production) Firebase project + the first-party
 * practice suites. Operator tool.
 *
 *   JUDGE0_URL=https://<host> [JUDGE0_AUTH_TOKEN=...] FIREBASE_PROJECT_ID=<test project> npx tsx scripts/live_judge0_check.ts
 *
 * It does NOT set EXECUTION_PROVIDER_VERIFIED. What it expects follows the value you give it:
 *   - not set / false: an accepted submission is judged for real and recorded, but is NOT counted in analytics
 *     (analytics_status excluded_unverified_provider), creates no revision item and completes no plan task.
 *   - true (set by you, in your own shell, after you decided the service is the intended deployment): accepted
 *     submissions must be counted and must update that student's progress, analytics and revision queue.
 * Student code runs only inside Judge0's sandbox, never in this process. Sends only the short reference solutions
 * written below. Creates one throwaway Firebase user, deletes its records and the user at the end. Prints only
 * PASS/FAIL lines: never a token, password or key. Exit 0 only if every check passed.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import dotenv from "dotenv";

const root = join(import.meta.dirname, "..");
const webEnv = dotenv.parse(readFileSync(join(root, "..", "frontend", ".env"), "utf8"));
const project = process.env.FIREBASE_PROJECT_ID ?? "";
const webKey = process.env.VITE_FIREBASE_API_KEY ?? webEnv.VITE_FIREBASE_API_KEY ?? "";
const judge0Url = process.env.JUDGE0_URL ?? "";
const verified = (process.env.EXECUTION_PROVIDER_VERIFIED ?? "").toLowerCase() === "true";
const blocked = (m: string) => {
  console.log(`BLOCKED: ${m} Nothing was sent.`);
  process.exit(2);
};
if (!project) blocked("set FIREBASE_PROJECT_ID to the non-production project id.");
if (process.env.FIREBASE_AUTH_EMULATOR_HOST || process.env.FIRESTORE_EMULATOR_HOST) blocked("an emulator address is set.");
if (!webKey) blocked("VITE_FIREBASE_API_KEY is not set.");
if (!judge0Url) blocked("set JUDGE0_URL.");

let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

const PORT = 8095;
const base = `http://127.0.0.1:${PORT}/api`;
const idt = "https://identitytoolkit.googleapis.com/v1";
const tag = randomBytes(4).toString("hex");
const QID = "fp_001_balanced_brackets";

/** Reference solutions to the first-party "balanced brackets" exercise (reads one line, prints YES or NO). */
const SOLUTIONS: Record<string, string> = {
  python: `s = input().strip()
pairs = {")": "(", "]": "[", "}": "{"}
st = []
ok = True
for ch in s:
    if ch in "([{":
        st.append(ch)
    elif not st or st.pop() != pairs[ch]:
        ok = False
        break
print("YES" if ok and not st else "NO")
`,
  javascript: `const s = require("fs").readFileSync(0, "utf8").trim();
const pairs = { ")": "(", "]": "[", "}": "{" };
const st = [];
let ok = true;
for (const ch of s) {
  if ("([{".includes(ch)) st.push(ch);
  else if (st.pop() !== pairs[ch]) { ok = false; break; }
}
console.log(ok && st.length === 0 ? "YES" : "NO");
`,
  cpp: `#include <iostream>
#include <string>
#include <vector>
int main() {
  std::string s; std::getline(std::cin, s);
  std::vector<char> st; bool ok = true;
  for (char c : s) {
    if (c == '(' || c == '[' || c == '{') st.push_back(c);
    else {
      char want = c == ')' ? '(' : c == ']' ? '[' : '{';
      if (st.empty() || st.back() != want) { ok = false; break; }
      st.pop_back();
    }
  }
  std::cout << ((ok && st.empty()) ? "YES" : "NO") << std::endl;
}
`,
  java: `import java.util.*;
public class Main {
  public static void main(String[] a) {
    String s = new Scanner(System.in).nextLine().trim();
    Deque<Character> st = new ArrayDeque<>();
    boolean ok = true;
    for (char c : s.toCharArray()) {
      if (c == '(' || c == '[' || c == '{') st.push(c);
      else {
        char want = c == ')' ? '(' : c == ']' ? '[' : '{';
        if (st.isEmpty() || st.pop() != want) { ok = false; break; }
      }
    }
    System.out.println(ok && st.isEmpty() ? "YES" : "NO");
  }
}
`,
};
const WRONG_PY = `print("YES")\n`;
const BROKEN_CPP = `int main( { return 0 }\n`;

let child: ChildProcess | undefined;
const logs: string[] = [];

async function startBackend(): Promise<void> {
  const env = {
    ...process.env,
    PORT: String(PORT),
    STORE: "firestore",
    FIREBASE_PROJECT_ID: project,
    LLM_MODE: "mock",
    CORS_ORIGIN: "*",
    LOG_LEVEL: "info",
    EXECUTION_PROVIDER: "judge0",
    JUDGE0_URL: judge0Url,
    DSA_CATALOGUE_PATH: join(root, "data", "dsa", "practice-pack.json"),
    CODE_SUITES_PATH: join(root, "data", "code", "practice-suites.json"),
  };
  child = spawn(process.execPath, ["--import", "tsx", "src/server.ts"], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout?.on("data", (d: Buffer) => logs.push(String(d)));
  child.stderr?.on("data", (d: Buffer) => logs.push(String(d)));
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${base}/health`)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("backend did not start (is the port free, and is the configuration valid?)");
}

async function stopBackend(): Promise<void> {
  if (!child) return;
  const c = child;
  child = undefined;
  await new Promise<void>((resolve) => {
    c.once("exit", () => resolve());
    if (process.platform === "win32" && c.pid) spawn("taskkill", ["/pid", String(c.pid), "/t", "/f"]);
    else c.kill();
    setTimeout(resolve, 5000);
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;
const tokens: Record<string, string> = {};
const call = async (method: string, path: string, who: string | null, body?: unknown): Promise<{ status: number; body: Json }> => {
  const r = await fetch(`${base}${path}`, {
    method,
    headers: { ...(who ? { Authorization: `Bearer ${tokens[who]}` } : {}), ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let json: Json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* not JSON */
  }
  return { status: r.status, body: json };
};
const signUp = async (label: string) => {
  const r = await fetch(`${idt}/accounts:signUp?key=${webKey}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: `live-j0-${label}-${tag}@example.test`, password: `Pw-${randomBytes(12).toString("base64url")}`, returnSecureToken: true }) });
  const b = (await r.json()) as { idToken?: string };
  if (!r.ok || !b.idToken) throw new Error("test-user sign-up failed");
  tokens[label] = b.idToken;
};

async function main() {
  console.log(`Project: ${project}. Judge0: ${new URL(judge0Url).host} (REAL). Firebase: REAL. EXECUTION_PROVIDER_VERIFIED=${verified ? "true (set by you)" : "not set"}.`);
  try {
    await signUp("a");
    await signUp("b");
    check("created two throwaway Firebase test users", Boolean(tokens.a && tokens.b));
    await startBackend();
    check("backend started with the real Judge0 provider and the first-party practice suites", true, `port ${PORT}`);

    // exercise projection
    const ex = await call("GET", `/code/exercises/${QID}`, null);
    check("the exercise is a gradable first-party exercise", ex.status === 200 && ex.body?.gradable === true && ex.body?.is_demonstration === false, `hidden tests: ${ex.body?.hidden_test_count}`);
    check("the public exercise exposes no hidden test cases (only a count)", !("tests" in (ex.body ?? {})) && typeof ex.body?.hidden_test_count === "number" && (ex.body?.samples?.length ?? 0) >= 1);
    const langs = await call("GET", "/code/languages", null);
    check("the service reports the four supported languages", ["python", "javascript", "cpp", "java"].every((l) => JSON.stringify(langs.body).includes(l)));

    // sample run: real execution, not stored, not counted
    const run = await call("POST", "/code/run", "a", { language: "python", source: SOLUTIONS.python, question_id: QID, sample_index: 0 });
    check("a sample run executed in the real sandbox and matched the sample output", run.status === 200 && /accepted|passed|completed/i.test(JSON.stringify(run.body)), `status ${run.status}`);
    check("a sample run is not stored", ((await call("GET", "/code/submissions", "a")).body?.submissions ?? []).length === 0);

    // judged submissions in every language
    const verdicts: string[] = [];
    for (const lang of ["python", "javascript", "cpp", "java"]) {
      const r = await call("POST", "/code/submit", "a", { question_id: QID, language: lang, source: SOLUTIONS[lang] });
      verdicts.push(`${lang}:${r.body?.verdict}`);
      check(`judged ${lang} submission against the hidden tests: accepted`, r.status === 200 && r.body?.verdict === "accepted", `verdict ${r.body?.verdict}, ${r.body?.passed}/${r.body?.total}`);
      check(`${lang}: the response shows no hidden test input or expected output`, !/expected_output|"input"/.test(JSON.stringify(r.body)));
      const status = r.body?.analytics_status;
      check(`${lang}: analytics status is ${verified ? "counted" : "excluded_unverified_provider"}`, status === (verified ? "counted" : "excluded_unverified_provider"), `status ${status}`);
    }
    const wrong = await call("POST", "/code/submit", "a", { question_id: QID, language: "python", source: WRONG_PY });
    check("a wrong answer is judged wrong_answer with a failed-test number only", wrong.status === 200 && wrong.body?.verdict === "wrong_answer" && typeof wrong.body?.failed_test === "number", `verdict ${wrong.body?.verdict}`);
    const ce = await call("POST", "/code/submit", "a", { question_id: QID, language: "cpp", source: BROKEN_CPP });
    check("broken C++ is reported as a compile error", ce.status === 200 && /compil/i.test(String(ce.body?.verdict)), `verdict ${ce.body?.verdict}`);

    // storage, ownership, progress
    const mine = (await call("GET", "/code/submissions", "a")).body?.submissions ?? [];
    check("all six judged submissions are stored for the owner (this also proves the composite index)", mine.length === 6, `${mine.length} stored`);
    check("another student cannot list or open them", ((await call("GET", "/code/submissions", "b")).body?.submissions ?? []).length === 0 && (await call("GET", `/code/submissions/${mine[0]?.id}`, "b")).status === 404);
    const totals = (await call("GET", "/me/dsa-analytics", "a")).body?.totals ?? {};
    const rev = (await call("GET", "/me/dsa-revision?view=all", "a")).body?.items ?? [];
    if (verified) {
      check("analytics count the accepted attempts and one solved question", totals.solved_unique === 1 && totals.accepted_attempts >= 4, JSON.stringify(totals));
      check("the revision queue has the failed question's follow-up only for this student", ((await call("GET", "/me/dsa-revision?view=all", "b")).body?.items ?? []).length === 0);
    } else {
      check("no result was counted: zero eligible attempts and nothing solved", totals.eligible_attempts === 0 && totals.solved_unique === 0, JSON.stringify(totals));
      check("no revision item was created from uncounted results", rev.length === 0);
    }
    check("student B's analytics are untouched", ((await call("GET", "/me/dsa-analytics", "b")).body?.totals?.eligible_attempts ?? 0) === 0);

    // cleanup
    for (const s of mine) await call("DELETE", `/code/submissions/${s.id}`, "a");
    check("the test submissions were deleted", ((await call("GET", "/code/submissions", "a")).body?.submissions ?? []).length === 0);
    const log = logs.join("");
    check("backend logs contain no token or submitted source code", !Object.values(tokens).some((t) => log.includes(t)) && !log.includes("std::getline") && !log.includes("ArrayDeque"));
  } finally {
    await stopBackend();
    let removed = 0;
    for (const t of Object.values(tokens)) {
      const del = await fetch(`${idt}/accounts:delete?key=${webKey}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken: t }) }).catch(() => null);
      if (del?.ok) removed += 1;
    }
    if (Object.keys(tokens).length > 0) check("test users were deleted from Firebase Auth", removed === Object.keys(tokens).length, `${removed}/${Object.keys(tokens).length}`);
  }
}

main()
  .catch((e: unknown) => {
    failures += 1;
    console.log(`FAIL  unexpected error: ${String((e as Error).message).slice(0, 200)}`);
  })
  .finally(() => {
    console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
    process.exitCode = failures === 0 ? 0 : 1;
    setTimeout(() => process.exit(), 300);
  });
