// Minimal jq fallback for smoke.sh when jq isn't installed.
// Supports `.` and dotted/indexed paths like `.claims[0].id`, `.claims | length`, `.progress`.
// Usage: echo '{"a":[{"b":1}]}' | node scripts/jq-lite.mjs '.a[0].b'
import { readFileSync } from "node:fs";

const expr = (process.argv[2] ?? ".").trim();
const input = JSON.parse(readFileSync(0, "utf8"));

const [path, pipe] = expr.split("|").map((s) => s.trim());
let value = input;
for (const token of path.match(/[^.[\]]+/g) ?? []) {
  value = value?.[/^\d+$/.test(token) ? Number(token) : token];
}
if (pipe === "length") value = Array.isArray(value) || typeof value === "string" ? value.length : Object.keys(value ?? {}).length;

process.stdout.write(typeof value === "string" ? `${value}\n` : `${JSON.stringify(value, null, 2)}\n`);
