/* eslint-disable @typescript-eslint/no-explicit-any -- these tests walk arbitrary GraphQL response JSON */
import { assertValidSchema, getIntrospectionQuery } from "graphql";
import { afterEach, describe, expect, it } from "vitest";
import { LIMITS, runOperation } from "../../src/graphqllab/engine.js";
import { LabService, schemaExcerpt } from "../../src/graphqllab/service.js";
import { MemoryLabStore } from "../../src/graphqllab/store.js";
import { COMPANIES, encodeCursor, MAX_APPLICATIONS, rootValue, seedState, trainingSchema, type LabContext } from "../../src/graphqllab/trainingApi.js";
import { silentLogger } from "../helpers.js";

const ctx = (over: Partial<LabContext> = {}): LabContext => ({ state: seedState(), readOnly: false, dirty: false, ...over });
const run = (query: string, variables?: Record<string, unknown>, c: LabContext = ctx(), operationName?: string) => runOperation({ query, variables, operationName }, c);
const data = (r: Awaited<ReturnType<typeof run>>) => r.result.data as Record<string, any>;

describe("the training schema", () => {
  it("is a valid GraphQL schema with Query and Mutation roots and no subscriptions", () => {
    const s = trainingSchema();
    expect(() => assertValidSchema(s)).not.toThrow();
    expect(s.getQueryType()?.name).toBe("Query");
    expect(s.getMutationType()?.name).toBe("Mutation");
    expect(s.getSubscriptionType()).toBeUndefined();
  });

  it("documentation shown to students is derived from that same schema", () => {
    const lab = new LabService({ store: new MemoryLabStore(), logger: silentLogger });
    const view = lab.trainingSchema();
    const real = Object.keys(trainingSchema().getTypeMap()).filter((n) => !n.startsWith("__") && !["String", "Int", "Float", "Boolean", "ID"].includes(n));
    expect(view.types.map((t) => t.name).sort()).toEqual(real.sort());
    expect(view.types[0]!.name).toBe("Query");
    const companies = view.types.find((t) => t.name === "Query")!.fields.find((f) => f.name === "companies")!;
    expect(companies.type).toBe("CompanyConnection!");
    expect(companies.args.find((a) => a.name === "first")).toMatchObject({ type: "Int", default: "3" });
    expect(view.types.find((t) => t.name === "Industry")).toMatchObject({ kind: "ENUM", enum_values: expect.arrayContaining([{ name: "TECH", description: null }]) });
    expect(view.types.find((t) => t.name === "SearchResult")).toMatchObject({ kind: "UNION", possible_types: ["Company", "Role", "Skill"] });
    expect(view.types.find((t) => t.name === "Role")!.fields.find((f) => f.name === "skills")!.type).toBe("[Skill!]!");
    expect(view.sdl).toContain("type Company");
    expect(view.limits.max_depth).toBe(LIMITS.maxDepth);
  });

  it("excerpts only the types a query touches", () => {
    const e = schemaExcerpt("{ roles { title company { name } } }");
    expect(e).toContain("type Role");
    expect(e).toContain("type Company");
    expect(e).not.toContain("type Student");
    expect(schemaExcerpt("this is not graphql {{")).toContain("type Query");
    expect(schemaExcerpt('mutation { withdrawApplication(id: "x") { userErrors { code } } }')).toContain("type Mutation");
  });
});

describe("queries", () => {
  it("answers hello with a standard response", async () => {
    const r = await run("{ hello }");
    expect(r).toMatchObject({ phase: "ok", operation: "query", result: { data: { hello: "Hello, GraphQL!" } }, state_changed: false, training_data: "per_student" });
    expect(r.result.errors).toBeUndefined();
  });

  it("shapes the response like the selection, with nesting and relationships", async () => {
    const r = await run('{ role(id: "r2") { title company { name } skills { name } } }');
    expect(data(r).role).toEqual({ title: "Backend Engineer", company: { name: "Northwind Labs" }, skills: [{ name: "TypeScript" }, { name: "GraphQL" }, { name: "SQL" }] });
    const back = await run("{ skills { name roles { title } } }");
    expect(data(back).skills.find((s: any) => s.name === "GraphQL").roles.map((x: any) => x.title)).toEqual(["Backend Engineer", "Software Engineer", "Analytics Engineer", "Frontend Engineer"]);
  });

  it("returns null for a missing optional object and for a nullable scalar without a value", async () => {
    const r = await run('{ role(id: "zzz") { title } company(id: "c4") { rating name } }');
    expect(data(r)).toEqual({ role: null, company: { rating: null, name: "Cartwheel Retail" } });
  });

  it("supports aliases, fragments, inline fragments and __typename", async () => {
    const r = await run('fragment F on Role { title } { a: roles(level: INTERN) { ...F } b: roles(remote: true, level: MID) { ...F } s: search(text: "analy") { __typename ... on Company { name } ... on Role { title } } }');
    expect(data(r).a.map((x: any) => x.title)).toEqual(["Frontend Intern", "Data Science Intern", "Backend Intern"]);
    expect(data(r).b).toEqual([{ title: "Platform Engineer" }, { title: "Site Reliability Engineer" }]);
    expect(data(r).s).toEqual([{ __typename: "Company", name: "Quill Analytics" }, { __typename: "Role", title: "Data Analyst" }, { __typename: "Role", title: "Analytics Engineer" }]);
  });

  it("filters with several arguments, enum values and a skill name", async () => {
    expect(data(await run("{ roles(level: ENTRY, remote: true, minPackage: 15) { title } }")).roles).toEqual([{ title: "Analytics Engineer" }, { title: "Frontend Engineer" }]);
    expect(data(await run('{ roles(skill: "graphql") { title } }')).roles).toHaveLength(4);
    expect(data(await run('{ roles(skill: "cobol") { title } }')).roles).toEqual([]);
  });

  it("allows introspection, including the standard full introspection query", async () => {
    const r = await run(getIntrospectionQuery());
    expect(r.phase).toBe("ok");
    expect(JSON.stringify(r.result.data)).toContain("CompanyConnection");
    expect(data(await run('{ __type(name: "Role") { fields { name } } }')).__type.fields.map((f: any) => f.name)).toEqual(["id", "title", "level", "packageLpa", "remote", "openings", "company", "skills", "description"]);
  });
});

describe("variables and coercion", () => {
  const q = "query Q($id: ID!, $n: Int = 2) { company(id: $id) { name } companies(first: $n) { edges { node { id } } } }";

  it("runs one document with different values", async () => {
    expect(data(await run(q, { id: "c1" })).company.name).toBe("Northwind Labs");
    expect(data(await run(q, { id: "c3", n: 1 })).company.name).toBe("Helix Health");
    expect(data(await run(q, { id: "c3", n: 1 })).companies.edges).toHaveLength(1);
    expect(data(await run(q, { id: "c3" })).companies.edges).toHaveLength(2); // the declared default applies
  });

  it("rejects a missing required variable and wrongly typed values as 'variables' errors, running nothing", async () => {
    const missing = await run(q, {});
    expect(missing.phase).toBe("variables");
    expect(missing.result.data).toBeUndefined();
    expect(missing.result.errors![0]).toMatchObject({ category: "variables" });
    expect(missing.result.errors![0]!.message).toMatch(/\$id/);
    const wrong = await run(q, { id: "c1", n: "two" });
    expect(wrong.phase).toBe("variables");
    const badEnum = await run("query($l: Level) { roles(level: $l) { title } }", { l: "SENIOR" });
    expect(badEnum.phase).toBe("variables");
    const badInput = await run("mutation($i: ApplyInput!) { applyToRole(input: $i) { userErrors { code } } }", { i: { note: "no role id" } });
    expect(badInput.phase).toBe("variables");
  });
});

describe("pagination is deterministic", () => {
  const page = "query P($first: Int, $after: String, $industry: Industry) { companies(first: $first, after: $after, industry: $industry) { totalCount pageInfo { hasNextPage hasPreviousPage startCursor endCursor } edges { cursor node { id } } } }";

  it("returns edges with cursors and page info for the first page", async () => {
    const r = data(await run(page, { first: 2 })).companies;
    expect(r.edges.map((e: any) => e.node.id)).toEqual(["c1", "c2"]);
    expect(r.edges.map((e: any) => e.cursor)).toEqual([encodeCursor("c1"), encodeCursor("c2")]);
    expect(r.pageInfo).toEqual({ hasNextPage: true, hasPreviousPage: false, startCursor: encodeCursor("c1"), endCursor: encodeCursor("c2") });
    expect(r.totalCount).toBe(6);
  });

  it("walks every company exactly once, in the same order every time", async () => {
    for (let round = 0; round < 2; round++) {
      const seen: string[] = [];
      let after: string | null = null;
      for (let guard = 0; guard < 10; guard++) {
        const r: any = data(await run(page, { first: 4, after })).companies;
        seen.push(...r.edges.map((e: any) => e.node.id));
        if (!r.pageInfo.hasNextPage) break;
        after = r.pageInfo.endCursor;
      }
      expect(seen).toEqual(COMPANIES.map((c) => c.id));
    }
  });

  it("filters, counts the filtered total, and reports the last page", async () => {
    const r = data(await run(page, { first: 10, industry: "TECH" })).companies;
    expect(r.edges.map((e: any) => e.node.id)).toEqual(["c1", "c5", "c6"]);
    expect(r.totalCount).toBe(3);
    expect(r.pageInfo.hasNextPage).toBe(false);
    const second = data(await run(page, { first: 5, after: encodeCursor("c5") })).companies;
    expect(second.edges.map((e: any) => e.node.id)).toEqual(["c6"]);
    expect(second.pageInfo.hasPreviousPage).toBe(true);
  });

  it("defaults to 3 per page and rejects an invalid size or cursor with a resolver error", async () => {
    expect(data(await run("{ companies { edges { node { id } } } }")).companies.edges).toHaveLength(3);
    for (const first of [0, 11, -1]) {
      const r = await run(page, { first });
      expect(r.result.errors![0]).toMatchObject({ category: "execution", code: "BAD_USER_INPUT" });
    }
    for (const after of ["not-base64!!", Buffer.from("company:zzz").toString("base64url"), Buffer.from("anything").toString("base64url")]) {
      const r = await run(page, { first: 2, after });
      expect(r.result.errors![0]).toMatchObject({ code: "BAD_CURSOR" });
      expect(r.phase).toBe("execution");
    }
  });
});

describe("failures are classified", () => {
  it("syntax errors carry a location and stop everything", async () => {
    const r = await run("{ skills { name }");
    expect(r.phase).toBe("syntax");
    expect(r.result.data).toBeUndefined();
    expect(r.result.errors![0]).toMatchObject({ category: "syntax", locations: [{ line: 1, column: expect.any(Number) }] });
  });

  it("validation errors name the problem: unknown field, missing and wrongly typed arguments, unknown type", async () => {
    const unknown = await run("{ skills { title } }");
    expect(unknown.phase).toBe("validation");
    expect(unknown.result.errors![0]!.message).toMatch(/Cannot query field "title" on type "Skill"/);
    expect((await run("{ role { title } }")).result.errors![0]!.message).toMatch(/argument "id" of type "ID!" is required/);
    expect((await run("{ roles(level: BOSS) { title } }")).result.errors![0]!.message).toMatch(/Level/);
    expect((await run("{ roles(remote: \"yes\") { title } }")).phase).toBe("validation");
    expect((await run("fragment F on Nope { x } { skills { ...F } }")).phase).toBe("validation");
    expect((await run("{ skills }")).result.errors![0]!.message).toMatch(/must have a selection of subfields/);
    expect((await run("{ hello { x } }")).phase).toBe("validation");
  });

  it("execution errors keep the rest of the data and point at the field", async () => {
    const r = await run("{ hello unavailableReport }");
    expect(r.phase).toBe("execution");
    expect(r.result.data).toEqual({ hello: "Hello, GraphQL!", unavailableReport: null });
    expect(r.result.errors).toEqual([{ message: "The report generator is offline. Try again later.", locations: [{ line: 1, column: 9 }], path: ["unavailableReport"], category: "execution", code: "SERVICE_UNAVAILABLE" }]);
  });

  it("authorization failures are their own category", async () => {
    const r = await run("{ companies(first: 1) { edges { node { name hiringContact } } } adminStats { totalStudents } }");
    expect(r.result.data).toEqual({ companies: { edges: [{ node: { name: "Northwind Labs", hiringContact: null } }] }, adminStats: null });
    expect(r.result.errors!.map((e) => [e.category, e.code, e.path!.join(".")])).toEqual([
      ["authorization", "FORBIDDEN", "companies.edges.0.node.hiringContact"],
      ["authorization", "FORBIDDEN", "adminStats"],
    ]);
  });

  it("a non-null field that fails nulls its nearest nullable parent", async () => {
    const original = rootValue.hello;
    rootValue.hello = () => {
      throw new Error("hello broke");
    };
    try {
      const r = await run("{ hello }");
      expect(r.result.data).toBeNull();
      expect(r.result.errors![0]!.path).toEqual(["hello"]);
    } finally {
      rootValue.hello = original;
    }
  });

  it("never leaks the text of an unexpected exception", async () => {
    const original = rootValue.hello;
    rootValue.hello = () => {
      throw new TypeError("secret internal path /srv/app/db.sqlite");
    };
    try {
      const r = await run("{ hello }");
      expect(JSON.stringify(r)).not.toContain("secret");
      expect(r.result.errors![0]).toMatchObject({ code: "INTERNAL", message: expect.stringContaining("unexpected problem") });
    } finally {
      rootValue.hello = original;
    }
  });
});

describe("operations", () => {
  it("needs an operation name when the document has several, and rejects unknown names", async () => {
    const doc = "query A { hello } query B { skills { name } }";
    expect((await run(doc)).result.errors![0]).toMatchObject({ code: "OPERATION_NAME_REQUIRED" });
    expect(data(await run(doc, {}, ctx(), "B")).skills).toHaveLength(8);
    expect((await run(doc, {}, ctx(), "C")).result.errors![0]).toMatchObject({ code: "UNKNOWN_OPERATION" });
    expect((await run("fragment F on Role { title }")).result.errors![0]!.message).toMatch(/never used|no operation/i);
  });

  it("has no subscriptions", async () => {
    const r = await run("subscription { hello }");
    expect(r.phase).toBe("validation");
    expect(r.result.errors![0]).toMatchObject({ code: "SUBSCRIPTIONS_NOT_SUPPORTED" });
  });
});

describe("limits", () => {
  afterEach(() => {
    LIMITS.maxResultBytes = 60_000;
    LIMITS.timeoutMs = 1500;
  });

  it("rejects an oversized query or variables with a clear message", async () => {
    const big = `{ hello ${"#".repeat(LIMITS.maxQueryChars)} }`;
    expect((await run(big)).result.errors![0]).toMatchObject({ category: "limits", code: "QUERY_TOO_LARGE" });
    const vars = await run("query($a: String) { hello }", { a: "x".repeat(LIMITS.maxVariablesChars) });
    expect(vars.result.errors![0]).toMatchObject({ code: "VARIABLES_TOO_LARGE" });
  });

  it("limits the number of tokens a parser will read", async () => {
    const r = await run(`{ ${"hello ".repeat(2000)} }`);
    expect(["syntax", "validation"]).toContain(r.phase);
    expect(r.result.errors).toBeDefined();
  });

  it("limits depth, and counts fields after expanding fragments", async () => {
    const deep = '{ company(id: "c1") { roles { company { roles { company { roles { company { roles { title } } } } } } } } }';
    expect((await run(deep)).result.errors![0]).toMatchObject({ category: "limits", code: "QUERY_TOO_DEEP" });
    const ok = '{ company(id: "c1") { roles { company { roles { title } } } } }';
    expect((await run(ok)).phase).toBe("ok");
    let doc = "fragment F0 on Role { title id }";
    for (let i = 1; i <= 12; i++) doc += ` fragment F${i} on Role { ...F${i - 1} ...F${i - 1} }`;
    doc += " { roles { ...F12 } }";
    const started = Date.now();
    const r = await run(doc);
    expect(r.result.errors![0]).toMatchObject({ category: "limits", code: "QUERY_TOO_COMPLEX" });
    expect(Date.now() - started).toBeLessThan(500); // measured without running it, so a fragment bomb costs nothing
  });

  it("rejects fragment cycles in validation before any expansion", async () => {
    const r = await run("fragment A on Role { ...B } fragment B on Role { ...A } { roles { ...A } }");
    expect(r.phase).toBe("validation");
    expect(r.result.errors![0]!.message).toMatch(/within itself/);
  });

  it("stops a response that is too large", async () => {
    LIMITS.maxResultBytes = 200;
    const r = await run("{ roles { title description company { name city } } }");
    expect(r.result.errors![0]).toMatchObject({ category: "limits", code: "RESULT_TOO_LARGE" });
    expect(r.result.data).toBeUndefined();
  });

  it("stops an execution that does not finish in time", async () => {
    const original = rootValue.hello;
    rootValue.hello = (() => new Promise(() => undefined)) as unknown as typeof original;
    LIMITS.timeoutMs = 25;
    try {
      const r = await run("{ hello }");
      expect(r.result.errors![0]).toMatchObject({ category: "limits", code: "EXECUTION_TIMEOUT" });
    } finally {
      rootValue.hello = original;
    }
  });
});

describe("mutations change only the calling student's own state", () => {
  const apply = (id: string, note?: string) =>
    `mutation { applyToRole(input: { roleId: "${id}"${note ? `, note: "${note}"` : ""} }) { application { id status note appliedOn role { title } } userErrors { field code message } } }`;

  it("creates an application with a deterministic id and date and marks the state changed", async () => {
    const c = ctx();
    const r = await run(apply("r3", "Excited"), {}, c);
    expect(r.state_changed).toBe(true);
    expect(data(r).applyToRole).toEqual({ application: { id: "app_3", status: "APPLIED", note: "Excited", appliedOn: "2026-01-07", role: { title: "Data Analyst" } }, userErrors: [] });
    expect(c.state.applications).toHaveLength(3);
  });

  it("two students have separate data: one student's mutation is invisible to another", async () => {
    const a = ctx();
    const b = ctx();
    await run(apply("r3"), {}, a);
    await run('mutation { withdrawApplication(id: "app_2") { application { status } } }', {}, a);
    const seenByB = await run("{ me { applicationCount applications { id status } } }", {}, b);
    expect(data(seenByB).me).toEqual({ applicationCount: 2, applications: [{ id: "app_1", status: "APPLIED" }, { id: "app_2", status: "INTERVIEWING" }] });
    expect(seedState().applications).toHaveLength(2); // the starting data itself is never shared or modified
  });

  it("returns fixable problems as userErrors and changes nothing", async () => {
    const c = ctx();
    expect(data(await run(apply("r999"), {}, c)).applyToRole).toMatchObject({ application: null, userErrors: [{ field: "roleId", code: "ROLE_NOT_FOUND" }] });
    expect(data(await run(apply("r1"), {}, c)).applyToRole.userErrors[0].code).toBe("ALREADY_APPLIED");
    expect(data(await run(apply("r3", "x".repeat(141)), {}, c)).applyToRole.userErrors[0].code).toBe("NOTE_TOO_LONG");
    expect(c.state.applications).toHaveLength(2);
    expect(c.dirty).toBe(false);
  });

  it("enforces the status machine, and withdrawing twice is safe", async () => {
    const c = ctx();
    const upd = (id: string, status: string) => run(`mutation { updateApplication(id: "${id}", input: { status: ${status} }) { application { status } userErrors { code } } }`, {}, c);
    expect(data(await upd("app_1", "OFFER")).updateApplication.userErrors[0].code).toBe("INVALID_TRANSITION");
    expect(data(await upd("app_1", "INTERVIEWING")).updateApplication.application.status).toBe("INTERVIEWING");
    expect(data(await upd("app_1", "OFFER")).updateApplication.application.status).toBe("OFFER");
    const w = 'mutation { withdrawApplication(id: "app_1") { application { status } userErrors { code } } }';
    expect(data(await run(w, {}, c)).withdrawApplication.application.status).toBe("WITHDRAWN");
    c.dirty = false;
    const again = await run(w, {}, c);
    expect(data(again).withdrawApplication).toEqual({ application: { status: "WITHDRAWN" }, userErrors: [] });
    expect(again.state_changed).toBe(false); // a retry changes nothing
    expect(data(await upd("app_1", "APPLIED")).updateApplication.userErrors[0].code).toBe("INVALID_TRANSITION");
    expect(data(await upd("app_404", "OFFER")).updateApplication.userErrors[0].code).toBe("APPLICATION_NOT_FOUND");
    expect(data(await run('mutation { updateApplication(id: "app_2", input: {}) { userErrors { code } } }', {}, c)).updateApplication.userErrors[0].code).toBe("NOTHING_TO_UPDATE");
  });

  it("caps how many applications a student can hold, and reset restores the start", async () => {
    const c = ctx();
    for (const id of ["r2", "r3", "r4", "r6", "r7", "r8", "r9", "r10", "r11", "r12"]) await run(apply(id), {}, c);
    expect(c.state.applications).toHaveLength(MAX_APPLICATIONS);
    expect(data(await run(apply("r5"), {}, c)).applyToRole.userErrors.map((e: any) => e.code)).toContain("LIMIT_REACHED");
    const r = await run("mutation { resetTrainingData { applicationCount } }", {}, c);
    expect(data(r).resetTrainingData.applicationCount).toBe(2);
    expect(c.state).toEqual(seedState());
  });

  it("mutation fields run in order, so later fields see earlier changes", async () => {
    const c = ctx();
    const r = await run('mutation { a: applyToRole(input: { roleId: "r3" }) { application { id } } b: applyToRole(input: { roleId: "r3" }) { userErrors { code } } }', {}, c);
    expect(data(r)).toEqual({ a: { application: { id: "app_3" } }, b: { userErrors: [{ code: "ALREADY_APPLIED" }] } });
  });

  it("refuses mutations when the student's data cannot be loaded, but still answers queries", async () => {
    const ro = ctx({ readOnly: true });
    const m = await run(apply("r3"), {}, ro);
    expect(m.training_data).toBe("read_only");
    expect(m.result.errors![0]).toMatchObject({ code: "TRAINING_DATA_READ_ONLY" });
    expect(ro.state.applications).toHaveLength(2);
    expect((await run("{ hello }", {}, ro)).phase).toBe("ok");
  });
});
