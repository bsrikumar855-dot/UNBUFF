import { z } from "zod";

/**
 * Optional, operator-enabled lookup of a student's public solved counts by username (LEETCODE_PUBLIC_LOOKUP=true).
 *
 * LeetCode publishes no API for this. This calls the same unofficial `graphql` endpoint its own website uses, and
 * LeetCode's terms forbid scraping and automated access of that kind, so it is OFF by default and the operator
 * accepts that risk by turning it on. It sends only a username (no cookies, no credentials), never follows
 * redirects, and everything it returns is untrusted until it passes the schema below.
 */

const ENDPOINT = "https://leetcode.com/graphql";
const QUERY =
  "query userProblemsSolved($username: String!) { allQuestionsCount { difficulty count } matchedUser(username: $username) { submitStatsGlobal { acSubmissionNum { difficulty count } } } }";

const Count = z.object({ difficulty: z.string(), count: z.number().int().min(0).max(100_000) });
const Response = z.object({
  data: z.object({
    allQuestionsCount: z.array(Count),
    matchedUser: z.object({ submitStatsGlobal: z.object({ acSubmissionNum: z.array(Count) }) }).nullable(),
  }),
});

export interface LookupData {
  totals: { solved: number; easy: number; medium: number; hard: number };
  available: { easy: number; medium: number; hard: number };
}
export type LookupResult = ({ status: "found" } & LookupData) | { status: "not_found" };

/** LeetCode could not give a trustworthy answer. Says nothing about whether the username exists. */
export class LeetCodeLookupError extends Error {
  constructor() {
    super("LeetCode could not be reached right now.");
    this.name = "LeetCodeLookupError";
  }
}

export interface LeetCodeLookup {
  lookup(username: string): Promise<LookupResult>;
}

const pick = (rows: { difficulty: string; count: number }[], name: string): number | null => rows.find((r) => r.difficulty.toLowerCase() === name)?.count ?? null;

export class HttpLeetCodeLookup implements LeetCodeLookup {
  constructor(private readonly opts: { fetchImpl?: typeof fetch; timeoutMs?: number } = {}) {}

  async lookup(username: string): Promise<LookupResult> {
    let res: Response;
    try {
      res = await (this.opts.fetchImpl ?? fetch)(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Referer: `https://leetcode.com/u/${encodeURIComponent(username)}/` },
        body: JSON.stringify({ query: QUERY, variables: { username } }),
        signal: AbortSignal.timeout(this.opts.timeoutMs ?? 8000),
        redirect: "error",
      });
    } catch {
      throw new LeetCodeLookupError();
    }
    // An unknown user answers 200 with `matchedUser: null` (plus an errors list); anything else non-OK is an outage.
    if (!res.ok) throw new LeetCodeLookupError();
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      throw new LeetCodeLookupError();
    }
    const parsed = Response.safeParse(json);
    if (!parsed.success) throw new LeetCodeLookupError();
    const { allQuestionsCount, matchedUser } = parsed.data.data;
    if (matchedUser === null) return { status: "not_found" };

    const solved = matchedUser.submitStatsGlobal.acSubmissionNum;
    const [easy, medium, hard] = [pick(solved, "easy"), pick(solved, "medium"), pick(solved, "hard")];
    const [aEasy, aMedium, aHard] = [pick(allQuestionsCount, "easy"), pick(allQuestionsCount, "medium"), pick(allQuestionsCount, "hard")];
    if (easy === null || medium === null || hard === null || aEasy === null || aMedium === null || aHard === null) throw new LeetCodeLookupError();
    if (easy > aEasy || medium > aMedium || hard > aHard) throw new LeetCodeLookupError(); // cannot have solved more than exist
    return {
      status: "found",
      totals: { solved: easy + medium + hard, easy, medium, hard },
      available: { easy: aEasy, medium: aMedium, hard: aHard },
    };
  }
}
