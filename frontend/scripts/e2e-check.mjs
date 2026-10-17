// End-to-end check against a running backend, using the exact payloads the UI sends.
//   API=http://localhost:8090 node scripts/e2e-check.mjs
// prepare-mode extract → confirm → claim 1 "I don't know" → fix task → 2 claims with long answers
// → retest due (progress.next_mode) → retest passes → report shows higher readiness + interleaved_claims >= 2.

const API = `${(process.env.API ?? "http://localhost:8090").replace(/\/+$/, "")}/api`;
const LONG =
  "I personally built the cart slice with Redux Toolkit; each dispatch returns a new state object and React re-renders and diffs the tree.";
const RESUME = [
  "Built a React e-commerce dashboard with Redux",
  "Implemented REST API integration with Axios and JWT auth",
  "Used Git and GitHub in a 4-member team",
].join("\n");

let failures = 0;
const step = (n, msg) => console.log(`[${n}] ${msg}`);
const check = (ok, msg) => {
  console.log(`    ${ok ? "PASS" : "FAIL"}  ${msg}`);
  if (!ok) failures++;
};

async function call(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(json)}`);
  return json;
}

/** Answer until the claim is done, like the Workspace does. */
async function runClaim(sid, claimId, answer, mode) {
  let t = await call("POST", "/interrogate", { session_id: sid, claim_id: claimId, ...(mode ? { mode } : {}) });
  while (t.turn !== "done") {
    t = await call("POST", "/interrogate", { session_id: sid, claim_id: claimId, answer });
  }
  return t;
}

const health = await call("GET", "/health");
step(0, `health: ${JSON.stringify(health)}`);

const ex = await call("POST", "/claims/extract", { role_id: "frontend_developer", mode: "prepare", resume_text: RESUME });
step(1, `extract (mode "prepare"): session ${ex.session_id}, ${ex.claims.length} claims, mode=${ex.mode}`);
check(ex.mode === "prepare" && ex.claims.length >= 3, "session is in prepare mode with 3 claims");

const conf = await call("POST", "/claims/confirm", {
  session_id: ex.session_id,
  claims: ex.claims.map(({ id, text, resume_line, skill_id }) => ({ id, text, resume_line, skill_id })),
});
const sid = conf.session_id;
const [c1, c2, c3] = conf.claims.map((c) => c.id);
step(2, `confirm: ${conf.claims.length} claims, next=${conf.progress.next_claim_id}/${conf.progress.next_mode}`);

const t1 = await runClaim(sid, c1, "I don't know");
step(3, `${c1} answered "I don't know": verdict=${t1.claim.verdict} teach_now=${t1.teach_now} root_cause=${t1.claim.root_cause}`);
check(t1.claim.verdict === "honest_gap" && t1.teach_now === true, "honest gap and teach_now in prepare mode");

const readinessBefore = (await call("GET", `/report/${sid}`)).readiness;
const fix = await call("POST", "/fix-task", { session_id: sid, claim_id: c1 });
step(4, `fix task: root_cause=${fix.root_cause}; exercise="${fix.exercise.slice(0, 60)}…"`);
try {
  await call("POST", "/interrogate", { session_id: sid, claim_id: c1, mode: "retest" });
  check(false, "retest should be locked right after the fix task");
} catch (err) {
  check(String(err).includes("Retest unlocks after 2 more concepts"), `retest locked: ${String(err).split(" → ")[1]?.slice(0, 90)}`);
}

const t2 = await runClaim(sid, c2, LONG);
step(5, `${c2} long answers: verdict=${t2.claim.verdict}, next=${t2.progress.next_claim_id}/${t2.progress.next_mode}`);
const t3 = await runClaim(sid, c3, LONG);
step(6, `${c3} long answers: verdict=${t3.claim.verdict}, next=${t3.progress.next_claim_id}/${t3.progress.next_mode}`);
check(t3.progress.next_mode === "retest" && t3.progress.next_claim_id === c1, "retest is due via progress.next_mode");

const r = await runClaim(sid, c1, LONG, "retest");
step(7, `retest ${c1}: verdict=${r.claim.verdict} retest=${JSON.stringify(r.claim.retest)}`);
check(r.claim.retest?.passed === true && r.claim.retest.interleaved_claims >= 2, "retest passed with interleaved_claims >= 2");

const report = await call("GET", `/report/${sid}`);
const rc = report.claims.find((c) => c.id === c1);
step(8, `report: readiness ${readinessBefore} → ${report.readiness}, ${c1} retest_status=${rc.retest_status}, interleaved=${rc.retest?.interleaved_claims}`);
check(report.readiness > readinessBefore, "readiness increased");
check(rc.retest_status === "done" && rc.retest.interleaved_claims >= 2, "report shows the verified retest");

console.log(failures === 0 ? "\nE2E OK" : `\nE2E FAILED (${failures})`);
process.exit(failures === 0 ? 0 : 1);
