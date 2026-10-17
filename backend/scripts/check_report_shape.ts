/**
 * Fetches a real report and checks it against the strict zod mirror of the contract's Report type.
 *   npx tsx scripts/check_report_shape.ts <session_id> [api_base]
 */
import { ReportSchema } from "../tests/fixtures/contractSchemas.js";

const [sessionId, base = "http://127.0.0.1:8090"] = process.argv.slice(2);
if (!sessionId) {
  console.error("usage: check_report_shape.ts <session_id> [api_base]");
  process.exit(2);
}

const typeOf = (v: unknown): string =>
  v === null ? "null" : Array.isArray(v) ? `array(${v.length})${v.length ? ` of ${typeOf(v[0])}` : ""}` : typeof v;

const res = await fetch(`${base}/api/report/${sessionId}`);
const body = (await res.json()) as Record<string, unknown>;
console.log(`GET /api/report/${sessionId} → HTTP ${res.status}\n`);
console.log("field                    runtime type");
for (const [k, v] of Object.entries(body)) console.log(`${k.padEnd(24)} ${typeOf(v)}`);

const claims = (body.claims as Record<string, unknown>[]) ?? [];
console.log(`\nclaims[0] keys: ${Object.keys(claims[0] ?? {}).join(", ")}`);
const skills = (body.skills as Record<string, unknown>[]) ?? [];
console.log(`skills[0] keys: ${Object.keys(skills[0] ?? {}).join(", ")}`);

const parsed = ReportSchema.safeParse(body);
if (parsed.success) {
  console.log("\nSTRICT CONTRACT CHECK: PASS (no missing fields, no extra fields, all types/enums valid)");
} else {
  console.log("\nSTRICT CONTRACT CHECK: FAIL");
  for (const issue of parsed.error.issues) console.log(`  ${issue.path.join(".")}: ${issue.message}`);
  process.exit(1);
}
