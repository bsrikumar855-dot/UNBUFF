import type { GithubChecklistItem } from "../types.js";
import type { StoredActivity, StoredContributions, StoredRepositories } from "./normalize.js";

/**
 * The only GitHub information the AI mentor ever sees: a short, structured summary of the student's cached PUBLIC data,
 * produced only when the message is about their projects or GitHub. It contains no tokens, no raw API payloads, no
 * repository descriptions or file contents (free text written by third parties is not passed on), and no private data.
 */

export interface CachedGithub {
  login: string;
  syncedAt: string;
  stale: boolean;
  contributions?: StoredContributions;
  repositories?: StoredRepositories;
  activity?: StoredActivity;
}

const TOPIC = /\b(github|git hub|repos?|repositor(?:y|ies)|portfolio|readme|commits?|pull requests?|contributions?|open[- ]source|side projects?|my projects?|project work|resume projects?)\b/i;

/** Only questions about projects or GitHub get GitHub context: everything else is not sent. */
export function wantsGithub(message: string): boolean {
  return TOPIC.test(message);
}

const MAX_REPOS = 6;
const MAX_CHARS = 1800;

/** Names come from GitHub but are still untrusted text: keep only characters a repository name can contain. */
const safe = (s: string, max = 80) => s.replace(/[^A-Za-z0-9._/+# -]/g, "").slice(0, max);
const yn = (s: GithubChecklistItem["status"] | undefined) => (s === "pass" ? "yes" : s === "fail" ? "no" : "unknown");

export const NOT_CONNECTED_TEXT = "(GitHub is not connected, or has not been synchronised yet. You have NO repository or contribution data. Say so and do not guess.)";

export function githubBlock(c: CachedGithub): string {
  const lines: string[] = [
    `Source: GitHub public data for @${safe(c.login, 40)}, synchronised ${c.syncedAt}${c.stale ? " (STALE: may be out of date)" : ""}. Public repositories only.`,
    "OBSERVED FACTS (returned by GitHub's API):",
  ];
  const k = c.contributions;
  if (k) {
    lines.push(`- ${k.from} to ${k.to}: ${k.total} contributions (${k.breakdown.commits} commits, ${k.breakdown.pull_requests} pull requests, ${k.breakdown.reviews} reviews, ${k.breakdown.issues} issues).`);
  } else {
    lines.push("- Contribution history: not available.");
  }
  if (c.activity) lines.push(`- Pull requests opened: ${c.activity.pull_requests_total}; issues opened: ${c.activity.issues_total}.`);
  const r = c.repositories;
  if (r) {
    lines.push(`- Public repositories: ${r.total_public}${r.truncated ? " (only the most recent were scanned)" : ""}.`);
    const byRepo = new Map<string, Map<string, GithubChecklistItem["status"]>>();
    for (const i of r.checklist) {
      const m = byRepo.get(i.repository) ?? new Map();
      m.set(i.check, i.status);
      byRepo.set(i.repository, m);
    }
    const own = r.repositories.filter((x) => !x.is_fork && !x.is_archived).slice(0, MAX_REPOS);
    own.forEach((x, i) => {
      const chk = byRepo.get(x.name_with_owner);
      const langs = x.languages.slice(0, 3).map((l) => `${safe(l.name, 20)} ${l.percent}%`).join(", ") || "unknown";
      const parts = [
        safe(x.name_with_owner),
        `languages: ${langs}`,
        `last push: ${x.pushed_at?.slice(0, 10) ?? "unknown"}`,
        `your commits in the last 90 days: ${x.your_commits_90d ?? "unknown"}`,
        `description: ${x.description ? "yes" : "no"}`,
      ];
      if (chk) {
        parts.push(`README: ${yn(chk.get("readme_present"))}`, `install/run steps in README: ${yn(chk.get("setup_instructions"))}`, `test steps in README: ${yn(chk.get("test_instructions"))}`, `licence: ${yn(chk.get("license_present"))}`);
      }
      lines.push(`  ${i + 1}. ${parts.join(" | ")}`);
    });
  } else {
    lines.push("- Repository details: not available.");
  }
  return lines.join("\n").slice(0, MAX_CHARS);
}
