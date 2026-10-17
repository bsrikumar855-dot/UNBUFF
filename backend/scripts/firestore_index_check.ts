/**
 * Checks that Firestore can answer the query that needs the composite index.
 *
 *   npm run indexes:check -- --config-only     no network: firestore.indexes.json and firebase.json cover the required indexes
 *   FIREBASE_PROJECT_ID=<non-production-project> [FIREBASE_SERVICE_ACCOUNT_JSON=...] npm run indexes:check
 *                                              read-only query against that project (needs credentials: ADC or the service-account secret)
 *
 * It never writes, never creates indexes and never deploys. Against a real project a missing index makes the query
 * fail with FAILED_PRECONDITION. With FIRESTORE_EMULATOR_HOST set it runs against the emulator, which does not
 * enforce indexes, so that pass proves nothing about a deployed project. Exit codes: 0 pass, 1 fail, 2 configuration.
 */
import "dotenv/config";
import { Firestore } from "@google-cloud/firestore";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseServiceAccount } from "../src/config.js";
import { checkSubmissionIndex, indexFileProblems, REQUIRED_COMPOSITE_INDEXES } from "../src/code/indexes.js";

const repoRoot = resolve(import.meta.dirname, "..", "..");

function configProblems(): string[] {
  const problems: string[] = [];
  try {
    const firebase = JSON.parse(readFileSync(resolve(repoRoot, "firebase.json"), "utf8")) as { firestore?: { indexes?: string } };
    const path = firebase.firestore?.indexes;
    if (path !== "firestore.indexes.json") problems.push(`firebase.json must reference firestore.indexes.json under "firestore.indexes" (found ${JSON.stringify(path)})`);
    problems.push(...indexFileProblems(JSON.parse(readFileSync(resolve(repoRoot, path ?? "firestore.indexes.json"), "utf8"))));
  } catch (err) {
    problems.push(`could not read the index configuration: ${(err as Error).message}`);
  }
  return problems;
}

async function main(): Promise<number> {
  const problems = configProblems();
  if (problems.length > 0) {
    console.error("Index configuration problems:\n  - " + problems.join("\n  - "));
    return 1;
  }
  console.log(`Index configuration OK (${REQUIRED_COMPOSITE_INDEXES.length} composite index${REQUIRED_COMPOSITE_INDEXES.length === 1 ? "" : "es"} defined and wired into firebase.json).`);
  if (process.argv.includes("--config-only")) {
    console.log("This only checks the files. Deploying them, and confirming they are built, is an operator step (see docs/phase-5.1-operational-readiness.md).");
    return 0;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID ?? process.env.GOOGLE_CLOUD_PROJECT;
  if (!projectId) {
    console.error("Set FIREBASE_PROJECT_ID to the non-production project to check (or use --config-only).");
    return 2;
  }
  const account = process.env.FIREBASE_SERVICE_ACCOUNT_JSON ? parseServiceAccount(process.env.FIREBASE_SERVICE_ACCOUNT_JSON) : null;
  const emulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
  const db = new Firestore({
    projectId,
    ...(account ? { credentials: { client_email: account.client_email, private_key: account.private_key } } : {}),
  });
  const result = await checkSubmissionIndex(db);
  await db.terminate();
  console.log(`${result.ok ? "PASS" : "FAIL"}  ${result.detail}`);
  if (emulator) console.log("WARNING: this ran against the Firestore emulator, which does not enforce indexes. It does not show that indexes are deployed.");
  return result.ok ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(`Index check crashed: ${(err as Error).message}`);
    process.exit(1);
  },
);
