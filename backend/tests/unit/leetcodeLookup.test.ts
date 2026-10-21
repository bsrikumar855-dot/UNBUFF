import { describe, expect, it } from "vitest";
import { ApiError } from "../../src/errors.js";
import { HttpLeetCodeLookup, LeetCodeLookupError, type LeetCodeLookup, type LookupResult } from "../../src/leetcode/lookup.js";
import { LeetCodeService } from "../../src/leetcode/service.js";
import { MemoryLeetCodeStore } from "../../src/leetcode/store.js";
import { silentLogger } from "../helpers.js";

const reply = (body: unknown, status = 200): typeof fetch => (async () => new Response(JSON.stringify(body), { status })) as typeof fetch;
const good = {
  data: {
    allQuestionsCount: [{ difficulty: "All", count: 4087 }, { difficulty: "Easy", count: 972 }, { difficulty: "Medium", count: 2131 }, { difficulty: "Hard", count: 984 }],
    matchedUser: { submitStatsGlobal: { acSubmissionNum: [{ difficulty: "All", count: 93 }, { difficulty: "Easy", count: 69 }, { difficulty: "Medium", count: 23 }, { difficulty: "Hard", count: 1 }] } },
  },
};

describe("HttpLeetCodeLookup", () => {
  it("reads solved and available counts and recomputes the total itself", async () => {
    const r = await new HttpLeetCodeLookup({ fetchImpl: reply(good) }).lookup("sample_user");
    expect(r).toEqual({ status: "found", totals: { solved: 93, easy: 69, medium: 23, hard: 1 }, available: { easy: 972, medium: 2131, hard: 984 } });
  });

  it("sends only the username: no cookies or credentials, no redirects", async () => {
    let init: RequestInit | undefined;
    const spy = (async (_u: unknown, i?: RequestInit) => ((init = i), new Response(JSON.stringify(good)))) as typeof fetch;
    await new HttpLeetCodeLookup({ fetchImpl: spy }).lookup("abc");
    expect(init?.redirect).toBe("error");
    expect(Object.keys(init?.headers as Record<string, string>).sort()).toEqual(["Content-Type", "Referer"]);
    expect(JSON.parse(init?.body as string).variables).toEqual({ username: "abc" });
  });

  it("reports an unknown user as not_found", async () => {
    const r = await new HttpLeetCodeLookup({ fetchImpl: reply({ data: { allQuestionsCount: good.data.allQuestionsCount, matchedUser: null } }) }).lookup("nobody");
    expect(r).toEqual({ status: "not_found" });
  });

  it.each([
    ["an HTTP error", reply({}, 503)],
    ["a changed response shape", reply({ data: { surprise: true } })],
    ["numbers that cannot be true", reply({ data: { ...good.data, matchedUser: { submitStatsGlobal: { acSubmissionNum: [{ difficulty: "Easy", count: 5000 }, { difficulty: "Medium", count: 1 }, { difficulty: "Hard", count: 1 }] } } } })],
    ["a network failure", (async () => { throw new Error("down"); }) as typeof fetch],
  ])("treats %s as LeetCode being unavailable, never as a verdict about the user", async (_n, f) => {
    await expect(new HttpLeetCodeLookup({ fetchImpl: f }).lookup("abc")).rejects.toBeInstanceOf(LeetCodeLookupError);
  });
});

const found = (solved = 93): LookupResult => ({ status: "found", totals: { solved, easy: solved - 24, medium: 23, hard: 1 }, available: { easy: 972, medium: 2131, hard: 984 } });
const setup = (impl: () => Promise<LookupResult>) => {
  const clock = { now: new Date("2026-10-21T10:00:00Z") };
  const calls = { n: 0 };
  const lookup: LeetCodeLookup = { lookup: async () => (calls.n++, impl()) };
  const service = new LeetCodeService({ store: new MemoryLeetCodeStore(), logger: silentLogger, lookup, now: () => clock.now });
  return { service, clock, calls };
};
const code = async (p: Promise<unknown>) => ((await p.then(() => null, (e: unknown) => e)) as ApiError | null)?.code ?? null;

describe("LeetCodeService with the lookup enabled", () => {
  it("only reports availability when a lookup is configured", () => {
    expect(setup(async () => found()).service.lookupAvailable()).toBe(true);
    expect(new LeetCodeService({ store: new MemoryLeetCodeStore(), logger: silentLogger }).lookupAvailable()).toBe(false);
  });

  it("never tells the student UNBLUFF 'never contacts LeetCode' when the lookup is on", async () => {
    const on = (await setup(async () => found()).service.connection("u1")).notes.join(" ");
    expect(on).toMatch(/unofficial lookup/);
    expect(on).not.toMatch(/never contacts LeetCode/);
    const off = (await new LeetCodeService({ store: new MemoryLeetCodeStore(), logger: silentLogger }).connection("u1")).notes.join(" ");
    expect(off).toMatch(/never contacts LeetCode/);
  });

  it("refuses to link a username LeetCode does not know, but links when LeetCode is down", async () => {
    const miss = setup(async () => ({ status: "not_found" }));
    expect(await code(miss.service.link("u1", "ghost_user"))).toBe("BAD_REQUEST");
    expect((await miss.service.connection("u1")).linked).toBe(false);
    const down = setup(async () => { throw new LeetCodeLookupError(); });
    expect((await down.service.link("u1", "abc")).connection.linked).toBe(true);
  });

  it("stores a lookup labelled as such, throttles repeats and never stores identical numbers twice", async () => {
    const { service, clock, calls } = setup(async () => found());
    await service.link("u1", "abc");
    const first = await service.lookupAndStore("u1");
    expect(first.status).toBe("imported");
    expect(first.snapshot).toMatchObject({ solved: 93, source: { kind: "public_lookup" } });
    expect(first.connection.states).toMatchObject({ ownership_unverified: true, officially_connected: false });

    const callsAfterFirst = calls.n;
    expect((await service.lookupAndStore("u1")).status).toBe("already_imported"); // inside the throttle window
    expect(calls.n).toBe(callsAfterFirst); // LeetCode was not asked again

    clock.now = new Date("2026-10-21T10:30:00Z");
    expect((await service.lookupAndStore("u1")).status).toBe("already_imported"); // asked again, same numbers
    expect((await service.history("u1")).total).toBe(1);
  });

  it("stores a new snapshot when the numbers changed, and reports an outage with its own code", async () => {
    let n = 93;
    const { service, clock } = setup(async () => found(n));
    await service.link("u1", "abc");
    await service.lookupAndStore("u1");
    n = 95;
    clock.now = new Date("2026-10-21T11:00:00Z");
    expect((await service.lookupAndStore("u1")).status).toBe("imported");
    expect((await service.history("u1")).total).toBe(2);

    const down = setup(async () => { throw new LeetCodeLookupError(); });
    await down.service.link("u1", "abc");
    expect(await code(down.service.lookupAndStore("u1"))).toBe("LEETCODE_UNAVAILABLE");
  });

  it("needs a linked username, and is refused outright when the lookup is not enabled", async () => {
    expect(await code(setup(async () => found()).service.lookupAndStore("u1"))).toBe("BAD_REQUEST");
    const off = new LeetCodeService({ store: new MemoryLeetCodeStore(), logger: silentLogger });
    expect(await code(off.lookupAndStore("u1"))).toBe("NOT_FOUND");
  });
});
