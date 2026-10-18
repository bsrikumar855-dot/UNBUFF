import { describe, expect, it } from "vitest";
import { isValidUsername, parseProfile, profileUrl } from "../../src/leetcode/profile.js";

const ok = (input: string) => {
  const r = parseProfile(input);
  if (!r.ok) throw new Error(`expected ok for ${input}: ${r.message}`);
  return r.username;
};
const bad = (input: string) => {
  const r = parseProfile(input);
  if (r.ok) throw new Error(`expected a rejection for ${input}`);
  return r.message;
};

describe("LeetCode username and profile address validation", () => {
  it("accepts a bare username, with or without @, and keeps its case", () => {
    expect(ok("Aryan_Raj-7")).toBe("Aryan_Raj-7");
    expect(ok("  @lee215 ")).toBe("lee215");
  });

  it("accepts the current and the older leetcode.com profile address forms", () => {
    expect(ok("https://leetcode.com/u/lee215/")).toBe("lee215");
    expect(ok("https://leetcode.com/u/lee215")).toBe("lee215");
    expect(ok("http://www.leetcode.com/u/lee215/?envType=daily")).toBe("lee215");
    expect(ok("leetcode.com/u/lee215#top")).toBe("lee215");
    expect(ok("https://leetcode.com/lee215/")).toBe("lee215"); // the older form
    expect(ok("HTTPS://LEETCODE.COM/u/Mixed_Case")).toBe("Mixed_Case");
  });

  it("builds the address itself, always on leetcode.com, from a validated username", () => {
    expect(profileUrl("lee215")).toBe("https://leetcode.com/u/lee215/");
    expect(profileUrl("a-b_c")).toBe("https://leetcode.com/u/a-b_c/");
  });

  it("rejects empty, too short, too long and badly shaped usernames", () => {
    for (const s of ["", "   ", "a", "x".repeat(41), "has space", "semi;colon", "slash/inside", "dot.dot", "ünïcode", "<script>", "a\u0000b", "name\nname"]) expect(bad(s), JSON.stringify(s)).toBeTruthy();
    expect(isValidUsername("ab")).toBe(true);
    expect(isValidUsername("x".repeat(40))).toBe(true);
    expect(isValidUsername("x".repeat(41))).toBe(false);
  });

  it("rejects names that are LeetCode pages, not people", () => {
    for (const s of ["problems", "contest", "Discuss", "explore", "https://leetcode.com/problems/", "https://leetcode.com/contest"]) expect(bad(s), s).toBeTruthy();
    expect(bad("problems")).toMatch(/page, not a username/);
  });

  it("rejects other hosts, other schemes, look-alike hosts, logins, ports and extra path parts", () => {
    expect(bad("https://leetcode.cn/u/someone/")).toMatch(/leetcode\.cn/);
    for (const s of [
      "https://example.com/u/lee215/",
      "https://leetcode.com.evil.example/u/lee215/",
      "https://evilleetcode.com/u/lee215/",
      "https://notleetcode.com/lee215",
      "ftp://leetcode.com/u/lee215/",
      "javascript://leetcode.com/u/lee215/",
      "https://user:pass@leetcode.com/u/lee215/",
      "https://leetcode.com:8443/u/lee215/",
      "https://leetcode.com/u/lee215/submissions/",
      "https://leetcode.com/u/",
      "https://leetcode.com/",
      "https://leetcode.com/u/bad name/",
      "https://leetcode.com/u/%E0%A4%A/",
    ]) expect(bad(s), s).toBeTruthy();
    expect(bad("https://user:pass@leetcode.com/u/lee215/")).toMatch(/Never enter a password/);
  });

  it("never fetches anything: parsing is pure and the address is only built, not opened", () => {
    // parseProfile and profileUrl take and return strings; there is no network client in this module to call.
    expect(parseProfile("https://leetcode.com/u/lee215/")).toEqual({ ok: true, username: "lee215" });
  });
});
