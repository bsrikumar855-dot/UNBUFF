import { describe, expect, it } from "vitest";
import { MAX_IMPORT_BYTES, SCHEMA_VERSION, TEMPLATE_CSV, TEMPLATE_JSON, hashSnapshot, parseImport } from "../../src/leetcode/importer.js";
import { NOW, good, json, minimal, type Obj } from "../leetcode/fixtures.js";

const run = (o: unknown) => parseImport("json", typeof o === "string" ? o : json(o), NOW);
const paths = (r: ReturnType<typeof run>) => r.issues.map((i) => i.path);
const messages = (r: ReturnType<typeof run>) => r.issues.map((i) => i.message).join(" | ");

describe("a valid import", () => {
  it("is normalised: UTC time, sorted topics, sorted activity, rounded rating", () => {
    const r = run(good({ captured_at: "2026-10-10T13:30:00+05:30" }));
    expect(r.issues).toEqual([]);
    expect(r.data).toMatchObject({
      captured_at: "2026-10-10T08:00:00.000Z", // the zone is applied, never guessed
      totals: { solved: 100, easy: 50, medium: 40, hard: 10 },
      available: { easy: 900, medium: 1900, hard: 850 },
      contest: { rating: 1650.46, global_rank: 120000, attended: 12 },
    });
    expect(r.data!.topics!.map((t) => t.topic)).toEqual(["Array", "Hash Table", "Dynamic Programming", "Graph"]); // by solved, descending
    expect(r.data!.activity!.map((a) => a.date)).toEqual(["2026-10-06", "2026-10-08"]); // oldest first
    expect(r.source_description).toBe("Typed from my own profile page in a unit test");
    expect(r.hash).toMatch(/^[a-f0-9]{32}$/);
  });

  it("accepts the smallest import and records that nothing else was supplied", () => {
    const r = run(minimal());
    expect(r.issues).toEqual([]);
    expect(r.data).toEqual({ captured_at: "2026-10-10T08:00:00.000Z", totals: { solved: 12, easy: null, medium: null, hard: null }, available: null, topics: null, contest: null, activity: null });
    expect(r.warnings.map((w) => w.path)).toContain("totals"); // no difficulty split
  });

  it("warns, without rejecting, about old and empty data", () => {
    const old = run(good({ captured_at: "2026-06-01T00:00:00Z", activity: undefined }));
    expect(old.issues).toEqual([]);
    expect(old.warnings.some((w) => w.path === "captured_at" && /days old/.test(w.message))).toBe(true);
    expect(run(minimal({ totals: { solved: 0 } })).warnings.some((w) => w.path === "totals.solved")).toBe(true);
  });

  it("has an id that depends on the numbers and capture time, not on formatting, order or description", () => {
    const a = run(good()).hash;
    const reordered = run(good({ topics: [...(good().topics as Obj[])].reverse(), source_description: "a different note", activity: [...(good().activity as Obj[])].reverse() })).hash;
    expect(reordered).toBe(a);
    expect(run(good({ captured_at: "2026-10-10T08:00:01Z" })).hash).not.toBe(a);
    expect(run(good({ totals: { solved: 101, easy: 51, medium: 40, hard: 10 } })).hash).not.toBe(a);
    expect(hashSnapshot(run(good()).data!)).toBe(a);
  });
});

describe("the documented CSV format", () => {
  it("gives the same snapshot as the equivalent JSON", () => {
    const csv = ["key,value", `schema_version,${SCHEMA_VERSION}`, "captured_at,2026-10-10T08:00:00Z", "solved,100", "easy,50", "medium,40", "hard,10", "available_easy,900", "available_medium,1900", "available_hard,850", "contest_rating,1650.456", "contest_global_rank,120000", "contest_attended,12", "topic:Array,45", "topic:Hash Table,30", '"topic:Dynamic Programming",6', "topic:Graph,4", "activity:2026-10-08,2", "activity:2026-10-06,1", "source_description,Typed from my own profile page in a unit test"].join("\n");
    const fromCsv = parseImport("csv", csv, NOW);
    expect(fromCsv.issues).toEqual([]);
    expect(fromCsv.hash).toBe(run(good()).hash);
  });

  it("handles quotes, comments, blank lines, CRLF and a byte-order mark", () => {
    const csv = `\uFEFF# a comment\r\n\r\nschema_version,${SCHEMA_VERSION}\r\ncaptured_at,2026-10-10T08:00:00Z\r\nsolved,5\r\nsource_description,"Typed by hand, then checked ""twice"""\r\n`;
    const r = parseImport("csv", csv, NOW);
    expect(r.issues).toEqual([]);
    expect(r.source_description).toBe('Typed by hand, then checked "twice"');
  });

  it("rejects rows that are not key,value, unterminated quotes, duplicates and unknown keys", () => {
    const head = `schema_version,${SCHEMA_VERSION}\ncaptured_at,2026-10-10T08:00:00Z\nsolved,5\n`;
    expect(parseImport("csv", `${head}easy,1,2\n`, NOW).issues[0]!.message).toMatch(/exactly two values/);
    expect(parseImport("csv", `${head}source_description,"oops\n`, NOW).issues[0]!.message).toMatch(/exactly two values/);
    expect(parseImport("csv", `${head}solved,6\n`, NOW).issues.some((i) => /more than once/.test(i.message))).toBe(true);
    expect(parseImport("csv", `${head}topic:Array,1\ntopic:array,2\n`, NOW).issues.some((i) => /more than once/.test(i.message))).toBe(true);
    expect(parseImport("csv", `${head}activity:2026-10-01,1\nactivity:2026-10-01,2\n`, NOW).issues.some((i) => /more than once/.test(i.message))).toBe(true);
    expect(parseImport("csv", `${head}karma,9\n`, NOW).issues[0]!.message).toMatch(/Unrecognised key/);
  });

  it("reports text where a number belongs", () => {
    const r = parseImport("csv", `schema_version,${SCHEMA_VERSION}\ncaptured_at,2026-10-10T08:00:00Z\nsolved,lots\n`, NOW);
    expect(messages(r)).toMatch(/must be a number, not text/);
  });
});

describe("the template", () => {
  it("is fictitious, labelled so, and refuses to import until it is replaced (JSON and CSV)", () => {
    expect(TEMPLATE_JSON.source_description).toMatch(/^FICTITIOUS EXAMPLE/);
    const j = run(TEMPLATE_JSON);
    expect(j.data).toBeNull();
    expect(paths(j)).toContain("example_data");
    expect(messages(j)).toMatch(/fictitious example template/);
    const c = parseImport("csv", TEMPLATE_CSV, NOW);
    expect(c.data).toBeNull();
    expect(c.issues.some((i) => i.path === "example_data")).toBe(true);
  });

  it("is otherwise valid: removing only the example marker would import (so the format it shows is real)", () => {
    const { example_data: _drop, source_description: _s, ...rest } = TEMPLATE_JSON;
    expect(run(rest).issues).toEqual([]);
  });

  it("also refuses a note that still says the data is fictitious", () => {
    expect(paths(run(good({ source_description: "Fictitious numbers for a demo" })))).toContain("source_description");
  });
});

describe("rejected: structure, fields and identity", () => {
  it("rejects non-JSON, arrays, empty input, binary data and oversize input", () => {
    expect(messages(run("{not json"))).toMatch(/not valid JSON/);
    expect(messages(run("[]"))).toMatch(/one JSON object/);
    expect(messages(run("   "))).toMatch(/empty/);
    expect(messages(parseImport("json", "\u0000\u0001binary", NOW))).toMatch(/text file/);
    const big = parseImport("json", json(good({ source_description: "x".repeat(10) })) + " ".repeat(MAX_IMPORT_BYTES), NOW);
    expect(big.data).toBeNull();
    expect(messages(big)).toMatch(/larger than 64 KB/);
  });

  it("does not echo file content in the message for malformed JSON beyond a short parser reason", () => {
    const secret = "SECRET-VALUE-123";
    const r = run(`{"x": "${secret}" oops`);
    expect(messages(r)).not.toContain(secret);
  });

  it("requires the supported schema version", () => {
    expect(paths(run(good({ schema_version: undefined })))).toContain("schema_version");
    expect(messages(run(good({ schema_version: "unbluff.leetcode-import/2" })))).toMatch(/Unsupported schema_version/);
    expect(paths(run(good({ schema_version: 1 })))).toContain("schema_version");
  });

  it("rejects unknown fields and any account identity, credential or session field", () => {
    for (const k of ["user_id", "uid", "owner_uid", "email", "password", "LEETCODE_SESSION", "csrftoken", "cookie", "token", "session_token", "colour"]) {
      const r = run(good({ [k]: "x" }));
      expect(r.data, k).toBeNull();
      expect(paths(r), k).toContain(k);
    }
    expect(messages(run(good({ user_id: "someone-else" })))).toMatch(/never takes an account id from a file/);
    expect(paths(run(good({ totals: { solved: 100, easy: 50, medium: 40, hard: 10, bonus: 1 } })))).toContain("totals.bonus");
    expect(paths(run(good({ topics: [{ topic: "Array", solved: 1, note: "x" }] })))).toContain("topics.0.note");
  });

  it("validates the optional username and description as plain text", () => {
    expect(paths(run(good({ username: "bad name!" })))).toContain("username");
    expect(run(good({ username: "@lee215" })).username).toBe("lee215");
    expect(paths(run(good({ source_description: "x".repeat(121) })))).toContain("source_description");
    expect(paths(run(good({ source_description: "a\u0007b" })))).toContain("source_description");
    expect(paths(run(good({ source_description: 5 })))).toContain("source_description");
  });
});

describe("rejected: dates and time zones", () => {
  it("requires a real timestamp with an explicit time zone", () => {
    expect(paths(run(good({ captured_at: undefined })))).toContain("captured_at");
    for (const bad of ["2026-10-10", "2026-10-10T08:00:00", "2026-10-10 08:00:00Z", "10/10/2026", "yesterday", 1760000000, "2026-02-30T08:00:00Z", "2026-10-10T25:00:00Z", "2026-10-10T08:61:00Z", "2026-10-10T08:00:00+25:00", "2026-13-10T08:00:00Z"]) {
      expect(paths(run(good({ captured_at: bad }))), String(bad)).toContain("captured_at");
    }
  });

  it("treats offsets correctly, so the same instant gives the same id", () => {
    expect(run(good({ captured_at: "2026-10-10T08:00:00Z" })).hash).toBe(run(good({ captured_at: "2026-10-10T13:30:00+05:30" })).hash);
    expect(run(good({ captured_at: "2026-10-10T03:00:00-05:00" })).hash).toBe(run(good()).hash);
  });

  it("rejects the future (beyond five minutes of clock skew) and dates before 2015", () => {
    expect(messages(run(good({ captured_at: "2026-10-18T11:00:00Z" })))).toMatch(/in the future/);
    expect(run(good({ captured_at: "2026-10-18T10:03:00Z", activity: undefined })).issues).toEqual([]);
    expect(messages(run(good({ captured_at: "2014-12-31T23:00:00Z" })))).toMatch(/before 2015/);
  });

  it("rejects activity dates that are not real, are duplicated, or come after the capture", () => {
    expect(paths(run(good({ activity: [{ date: "2026-02-30", problems_solved: 1 }] })))).toContain("activity.0.date");
    expect(paths(run(good({ activity: [{ date: "10/08/2026", problems_solved: 1 }] })))).toContain("activity.0.date");
    expect(messages(run(good({ activity: [{ date: "2026-10-08", problems_solved: 1 }, { date: "2026-10-08", problems_solved: 1 }] })))).toMatch(/more than once/);
    expect(messages(run(good({ activity: [{ date: "2026-10-20", problems_solved: 1 }] })))).toMatch(/after captured_at/);
    expect(run(good({ activity: [{ date: "2026-10-11", problems_solved: 1 }] })).issues).toEqual([]); // one day of slack for time zones
  });
});

describe("rejected: numbers and totals", () => {
  it("requires totals.solved and rejects negative, fractional, huge and non-numeric counts", () => {
    expect(paths(run(good({ totals: undefined })))).toContain("totals");
    expect(paths(run(good({ totals: {} })))).toContain("totals.solved");
    expect(messages(run(good({ totals: { solved: -1 } })))).toMatch(/cannot be negative/);
    expect(messages(run(good({ totals: { solved: 10.5 } })))).toMatch(/whole number/);
    expect(messages(run(good({ totals: { solved: 10_001 } })))).toMatch(/implausibly large/);
    expect(messages(run(good({ totals: { solved: "100" } })))).toMatch(/must be a number, not text/);
    expect(paths(run(good({ totals: { solved: null } })))).toContain("totals.solved");
    expect(paths(run(good({ totals: { solved: Number.NaN } })))).toContain("totals.solved"); // JSON.stringify makes this null
  });

  it("requires the difficulty split to be all three or none, and to add up", () => {
    expect(messages(run(good({ totals: { solved: 100, easy: 50 } })))).toMatch(/all three of easy, medium and hard/);
    expect(messages(run(good({ totals: { solved: 100, easy: 50, medium: 40, hard: 11 } })))).toMatch(/easy \+ medium \+ hard is 101, but totals\.solved is 100/);
    expect(paths(run(good({ totals: { solved: 100, easy: -50, medium: 140, hard: 10 } })))).toContain("totals.easy");
    expect(run(good({ totals: { solved: 100 } })).issues).toEqual([]);
  });

  it("checks solved against what was available, per difficulty", () => {
    expect(messages(run(good({ available: { easy: 40, medium: 1900, hard: 850 } })))).toMatch(/50 easy problems solved but only 40 were available/);
    expect(paths(run(good({ available: { easy: 900, medium: 1900 } })))).toContain("available.hard");
    expect(paths(run(good({ available: { easy: 0, medium: 1, hard: 1 } })))).toContain("available.easy");
    expect(paths(run(good({ available: { easy: 900, medium: 1900, hard: 850, extra: 1 } })))).toContain("available.extra");
  });

  it("checks topics: names, ranges, duplicates, and not more than the total", () => {
    expect(paths(run(good({ topics: [] })))).toContain("topics");
    expect(paths(run(good({ topics: "Array" })))).toContain("topics");
    expect(paths(run(good({ topics: [{ topic: "", solved: 1 }] })))).toContain("topics.0.topic");
    expect(paths(run(good({ topics: [{ topic: "<b>x</b>", solved: 1 }] })))).toContain("topics.0.topic");
    expect(paths(run(good({ topics: [{ topic: "A".repeat(41), solved: 1 }] })))).toContain("topics.0.topic");
    expect(messages(run(good({ topics: [{ topic: "Array", solved: 1 }, { topic: "  array ", solved: 2 }] })))).toMatch(/appears more than once/);
    expect(messages(run(good({ topics: [{ topic: "Array", solved: 101 }] })))).toMatch(/more than your total of 100/);
    expect(paths(run(good({ topics: [{ topic: "Array", solved: -1 }] })))).toContain("topics.0.solved");
    expect(run(good({ topics: Array.from({ length: 101 }, (_v, i) => ({ topic: `T${i}`, solved: 1 })) })).issues[0]!.message).toMatch(/At most 100 topics/);
    // topics overlap on LeetCode, so their counts may add up to more than the total
    expect(run(good({ topics: [{ topic: "Array", solved: 90 }, { topic: "Hash Table", solved: 90 }] })).issues).toEqual([]);
  });

  it("checks contest data: ranges, not empty, and warns about a rating with no contests", () => {
    expect(paths(run(good({ contest: {} })))).toContain("contest");
    expect(paths(run(good({ contest: { rating: -3 } })))).toContain("contest.rating");
    expect(paths(run(good({ contest: { rating: 9000 } })))).toContain("contest.rating");
    expect(paths(run(good({ contest: { rating: "high" } })))).toContain("contest.rating");
    expect(paths(run(good({ contest: { global_rank: 0 } })))).toContain("contest.global_rank");
    expect(paths(run(good({ contest: { attended: -1 } })))).toContain("contest.attended");
    expect(paths(run(good({ contest: { rating: 1500, colour: "red" } })))).toContain("contest.colour");
    const w = run(good({ contest: { rating: 1500, attended: 0 } }));
    expect(w.issues).toEqual([]);
    expect(w.warnings.some((x) => x.path === "contest")).toBe(true);
    expect(run(good({ contest: { rating: null, global_rank: 5, attended: null } })).data!.contest).toEqual({ rating: null, global_rank: 5, attended: null });
  });

  it("checks that per-day activity is consistent with the total", () => {
    expect(paths(run(good({ activity: [] })))).toContain("activity");
    expect(paths(run(good({ activity: [{ date: "2026-10-08", problems_solved: 101 }] })))).toContain("activity.0.problems_solved");
    expect(messages(run(good({ activity: [{ date: "2026-10-07", problems_solved: 60 }, { date: "2026-10-08", problems_solved: 50 }] })))).toMatch(/adds up to 110 problems first solved, which is more than your total of 100/);
    expect(paths(run(good({ activity: [{ date: "2026-10-08", problems_solved: -1 }] })))).toContain("activity.0.problems_solved");
    expect(run(good({ activity: Array.from({ length: 401 }, (_v, i) => ({ date: `2025-${String(1 + (i % 12)).padStart(2, "0")}-${String(1 + (i % 28)).padStart(2, "0")}`, problems_solved: 0 })) })).issues[0]!.message).toMatch(/At most 400 days/);
  });

  it("reports every problem in one pass, not just the first", () => {
    const r = run(good({ captured_at: "nope", totals: { solved: -1 }, topics: [{ topic: "", solved: 1 }], contest: { rating: -1 } }));
    expect(r.data).toBeNull();
    expect(paths(r)).toEqual(expect.arrayContaining(["captured_at", "totals.solved", "topics.0.topic", "contest.rating"]));
  });
});
