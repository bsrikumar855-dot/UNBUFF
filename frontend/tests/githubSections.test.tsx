import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  ActivityTimeline,
  ChecklistCards,
  RepoList,
} from "@/components/github/GithubSections";
import { checklistScore } from "@/lib/github";
import type { GithubChecklistItem, GithubRepository } from "@/types/contract";

const repo = (name: string, over: Partial<GithubRepository> = {}): GithubRepository => ({
  name_with_owner: `a/${name}`,
  url: `https://github.com/a/${name}`,
  description: null,
  primary_language: null,
  languages: [],
  is_fork: false,
  is_archived: false,
  pushed_at: null,
  updated_at: null,
  stars: 0,
  open_issues: 0,
  open_pull_requests: 0,
  your_commits_90d: 0,
  has_license: null,
  topics: [],
  ...over,
});
const check = (
  repository: string,
  status: GithubChecklistItem["status"],
  n: number
): GithubChecklistItem => ({
  repository,
  check: `readme_present`,
  status,
  label: `Check ${n}`,
  evidence: "e",
});

describe("GitHub sections", () => {
  it("scores the checklist and leaves unchecked items out of the denominator", () => {
    expect(
      checklistScore([
        check("a/x", "pass", 1),
        check("a/x", "fail", 2),
        check("a/x", "unknown", 3),
      ])
    ).toEqual({ pass: 1, checked: 2, unknown: 1 });
  });

  it("shows overall and per-repository progress, failing checks first", () => {
    render(<ChecklistCards items={[check("a/x", "pass", 1), check("a/x", "fail", 2)]} />);
    expect(screen.getByText(/1 of 2 checks done/)).toBeInTheDocument();
    const items = screen.getAllByText(/^Check \d/);
    expect(items[0]).toHaveTextContent("Check 2: Missing");
  });

  it("can hide forks and archived repositories, and says how many are shown", () => {
    render(
      <RepoList
        repos={[
          repo("own"),
          repo("forked", { is_fork: true }),
          repo("old", { is_archived: true }),
        ]}
      />
    );
    expect(screen.getByText("Showing 3 of 3")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Hide forks and archived"));
    expect(screen.getByText("Showing 1 of 3")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "a/forked" })).not.toBeInTheDocument();
  });

  it("groups activity by month, newest first", () => {
    render(
      <ActivityTimeline
        items={[
          {
            kind: "issue",
            title: "Older",
            url: "https://x/1",
            repository: "a/r",
            state: "OPEN",
            occurred_at: "2026-09-01T00:00:00Z",
          },
          {
            kind: "pull_request",
            title: "Newer",
            url: "https://x/2",
            repository: "a/r",
            state: "MERGED",
            occurred_at: "2026-10-05T00:00:00Z",
          },
        ]}
      />
    );
    const links = screen.getAllByRole("link").map((l) => l.textContent);
    expect(links).toEqual(["Newer", "Older"]);
  });
});
