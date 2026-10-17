/**
 * Regenerates the first-party practice pack data files from scripts/lib/practicePack.ts.
 *
 *   npm run practice:build            writes data/dsa/practice-pack.json and data/code/practice-suites.json
 *   npm run practice:build -- --check exits 1 if the committed files differ from what the generator produces
 *
 * Deterministic and idempotent: running it twice leaves the files untouched. It only writes catalogue and suite
 * files. Student progress, submissions and statistics live elsewhere and are never touched.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseCatalogueFile } from "../src/dsa/catalogue.js";
import { parseSuiteFile } from "../src/code/suites.js";
import { buildPracticePack, serialize } from "./lib/practicePack.js";

const check = process.argv.includes("--check");
const { catalogue, suites } = buildPracticePack();
parseCatalogueFile(catalogue); // fail loudly if either file would be invalid
parseSuiteFile(suites);

const targets: [string, string][] = [
  [resolve("data/dsa/practice-pack.json"), serialize(catalogue)],
  [resolve("data/code/practice-suites.json"), serialize(suites)],
];

let drift = false;
for (const [path, content] of targets) {
  const current = existsSync(path) ? readFileSync(path, "utf8") : null;
  if (current === content) {
    console.log(`unchanged  ${path}`);
  } else if (check) {
    console.error(`DRIFT      ${path}`);
    drift = true;
  } else {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
    console.log(`written    ${path}`);
  }
}
if (drift) process.exit(1);
