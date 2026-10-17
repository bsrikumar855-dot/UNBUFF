/**
 * Imports an explicitly approved CSV/JSON file into the DSA catalogue file.
 *
 *   npm run dsa:import -- --input path/to/approved.csv \
 *     --source-name "Name of the data provider" \
 *     --license-status permission_granted \
 *     --license-note "Written permission from X on 2026-01-01, ref #123" \
 *     [--source-url https://...] [--source-updated-at 2026-01-01] \
 *     [--allowed-hosts leetcode.com,example.org] [--out data/dsa/catalogue.json] \
 *     [--replace] [--dry-run]
 *
 * Input columns: company, title, url, difficulty (easy|medium|hard), topics (separated by ; | or ,).
 * The tool never downloads anything. It refuses input without a licence/permission statement, rejects
 * malformed rows (all-or-nothing), and is idempotent: re-running the same import leaves the file untouched.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { parseCatalogueFile, type CatalogueFile } from "../src/dsa/catalogue.js";
import {
  buildCatalogue,
  ImportError,
  IMPORT_LICENSE_STATUSES,
  parseRecords,
  serializeCatalogue,
  type ImportLicenseStatus,
} from "../src/dsa/importer.js";

function parseArgs(argv: string[]): Map<string, string | true> {
  const args = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (!a.startsWith("--")) throw new Error(`unexpected argument "${a}"`);
    const key = a.slice(2);
    const next = argv[i + 1];
    if (key === "replace" || key === "dry-run") args.set(key, true);
    else if (next === undefined || next.startsWith("--")) throw new Error(`--${key} needs a value`);
    else {
      args.set(key, next);
      i++;
    }
  }
  return args;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const str = (k: string) => (typeof args.get(k) === "string" ? (args.get(k) as string) : undefined);
  const required = (k: string) => {
    const v = str(k);
    if (!v) throw new Error(`--${k} is required`);
    return v;
  };

  const input = resolve(required("input"));
  const out = resolve(str("out") ?? "data/dsa/catalogue.json");
  const status = required("license-status") as ImportLicenseStatus;
  if (!IMPORT_LICENSE_STATUSES.includes(status)) throw new Error(`--license-status must be one of ${IMPORT_LICENSE_STATUSES.join(", ")}`);
  const ext = extname(input).toLowerCase();
  const format = ext === ".csv" ? "csv" : ext === ".json" ? "json" : null;
  if (!format) throw new Error("input must be a .csv or .json file");

  const existing: CatalogueFile | null = existsSync(out) ? parseCatalogueFile(JSON.parse(readFileSync(out, "utf8"))) : null;
  const { file, report } = buildCatalogue(parseRecords(readFileSync(input, "utf8"), format), existing, {
    source: {
      name: required("source-name"),
      license_status: status,
      license_note: required("license-note"),
      url: str("source-url") ?? null,
      source_updated_at: str("source-updated-at") ?? null,
    },
    allowedHosts: str("allowed-hosts")?.split(",").map((h) => h.trim().toLowerCase()).filter(Boolean),
    replace: args.get("replace") === true,
  });

  console.log(
    `${report.rows} rows -> ${report.companies} companies, ${report.questions} questions, ${report.associations} associations ` +
      `(${report.duplicate_rows_collapsed} duplicate rows collapsed)`,
  );
  if (!report.changed) {
    console.log("No changes: the catalogue file is already up to date.");
    return;
  }
  if (args.get("dry-run") === true) {
    console.log("Dry run: nothing written.");
    return;
  }
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, serializeCatalogue(file));
  console.log(`Wrote ${out}. Student progress is stored separately and was not touched.`);
}

try {
  main();
} catch (err) {
  console.error(err instanceof ImportError ? err.message : `Error: ${(err as Error).message}`);
  process.exit(1);
}
