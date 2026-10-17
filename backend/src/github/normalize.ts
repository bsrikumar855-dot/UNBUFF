import type {
  GithubActivityItem,
  GithubCalendarWeek,
  GithubChecklistItem,
  GithubCheckId,
  GithubCheckStatus,
  GithubPeriodTotal,
  GithubRepository,
} from "../types.js";
import type { RepoNodeT } from "./queries.js";
import { ActivityData, ContributionsData } from "./queries.js";
import type { z } from "zod";

/** What is stored for each section after a synchronisation (normalised; raw API payloads are never kept). */
export interface StoredContributions {
  from: string;
  to: string;
  total: number;
  weeks: GithubCalendarWeek[];
  breakdown: { commits: number; pull_requests: number; reviews: number; issues: number };
  restricted_count: number | null;
}
export interface StoredRepositories {
  total_public: number;
  truncated: boolean;
  repositories: GithubRepository[];
  checklist: GithubChecklistItem[];
}
export interface StoredActivity {
  pull_requests_total: number;
  issues_total: number;
  items: GithubActivityItem[];
}

const isoDate = (s: string) => s.slice(0, 10);

// ---------------- contributions ----------------

export function normalizeContributions(data: z.infer<typeof ContributionsData>): StoredContributions {
  const c = data.viewer.contributionsCollection;
  return {
    from: isoDate(c.startedAt),
    to: isoDate(c.endedAt),
    total: c.contributionCalendar.totalContributions,
    weeks: c.contributionCalendar.weeks.map((w) => ({ starts_on: w.firstDay, days: w.contributionDays.map((d) => ({ date: d.date, count: d.contributionCount })) })),
    breakdown: {
      commits: c.totalCommitContributions,
      pull_requests: c.totalPullRequestContributions,
      reviews: c.totalPullRequestReviewContributions,
      issues: c.totalIssueContributions,
    },
    restricted_count: c.restrictedContributionsCount ?? null,
  };
}

/** Totals derived from the stored calendar, computed on read so they always agree with the heatmap. */
export function summarizeCalendar(weeks: GithubCalendarWeek[]): {
  weekly: GithubPeriodTotal[];
  monthly: GithubPeriodTotal[];
  active_days: number;
  longest_streak_days: number;
} {
  const days = weeks.flatMap((w) => w.days).sort((a, b) => a.date.localeCompare(b.date));
  const monthly = new Map<string, number>();
  for (const d of days) monthly.set(d.date.slice(0, 7), (monthly.get(d.date.slice(0, 7)) ?? 0) + d.count);
  const weekly = weeks
    .map((w) => ({ period: w.starts_on, total: w.days.reduce((s, d) => s + d.count, 0) }))
    .sort((a, b) => a.period.localeCompare(b.period))
    .slice(-12);
  let active = 0;
  let longest = 0;
  let run = 0;
  let prev: number | null = null;
  for (const d of days) {
    const t = Date.parse(`${d.date}T00:00:00Z`);
    if (d.count > 0) {
      active++;
      run = prev !== null && t - prev === 86_400_000 ? run + 1 : 1;
      prev = t;
      longest = Math.max(longest, run);
    } else {
      run = 0;
      prev = null;
    }
  }
  return { weekly, monthly: [...monthly.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([period, total]) => ({ period, total })), active_days: active, longest_streak_days: longest };
}

// ---------------- repositories ----------------

const README_NAME = /^readme(\.[a-z0-9]+)?$/i;
const LICENSE_NAME = /^(license|licence|copying|unlicense)(\.[a-z0-9]+)?$/i;
/** Exact file names allowed in a README read (they come from GitHub's own tree listing, then are checked again here). */
const SAFE_FILE = /^[A-Za-z0-9._-]{1,64}$/;

export function normalizeRepository(n: RepoNodeT): GithubRepository {
  const edges = n.languages?.edges ?? [];
  const total = edges.reduce((s, e) => s + e.size, 0);
  const history = n.defaultBranchRef?.target?.history;
  return {
    name_with_owner: n.nameWithOwner,
    url: n.url,
    description: n.description?.trim() ? n.description.trim().slice(0, 300) : null,
    primary_language: n.primaryLanguage?.name ?? null,
    languages: total > 0 ? edges.map((e) => ({ name: e.node.name, percent: Math.round((e.size / total) * 100) })) : [],
    is_fork: n.isFork,
    is_archived: n.isArchived,
    pushed_at: n.pushedAt ?? null,
    updated_at: n.updatedAt ?? null,
    stars: n.stargazerCount,
    open_issues: n.issues.totalCount,
    open_pull_requests: n.pullRequests.totalCount,
    your_commits_90d: history ? history.totalCount : null,
    has_license: n.licenseInfo ? true : null, // refined below once the file listing is known
    topics: (n.repositoryTopics?.nodes ?? []).map((t) => t.topic.name),
  };
}

/** The repositories whose documentation is worth checking: the student's own, public, active ones. */
export function checkable(nodes: RepoNodeT[]): RepoNodeT[] {
  return nodes.filter((n) => !n.isPrivate && !n.isFork && !n.isArchived);
}

export function rootFiles(n: RepoNodeT): string[] | null {
  const entries = n.root?.entries;
  return entries ? entries.filter((e) => e.type === "blob").map((e) => e.name) : null;
}

/** The README file name to read, taken from GitHub's own listing of the repository root. */
export function readmeNameOf(n: RepoNodeT): string | null {
  const files = rootFiles(n);
  const name = files?.find((f) => README_NAME.test(f));
  return name && SAFE_FILE.test(name) ? name : null;
}

export interface ReadmeRead {
  text: string | null;
  truncated: boolean;
}

const SETUP_HEADING = /^#{1,6}\s*.*\b(install(ation)?|setup|set up|getting started|quick ?start|how to run|running (the )?(app|project|locally)|build(ing)?|usage|prerequisites?)\b/im;
const SETUP_COMMAND = /\b(npm (install|ci|i)|yarn( install)?|pnpm install|pip3? install|poetry install|bundle install|go (build|run|install)|cargo (build|run)|mvn |gradle|docker(-compose| compose)? (build|run|up)|git clone|make( install| build)?|python3? \S+\.py|npm (start|run))\b/i;
const TEST_HEADING = /^#{1,6}\s*.*\b(tests?|testing|running tests|test suite)\b/im;
const TEST_COMMAND = /\b(npm (run )?test|yarn test|pnpm test|pytest|python3? -m (pytest|unittest)|go test|cargo test|mvn test|gradlew? test|vitest|jest|rspec|phpunit|make test|ctest|dotnet test)\b/i;

/**
 * Builds the portfolio checklist from facts GitHub returned. A check is "fail" only when the data needed to decide was
 * actually retrieved; otherwise it is "unknown". README text is only pattern-matched, never executed or followed.
 */
export function buildChecklist(nodes: RepoNodeT[], readmes: Map<string, ReadmeRead>): { checklist: GithubChecklistItem[]; licenseByRepo: Map<string, boolean | null> } {
  const checklist: GithubChecklistItem[] = [];
  const licenseByRepo = new Map<string, boolean | null>();
  const add = (repository: string, check: GithubCheckId, status: GithubCheckStatus, label: string, evidence: string) => checklist.push({ repository, check, status, label, evidence });

  for (const n of nodes) {
    const repo = n.nameWithOwner;
    const files = rootFiles(n);
    const readmeFile = files?.find((f) => README_NAME.test(f)) ?? null;

    add(repo, "description_present", n.description?.trim() ? "pass" : "fail", "Has a repository description", n.description?.trim() ? "A description is set on GitHub." : "GitHub returned no description.");

    if (files === null) {
      add(repo, "readme_present", "unknown", "Has a README at the repository root", "GitHub returned no file listing for the default branch (the repository may be empty).");
    } else if (readmeFile) {
      add(repo, "readme_present", "pass", "Has a README at the repository root", `Found ${readmeFile}.`);
    } else {
      add(repo, "readme_present", "fail", "Has a README at the repository root", "No README file in the root listing returned by GitHub.");
    }

    const hasLicense = n.licenseInfo ? true : files === null ? null : files.some((f) => LICENSE_NAME.test(f));
    licenseByRepo.set(repo, hasLicense);
    add(
      repo,
      "license_present",
      hasLicense === null ? "unknown" : hasLicense ? "pass" : "fail",
      "Has a licence",
      hasLicense === null ? "The file listing was not available." : hasLicense ? "A licence was detected." : "No licence file in the root listing and GitHub detected none.",
    );

    const read = readmes.get(repo);
    const noReadmeNote = readmeFile ? "The README text was not read in this synchronisation." : "There is no README to inspect (a docs folder was not checked).";
    if (!read || read.text === null) {
      add(repo, "setup_instructions", "unknown", "README explains how to install or run the project", noReadmeNote);
      add(repo, "test_instructions", "unknown", "README explains how to run the tests", noReadmeNote);
      continue;
    }
    const setup = SETUP_HEADING.test(read.text) || SETUP_COMMAND.test(read.text);
    const test = TEST_HEADING.test(read.text) || TEST_COMMAND.test(read.text);
    const partial = read.truncated ? " The README was truncated by GitHub, so later sections were not seen." : "";
    add(repo, "setup_instructions", setup ? "pass" : read.truncated ? "unknown" : "fail", "README explains how to install or run the project", (setup ? "An install or run section/command appears in the README." : "No install, setup or run section or command was found in the README text.") + partial);
    add(repo, "test_instructions", test ? "pass" : read.truncated ? "unknown" : "fail", "README explains how to run the tests", (test ? "A testing section or test command appears in the README." : "No testing section or test command was found in the README text.") + partial);
  }
  return { checklist, licenseByRepo };
}

// ---------------- activity ----------------

export function normalizeActivity(data: z.infer<typeof ActivityData>): StoredActivity {
  const v = data.viewer;
  const items: GithubActivityItem[] = [];
  const keep = <T extends { repository: { isPrivate: boolean } }>(x: T | null): x is T => x !== null && !x.repository.isPrivate;
  for (const p of v.pullRequests.nodes) if (keep(p)) items.push({ kind: "pull_request", title: p.title, url: p.url, repository: p.repository.nameWithOwner, state: p.state.toLowerCase(), occurred_at: p.createdAt });
  for (const i of v.issues.nodes) if (keep(i)) items.push({ kind: "issue", title: i.title, url: i.url, repository: i.repository.nameWithOwner, state: i.state.toLowerCase(), occurred_at: i.createdAt });
  for (const r of v.contributionsCollection.pullRequestReviewContributions.nodes) {
    if (r && !r.pullRequest.repository.isPrivate) {
      items.push({ kind: "review", title: r.pullRequest.title, url: r.pullRequest.url, repository: r.pullRequest.repository.nameWithOwner, state: r.pullRequestReview.state.toLowerCase(), occurred_at: r.occurredAt });
    }
  }
  items.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
  return { pull_requests_total: v.pullRequests.totalCount, issues_total: v.issues.totalCount, items: items.slice(0, 30) };
}
