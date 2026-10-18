/**
 * A small LIVE check of Freehire's public jobs API against the assumptions the Career feature relies on.
 * Operator tool: it makes about eight bounded read-only requests to https://freehire.me/api/v1 (no key, no login),
 * identifies itself in the User-Agent, prints only PASS/FAIL lines and counts, and never prints a job description.
 *
 *   npm run career:smoke
 *
 * Exit 0 only if every check passed. Exit 2 if Freehire could not be reached at all (nothing was verified).
 * Automated tests mock Freehire; this script is how you confirm the live API still behaves as documented.
 */
import { FREEHIRE_API, FreehireClient, FreehireError } from "../src/careers/freehire.js";
import { normalizeJob } from "../src/careers/normalize.js";
import { SKILL_VOCABULARY } from "../src/careers/resumeSkills.js";

const client = new FreehireClient({ timeoutMs: 15_000 });
let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

async function raw(path: string): Promise<{ status: number; body: unknown; remaining: string | null }> {
  const res = await fetch(`${FREEHIRE_API}${path}`, { headers: { Accept: "application/json", "User-Agent": "unbluff/career-smoke (+https://github.com/bsrikumar855-dot/UNBUFF)" }, signal: AbortSignal.timeout(15_000), redirect: "error" });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* not JSON */
  }
  return { status: res.status, body, remaining: res.headers.get("x-ratelimit-remaining") };
}

async function main() {
  let first;
  try {
    first = await client.search({ employment_type: ["internship"], is_tech: "tech", reality: ["fresh"], limit: 5 });
  } catch (e) {
    console.log(`BLOCKED: Freehire could not be reached (${e instanceof FreehireError ? e.kind : "error"}). Nothing was verified.`);
    process.exit(2);
  }
  check("internship search returns postings and a numeric total", first.jobs.length > 0 && typeof first.meta.total === "number", `${first.jobs.length} rows, total ${first.meta.total}`);
  check("a clean request has no ignored_params", first.meta.ignored_params.length === 0);
  check("rate-limit headers are present", first.rate.limit !== null && first.rate.remaining !== null, `limit ${first.rate.limit}, remaining ${first.rate.remaining}`);

  const normalized = first.jobs.map((j) => normalizeJob(j));
  check("every posting normalizes with a slug, title and https-or-null apply link", normalized.every((j) => j.slug && j.title && (j.apply_url === null || j.apply_url.startsWith("https://"))));
  check("every internship result reports employment_type=internship", normalized.every((j) => j.employment_type === "internship" || j.employment_type === null));
  check("no description is returned as markup", normalized.every((j) => !/[<>]/.test(`${j.preview ?? ""}${j.summary ?? ""}`)));

  const [asIntern, asInternFullTime] = await Promise.all([client.search({ seniority: ["intern"], is_tech: "tech", limit: 1 }), client.search({ seniority: ["intern"], employment_type: ["full_time"], is_tech: "tech", limit: 1 })]);
  check("seniority=intern and employment_type=internship are different sets (neither implies the other)", (asInternFullTime.meta.total ?? 0) > 0, `${asInternFullTime.meta.total} full-time postings are labelled intern among ${asIntern.meta.total}`);

  const misspelled = await raw("/jobs/search?limit=1&country=in");
  const ignored = (misspelled.body as { meta?: { ignored_params?: { param: string }[] } } | null)?.meta?.ignored_params ?? [];
  check("an unknown parameter is reported in meta.ignored_params", misspelled.status === 200 && ignored.some((p) => p.param === "country"));

  const deep = await raw("/jobs/search?limit=10&offset=10000");
  check("paging past offset+limit 10000 is a 400", deep.status === 400, `status ${deep.status}`);

  if (first.jobs[0]) {
    const one = await client.getJob(first.jobs[0].public_slug);
    check("a posting can be read by its slug", one.job.public_slug === first.jobs[0].public_slug);
  }
  const facets = await client.facets({ employment_type: ["internship"], is_tech: "tech" }, ["category", "seniority", "work_mode"]);
  check("facets return live counts", (facets.facets.category?.length ?? 0) > 0 && typeof facets.total === "number", `${facets.facets.category?.length ?? 0} categories`);

  const skillFacet = await client.facets({}, ["skills"]);
  const live = new Set((skillFacet.facets.skills ?? []).map((x) => x.value));
  const missing = SKILL_VOCABULARY.filter((v) => !live.has(v.slug)).map((v) => v.slug);
  check("every resume-skill slug is a skill Freehire knows", missing.length === 0 && live.size > 0, missing.length ? `missing: ${missing.join(", ")}` : `${SKILL_VOCABULARY.length} of ${live.size} live skills`);

  console.log(failures === 0 ? "\nRESULT: PASS (Freehire answered as the Career feature expects)" : `\nRESULT: FAIL (${failures} check${failures === 1 ? "" : "s"} failed)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e: unknown) => {
  console.log(`FAIL  unexpected error: ${(e as Error).message}`);
  process.exit(1);
});
