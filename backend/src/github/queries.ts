import { z } from "zod";

/**
 * The complete set of GraphQL documents this server sends to GitHub. They are constants: nothing from a client is ever
 * spliced into them, and values travel only as GraphQL variables. Fields were chosen from GitHub's public schema
 * (docs.github.com/graphql/reference); each response is validated before use and anything missing is treated as unavailable.
 */

const RATE = "rateLimit { cost remaining resetAt }";

export const VIEWER_QUERY = `query UnbluffViewer { viewer { id databaseId login url } ${RATE} }`;

export const CONTRIBUTIONS_QUERY = `query UnbluffContributions($from: DateTime!, $to: DateTime!) {
  viewer {
    contributionsCollection(from: $from, to: $to) {
      startedAt
      endedAt
      restrictedContributionsCount
      totalCommitContributions
      totalIssueContributions
      totalPullRequestContributions
      totalPullRequestReviewContributions
      contributionCalendar {
        totalContributions
        weeks { firstDay contributionDays { date contributionCount } }
      }
    }
  }
  ${RATE}
}`;

export const REPOSITORIES_QUERY = `query UnbluffRepositories($after: String, $since: GitTimestamp!, $authorId: ID!) {
  viewer {
    repositories(first: 25, after: $after, ownerAffiliations: OWNER, privacy: PUBLIC, orderBy: { field: PUSHED_AT, direction: DESC }) {
      totalCount
      pageInfo { hasNextPage endCursor }
      nodes {
        nameWithOwner
        name
        url
        description
        isPrivate
        isFork
        isArchived
        pushedAt
        updatedAt
        stargazerCount
        primaryLanguage { name }
        languages(first: 5, orderBy: { field: SIZE, direction: DESC }) { edges { size node { name } } }
        licenseInfo { spdxId }
        repositoryTopics(first: 5) { nodes { topic { name } } }
        issues(states: OPEN) { totalCount }
        pullRequests(states: OPEN) { totalCount }
        defaultBranchRef { target { ... on Commit { history(since: $since, author: { id: $authorId }) { totalCount } } } }
        root: object(expression: "HEAD:") { ... on Tree { entries { name type } } }
      }
    }
  }
  ${RATE}
}`;

export const ACTIVITY_QUERY = `query UnbluffActivity($from: DateTime!, $to: DateTime!) {
  viewer {
    pullRequests(first: 15, orderBy: { field: CREATED_AT, direction: DESC }) {
      totalCount
      nodes { title url state createdAt repository { nameWithOwner isPrivate } }
    }
    issues(first: 15, orderBy: { field: CREATED_AT, direction: DESC }) {
      totalCount
      nodes { title url state createdAt repository { nameWithOwner isPrivate } }
    }
    contributionsCollection(from: $from, to: $to) {
      pullRequestReviewContributions(first: 15) {
        nodes { occurredAt pullRequestReview { state } pullRequest { title url repository { nameWithOwner isPrivate } } }
      }
    }
  }
  ${RATE}
}`;

/** README text for up to MAX_README_READS repositories at once. Names and paths are variables, never interpolated. */
export const MAX_README_READS = 10;
export function readmesQuery(count: number): string {
  const n = Math.min(count, MAX_README_READS);
  const vars = Array.from({ length: n }, (_, i) => `$o${i}: String!, $n${i}: String!, $e${i}: String!`).join(", ");
  const body = Array.from({ length: n }, (_, i) => `r${i}: repository(owner: $o${i}, name: $n${i}) { object(expression: $e${i}) { ... on Blob { byteSize isTruncated text } } }`).join(" ");
  return `query UnbluffReadmes(${vars}) { ${body} ${RATE} }`;
}

// ---------------- response schemas (lenient about extras, strict about the fields we use) ----------------

const Count = z.object({ totalCount: z.number().int().nonnegative() });
/** Every link we store or show comes from GitHub and must point at github.com over https (never javascript: or another host). */
const GithubUrl = z.string().url().max(500).startsWith("https://github.com/");

const RepoRef = z.object({ nameWithOwner: z.string().max(200), isPrivate: z.boolean() });

export const ViewerData = z.object({ viewer: z.object({ id: z.string().min(1), databaseId: z.number().int().positive(), login: z.string().min(1).max(100), url: GithubUrl }) });

export const ContributionsData = z.object({
  viewer: z.object({
    contributionsCollection: z.object({
      startedAt: z.string(),
      endedAt: z.string(),
      restrictedContributionsCount: z.number().int().nonnegative().nullish(),
      totalCommitContributions: z.number().int().nonnegative(),
      totalIssueContributions: z.number().int().nonnegative(),
      totalPullRequestContributions: z.number().int().nonnegative(),
      totalPullRequestReviewContributions: z.number().int().nonnegative(),
      contributionCalendar: z.object({
        totalContributions: z.number().int().nonnegative(),
        weeks: z.array(
          z.object({
            firstDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
            contributionDays: z.array(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), contributionCount: z.number().int().nonnegative() })).max(7),
          }),
        ).max(60),
      }),
    }),
  }),
});

const TreeEntry = z.object({ name: z.string().max(255), type: z.string().max(20) });
export const RepoNode = z.object({
  nameWithOwner: z.string().regex(/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/).max(200),
  name: z.string().regex(/^[A-Za-z0-9._-]{1,100}$/),
  url: GithubUrl,
  description: z.string().nullish(),
  isPrivate: z.boolean(),
  isFork: z.boolean(),
  isArchived: z.boolean(),
  pushedAt: z.string().nullish(),
  updatedAt: z.string().nullish(),
  stargazerCount: z.number().int().nonnegative(),
  primaryLanguage: z.object({ name: z.string() }).nullish(),
  languages: z.object({ edges: z.array(z.object({ size: z.number().nonnegative(), node: z.object({ name: z.string() }) })).nullish() }).nullish(),
  licenseInfo: z.object({ spdxId: z.string().nullish() }).nullish(),
  repositoryTopics: z.object({ nodes: z.array(z.object({ topic: z.object({ name: z.string() }) })).nullish() }).nullish(),
  issues: Count,
  pullRequests: Count,
  defaultBranchRef: z.object({ target: z.object({ history: Count }).partial().nullish() }).nullish(),
  root: z.object({ entries: z.array(TreeEntry).nullish() }).partial().nullish(),
});
export type RepoNodeT = z.infer<typeof RepoNode>;

export const RepositoriesData = z.object({
  viewer: z.object({
    repositories: z.object({
      totalCount: z.number().int().nonnegative(),
      pageInfo: z.object({ hasNextPage: z.boolean(), endCursor: z.string().nullish() }),
      nodes: z.array(RepoNode.nullable()),
    }),
  }),
});

const ItemNode = z.object({ title: z.string().max(500), url: GithubUrl, state: z.string().max(20), createdAt: z.string(), repository: RepoRef });
export const ActivityData = z.object({
  viewer: z.object({
    pullRequests: z.object({ totalCount: z.number().int().nonnegative(), nodes: z.array(ItemNode.nullable()) }),
    issues: z.object({ totalCount: z.number().int().nonnegative(), nodes: z.array(ItemNode.nullable()) }),
    contributionsCollection: z.object({
      pullRequestReviewContributions: z.object({
        nodes: z.array(
          z
            .object({
              occurredAt: z.string(),
              pullRequestReview: z.object({ state: z.string().max(30) }),
              pullRequest: z.object({ title: z.string().max(500), url: GithubUrl, repository: RepoRef }),
            })
            .nullable(),
        ),
      }),
    }),
  }),
});

export const ReadmesData = z.record(z.string(), z.unknown());
export const ReadmeBlob = z.object({ object: z.object({ byteSize: z.number().int().nonnegative(), isTruncated: z.boolean(), text: z.string().nullable() }).partial().nullish() }).nullable();
