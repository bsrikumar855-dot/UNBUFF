#!/usr/bin/env node
/**
 * Visual QA for the frontend, with no dependencies: drives a locally installed Chrome/Edge over the DevTools protocol.
 * For LOCAL development only: it signs in to the Firebase Auth EMULATOR with a throwaway user, never a real project.
 *
 *   QA_PASSWORD=<throwaway> node scripts/visual-qa.mjs --base http://localhost:5174 --out <dir> \
 *     --api http://localhost:8096 --emulator http://127.0.0.1:9099 \
 *     --routes /,/placement,/dsa --widths 1440,1024,768,390,320 [--auth] [--seed]
 *
 * For each route and width it saves a screenshot and reports: horizontal overflow of the page, console errors,
 * and images/controls without an accessible name. --seed creates synthetic data through the real API (profile, plan,
 * a mentor exchange, a bookmark). Nothing is written outside --out except the user's own emulator records.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i < 0
    ? fallback
    : process.argv[i + 1]?.startsWith("--") || process.argv[i + 1] === undefined
      ? true
      : process.argv[i + 1];
};
const base = arg("base", "http://localhost:5174");
const api = arg("api", "http://localhost:8096");
const emulator = arg("emulator", "http://127.0.0.1:9099");
const out = arg("out", join(tmpdir(), "unbluff-qa"));
const routes = String(arg("routes", "/")).split(",");
const widths = String(arg("widths", "1440,390")).split(",").map(Number);
const wantAuth = process.argv.includes("--auth");
const wantSeed = process.argv.includes("--seed");
const fullCap = Number(arg("cap", 3200));
// JS evaluated in the page after it loads and before the screenshot (for example, click Run), then wait a few seconds.
const afterJs = arg("after", "");
// Path to axe-core's axe.min.js (kept outside the repository): runs a WCAG 2.1 A/AA audit on every page.
const axeFile = arg("axe", "");
const reducedMotion = process.argv.includes("--reduced-motion");
// A JS file registered to run before the page scripts on every navigation (QA-only stubs, for example).
const injectFile = arg("inject", "");
const afterWait = Number(arg("after-wait", 7000));
const password = process.env.QA_PASSWORD ?? "";
const email = process.env.QA_EMAIL ?? "qa-visual@example.test";
mkdirSync(out, { recursive: true });

const CHROME = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
].find((p) => existsSync(p));

if (wantAuth && !password) {
  console.error("Set QA_PASSWORD (a throwaway password for the local emulator user).");
  process.exit(2);
}
if (!CHROME) {
  console.error("No Chrome or Edge found.");
  process.exit(2);
}

// ---- emulator user and seed data (local emulator and the real API only) ----
async function emulatorToken() {
  const key = "fake-key";
  const body = JSON.stringify({ email, password, returnSecureToken: true });
  const headers = { "Content-Type": "application/json" };
  let r = await fetch(
    `${emulator}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=${key}`,
    { method: "POST", headers, body }
  );
  if (!r.ok)
    r = await fetch(
      `${emulator}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${key}`,
      { method: "POST", headers, body }
    );
  const j = await r.json();
  if (!j.idToken) throw new Error("emulator sign-in failed");
  return j.idToken;
}
async function call(token, method, path, data) {
  const r = await fetch(`${api}/api${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: data ? JSON.stringify(data) : undefined,
  });
  return { status: r.status, body: await r.json().catch(() => null) };
}
async function seed() {
  const t = await emulatorToken();
  const profile = {
    role_ids: ["frontend_developer"],
    target_companies: [],
    placement_date: "2027-03-15",
    available_weekdays: [1, 2, 3, 4, 5],
    daily_minutes: 60,
    preferred_language: "python",
    experience_level: "intermediate",
    strengths: [],
    weak_areas: ["Stack"],
    priorities: ["dsa", "interview", "graphql"],
  };
  console.log(
    "seed profile",
    (await call(t, "PUT", "/placement/profile", profile)).status
  );
  console.log(
    "seed plan",
    (await call(t, "POST", "/placement/plan/generate", {})).status
  );
  console.log(
    "seed memory",
    (
      await call(t, "POST", "/mentor/memories", {
        type: "learning",
        content: "Finds stacks difficult (synthetic QA data)",
        topic: "stacks",
        signal: "difficult",
      })
    ).status
  );
  console.log(
    "seed lab",
    (
      await call(t, "POST", "/graphql-lab/exercises/m1-e1/submit", {
        client_attempt_id: "attempt_qa_seed_01",
        answer: ["b"],
      })
    ).status
  );
}

// ---- minimal CDP client ----
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function launch() {
  const dir = mkdtempSync(join(tmpdir(), "unbluff-chrome-"));
  const port = 9340 + Math.floor(Math.random() * 50);
  const proc = spawn(
    CHROME,
    [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${dir}`,
      "--headless=new",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-gpu",
      "--hide-scrollbars=false",
      "about:blank",
    ],
    { stdio: "ignore" }
  );
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = list.find((t) => t.type === "page");
      if (page) return { proc, ws: page.webSocketDebuggerUrl };
    } catch {
      /* not ready */
    }
    await sleep(250);
  }
  throw new Error("browser did not start");
}
function client(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const events = [];
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) {
      pending.get(d.id)(d);
      pending.delete(d.id);
    } else if (d.method) events.push(d);
  };
  const ready = new Promise((r) => (ws.onopen = r));
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const i = ++id;
      pending.set(i, (d) =>
        d.error ? reject(new Error(d.error.message)) : resolve(d.result)
      );
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  return { ready, send, events, close: () => ws.close() };
}

const evalJs = async (c, expression) => {
  const r = await c.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (r.exceptionDetails) console.error("page script error:", (r.exceptionDetails.exception?.description ?? r.exceptionDetails.text ?? "").slice(0, 300));
  return r.result?.value;
};
const goto = async (c, url, settle = 1500) => {
  await c.send("Page.navigate", { url });
  await sleep(settle);
};
const setViewport = (c, width, height) =>
  c.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 600,
  });

const CHECK = `(() => {
  const el = document.scrollingElement;
  const over = el.scrollWidth - el.clientWidth;
  const wide = [...document.querySelectorAll('body *')].filter(e => { const r = e.getBoundingClientRect(); return r.right > innerWidth + 1 && r.width > 0 && getComputedStyle(e).position !== 'fixed' && !e.closest('.scroll-x, pre, code, [class*="overflow"]'); }).slice(0, 4).map(e => e.tagName.toLowerCase() + '.' + String(e.className).slice(0, 50));
  const nameless = [...document.querySelectorAll('button, a[href], input, select, textarea')].filter(e => !e.closest('[aria-hidden=true]') && !(e.getAttribute('aria-label') || e.getAttribute('aria-labelledby') || e.textContent.trim() || (e.labels && e.labels.length) || e.getAttribute('title') || e.getAttribute('placeholder'))).slice(0, 5).map(e => e.outerHTML.slice(0, 80));
  const h1 = document.querySelectorAll('h1').length;
  const small = [...document.querySelectorAll('button, a[href], [role=button]')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.height < 24); }).length;
  return { overflowPx: over, wide, nameless, h1, tinyTargets: small, title: document.title, path: location.pathname };
})()`;

async function signIn(c) {
  await goto(c, `${base}/login`, 1500);
  const ok = await evalJs(
    c,
    `(async () => {
      const set = (el, v) => { const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
      const em = document.querySelector('input[type=email]'); const pw = document.querySelector('input[type=password]');
      if (!em || !pw) return false;
      set(em, ${JSON.stringify(email)}); set(pw, ${JSON.stringify(password)});
      [...document.querySelectorAll('button')].find(b => b.type === 'submit')?.click();
      await new Promise(r => setTimeout(r, 2500));
      return location.pathname !== '/login';
    })()`
  );
  if (!ok) throw new Error("sign-in through the UI did not complete");
}

async function main() {
  if (wantAuth && wantSeed) await seed();
  const { proc, ws } = await launch();
  const c = client(ws);
  await c.ready;
  await c.send("Page.enable");
  await c.send("Runtime.enable");
  if (reducedMotion) await c.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  if (injectFile) await c.send("Page.addScriptToEvaluateOnNewDocument", { source: readFileSync(injectFile, "utf8") });
  const results = [];
  try {
    if (wantAuth) await signIn(c);
    for (const route of routes) {
      for (const w of widths) {
        const h = w >= 1024 ? 900 : 844;
        await setViewport(c, w, h);
        c.events.length = 0;
        await goto(c, `${base}${route}`, 1800);
        if (afterJs) {
          await evalJs(c, afterJs);
          await sleep(afterWait);
        }
        await sleep(400);
        const info = await evalJs(c, CHECK);
        let axeViolations = [];
        if (axeFile) {
          await evalJs(c, readFileSync(axeFile, "utf8"));
          axeViolations = (await evalJs(
            c,
            `axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } }).then(r => r.violations.map(v => ({ id: v.id, impact: v.impact, count: v.nodes.length, sample: v.nodes[0].target.join(" ").slice(0, 90) })))`
          )) ?? [];
        }
        const errors = c.events
          .filter(
            (e) =>
              e.method === "Runtime.exceptionThrown" ||
              (e.method === "Runtime.consoleAPICalled" && e.params.type === "error")
          )
          .map((e) => JSON.stringify(e.params).slice(0, 160));
        const name = `${route === "/" ? "home" : route.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "")}-${w}.png`;
        // Scroll through the page once so scroll-triggered reveals run, then capture it whole (capped to keep files small).
        await evalJs(
          c,
          `(async () => { const h = document.scrollingElement.scrollHeight; for (let y = 0; y < h; y += innerHeight * 0.7) { scrollTo(0, y); await new Promise(r => setTimeout(r, 90)); } scrollTo(0, 0); await new Promise(r => setTimeout(r, 450)); })()`
        );
        const height = Math.min(
          await evalJs(c, "document.scrollingElement.scrollHeight"),
          fullCap
        );
        const shot = await c.send("Page.captureScreenshot", {
          format: "png",
          captureBeyondViewport: true,
          clip: { x: 0, y: 0, width: w, height, scale: 1 },
        });
        writeFileSync(join(out, name), Buffer.from(shot.data, "base64"));
        results.push({ route, width: w, file: name, ...info, errors, axe: axeViolations });
        for (const v of axeViolations) console.log(`   AXE ${v.impact} ${v.id} x${v.count}: ${v.sample}`);
        const flags = [
          info.overflowPx > 1
            ? `OVERFLOW ${info.overflowPx}px ${info.wide.join(" ")}`
            : "",
          info.nameless.length ? `NAMELESS ${info.nameless.length}` : "",
          info.h1 !== 1 ? `h1=${info.h1}` : "",
          errors.length ? `ERRORS ${errors.length}` : "",
        ]
          .filter(Boolean)
          .join(" | ");
        console.log(
          `${route.padEnd(34)} ${String(w).padStart(4)}  ${info.path}  ${flags || "ok"}`
        );
      }
    }
  } finally {
    c.close();
    proc.kill();
  }
  writeFileSync(join(out, "results.json"), JSON.stringify(results, null, 2));
  console.log(`\nScreenshots and results.json are in ${out}`);
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
