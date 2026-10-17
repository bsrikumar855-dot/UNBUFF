/**
 * Validates and merges authorized hidden-test suites into the server-side suites file.
 *
 *   npm run code:import-suite -- --input approved-suites.json [--out data/code/suites.json] \
 *     [--catalogue data/dsa/catalogue.json] [--dry-run]
 *
 * The input is JSON: { "schema_version": 1, "suites": [ ... ] } (see src/code/suites.ts). Each suite states its
 * own licence/permission. The output file is server-only: never serve it, bundle it into the frontend or commit
 * real hidden tests to a public repository.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Catalogue } from "../src/dsa/catalogue.js";
import { mergeSuites, serializeSuites } from "../src/code/suiteImport.js";
import { parseSuiteFile } from "../src/code/suites.js";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

try {
  const input = arg("input");
  if (!input) throw new Error("--input is required");
  const out = resolve(arg("out") ?? "data/code/suites.json");
  const catalogue = arg("catalogue") ? Catalogue.fromPath(resolve(arg("catalogue")!)) : undefined;
  const existing = existsSync(out) ? parseSuiteFile(JSON.parse(readFileSync(out, "utf8"))) : null;
  const { file, report } = mergeSuites(existing, JSON.parse(readFileSync(resolve(input), "utf8")), { catalogue });
  console.log(`added ${report.added.length}, updated ${report.updated.length}, unchanged ${report.unchanged.length}`);
  if (!report.changed) console.log("No changes: the suites file is already up to date.");
  else if (process.argv.includes("--dry-run")) console.log("Dry run: nothing written.");
  else {
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, serializeSuites(file));
    console.log(`Wrote ${out} (server-only; do not serve or publish it).`);
  }
} catch (err) {
  console.error(`Error: ${(err as Error).message}`);
  process.exit(1);
}
