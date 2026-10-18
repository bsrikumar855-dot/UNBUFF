import { describe, expect, it } from "vitest";
import { FreehireClient, FreehireError, MAX_DEPTH, describeFilters, serializeQuery } from "../../src/careers/freehire.js";
import { rawJob } from "../careers/fakes.js";

const json = (body: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json", "x-ratelimit-limit": "600", "x-ratelimit-remaining": "598", "x-ratelimit-reset": "1" }, ...init });

function clientWith(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return handler(url, init);
  }) as unknown as typeof fetch;
  return { client: new FreehireClient({ fetchImpl, timeoutMs: 500 }), calls };
}
const kind = async (p: Promise<unknown>) => p.then(() => "ok", (e: unknown) => (e instanceof FreehireError ? e.kind : "other"));

describe("serializing a query into the documented parameters", () => {
  it("repeats multi-valued facets, sets paging, and uses only documented names", () => {
    const p = serializeQuery({ q: "react", q_fields: ["title"], limit: 20, offset: 40, employment_type: ["internship"], seniority: ["intern", "junior"], work_mode: ["remote", "hybrid"], skills: ["react", "typescript"], skills_mode: "and", countries: ["in", "us"], is_tech: "tech", reality: ["fresh"], posted_within_days: 14, salary_min: 1000, salary_currency: "usd" });
    expect(p.get("q")).toBe("react");
    expect(p.get("q_fields")).toBe("title");
    expect(p.get("limit")).toBe("20");
    expect(p.get("offset")).toBe("40");
    expect(p.getAll("seniority")).toEqual(["intern", "junior"]);
    expect(p.getAll("work_mode")).toEqual(["remote", "hybrid"]);
    expect(p.getAll("skills")).toEqual(["react", "typescript"]);
    expect(p.get("skills_mode")).toBe("and");
    expect(p.getAll("countries")).toEqual(["in", "us"]);
    expect(p.get("employment_type")).toBe("internship");
    expect(p.get("is_tech")).toBe("tech");
    expect(p.get("salary_currency")).toBe("USD");
    const documented = new Set(["q", "q_fields", "limit", "offset", "sort", "order", "work_mode", "seniority", "employment_type", "reality", "category", "skills", "skills_mode", "countries", "cities", "regions", "is_tech", "experience_years_max", "salary_min", "salary_currency", "posted_within_days"]);
    for (const k of p.keys()) expect(documented.has(k), k).toBe(true);
  });

  it("defaults to a small page and omits an empty search", () => {
    const p = serializeQuery({});
    expect(p.toString()).toBe("limit=10");
  });

  it("rejects undocumented enumeration values instead of sending a filter upstream would ignore", () => {
    expect(() => serializeQuery({ employment_type: ["intern" as never] })).toThrow(/not a documented value/);
    expect(() => serializeQuery({ seniority: ["entry" as never] })).toThrow(/not a documented value/);
    expect(() => serializeQuery({ work_mode: ["wfh" as never] })).toThrow(/not a documented value/);
    expect(() => serializeQuery({ sort: "relevance" as never })).toThrow(/not a documented value/);
    expect(() => serializeQuery({ q_fields: ["salary" as never], q: "x" })).toThrow(/not a documented value/);
  });

  it("rejects malformed open-vocabulary values and out-of-range numbers", () => {
    expect(() => serializeQuery({ skills: ["react&limit=1"] })).toThrow(/not a valid value/);
    expect(() => serializeQuery({ countries: ["India!"] })).toThrow(/not a valid value/);
    expect(() => serializeQuery({ limit: 0 })).toThrow(/limit must be/);
    expect(() => serializeQuery({ limit: 101 })).toThrow(/limit must be/);
    expect(() => serializeQuery({ offset: -1 })).toThrow(/offset must be/);
    expect(() => serializeQuery({ q: "x".repeat(201) })).toThrow(/at most 200/);
    expect(() => serializeQuery({ skills: Array.from({ length: 21 }, (_v, i) => `s${i}`) })).toThrow(/at most 20/);
  });

  it("encodes values safely and never lets one value smuggle in a parameter", () => {
    const p = serializeQuery({ q: "a&b=c d", cities: ["São Paulo"] });
    expect(p.get("q")).toBe("a&b=c d");
    expect(p.toString()).toContain("q=a%26b%3Dc+d");
    expect([...p.keys()].sort()).toEqual(["cities", "limit", "q"]);
  });

  it("refuses a page past upstream's 10,000-row depth instead of sending a request that would 400", () => {
    expect(() => serializeQuery({ offset: MAX_DEPTH - 5, limit: 10 })).toThrow(/10000/);
    expect(() => serializeQuery({ offset: MAX_DEPTH - 10, limit: 10 })).not.toThrow();
  });

  it("describes the filters actually sent, without paging", () => {
    expect(describeFilters({ limit: 50, offset: 100, employment_type: ["internship"], is_tech: "tech", reality: ["fresh"] })).toEqual({ employment_type: ["internship"], is_tech: ["tech"], reality: ["fresh"] });
  });
});

describe("reading a search response", () => {
  it("parses the data and meta envelope, keeps upstream's own total and surfaces ignored_params", async () => {
    const { client, calls } = clientWith(() => json({ data: [rawJob()], meta: { total: 2826, limit: 2, offset: 0, ignored_params: [{ param: "country", did_you_mean: "countries" }, { param: "skil" }] } }));
    const r = await client.search({ employment_type: ["internship"], limit: 2 });
    expect(r.jobs).toHaveLength(1);
    expect(r.meta).toEqual({ total: 2826, limit: 2, offset: 0, ignored_params: [{ param: "country", did_you_mean: "countries" }, { param: "skil", did_you_mean: null }] });
    expect(r.rate).toEqual({ limit: 600, remaining: 598, reset_seconds: 1 });
    expect(calls[0]!.url).toBe("https://freehire.me/api/v1/jobs/search?limit=2&employment_type=internship");
    expect((calls[0]!.init.headers as Record<string, string>)["User-Agent"]).toMatch(/unbluff/);
    expect(calls[0]!.init.redirect).toBe("error");
  });

  it("does not invent a total when upstream omits it, and treats a clean response as having no ignored params", async () => {
    const { client } = clientWith(() => json({ data: [rawJob()] }));
    const r = await client.search({});
    expect(r.meta).toEqual({ total: null, limit: null, offset: null, ignored_params: [] });
  });

  it("drops a row that is not a usable job instead of showing it, and counts it", async () => {
    const { client } = clientWith(() => json({ data: [rawJob(), { title: "no slug" }, "junk", null, { public_slug: "x", title: "" }], meta: { total: 5 } }));
    const r = await client.search({});
    expect(r.jobs).toHaveLength(1);
    expect(r.dropped).toBe(4);
  });

  it("accepts optional fields being absent or null", async () => {
    const { client } = clientWith(() => json({ data: [{ public_slug: "a", title: "T", company: null, url: null, skills: null, countries: null, enrichment: null, reality: null, work_mode: null }] }));
    const r = await client.search({});
    expect(r.jobs[0]!.public_slug).toBe("a");
    expect(r.jobs[0]!.skills).toBeUndefined();
  });

  it("rejects a body that is not the documented envelope", async () => {
    expect(await kind(clientWith(() => json({ jobs: [] })).client.search({}))).toBe("invalid_response");
    expect(await kind(clientWith(() => json([])).client.search({}))).toBe("invalid_response");
    expect(await kind(clientWith(() => new Response("<html>not json</html>", { status: 200 })).client.search({}))).toBe("invalid_response");
  });
});

describe("failures are reported, never turned into results", () => {
  it("maps 429 to rate_limited and reads Retry-After", async () => {
    const { client } = clientWith(() => new Response('{"error":"rate limit"}', { status: 429, headers: { "retry-after": "17" } }));
    const err = (await client.search({}).catch((e: unknown) => e)) as FreehireError;
    expect(err).toBeInstanceOf(FreehireError);
    expect(err.kind).toBe("rate_limited");
    expect(err.retryAfterSeconds).toBe(17);
  });

  it("maps 400 to rejected with upstream's message, 404 to not_found and 5xx to unavailable", async () => {
    const e400 = (await clientWith(() => new Response('{"error":"pagination too deep"}', { status: 400 })).client.search({}).catch((e: unknown) => e)) as FreehireError;
    expect(e400.kind).toBe("rejected");
    expect(e400.message).toBe("pagination too deep");
    expect(await kind(clientWith(() => new Response("{}", { status: 404 })).client.getJob("a-b"))).toBe("not_found");
    expect(await kind(clientWith(() => new Response("oops", { status: 503 })).client.search({}))).toBe("unavailable");
  });

  it("maps a network failure to unavailable and a slow answer to timeout", async () => {
    expect(await kind(clientWith(() => Promise.reject(new TypeError("fetch failed"))).client.search({}))).toBe("unavailable");
    const slow = (() => new Promise<Response>((_res, rej) => setTimeout(() => rej(Object.assign(new Error("t"), { name: "TimeoutError" })), 5))) as never;
    expect(await kind(clientWith(slow).client.search({}))).toBe("timeout");
  });

  it("never leaks a raw upstream body in its error", async () => {
    const e = (await clientWith(() => new Response("secret stack trace at /srv/app.js:1", { status: 500 })).client.search({}).catch((x: unknown) => x)) as Error;
    expect(e.message).not.toMatch(/secret|srv/);
  });
});

describe("only documented endpoints on the fixed host are ever requested", () => {
  it("builds job URLs from a validated slug only", async () => {
    const { client, calls } = clientWith(() => json({ data: rawJob({ public_slug: "a-b" }) }));
    const r = await client.getJob("a-b");
    expect(r.job.public_slug).toBe("a-b");
    expect(calls[0]!.url).toBe("https://freehire.me/api/v1/jobs/a-b");
    for (const bad of ["../admin", "a/b", "http://evil.test/x", "a b", "", "x".repeat(301)]) {
      expect(await kind(clientWith(() => json({})).client.getJob(bad)), bad).toBe("rejected");
    }
  });

  it("reads facets with only the requested names", async () => {
    const { client, calls } = clientWith(() => json({ data: { total: 9, facets: { category: { frontend: 5, backend: 5, devops: 1 } } }, meta: { ignored_params: [{ param: "x" }] } }));
    const r = await client.facets({ employment_type: ["internship"] }, ["category"]);
    expect(r.total).toBe(9);
    expect(r.facets.category).toEqual([{ value: "backend", count: 5 }, { value: "frontend", count: 5 }, { value: "devops", count: 1 }]);
    expect(r.ignored_params).toEqual([{ param: "x", did_you_mean: null }]);
    expect(calls[0]!.url).toBe("https://freehire.me/api/v1/jobs/facets?employment_type=internship&facets=category");
    expect(await kind(client.facets({}, ["password" as never]))).toBe("rejected");
  });
});
