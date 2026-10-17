/**
 * Controlled LIVE check of Firebase Authentication and Firestore against a NON-PRODUCTION project. Operator tool.
 *
 *   FIREBASE_PROJECT_ID=<test project id> npx tsx scripts/live_firebase_check.ts
 *
 * Needs: the project's web API key (VITE_FIREBASE_API_KEY in ../frontend/.env or the environment), Email/Password sign-in
 * enabled in that project, and Application Default Credentials (gcloud auth application-default login) or a service
 * account. It creates two throwaway users, starts the backend on a spare port with STORE=firestore, exercises sign-in,
 * token verification, writes, reads, ownership isolation and persistence across a backend restart, then deletes every
 * record and both users. Prints only PASS/FAIL lines: never a token, password or key. Exit 0 only if all checks passed.
 * Refuses to run when an emulator address is set, so it cannot be mistaken for an emulator run.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import dotenv from "dotenv";

const project = process.env.FIREBASE_PROJECT_ID ?? "";
if (!project) {
  console.log("BLOCKED: set FIREBASE_PROJECT_ID to the non-production project id. Nothing was sent.");
  process.exit(2);
}
if (process.env.FIREBASE_AUTH_EMULATOR_HOST || process.env.FIRESTORE_EMULATOR_HOST) {
  console.log("BLOCKED: an emulator address is set; unset it so this talks to the real project.");
  process.exit(2);
}
const root = join(import.meta.dirname, "..");
const webEnv = dotenv.parse(readFileSync(join(root, "..", "frontend", ".env"), "utf8"));
const webKey = process.env.VITE_FIREBASE_API_KEY ?? webEnv.VITE_FIREBASE_API_KEY ?? "";
if (!webKey) {
  console.log("BLOCKED: VITE_FIREBASE_API_KEY is not set. Nothing was sent.");
  process.exit(2);
}
if ((process.env.VITE_FIREBASE_PROJECT_ID ?? webEnv.VITE_FIREBASE_PROJECT_ID) !== project) {
  console.log("BLOCKED: the frontend's VITE_FIREBASE_PROJECT_ID does not match FIREBASE_PROJECT_ID.");
  process.exit(2);
}

let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

const PORT = 8093;
const base = `http://127.0.0.1:${PORT}/api`;
const idt = "https://identitytoolkit.googleapis.com/v1";
const tag = randomBytes(4).toString("hex");

interface User {
  email: string;
  password: string;
  idToken: string;
  uid: string;
}

async function signUp(label: string): Promise<User> {
  const email = `live-${label}-${tag}@example.test`;
  const password = `Pw-${randomBytes(12).toString("base64url")}`;
  const r = await fetch(`${idt}/accounts:signUp?key=${webKey}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, returnSecureToken: true }) });
  const b = (await r.json()) as { idToken?: string; localId?: string; error?: { message?: string } };
  if (!r.ok || !b.idToken || !b.localId) throw new Error(`sign-up failed: ${b.error?.message ?? r.status}`);
  return { email, password, idToken: b.idToken, uid: b.localId };
}

async function signIn(u: User): Promise<string> {
  const r = await fetch(`${idt}/accounts:signInWithPassword?key=${webKey}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: u.email, password: u.password, returnSecureToken: true }) });
  const b = (await r.json()) as { idToken?: string };
  if (!r.ok || !b.idToken) throw new Error("sign-in failed");
  return b.idToken;
}

async function deleteUser(u: User): Promise<boolean> {
  const r = await fetch(`${idt}/accounts:delete?key=${webKey}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken: u.idToken }) });
  return r.ok;
}

let child: ChildProcess | undefined;
const logs: string[] = [];

async function startBackend(): Promise<void> {
  const env = { ...process.env, PORT: String(PORT), STORE: "firestore", FIREBASE_PROJECT_ID: project, LLM_MODE: "mock", CORS_ORIGIN: "*", LOG_LEVEL: "info" };
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
  throw new Error("backend did not start");
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

const call = async (method: string, path: string, token: string | null, body?: unknown) => {
  const r = await fetch(`${base}${path}`, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let json: any = null; // eslint-disable-line @typescript-eslint/no-explicit-any
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* not JSON */
  }
  return { status: r.status, body: json };
};

const MARK = `livecheck-${tag}`;
const profile = { role_ids: ["frontend_developer"], target_companies: [], placement_date: "2027-03-15", available_weekdays: [1, 2, 3, 4, 5], daily_minutes: 60, preferred_language: "python", experience_level: "intermediate", strengths: [], weak_areas: [], priorities: ["interview", "graphql"] };

async function main() {
  console.log(`Project: ${project}. Auth and Firestore: REAL (no emulator). Test users: 2 throwaway, deleted at the end.`);
  const users: User[] = [];
  try {
    const a = await signUp("a");
    const b = await signUp("b");
    users.push(a, b);
    check("real Firebase Auth created two test users", a.uid !== b.uid && a.idToken.length > 100);

    await startBackend();
    check("backend started against real Firestore (STORE=firestore)", true, `port ${PORT}`);

    // token verification
    check("no token is refused", (await call("GET", "/placement/dashboard", null)).status === 401);
    check("a malformed token is refused", (await call("GET", "/placement/dashboard", "not.a.token")).status === 401);
    check("a token with a broken signature is refused", (await call("GET", "/placement/dashboard", `${a.idToken.slice(0, -4)}AAAA`)).status === 401);
    const okA = await call("GET", "/placement/dashboard", a.idToken);
    check("a real ID token is accepted by the backend verifier", okA.status === 200, `status ${okA.status}`);

    // writes
    const mem = await call("POST", "/mentor/memories", a.idToken, { type: "learning", content: `Finds ${MARK} hard`, topic: "closures", signal: "difficult" });
    check("student A wrote a mentor memory to Firestore", mem.status === 200 && typeof mem.body?.id === "string", `status ${mem.status}`);
    const memId: string = mem.body?.id ?? "";
    const prof = await call("PUT", "/placement/profile", a.idToken, profile);
    check("student A saved a placement profile", prof.status === 200, `status ${prof.status}`);
    const plan = await call("POST", "/placement/plan/generate", a.idToken, {});
    check("student A generated a plan (several documents written)", plan.status === 200, `status ${plan.status}`);
    const planTasks = (plan.body?.today_tasks?.length ?? 0) + (plan.body?.week ?? []).reduce((n: number, d: { tasks: unknown[] }) => n + d.tasks.length, 0);

    // reads and isolation
    const list = async (u: User) => (await call("GET", "/mentor/memories", u.idToken)).body?.memories ?? [];
    check("student A reads the memory back", (await list(a)).some((m: { id: string }) => m.id === memId));
    check("student B cannot see student A's memory", !(await list(b)).some((m: { id: string }) => m.id === memId));
    check("student B has no placement profile of their own from A's write", (await call("GET", "/placement/dashboard", b.idToken)).body?.needs_profile === true);
    check("student B cannot change or delete A's memory", (await call("DELETE", `/mentor/memories/${memId}`, b.idToken)).status === 404 && (await call("PATCH", `/mentor/memories/${memId}`, b.idToken, { content: "tamper" })).status === 404);
    check("student A's memory survived B's attempt", (await list(a)).some((m: { id: string }) => m.id === memId));

    // persistence across a backend restart
    await stopBackend();
    await startBackend();
    const tokenA2 = await signIn(a);
    check("after a backend restart, A's memory is still there (durable)", ((await call("GET", "/mentor/memories", tokenA2)).body?.memories ?? []).some((m: { id: string }) => m.id === memId));
    const dash = await call("GET", "/placement/dashboard", tokenA2);
    const tasksAfter = (dash.body?.today_tasks?.length ?? 0) + (dash.body?.week ?? []).reduce((n: number, d: { tasks: unknown[] }) => n + d.tasks.length, 0);
    check("after a restart, A's profile and plan are still there", dash.body?.needs_profile === false && tasksAfter === planTasks && planTasks > 0, `${tasksAfter} tasks`);
    check("after a restart, B still sees none of it", !((await call("GET", "/mentor/memories", b.idToken)).body?.memories ?? []).some((m: { id: string }) => m.id === memId));

    // deletion
    check("A deletes the memory", (await call("DELETE", `/mentor/memories/${memId}`, tokenA2)).status === 204);
    check("the deleted memory is gone", !(await list(a)).some((m: { id: string }) => m.id === memId));
    check("A deletes planner data", (await call("DELETE", "/placement/data", tokenA2)).status === 204);
    check("planner data is gone", (await call("GET", "/placement/dashboard", tokenA2)).body?.needs_profile === true);

    // logs
    const log = logs.join("");
    check("backend logs contain no ID token, password or test memory text", ![a, b].some((u) => log.includes(u.idToken) || log.includes(u.password)) && !log.includes(MARK));
  } finally {
    await stopBackend();
    let removed = 0;
    for (const u of users) if (await deleteUser(u).catch(() => false)) removed += 1;
    if (users.length > 0) check("test users were deleted from Firebase Auth", removed === users.length, `${removed}/${users.length}`);
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
    setTimeout(() => process.exit(), 200);
  });
