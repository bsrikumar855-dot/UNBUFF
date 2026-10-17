/**
 * Validates a DSA catalogue file (schema, duplicates, dangling associations) without loading it anywhere.
 *   npm run dsa:validate [-- path/to/catalogue.json]
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseCatalogueFile } from "../src/dsa/catalogue.js";

const path = resolve(process.argv[2] ?? "data/dsa/catalogue.json");
try {
  const file = parseCatalogueFile(JSON.parse(readFileSync(path, "utf8")));
  console.log(
    `OK ${path}\n  source: ${file.source.name} (${file.source.license_status}), imported ${file.source.imported_at}\n` +
      `  ${file.companies.length} companies, ${file.questions.length} questions, ${file.associations.length} associations`,
  );
  if (file.source.license_status === "development_fixture") console.log("  NOTE: development fixture, not real company data.");
} catch (err) {
  console.error(`INVALID ${path}\n  ${(err as Error).message}`);
  process.exit(1);
}
