#!/usr/bin/env node
/**
 * Scripted journey through the REAL UI against a LOCAL stack (Firebase Auth emulator + backend + Vite). Dependency-free:
 * it drives a locally installed Chrome/Edge over the DevTools protocol, like scripts/visual-qa.mjs. LOCAL development
 * only: it creates a throwaway account in the Auth emulator and never touches a real Firebase project.
 *
 *   QA_PASSWORD=<throwaway> node scripts/ui-flow-qa.mjs --base http://localhost:5174 [--out <dir>]
 *
 * Needs the backend started with code execution and EXECUTION_PROVIDER_VERIFIED=true if you want accepted
 * submissions to be counted (the flag is the operator's decision; never set it in a file). Prints PASS/FAIL lines.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i < 0 ? fallback : process.argv[i + 1];
};
const base = arg("base", "http://localhost:5174");
const out = arg("out", join(tmpdir(), "unbluff-flow"));
const password = process.env.QA_PASSWORD ?? "";
const email = process.env.QA_EMAIL ?? `qa-flow-${Date.now()}@example.test`;
mkdirSync(out, { recursive: true });
if (!password) {
  console.error("Set QA_PASSWORD (a throwaway password for the local emulator user).");
  process.exit(2);
}
const CHROME = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find((p) => existsSync(p));
if (!CHROME) {
  console.error("No Chrome or Edge found.");
  process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

async function launch() {
  const dir = mkdtempSync(join(tmpdir(), "unbluff-flow-chrome-"));
  const port = 9400 + Math.floor(Math.random() * 50);
  const proc = spawn(CHROME, [`--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, "--headless=new", "--no-first-run", "--disable-gpu", "about:blank"], { stdio: "ignore" });
  for (let i = 0; i < 60; i++) {
    try {
      const page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === "page");
      if (page) return { proc, ws: page.webSocketDebuggerUrl };
    } catch {
      /* not ready */
    }
    await sleep(250);
  }
  throw new Error("browser did not start");
}
function client(url) {
  const ws = new WebSocket(url);
  let id = 0;
  const pending = new Map();
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) {
      pending.get(d.id)(d);
      pending.delete(d.id);
    }
  };
  const ready = new Promise((r) => (ws.onopen = r));
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const i = ++id;
      pending.set(i, (d) => (d.error ? reject(new Error(d.error.message)) : resolve(d.result)));
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  return { ready, send, close: () => ws.close() };
}

let c;
const js = async (expression) => {
  const r = await c.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result?.value;
};
const go = async (path) => {
  await c.send("Page.navigate", { url: `${base}${path}` });
  await sleep(1500);
};
const bodyText = () => js("document.body.innerText");
/** Waits until the page text matches; returns the matching text or null. */
async function waitText(re, timeout = 20000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const t = await bodyText();
    if (re.test(t)) return t;
    await sleep(400);
  }
  return null;
}
const clickText = (selector, text) =>
  js(`(() => { const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find(e => e.textContent.trim() === ${JSON.stringify(text)} && !e.disabled); if (!el) return false; el.scrollIntoView(); el.click(); return true; })()`);
const setValue = (selector, value, index = 0) =>
  js(`(() => { const el = document.querySelectorAll(${JSON.stringify(selector)})[${index}]; if (!el) return false; const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
const setByLabel = (labelText, value) =>
  js(`(() => { const l = [...document.querySelectorAll('label')].find(x => x.textContent.includes(${JSON.stringify(labelText)})); const el = l && (l.control ?? l.querySelector('input,textarea,select')); if (!el) return false; const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
/** Clicks Submit and waits for the expected text. A busy or rate-limited public judge is retried a few times. */
async function submitUntil(re, tries = 3) {
  for (let i = 0; i < tries; i++) {
    await clickText("button", "Submit");
    const end = Date.now() + 100000;
    while (Date.now() < end) {
      const t = await bodyText();
      if (re.test(t)) return true;
      if (/Code execution is not available/.test(t)) break;
      await sleep(500);
    }
    await sleep(30000);
  }
  return false;
}
const setChecked = (selector, index, checked) =>
  js(`(() => { const el = document.querySelectorAll(${JSON.stringify(selector)})[${index}]; if (!el) return false; if (el.checked !== ${checked}) el.click(); return true; })()`);
const shot = async (name) => {
  const r = await c.send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(out, `${name}.png`), Buffer.from(r.data, "base64"));
};

const SOLUTION = `s = input().strip()
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
`;

async function main() {
  const { proc, ws } = await launch();
  c = client(ws);
  await c.ready;
  await c.send("Page.enable");
  await c.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  try {
    // 1. create an account through the real sign-up form (local emulator only)
    await go("/login");
    check("the sign-in page offers to create an account", Boolean(await clickText("button", "New here? Create an account")));
    await sleep(500);
    await setValue("input[type=email]", email);
    await setValue("input[type=password]", password, 0);
    await setValue("input[type=password]", password, 1);
    await clickText("button", "Create account");
    check("sign-up through the form signs the student in", Boolean(await waitText(/Prepare your claims/, 15000)));

    // 2. goals and plan
    await go("/placement");
    await waitText(/Start with your goals and availability/);
    await setChecked("input[type=checkbox]", 0, true); // Frontend Developer
    await setValue("input[type=number]", "60");
    await setByLabel("Topics you find hard", "Stack");
    await shot("flow-1-plan-form");
    await clickText("button", "Save goals and availability");
    check("saving goals generates a plan", Boolean(await waitText(/Plan version 1/, 20000)));
    const plan = (await bodyText()).match(/First measurement, [^\n]+/g) ?? [];
    check("the plan names real first-party questions", plan.length > 0, plan.slice(0, 2).join(" | "));
    await shot("flow-2-plan");

    // 3. code workspace: wrong answer, then a correct one (real Judge0)
    await go("/dsa/questions/fp_001_balanced_brackets/code");
    await waitText(/Balanced Brackets/);
    await waitText(/Python/, 8000);
    await clickText("label", "Plain text editor");
    await sleep(500);
    await setValue("textarea[aria-label^='Code editor']", 'print("YES")\n');
    check("a wrong solution is judged Wrong answer with hidden data withheld", await submitUntil(/Wrong answer[\s\S]*Hidden test data is never shown/));
    await shot("flow-3-wrong");
    await setValue("textarea[aria-label^='Code editor']", SOLUTION);
    check("the correct solution is Accepted and marks the question solved", await submitUntil(/Accepted[\s\S]*12 of 12 hidden tests passed[\s\S]*now marked solved/));
    await shot("flow-4-accepted");

    // 4. analytics and revision
    await go("/dsa/analytics");
    const an = await waitText(/SOLVED\s*\n?\s*1/, 15000);
    check("analytics count one solved question", Boolean(an));
    await go("/dsa/revision");
    check("the revision queue holds the failed-then-solved question once, scheduled", Boolean(await waitText(/Upcoming \(1\)/, 15000)));
    await shot("flow-5-revision");

    // 5. mentor
    await go("/mentor");
    await waitText(/AI Mentor/);
    await setValue("#mentor-input", "Explain the two-pointer technique with an example.");
    await clickText("button", "Send");
    check("the mentor answers and the transcript labels the roles", Boolean(await waitText(/YOU[\s\S]*MENTOR/i, 30000)));
    await shot("flow-6-mentor");

    // 6. Learn: a DSA pattern and a DBMS quiz (answers are graded on the server)
    await go("/learn/patterns/sliding-window-fixed");
    await waitText(/Spot it/);
    check("a pattern page shows its template and practice links", /Template \(Python\)/.test(await bodyText()) && /Practice/.test(await bodyText()));
    await go("/learn/dbms/joins");
    await waitText(/Check my answers/);
    await js(`document.querySelectorAll('fieldset').forEach(f => f.querySelector('input[type=radio]')?.click())`);
    await clickText("button", "Check my answers");
    check("a DBMS quiz is graded by the server", Boolean(await waitText(/\d of \d correct/, 15000)));
    await shot("flow-7-learn");

    // 7. integrated dashboard
    await go("/placement");
    const dash = await waitText(/Balanced Brackets[^\n]*done/, 20000);
    check("the dashboard shows the diagnostic completed from the verified record", Boolean(dash));
    await shot("flow-8-dashboard");
  } catch (e) {
    failures += 1;
    console.log(`FAIL  unexpected error: ${String(e.message).slice(0, 200)}`);
    await shot("flow-error").catch(() => undefined);
  } finally {
    c.close();
    proc.kill();
  }
  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
  console.log(`Screenshots: ${out}`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
