import type { GithubRepository, GithubSection, GithubSyncFailure } from "../types.js";
import { GithubApiError, type GithubGraphQL, type GraphQLResult } from "./client.js";
import {
  buildChecklist,
  checkable,
  normalizeActivity,
  normalizeContributions,
  normalizeRepository,
  readmeNameOf,
  type ReadmeRead,
  type StoredActivity,
  type StoredContributions,
  type StoredRepositories,
} from "./normalize.js";
import {
  ACTIVITY_QUERY,
  ActivityData,
  CONTRIBUTIONS_QUERY,
  ContributionsData,
  MAX_README_READS,
  readmesQuery,
  ReadmeBlob,
  ReadmesData,
  REPOSITORIES_QUERY,
  RepositoriesData,
  VIEWER_QUERY,
  ViewerData,
  type RepoNodeT,
} from "./queries.js";

/** Bounds on every synchronisation. Nothing here grows with the size of the student's GitHub history. */
export const LIMITS = {
  contributionDays: 364, // GitHub allows at most one year per contributionsCollection
  repositoryPages: 2,
  repositoriesKept: 30,
  commitWindowDays: 90,
  readmeBytes: 100_000,
};

export interface SyncResult {
  contributions?: StoredContributions;
  repositories?: StoredRepositories;
  activity?: StoredActivity;
  /** Sections GitHub did not return this time. */
  unavailable: GithubSection[];
  /** Sections stored from a response that also carried GraphQL errors (some items missing). */
  partial: GithubSection[];
  failure: GithubSyncFailure | null;
  /** When the rate limit resets, if it was the reason a section failed. */
  resetAt: string | null;
  remaining: number | null;
}

const failureOf = (k: GithubApiError["kind"]): GithubSyncFailure =>
  k === "rate_limited" ? "rate_limited" : k === "timeout" ? "timeout" : k === "invalid_response" ? "invalid_response" : k === "forbidden" || k === "unauthorized" ? "unauthorized" : "unavailable";

/**
 * One bounded synchronisation of a student's PUBLIC GitHub data. The token is used only inside this call.
 * Throws GithubApiError("unauthorized") when the token is dead or belongs to a different GitHub account than the one linked.
 * Any other failure is recorded per section so one broken section does not discard the rest.
 */
export async function runSync(gql: GithubGraphQL, token: string, expectedGithubId: string, now: Date): Promise<SyncResult> {
  const result: SyncResult = { unavailable: [], partial: [], failure: null, resetAt: null, remaining: null };
  const track = <T>(r: GraphQLResult<T>) => {
    if (r.rate) result.remaining = r.rate.remaining;
    return r;
  };

  // Ownership check before anything else: the token must still belong to the linked account.
  const viewer = track(await gql.query(token, VIEWER_QUERY, {}, ViewerData)).data.viewer;
  if (String(viewer.databaseId) !== expectedGithubId) throw new GithubApiError("unauthorized");

  const to = now;
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - LIMITS.contributionDays * 86_400_000);
  const since = new Date(now.getTime() - LIMITS.commitWindowDays * 86_400_000).toISOString();
  let stop = false;

  const section = async (name: GithubSection, run: () => Promise<boolean | void>) => {
    if (stop) {
      result.unavailable.push(name);
      return;
    }
    try {
      if ((await run()) === true) result.partial.push(name);
    } catch (err) {
      if (!(err instanceof GithubApiError)) throw err;
      if (err.kind === "unauthorized") throw err; // the whole credential is dead
      result.unavailable.push(name);
      result.failure ??= failureOf(err.kind);
      if (err.kind === "rate_limited") {
        result.resetAt = err.resetAt;
        stop = true; // no point asking again until it resets
      }
    }
  };

  await section("contributions", async () => {
    const r = track(await gql.query(token, CONTRIBUTIONS_QUERY, { from: from.toISOString(), to: to.toISOString() }, ContributionsData));
    result.contributions = normalizeContributions(r.data);
    return r.partial.length > 0;
  });

  await section("repositories", async () => {
    const nodes: RepoNodeT[] = [];
    let after: string | null = null;
    let total = 0;
    let more = false;
    let partial = false;
    for (let page = 0; page < LIMITS.repositoryPages; page++) {
      const r: GraphQLResult<ReturnType<typeof RepositoriesData.parse>> = track(await gql.query(token, REPOSITORIES_QUERY, { after, since, authorId: viewer.id }, RepositoriesData));
      partial ||= r.partial.length > 0;
      const repos = r.data.viewer.repositories;
      total = repos.totalCount;
      for (const n of repos.nodes) if (n && !n.isPrivate) nodes.push(n); // public data only, even if GitHub sent more
      more = repos.pageInfo.hasNextPage;
      after = repos.pageInfo.endCursor ?? null;
      if (!more || !after) break;
    }
    const kept = nodes.slice(0, LIMITS.repositoriesKept);

    // README text for the few repositories we check. Failure here only turns those checks into "unknown".
    const readmes = new Map<string, ReadmeRead>();
    const toRead = checkable(kept)
      .map((n) => ({ n, file: readmeNameOf(n) }))
      .filter((x): x is { n: RepoNodeT; file: string } => x.file !== null)
      .slice(0, MAX_README_READS);
    if (toRead.length > 0) {
      try {
        const vars: Record<string, string> = {};
        toRead.forEach(({ n, file }, i) => {
          const [owner = "", name = ""] = n.nameWithOwner.split("/");
          vars[`o${i}`] = owner;
          vars[`n${i}`] = name;
          vars[`e${i}`] = `HEAD:${file}`;
        });
        const r = track(await gql.query(token, readmesQuery(toRead.length), vars, ReadmesData));
        toRead.forEach(({ n }, i) => {
          const parsed = ReadmeBlob.safeParse(r.data[`r${i}`]);
          const o = parsed.success ? parsed.data?.object : null;
          if (o && typeof o.text === "string") readmes.set(n.nameWithOwner, { text: o.text.slice(0, LIMITS.readmeBytes), truncated: o.isTruncated === true });
        });
      } catch (err) {
        if (!(err instanceof GithubApiError)) throw err;
        if (err.kind === "unauthorized") throw err;
        partial = true;
        result.failure ??= failureOf(err.kind);
        if (err.kind === "rate_limited") {
          result.resetAt = err.resetAt;
          stop = true;
        }
      }
    }

    const { checklist, licenseByRepo } = buildChecklist(checkable(kept).slice(0, MAX_README_READS), readmes);
    const repositories: GithubRepository[] = kept.map((n) => {
      const repo = normalizeRepository(n);
      const l = licenseByRepo.get(n.nameWithOwner);
      if (l !== undefined) repo.has_license = l;
      return repo;
    });
    result.repositories = { total_public: total, truncated: more || total > nodes.length, repositories, checklist };
    return partial;
  });

  await section("activity", async () => {
    const r = track(await gql.query(token, ACTIVITY_QUERY, { from: from.toISOString(), to: to.toISOString() }, ActivityData));
    result.activity = normalizeActivity(r.data);
    return r.partial.length > 0;
  });

  return result;
}
