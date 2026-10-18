import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { testApp } from "./app.js";

/**
 * A systematic authentication audit. The routes are read from the route source files (so a route added later is audited
 * automatically). Every route must refuse a request without a valid token, unless it is on the short, explicit list of
 * routes that are public by design. An unlisted route that answers without a token fails this test.
 */

const dir = join(import.meta.dirname, "..", "..", "src", "routes");

interface Route {
  method: "get" | "post" | "put" | "patch" | "delete";
  path: string;
  file: string;
}

function routes(): Route[] {
  const out: Route[] = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".ts"))) {
    const src = readFileSync(join(dir, f), "utf8");
    for (const m of src.matchAll(/(?:router|Router\(\))\.(get|post|put|patch|delete)\(\s*"([^"]+)"/g)) out.push({ method: m[1] as Route["method"], path: m[2]!, file: f });
  }
  return out;
}

/** Public by design: no student data, or a browser redirect that carries no token (GitHub's callback). */
const PUBLIC = new Set([
  "get /health",
  "get /roles",
  "get /roles/:roleId",
  "get /demo/report",
  "get /companies",
  "get /companies/:companyId",
  "get /companies/:companyId/questions",
  "get /questions",
  "get /questions/:questionId",
  "get /code/languages",
  "get /code/exercises/:questionId",
  "get /github/oauth/callback",
]);

const concrete = (path: string) => path.replace(/:[A-Za-z]+/g, (p) => (p === ":questionId" ? "q_fixture_01" : p === ":taskId" ? `t_${"a".repeat(24)}` : "x"));

describe("every route requires a verified student unless it is explicitly public", () => {
  const all = routes();
  const app = testApp({ autoAuth: false });

  it("finds the routes (guards against the audit silently checking nothing)", () => {
    expect(all.length).toBeGreaterThanOrEqual(72);
    for (const f of ["mentor.ts", "github.ts", "graphqlLab.ts", "placement.ts", "code.ts", "analytics.ts", "sessions.ts", "career.ts"]) expect(all.some((r) => r.file === f), f).toBe(true);
  });

  it("refuses a missing, malformed or invalid token on every private route, with no detail", async () => {
    const private_ = all.filter((r) => !PUBLIC.has(`${r.method} ${r.path}`));
    expect(private_.length).toBeGreaterThanOrEqual(60);
    for (const r of private_) {
      for (const header of [undefined, "Bearer", "Bearer not-a-valid-token", "Basic dGVzdDp0ZXN0", "Bearer expired"]) {
        const req = request(app)[r.method](`/api${concrete(r.path)}`);
        const res = await (header ? req.set("Authorization", header) : req).send({});
        expect(res.status, `${r.method.toUpperCase()} ${r.path} with ${header ?? "no header"}`).toBe(401);
        expect(res.body.error?.code).toBe("UNAUTHENTICATED");
        expect(JSON.stringify(res.body)).not.toMatch(/stack|at .*\.ts|firebase|token/i);
      }
    }
  }, 60_000);

  it("the public list is accurate: each listed route really answers without a token, and none is missing from the code", async () => {
    const known = new Set(all.map((r) => `${r.method} ${r.path}`));
    for (const p of PUBLIC) expect(known.has(p), `${p} is listed as public but no longer exists`).toBe(true);
    for (const p of PUBLIC) {
      const [method, path] = p.split(" ") as [Route["method"], string];
      const res = await request(app)[method](`/api${concrete(path)}`);
      expect(res.status, p).not.toBe(401);
    }
  });

  it("an unknown route is a plain 404 and does not reveal the route table", async () => {
    const res = await request(app).get("/api/does/not/exist");
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toMatch(/router|express|stack/i);
  });
});
