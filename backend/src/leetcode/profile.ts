/**
 * Reading a LeetCode username from what a student types. Nothing here contacts LeetCode: the address is built locally
 * and only ever opened by the student's own browser. LeetCode's published terms forbid crawling and scraping, so a
 * username is a label the student gives us, never something we look up.
 *
 * The accepted shape (2 to 40 letters, digits, underscores and hyphens) is a conservative safety rule of ours. LeetCode
 * does not publish its own username rule that we could verify, so a real username outside this shape cannot be linked.
 */

export const PROFILE_HOST = "leetcode.com";
const USERNAME = /^[A-Za-z0-9_-]{2,40}$/;

/** First path segments on leetcode.com that are pages, not people. A legacy `leetcode.com/<name>` address with one of these is not a profile. */
const RESERVED = new Set([
  "u", "problems", "problemset", "contest", "discuss", "explore", "store", "premium", "subscribe", "studyplan", "interview", "assessment",
  "accounts", "login", "logout", "signup", "register", "profile", "settings", "submissions", "playground", "list", "tag", "company", "jobs",
  "support", "terms", "privacy", "api", "graphql", "static", "robots.txt", "sitemap.xml", "favicon.ico", "bugbounty", "student", "business",
]);

export type ProfileParse = { ok: true; username: string } | { ok: false; message: string };

const BAD_USERNAME = "A LeetCode username has 2 to 40 letters, digits, underscores or hyphens, with no spaces.";

export const isValidUsername = (s: string): boolean => USERNAME.test(s) && !RESERVED.has(s.toLowerCase());

/** The one address form UNBLUFF shows and stores. Built from a username that already passed `isValidUsername`. */
export function profileUrl(username: string): string {
  return `https://${PROFILE_HOST}/u/${encodeURIComponent(username)}/`;
}

/** Accepts a bare username (optionally with @), or a leetcode.com profile address. Rejects everything else with a reason. */
export function parseProfile(raw: string): ProfileParse {
  const input = raw.trim();
  if (input === "") return { ok: false, message: "Enter your LeetCode username or your profile address." };
  if (input.length > 200) return { ok: false, message: "That is too long to be a LeetCode username or profile address." };
  // eslint-disable-next-line no-control-regex -- rejects control characters in pasted text
  if (/[\u0000-\u001f\u007f\s]/.test(input)) return { ok: false, message: BAD_USERNAME };

  const looksLikeAddress = /^[a-z][a-z0-9+.-]*:\/\//i.test(input) || /^(?:www\.)?leetcode\.[a-z]+(?:[/?#]|$)/i.test(input);
  if (!looksLikeAddress) {
    const name = input.replace(/^@/, "");
    if (!isValidUsername(name)) return { ok: false, message: RESERVED.has(name.toLowerCase()) ? `"${name}" is a LeetCode page, not a username.` : BAD_USERNAME };
    return { ok: true, username: name };
  }

  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(input) ? input : `https://${input}`);
  } catch {
    return { ok: false, message: "That is not a valid address. Use https://leetcode.com/u/<username>/ or just the username." };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { ok: false, message: "Only https://leetcode.com profile addresses are supported." };
  if (url.username !== "" || url.password !== "") return { ok: false, message: "A profile address must not contain a login. Never enter a password or token here." };
  if (url.port !== "") return { ok: false, message: "Only https://leetcode.com profile addresses are supported." };
  const host = url.hostname.toLowerCase();
  if (host !== PROFILE_HOST && host !== `www.${PROFILE_HOST}`) {
    return { ok: false, message: host.endsWith("leetcode.cn") ? "Only leetcode.com profiles are supported, not leetcode.cn." : "Only leetcode.com profile addresses are supported." };
  }
  const parts = url.pathname.split("/").filter((p) => p !== "");
  let name: string | undefined;
  if (parts[0]?.toLowerCase() === "u" && parts.length === 2) name = parts[1];
  else if (parts.length === 1 && parts[0] !== undefined && !RESERVED.has(parts[0].toLowerCase())) name = parts[0]; // the older leetcode.com/<name> form
  if (name === undefined) return { ok: false, message: "That does not look like a profile address. Use https://leetcode.com/u/<username>/." };
  let decoded: string;
  try {
    decoded = decodeURIComponent(name);
  } catch {
    return { ok: false, message: BAD_USERNAME };
  }
  if (!isValidUsername(decoded)) return { ok: false, message: BAD_USERNAME };
  return { ok: true, username: decoded };
}
