/**
 * Production preflight: run before a deploy. Reads an env file (dotenv format), validates it exactly as the server does at
 * startup (NODE_ENV=production), and prints advisory warnings for settings that are legal but weak. It changes nothing and
 * never prints a secret value.
 *
 *   npm run preflight -- path/to/production.env
 */
import { readFileSync } from "node:fs";
import { loadConfig } from "../src/config.js";

const file = process.argv[2];
if (!file) {
  console.error("usage: npm run preflight -- <env-file>");
  process.exit(2);
}

const env: Record<string, string> = {};
for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(raw);
  if (!m || raw.trim().startsWith("#")) continue;
  env[m[1]!] = m[2]!.replace(/^(['"])(.*)\1$/, "$2");
}
env.NODE_ENV = "production";

let failed = false;
const warnings: string[] = [];
try {
  const c = loadConfig(env as NodeJS.ProcessEnv);
  if (c.EXECUTION_PROVIDER === "none") warnings.push("EXECUTION_PROVIDER=none: code Run/Submit report 'unavailable' and no DSA result counts. Set up and verify a Judge0 server to enable judging.");
  if (c.APP_CHECK !== "enforce") warnings.push(`APP_CHECK=${c.APP_CHECK}: requests are not bound to your frontend. Build the frontend with the reCAPTCHA site key, run 'monitor' for a few days, then 'enforce'.`);
  if (!c.REQUIRE_EMAIL_VERIFICATION) warnings.push("REQUIRE_EMAIL_VERIFICATION is off: anyone can use the AI features with an unverified email, which makes abuse and cost control harder.");
  if (!c.GEMINI_FALLBACK_MODEL) warnings.push("GEMINI_FALLBACK_MODEL is not set: an overloaded primary model (503/504) will make audits fail instead of switching to a fallback.");
  if (String(c.CORS_ORIGIN).includes("localhost")) warnings.push("CORS_ORIGIN contains localhost: it should list only your deployed frontend origin.");
  if (c.LLM_DAILY_BUDGET > 500) warnings.push(`LLM_DAILY_BUDGET=${c.LLM_DAILY_BUDGET} model calls per student per day is high; check it against your Gemini quota and budget.`);
  if (!c.GITHUB_CLIENT_ID) warnings.push("GitHub insights are off (no GITHUB_CLIENT_ID). Fine if you do not offer it; the GitHub page will say it is not set up.");
  console.log("✔ configuration is valid for production");
} catch (e) {
  failed = true;
  console.error("✘ configuration is NOT valid for production:\n" + (e instanceof Error ? e.message : String(e)).split("\n").map((l) => "  " + l).join("\n"));
}
for (const w of warnings) console.warn("⚠ " + w);
if (!failed && warnings.length === 0) console.log("No warnings.");
console.log("\nStill yours to check (this script cannot): credentials rotated, privacy contact set (VITE_CONTACT_EMAIL), Firestore backups on, uptime check on /api/ready, legal review done.");
process.exit(failed ? 1 : 0);
