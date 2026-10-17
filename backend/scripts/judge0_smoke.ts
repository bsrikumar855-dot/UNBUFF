/**
 * Smoke test for a real Judge0 service. Reads ONLY the environment (never a URL from a flag or a request):
 *
 *   EXECUTION_PROVIDER=judge0 JUDGE0_URL=https://<your-judge0-host> JUDGE0_AUTH_TOKEN=<token> npm run smoke:judge0
 *
 * Optional: JUDGE0_AUTH_HEADER (default X-Auth-Token), --languages python,cpp (those become required),
 * --expect-ids python=100,cpp=105 (pin the provider ids you expect), --json, --timeout 120 (seconds).
 *
 * It looks up the service's languages, runs `2 + 3` in each offered language inside the service's sandbox and checks
 * for the output 5, and (for C++ and Java) checks that broken source is reported as a compilation error. The token is
 * sent only as a header and never printed. Exit codes: 0 all required checks passed, 1 a check failed, 2 configuration
 * problem. A pass does NOT set EXECUTION_PROVIDER_VERIFIED; only the operator may, after confirming the endpoint is
 * the intended deployment (see docs/phase-5.1-operational-readiness.md).
 */
import "dotenv/config";
import { Judge0Provider } from "../src/code/judge0.js";
import { ALL_LANGUAGES, parseExpectedIds, redactor, runSmoke, smokeConfigProblems } from "../src/code/smoke.js";
import type { CodeLanguageId } from "../src/types.js";

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<number> {
  const json = process.argv.includes("--json");
  const problems = smokeConfigProblems(process.env);
  let expectedIds: ReturnType<typeof parseExpectedIds> = {};
  try {
    expectedIds = parseExpectedIds(flag("expect-ids"));
  } catch (err) {
    problems.push((err as Error).message);
  }
  const requested = flag("languages")?.split(",").map((s) => s.trim()).filter(Boolean);
  if (requested?.some((l) => !ALL_LANGUAGES.includes(l as CodeLanguageId))) problems.push(`--languages must be a list of: ${ALL_LANGUAGES.join(", ")}`);
  if (problems.length > 0) {
    console.error("Smoke test not run. Fix the configuration:\n  - " + problems.join("\n  - "));
    console.error("\nExample:\n  EXECUTION_PROVIDER=judge0 JUDGE0_URL=https://<your-judge0-host> JUDGE0_AUTH_TOKEN=<token> npm run smoke:judge0");
    return 2;
  }

  const token = process.env.JUDGE0_AUTH_TOKEN;
  const redact = redactor([token, process.env.JUDGE0_URL]);
  const url = new URL(process.env.JUDGE0_URL as string);
  const provider = new Judge0Provider({
    baseUrl: process.env.JUDGE0_URL as string,
    authToken: token,
    authHeader: process.env.JUDGE0_AUTH_HEADER,
    executionDeadlineMs: 30_000,
    requestTimeoutMs: 10_000,
  });

  if (!json) {
    console.log(`Service host: ${url.host} (${url.protocol.replace(":", "")})`);
    console.log(`Credential:   ${token ? `sent in the ${process.env.JUDGE0_AUTH_HEADER ?? "X-Auth-Token"} header (value hidden)` : "none configured (works only if the service has authentication disabled)"}`);
  }

  const report = await runSmoke(provider, {
    languages: requested as CodeLanguageId[] | undefined,
    expectedIds,
    timeoutMs: Number(flag("timeout") ?? 180) * 1000,
    redact,
  });

  if (json) {
    console.log(JSON.stringify({ ...report, host: url.host }, null, 2));
  } else {
    for (const c of report.checks) console.log(`${c.ok ? "PASS" : c.required ? "FAIL" : "info"}  ${c.name}: ${c.detail}`);
    console.log(`\nRESULT: ${report.ok ? "PASS" : "FAIL"}`);
    if (report.ok) {
      console.log("The service answered the Judge0 protocol and executed the programs above.");
      console.log("EXECUTION_PROVIDER_VERIFIED was NOT changed. Confirm through your hosting configuration that this endpoint is the intended deployment, then set it yourself.");
    }
  }
  return report.ok ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(`Smoke test crashed: ${(err as Error).message}`);
    process.exit(1);
  },
);
