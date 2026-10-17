/**
 * Controlled LIVE check of the GitHub OAuth connection and GraphQL sync against a NON-PRODUCTION OAuth App and a
 * NON-PRODUCTION Firebase project. Operator tool; it needs a human to click "Authorize" in a browser.
 *
 *   FIREBASE_PROJECT_ID=<test project id> npx tsx scripts/live_github_check.ts
 *
 * Needs the GITHUB_* variables in backend/.env (client id and secret of the test OAuth App, redirect URI on a free
 * local port, encryption key), the web API key in ../frontend/.env, Email/Password sign-in enabled, and Application
 * Default Credentials. It creates one throwaway Firebase user, starts the backend on the redirect URI's port with
 * STORE=firestore, prints the GitHub authorisation address (no secret in it), waits for you to authorise, then checks
 * state validation, the token exchange, the sync, rate-limit information, privacy of responses and of storage, and
 * disconnect. It deletes the user and its records. Prints only PASS/FAIL lines: never a token, secret or key.
 * No scope is requested, so only public data can be read. Exit 0 only if every check passed.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import dotenv from "dotenv";
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const root = join(import.meta.dirname, "..");
const backendEnv = dotenv.parse(readFileSync(join(root, ".env"), "utf8"));
const webEnv = dotenv.parse(readFileSync(join(root, "..", "frontend", ".env"), "utf8"));
const project = process.env.FIREBASE_PROJECT_ID ?? "";
const webKey = process.env.VITE_FIREBASE_API_KEY ?? webEnv.VITE_FIREBASE_API_KEY ?? "";
const gh = {
  id: backendEnv.GITHUB_CLIENT_ID ?? "",
  secret: backendEnv.GITHUB_CLIENT_SECRET ?? "",
  redirect: backendEnv.GITHUB_REDIRECT_URI ?? "",
  key: backendEnv.GITHUB_TOKEN_ENCRYPTION_KEY ?? "",
};
const blocked = (m: string) => {
  console.log(`BLOCKED: ${m} Nothing was sent.`);
  process.exit(2);
};
if (!project) blocked("set FIREBASE_PROJECT_ID to the non-production project id.");
if (process.env.FIREBASE_AUTH_EMULATOR_HOST || process.env.FIRESTORE_EMULATOR_HOST) blocked("an emulator address is set.");
if (!webKey) blocked("VITE_FIREBASE_API_KEY is not set.");
if (!gh.id || !gh.secret || !gh.redirect || !gh.key) blocked("the GITHUB_* variables are not all set in backend/.env.");
const redirect = new URL(gh.redirect);
const PORT = Number(redirect.port || 80);
if (redirect.hostname !== "localhost" && redirect.hostname !== "127.0.0.1") blocked("GITHUB_REDIRECT_URI is not a local address; this tool is for local non-production runs.");

let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

const base = `http://127.0.0.1:${PORT}/api`;
const idt = "https://identitytoolkit.googleapis.com/v1";
const tag = randomBytes(4).toString("hex");
const TOKEN_PATTERN = /gh[opsu]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}/;

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
  throw new Error("backend did not start (is the port free?)");
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
let idToken = "";
const call = async (method: string, path: string, body?: unknown, auth = true): Promise<{ status: number; body: Json; location: string | null }> => {
  const r = await fetch(`${base}${path}`, {
    method,
    redirect: "manual",
    headers: { ...(auth ? { Authorization: `Bearer ${idToken}` } : {}), ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let json: Json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* not JSON */
  }
  return { status: r.status, body: json, location: r.headers.get("location") };
};
const noSecrets = (v: unknown) => {
  const s = JSON.stringify(v);
  return !TOKEN_PATTERN.test(s) && !s.includes(gh.secret) && !s.includes(gh.key);
};

async function main() {
  console.log(`Project: ${project}. GitHub: REAL OAuth App (local callback port ${PORT}), no scopes. Firebase: REAL.`);
  initializeApp({ credential: applicationDefault(), projectId: project });
  const db = getFirestore();
  const email = `live-gh-${tag}@example.test`;
  const password = `Pw-${randomBytes(12).toString("base64url")}`;
  let uid = "";
  try {
    const r = await fetch(`${idt}/accounts:signUp?key=${webKey}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, returnSecureToken: true }) });
    const b = (await r.json()) as { idToken?: string; localId?: string };
    if (!r.ok || !b.idToken || !b.localId) throw new Error("test-user sign-up failed");
    idToken = b.idToken;
    uid = b.localId;
    check("created one throwaway Firebase test user", true);

    await startBackend();
    check("backend started (STORE=firestore, GitHub configured)", true, `port ${PORT}`);

    // before connecting
    const c0 = await call("GET", "/github/connection");
    check("before connecting, the student is shown as disconnected", c0.status === 200 && c0.body?.status === "disconnected", `status ${c0.body?.status}`);
    check("no scope or write access is advertised", c0.body?.access === "public_only");
    check("reading GitHub data while disconnected is refused", (await call("GET", "/github/contributions")).status >= 400);

    // state validation
    const bad = await call("GET", "/github/oauth/callback?code=forged-code&state=forged-state-value-0000000000000000", undefined, false);
    check("a forged state is not accepted (redirected with an error, nothing connected)", bad.status === 302 && (await call("GET", "/github/connection")).body?.status === "disconnected", `status ${bad.status}`);
    const none = await call("GET", "/github/oauth/callback", undefined, false);
    check("a callback with no code or state is handled without a crash", none.status === 302 || none.status === 400, `status ${none.status}`);

    // authorisation address
    const start = await call("POST", "/github/connect", {});
    const au = start.body?.authorize_url ? new URL(start.body.authorize_url) : null;
    check("the connect request returns a GitHub authorisation address", start.status === 200 && au?.origin === "https://github.com" && au.pathname === "/login/oauth/authorize");
    check("the address uses this app's id and callback, a state and PKCE (S256)", au?.searchParams.get("client_id") === gh.id && au?.searchParams.get("redirect_uri") === gh.redirect && (au?.searchParams.get("state")?.length ?? 0) >= 20 && au?.searchParams.get("code_challenge_method") === "S256" && Boolean(au?.searchParams.get("code_challenge")));
    check("the address requests no scope", !au?.searchParams.get("scope"));
    check("the address contains no secret", !String(start.body?.authorize_url).includes(gh.secret));

    console.log("\nACTION NEEDED: open this address in your browser, sign in to GitHub with your TEST account, and click Authorize.");
    console.log("It carries no secret. After authorising, the browser will be sent to your frontend address (which may show 'site cannot be reached'; that is expected).");
    console.log(`AUTHORIZE_URL=${start.body?.authorize_url}\n`);

    let connected = false;
    for (let i = 0; i < 100 && !connected; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      connected = (await call("GET", "/github/connection")).body?.status === "connected";
    }
    check("after you authorised, the callback validated the state and exchanged the code (status connected)", connected);
    if (!connected) throw new Error("not authorised in time");

    const c1 = (await call("GET", "/github/connection")).body;
    check("the connection reports public-only access and no token", c1.access === "public_only" && noSecrets(c1) && typeof c1.login === "string" && c1.login.length > 0, "login shown to the student");

    // storage privacy
    const cred = await db.collection("unbluff_github_credentials").doc(uid).get();
    check("a credential record exists and holds no readable token", cred.exists && noSecrets(cred.data()));
    const conn = await db.collection("unbluff_github_connections").doc(uid).get();
    check("the connection record exists, owned by this student, with no token", conn.exists && conn.data()?.owner_uid === uid && noSecrets(conn.data()));
    const state = await db.collection("unbluff_github_states").limit(20).get();
    check("no one-time state records are left over", state.docs.length === 0 || state.docs.every((d) => d.data()?.used_at || d.data()?.owner_uid !== uid), `${state.docs.length} present`);

    // sync
    const s1 = await call("POST", "/github/sync", {});
    check("an authenticated GraphQL sync completed", s1.status === 200 && ["synced", "partial"].includes(String(s1.body?.outcome)), `outcome ${s1.body?.outcome}, status ${s1.status}`);
    check("GitHub's rate-limit allowance was read", typeof s1.body?.rate_limit_remaining === "number" && s1.body.rate_limit_remaining > 0, typeof s1.body?.rate_limit_remaining === "number" ? `remaining ${s1.body.rate_limit_remaining}` : "not reported");
    const s2 = await call("POST", "/github/sync", {});
    check("an immediate second sync is not sent to GitHub (minimum interval, cached)", s2.status === 200 && s2.body?.outcome === "cached", `outcome ${s2.body?.outcome}`);
    const bodies = await Promise.all(["contributions", "repositories", "activity"].map((p) => call("GET", `/github/${p}`)));
    check("contributions, repositories and activity are returned", bodies.every((x) => x.status === 200), bodies.map((x) => x.status).join("/"));
    check("no response contains a token, client secret or encryption key", noSecrets(bodies.map((x) => x.body)) && noSecrets(s1.body));
    check("every repository link is https://github.com/...", (bodies[1]!.body?.repositories ?? []).every((r: { url: string }) => r.url.startsWith("https://github.com/")), `${(bodies[1]!.body?.repositories ?? []).length} repositories`);

    // disconnect
    const d = await call("DELETE", "/github/connection");
    check("disconnect succeeded", d.status === 200, `status ${d.status}`);
    check("the student is shown as disconnected again", (await call("GET", "/github/connection")).body?.status === "disconnected");
    check("the stored token and connection records are deleted", !(await db.collection("unbluff_github_credentials").doc(uid).get()).exists && !(await db.collection("unbluff_github_connections").doc(uid).get()).exists);
    check("synced GitHub data is deleted", !(await db.collection("unbluff_github_insights").doc(uid).get()).exists);
    check("reading GitHub data after disconnect is refused", (await call("GET", "/github/contributions")).status >= 400);
    check("the grant was revoked at GitHub (the service reports it)", d.body?.revoked_at_github === true, `revoked_at_github=${String(d.body?.revoked_at_github)}`);

    const log = logs.join("");
    check("backend logs contain no token, client secret, encryption key or authorisation code", !TOKEN_PATTERN.test(log) && !log.includes(gh.secret) && !log.includes(gh.key) && !log.includes(String(au?.searchParams.get("state"))));
  } finally {
    await stopBackend();
    if (idToken) {
      const del = await fetch(`${idt}/accounts:delete?key=${webKey}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken }) }).catch(() => null);
      check("the test user was deleted from Firebase Auth", Boolean(del?.ok));
    }
  }
}

main()
  .catch((e: unknown) => {
    failures += 1;
    console.log(`FAIL  unexpected error: ${String((e as Error).message).replaceAll(gh.secret, "[secret]").slice(0, 200)}`);
  })
  .finally(() => {
    console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
    process.exitCode = failures === 0 ? 0 : 1;
    setTimeout(() => process.exit(), 300);
  });
