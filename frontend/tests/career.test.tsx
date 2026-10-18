import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AppRoutes } from "@/App";
import { AuthProvider } from "@/auth/AuthContext";
import type { AuthClient, AuthUser } from "@/auth/types";
import { api } from "@/api/endpoints";
import { ApiError } from "@/api/types";
import type { CareerFeedResponse, CareerJob, CareerJobCard, CareerMatch, CareerPreferencesResponse, CareerTrackedItem, CareerTracker, MentorChatResponse } from "@/types/contract";

vi.mock("@/api/endpoints", () => ({
  api: {
    getCareerJobs: vi.fn(),
    getCareerJob: vi.fn(),
    getCareerFacets: vi.fn(),
    getCareerPreferences: vi.fn(),
    putCareerPreferences: vi.fn(),
    getCareerTracked: vi.fn(),
    updateCareerTracked: vi.fn(),
    removeCareerTracked: vi.fn(),
    mentorChat: vi.fn(),
    listMentorConversations: vi.fn(),
    getMentorConversation: vi.fn(),
    getHealth: vi.fn(),
    getQuestion: vi.fn(),
  },
}));
const mocked = vi.mocked(api);

const user: AuthUser = { uid: "u1", email: "a@b.co" };
const fakeAuth = (u: AuthUser | null): AuthClient => ({
  configured: true,
  onChange(cb) {
    queueMicrotask(() => cb(u));
    return () => undefined;
  },
  signIn: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(async () => undefined),
  sendPasswordReset: vi.fn(),
  getIdToken: vi.fn(async () => (u ? "t" : null)),
});
const renderAt = (path: string, u: AuthUser | null = user) =>
  render(
    <AuthProvider client={fakeAuth(u)}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </AuthProvider>
  );

const job = (over: Partial<CareerJob> = {}): CareerJob => ({
  id: "freehire:react-intern-1",
  slug: "react-intern-1",
  source: "freehire",
  source_board: "greenhouse",
  title: "React Intern",
  company: "Acme Labs",
  location: "Bengaluru, India",
  countries: ["in"],
  regions: ["apac"],
  cities: ["Bengaluru"],
  work_mode: "hybrid",
  skills: ["react", "javascript", "css"],
  seniority: "intern",
  employment_type: "internship",
  category: "frontend",
  experience_years_min: 0,
  salary: null,
  summary: "A frontend internship.",
  preview: "Build UI with React.",
  requirements: [{ text: "Knows React basics", priority: "required" }],
  apply_url: "https://boards.example.com/acme/1",
  freehire_url: "https://freehire.me/jobs/react-intern-1",
  posted_at: new Date(Date.now() - 2 * 86_400_000).toISOString(),
  updated_at: null,
  last_seen_at: null,
  closed_at: null,
  reality: { class: "fresh", age_days: 2, repost_count: 1, fake_freshness: false },
  ghost_level: null,
  ...over,
});
const match = (over: Partial<CareerMatch> = {}): CareerMatch => ({
  score: 81,
  confidence: "medium",
  matched_skills: [{ skill: "react", provenance: "verified" }, { skill: "javascript", provenance: "self_reported" }],
  missing_skills: ["css"],
  components: [
    { key: "skills", label: "Skills", weight: 0.35, state: "partial", value: 0.57, note: "2 of 3 listed skills are in your profile." },
    { key: "category", label: "Role category", weight: 0.25, state: "match", value: 1, note: "The frontend category is one you target." },
    { key: "location", label: "Location", weight: 0.1, state: "not_set", value: null, note: "No preferred country or city set." },
  ],
  reasons: ["Matches your skills: react (verified), javascript (self-reported)."],
  hard_mismatches: [],
  unverified_constraints: [],
  ...over,
});
const card = (j: Partial<CareerJob> = {}, m: Partial<CareerMatch> = {}, tracker: CareerTracker | null = null): CareerJobCard => ({ job: job(j), match: match(m), tracker });
const tracker = (over: Partial<CareerTracker> = {}): CareerTracker => ({ saved: true, status: "saved", applied_on: null, follow_up_on: null, notes: "", posting_state: "unknown", updated_at: "2026-10-18T00:00:00.000Z", ...over });
const feed = (jobs: CareerJobCard[], over: Partial<CareerFeedResponse> = {}): CareerFeedResponse => ({
  tab: "for_you",
  jobs,
  total: jobs.length,
  limit: 20,
  offset: 0,
  has_more: false,
  ranked_window: jobs.length,
  filters: {},
  relaxed: [],
  ignored_params: [],
  personalization: { level: "full", notes: [] },
  source: { name: "Freehire", url: "https://freehire.me", api: "https://freehire.me/api/v1" },
  fetched_at: "2026-10-18T00:00:00.000Z",
  ...over,
});
const prefs = (over: Partial<CareerPreferencesResponse> = {}): CareerPreferencesResponse => ({
  preferences: null,
  updated_at: null,
  profile: { role_names: ["Frontend Developer"], experience_level: "beginner", derived_categories: ["frontend"], verified_skills: ["react"], resume_skills: [], resume_skills_saved_at: null, self_reported_skills: ["javascript"], target_companies: [], placement_date: null },
  ...over,
});
const item = (over: Partial<CareerTrackedItem> = {}): CareerTrackedItem => ({ slug: "react-intern-1", title: "React Intern", company: "Acme Labs", apply_url: "https://boards.example.com/acme/1", freehire_url: "https://freehire.me/jobs/react-intern-1", tracker: tracker(), ...over });
const facets = { total: 100, facets: { category: [{ value: "frontend", count: 10 }, { value: "backend", count: 8 }], countries: [{ value: "in", count: 50 }], skills: [{ value: "react", count: 9 }] }, source: { name: "Freehire" as const, url: "https://freehire.me", api: "x" }, fetched_at: "x" };

beforeEach(() => {
  vi.resetAllMocks();
  mocked.getCareerPreferences.mockResolvedValue(prefs());
  mocked.getCareerJobs.mockResolvedValue(feed([card()]));
  mocked.getCareerFacets.mockResolvedValue(facets);
  mocked.getCareerTracked.mockResolvedValue({ items: [], total: 0 });
  mocked.listMentorConversations.mockResolvedValue({ conversations: [], page: 1, page_size: 20, total: 0, total_pages: 1 });
  mocked.getHealth.mockResolvedValue({ status: "ok", llm_mode: "live", model: "m" });
});

const lastParams = () => mocked.getCareerJobs.mock.calls.at(-1)![0];

describe("Career page", () => {
  it("shows the profile summary, the sections and genuine listings with attribution and an original-posting link", async () => {
    renderAt("/career");
    expect(await screen.findByRole("heading", { name: "Career" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "React Intern" })).toBeInTheDocument();
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["For you", "Internships", "Jobs", "Explore", "Saved", "Applications"]);
    expect(screen.getByText("Frontend Developer")).toBeInTheDocument();
    expect(screen.getByText(/1 verified, 1 stated/)).toBeInTheDocument();
    expect(screen.getByText(/Showing 1 to 1 of 1 matching postings on Freehire/)).toBeInTheDocument();
    expect(screen.getByText("81")).toBeInTheDocument();
    const apply = screen.getByRole("link", { name: /Apply on employer site/ });
    expect(apply).toHaveAttribute("href", "https://boards.example.com/acme/1");
    expect(apply).toHaveAttribute("target", "_blank");
    expect(apply).toHaveAttribute("rel", expect.stringContaining("noopener"));
    expect(apply).toHaveAttribute("rel", expect.stringContaining("noreferrer"));
    expect(lastParams()).toMatchObject({ tab: "for_you", limit: 20 });
  });

  it("requires sign-in", async () => {
    renderAt("/career", null);
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(mocked.getCareerJobs).not.toHaveBeenCalled();
  });

  it("separates internships, jobs and explore into their own requests", async () => {
    renderAt("/career");
    await screen.findByRole("heading", { name: "React Intern" });
    for (const [label, tab] of [["Internships", "internships"], ["Jobs", "jobs"], ["Explore", "explore"]] as const) {
      fireEvent.mouseDown(screen.getByRole("tab", { name: label }));
      await waitFor(() => expect(lastParams().tab).toBe(tab));
    }
  });

  it("never shows a link that is not https, and falls back to the Freehire page", async () => {
    mocked.getCareerJobs.mockResolvedValue(feed([card({ apply_url: "javascript:alert(1)" }), card({ slug: "b", id: "freehire:b", title: "Other", apply_url: null })]));
    renderAt("/career");
    await screen.findByRole("heading", { name: "React Intern" });
    expect(screen.queryByRole("link", { name: /Apply on employer site/ })).not.toBeInTheDocument();
    const fallback = screen.getAllByRole("link", { name: /View on Freehire/ });
    expect(fallback).toHaveLength(2);
    for (const a of fallback) expect(a).toHaveAttribute("href", expect.stringMatching(/^https:\/\/freehire\.me\/jobs\//));
  });

  it("shows an unscored posting honestly, and a posting with no company or date without inventing them", async () => {
    mocked.getCareerJobs.mockResolvedValue(feed([card({ company: null, posted_at: null, location: null }, { score: null, confidence: "insufficient", components: [], reasons: [] })]));
    renderAt("/career");
    await screen.findByRole("heading", { name: "React Intern" });
    expect(screen.getByText("Not scored")).toBeInTheDocument();
    expect(screen.getByText("Employer not named in the listing")).toBeInTheDocument();
    expect(screen.getByText("No posting date given")).toBeInTheDocument();
  });

  it("explains the match when a row is opened: components, provenance, requirements and freshness, with no claim it is open", async () => {
    renderAt("/career");
    fireEvent.click(await screen.findByRole("button", { name: "React Intern" }));
    const region = await screen.findByRole("region", { name: "Details for React Intern" });
    expect(within(region).getByText("Why this match")).toBeInTheDocument();
    expect(within(region).getByText("2 of 3 listed skills are in your profile.")).toBeInTheDocument();
    expect(within(region).getByText(/react/)).toBeInTheDocument();
    expect(within(region).getByText("Knows React basics")).toBeInTheDocument();
    expect(within(region).getByText(/Freehire rates this posting fresh/)).toBeInTheDocument();
    expect(within(region).getByText(/not a guarantee that it is still open/)).toBeInTheDocument();
    expect(within(region).getByRole("form", { name: "Application tracker" })).toBeInTheDocument();
    expect(screen.queryByText(/This job is open|Currently open/i)).not.toBeInTheDocument();
  });

  it("flags a hedged ghost-posting signal and stale postings as signals, not facts", async () => {
    mocked.getCareerJobs.mockResolvedValue(feed([card({ ghost_level: "possible", reality: { class: "stale", age_days: 200, repost_count: 3, fake_freshness: true } })]));
    renderAt("/career");
    await screen.findByRole("heading", { name: "React Intern" });
    expect(screen.getByText(/Marked stale by Freehire/)).toBeInTheDocument();
    expect(screen.getByText(/Flagged as possibly inactive/)).toBeInTheDocument();
  });

  it("lists mandatory-preference problems in the match details", async () => {
    mocked.getCareerJobs.mockResolvedValue(feed([card({}, { hard_mismatches: ["Work mode: Hybrid; you prefer remote."], unverified_constraints: ["Location: the posting does not say, so this cannot be confirmed."] })]));
    renderAt("/career");
    fireEvent.click(await screen.findByRole("button", { name: "React Intern" }));
    expect(await screen.findByText("Breaks something you marked as required")).toBeInTheDocument();
    expect(screen.getByText("Work mode: Hybrid; you prefer remote.")).toBeInTheDocument();
    expect(screen.getByText("Can't confirm what you marked as required")).toBeInTheDocument();
  });
});

describe("search, filters and paging", () => {
  it("applies search and filters only when submitted, keeps them visible as chips, and resets", async () => {
    renderAt("/career?tab=explore");
    await screen.findByRole("heading", { name: "React Intern" });
    fireEvent.change(screen.getByLabelText("Search"), { target: { value: "react" } });
    expect(mocked.getCareerJobs).toHaveBeenCalledTimes(1); // typing alone sends nothing
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    await waitFor(() => expect(mocked.getCareerFacets).toHaveBeenCalled());
    fireEvent.click(screen.getByLabelText("remote"));
    fireEvent.change(await screen.findByLabelText("Country"), { target: { value: "in" } });
    fireEvent.click(screen.getByLabelText("internship"));
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    await waitFor(() => expect(lastParams()).toMatchObject({ tab: "explore", q: "react", work_mode: ["remote"], countries: ["in"], employment_type: ["internship"] }));
    const chips = await screen.findByRole("list", { name: "Active filters" });
    expect(within(chips).getByText(/Search: react/)).toBeInTheDocument();
    expect(within(chips).getByText(/Country: IN/)).toBeInTheDocument();
    expect(within(chips).getByText(/Work mode: remote/)).toBeInTheDocument();

    fireEvent.click(within(chips).getByRole("button", { name: /Country: IN/ }));
    await waitFor(() => expect(lastParams().countries).toEqual([]));
    fireEvent.click(screen.getByRole("button", { name: "Reset all filters" }));
    await waitFor(() => expect(lastParams()).toMatchObject({ q: undefined, work_mode: [], employment_type: [] }));
    expect(screen.queryByRole("list", { name: "Active filters" })).not.toBeInTheDocument();
  });

  it("searches by company or title only when asked", async () => {
    renderAt("/career?tab=internships");
    await screen.findByRole("heading", { name: "React Intern" });
    fireEvent.change(screen.getByLabelText("Search"), { target: { value: "acme" } });
    fireEvent.change(screen.getByLabelText("Search in"), { target: { value: "company" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(lastParams()).toMatchObject({ tab: "internships", q: "acme", search_in: "company" }));
  });

  it("includes older postings and broadens full-time roles only when the student chooses to", async () => {
    renderAt("/career?tab=jobs");
    await screen.findByRole("heading", { name: "React Intern" });
    expect(lastParams()).toMatchObject({ include_stale: undefined, broaden: undefined });
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    fireEvent.click(screen.getByLabelText(/Include mid-level roles/));
    fireEvent.click(screen.getByLabelText(/Include older postings/));
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    await waitFor(() => expect(lastParams()).toMatchObject({ tab: "jobs", broaden: true, include_stale: true }));
    const chips = await screen.findByRole("list", { name: "Active filters" });
    expect(within(chips).getByText("Including mid-level roles")).toBeInTheDocument();
    expect(within(chips).getByText("Including older postings")).toBeInTheDocument();
  });

  it("pages through the real total with offsets, and says when upstream gives no total", async () => {
    mocked.getCareerJobs.mockResolvedValue(feed([card()], { tab: "explore", total: 2826, has_more: true, ranked_window: null }));
    renderAt("/career?tab=explore");
    expect(await screen.findByText("Page 1 of 142")).toBeInTheDocument();
    expect(screen.getByText(/Showing 1 to 1 of 2,826 postings on Freehire/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(lastParams()).toMatchObject({ offset: 20, limit: 20 }));
    mocked.getCareerJobs.mockResolvedValue(feed([card()], { tab: "explore", total: null, has_more: false, ranked_window: null }));
    fireEvent.click(screen.getByRole("tab", { name: "Internships" }));
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Internships" }));
    expect(await screen.findByText(/Freehire did not report a total/)).toBeInTheDocument();
  });

  it("ranks Internships by match by default, pages over the ranked window, and can switch to newest first", async () => {
    mocked.getCareerJobs.mockResolvedValue(feed([card()], { tab: "internships", total: 5436, has_more: true, ranked_window: 100 }));
    renderAt("/career?tab=internships");
    expect(await screen.findByText("Page 1 of 5")).toBeInTheDocument(); // 100 ranked candidates, not 5,436 / 20
    expect(screen.getByText(/Ranked from the 100 most recent candidates, best match first\. Choose newest first in Filters/)).toBeInTheDocument();
    expect(lastParams().sort).toBeUndefined();
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    fireEvent.change(await screen.findByLabelText("Order"), { target: { value: "newest" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    await waitFor(() => expect(lastParams()).toMatchObject({ tab: "internships", sort: "newest" }));
    expect(await screen.findByText(/Order: newest first/)).toBeInTheDocument();
  });

  it("offers ranking in Explore without making it the default", async () => {
    renderAt("/career?tab=explore");
    await screen.findByRole("heading", { name: "React Intern" });
    expect(lastParams().sort).toBeUndefined();
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    const order = (await screen.findByLabelText("Order")) as HTMLSelectElement;
    expect([...order.options].map((o) => o.value)).toEqual(["", "best_match"]);
    fireEvent.change(order, { target: { value: "best_match" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    await waitFor(() => expect(lastParams().sort).toBe("best_match"));
  });

  it("caps page numbers where upstream stops serving rows", async () => {
    mocked.getCareerJobs.mockResolvedValue(feed([card()], { tab: "explore", total: 1_400_000, has_more: true, ranked_window: null }));
    renderAt("/career?tab=explore");
    expect(await screen.findByText("Page 1 of 500")).toBeInTheDocument();
    expect(screen.getByText(/does not serve results past page 500/)).toBeInTheDocument();
  });

  it("warns when Freehire ignored a filter, tells the student when a filter was relaxed, and when personalisation is limited", async () => {
    mocked.getCareerJobs.mockResolvedValue(feed([card()], { ignored_params: [{ param: "country", did_you_mean: "countries" }], relaxed: ["category"], personalization: { level: "limited", notes: ["No skills to compare yet."] } }));
    renderAt("/career");
    expect(await screen.findByText(/Freehire ignored country \(did you mean countries\?\)/)).toBeInTheDocument();
    expect(screen.getByText(/Nothing matched your category filter/)).toBeInTheDocument();
    expect(screen.getByText(/Limited personalisation: No skills to compare yet\./)).toBeInTheDocument();
  });
});

describe("states", () => {
  it("shows loading rows, then an error with a retry that really retries, and never listings", async () => {
    mocked.getCareerJobs.mockRejectedValueOnce(new ApiError("down", "CAREER_UNAVAILABLE", 502)).mockResolvedValueOnce(feed([card()]));
    renderAt("/career");
    expect(await screen.findByText(/job source could not be reached/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "React Intern" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("heading", { name: "React Intern" })).toBeInTheDocument();
    expect(mocked.getCareerJobs).toHaveBeenCalledTimes(2);
  });

  it("explains rate limiting", async () => {
    mocked.getCareerJobs.mockRejectedValue(new ApiError("slow down", "CAREER_RATE_LIMITED", 429));
    renderAt("/career");
    expect(await screen.findByText(/receiving too many requests/i)).toBeInTheDocument();
  });

  it("shows an honest empty state with ways to widen the search", async () => {
    mocked.getCareerJobs.mockResolvedValue(feed([], { tab: "jobs", total: 0, ranked_window: null }));
    renderAt("/career?tab=jobs");
    expect(await screen.findByText("Nothing matched")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Include mid-level roles" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Include older postings" })).toBeInTheDocument();
    expect(screen.getByText(/never fills a gap with listings it did not fetch/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Include older postings" }));
    await waitFor(() => expect(lastParams().include_stale).toBe(true));
  });

  it("shows an offline notice", async () => {
    renderAt("/career");
    await screen.findByRole("heading", { name: "React Intern" });
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(await screen.findByText(/You appear to be offline/)).toBeInTheDocument();
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    await waitFor(() => expect(screen.queryByText(/You appear to be offline/)).not.toBeInTheDocument());
  });

  it("copes with a profile that cannot be read", async () => {
    mocked.getCareerPreferences.mockRejectedValue(new ApiError("x", "INTERNAL", 500));
    renderAt("/career");
    expect(await screen.findByText(/Something went wrong on our side/)).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "React Intern" })).toBeInTheDocument();
  });
});

describe("saving and tracking", () => {
  it("saves and un-saves a listing from the row", async () => {
    mocked.updateCareerTracked.mockResolvedValueOnce({ item: item() }).mockResolvedValueOnce({ item: null });
    renderAt("/career");
    const save = await screen.findByRole("button", { name: /^Save React Intern/ });
    expect(save).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(save);
    await waitFor(() => expect(mocked.updateCareerTracked).toHaveBeenCalledWith("react-intern-1", { saved: true }));
    const saved = await screen.findByRole("button", { name: /^Saved React Intern/ });
    expect(saved).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(saved);
    await waitFor(() => expect(mocked.updateCareerTracked).toHaveBeenLastCalledWith("react-intern-1", { saved: false }));
    expect(await screen.findByRole("button", { name: /^Save React Intern/ })).toHaveAttribute("aria-pressed", "false");
  });

  it("shows why a save failed instead of pretending it worked", async () => {
    mocked.updateCareerTracked.mockRejectedValue(new ApiError("gone", "CAREER_JOB_NOT_FOUND", 404));
    renderAt("/career");
    fireEvent.click(await screen.findByRole("button", { name: /^Save React Intern/ }));
    expect(await screen.findByText(/could not be found/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Save React Intern/ })).toHaveAttribute("aria-pressed", "false");
  });

  it("records a status, dates and private notes, offering only the moves the server allows", async () => {
    mocked.getCareerJobs.mockResolvedValue(feed([card({}, {}, tracker({ status: "interested" }))]));
    mocked.updateCareerTracked.mockResolvedValue({ item: item({ tracker: tracker({ status: "applied", applied_on: "2026-10-15", follow_up_on: "2026-10-25", notes: "referred" }) }) });
    renderAt("/career");
    fireEvent.click(await screen.findByRole("button", { name: "React Intern" }));
    const form = await screen.findByRole("form", { name: "Application tracker" });
    const status = within(form).getByLabelText("Status") as HTMLSelectElement;
    expect([...status.options].map((o) => o.value)).toEqual(["saved", "interested", "applied", "withdrawn"]);
    fireEvent.change(status, { target: { value: "applied" } });
    fireEvent.change(within(form).getByLabelText("Applied on"), { target: { value: "2026-10-15" } });
    fireEvent.change(within(form).getByLabelText("Follow up on"), { target: { value: "2026-10-25" } });
    fireEvent.change(within(form).getByLabelText("Private notes"), { target: { value: "referred" } });
    fireEvent.click(within(form).getByRole("button", { name: "Save tracker" }));
    await waitFor(() => expect(mocked.updateCareerTracked).toHaveBeenCalledWith("react-intern-1", { status: "applied", applied_on: "2026-10-15", follow_up_on: "2026-10-25", notes: "referred" }));
    expect(await within(form).findByText(/Current status: Applied/)).toBeInTheDocument();
  });

  it("shows the server's reason when a status move is refused", async () => {
    mocked.updateCareerTracked.mockRejectedValue(new ApiError("You can't move an application from \"saved\" to \"offer\".", "BAD_REQUEST", 400));
    renderAt("/career");
    fireEvent.click(await screen.findByRole("button", { name: "React Intern" }));
    const form = await screen.findByRole("form", { name: "Application tracker" });
    fireEvent.change(within(form).getByLabelText("Private notes"), { target: { value: "x" } });
    fireEvent.click(within(form).getByRole("button", { name: "Save tracker" }));
    expect(await within(form).findByText(/can't move an application/)).toBeInTheDocument();
  });
});

describe("saved jobs and applications", () => {
  it("lists saved jobs with the original links, and removes a bookmark", async () => {
    mocked.getCareerTracked.mockResolvedValueOnce({ items: [item()], total: 1 }).mockResolvedValueOnce({ items: [], total: 0 });
    mocked.removeCareerTracked.mockResolvedValue(undefined);
    renderAt("/career?tab=saved");
    const list = await screen.findByRole("list", { name: "Saved jobs" });
    expect(within(list).getByRole("heading", { name: "React Intern" })).toBeInTheDocument();
    expect(within(list).getByRole("link", { name: /Employer page/ })).toHaveAttribute("href", "https://boards.example.com/acme/1");
    expect(within(list).getByRole("link", { name: /On Freehire/ })).toHaveAttribute("rel", expect.stringContaining("noopener"));
    expect(mocked.getCareerTracked).toHaveBeenCalledWith("saved");
    fireEvent.click(within(list).getByRole("button", { name: /Edit tracker/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Remove bookmark/ }));
    await waitFor(() => expect(mocked.removeCareerTracked).toHaveBeenCalledWith("react-intern-1", "bookmark"));
    expect(await screen.findByText("No saved jobs yet")).toBeInTheDocument();
  });

  it("shows empty states that explain what to do, and that tracking does not apply for them", async () => {
    renderAt("/career?tab=applications");
    expect(await screen.findByText("No applications tracked yet")).toBeInTheDocument();
    expect(screen.getByText(/does not apply for you/)).toBeInTheDocument();
    expect(mocked.getCareerTracked).toHaveBeenCalledWith("applications");
  });

  it("shows applications with dates, a possibly-unavailable marker, and can check the listing", async () => {
    mocked.getCareerTracked.mockResolvedValue({ items: [item({ tracker: tracker({ status: "interviewing", applied_on: "2026-10-15", follow_up_on: "2026-10-25", notes: "n", posting_state: "possibly_unavailable" }) })], total: 1 });
    mocked.getCareerJob.mockRejectedValue(new ApiError("gone", "CAREER_JOB_NOT_FOUND", 404));
    renderAt("/career?tab=applications");
    expect(await screen.findByText("Interviewing")).toBeInTheDocument();
    expect(screen.getByText("Listing may no longer be available")).toBeInTheDocument();
    expect(screen.getByText(/Applied .*2026.*Follow up .*2026.*Has notes/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Check listing/ }));
    expect(await screen.findByText(/no longer lists this posting\. Your notes and history are kept/)).toBeInTheDocument();
  });

  it("deletes a whole record only on request", async () => {
    mocked.getCareerTracked.mockResolvedValue({ items: [item({ tracker: tracker({ saved: false, status: "applied" }) })], total: 1 });
    mocked.removeCareerTracked.mockResolvedValue(undefined);
    renderAt("/career?tab=applications");
    fireEvent.click(await screen.findByRole("button", { name: /Edit tracker/ }));
    expect(screen.queryByRole("button", { name: /Remove bookmark/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Delete this record/ }));
    await waitFor(() => expect(mocked.removeCareerTracked).toHaveBeenCalledWith("react-intern-1", "all"));
  });
});

describe("career preferences", () => {
  it("shows what comes from the profile and saves only what the student typed", async () => {
    mocked.putCareerPreferences.mockImplementation(async (p) => prefs({ preferences: p }));
    renderAt("/career");
    await screen.findByRole("heading", { name: "React Intern" });
    fireEvent.click(screen.getByRole("button", { name: "Career preferences" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Already known from your profile")).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "your placement goals" })).toHaveAttribute("href", "/placement");
    fireEvent.change(within(dialog).getByLabelText(/Other skills you have/), { target: { value: "Python, SQL" } });
    fireEvent.change(within(dialog).getByLabelText("Countries (two-letter codes)"), { target: { value: "IN, us" } });
    fireEvent.change(within(dialog).getByLabelText("Cities"), { target: { value: "Bengaluru" } });
    fireEvent.click(within(dialog).getByLabelText("remote"));
    fireEvent.click(within(dialog).getByLabelText("internship"));
    fireEvent.click(within(dialog).getByLabelText("Work mode", { selector: "input[type=checkbox]" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save preferences" }));
    await waitFor(() => expect(mocked.putCareerPreferences).toHaveBeenCalledTimes(1));
    expect(mocked.putCareerPreferences.mock.calls[0]![0]).toEqual({ categories: [], skills: ["python", "sql"], countries: ["in", "us"], cities: ["Bengaluru"], work_modes: ["remote"], employment_types: ["internship"], must_match_location: false, must_match_work_mode: true, must_match_employment: false });
    await waitFor(() => expect(mocked.getCareerJobs.mock.calls.length).toBeGreaterThan(1)); // the feed is re-ranked with them
  });

  it("shows a refused save", async () => {
    mocked.putCareerPreferences.mockRejectedValue(new ApiError("countries: use two-letter country codes like in or us", "BAD_REQUEST", 400));
    renderAt("/career");
    await screen.findByRole("heading", { name: "React Intern" });
    fireEvent.click(screen.getByRole("button", { name: "Career preferences" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save preferences" }));
    expect(await within(dialog).findByText(/two-letter country codes/)).toBeInTheDocument();
  });
});

describe("AI mentor from Career", () => {
  const reply = (): MentorChatResponse => ({ conversation: { id: "conv_aaaaaaaaaaaaaaaaaaaaaaaa", title: "t", mode: "placement_mentor", message_count: 2, hint_level: 0, created_at: "x", updated_at: "x" }, reply: { id: "m", role: "assistant", content: "Here is what the matches show.", at: "x" }, memory_saved: [], persistence: { conversation: "saved", memory: "none" }, references: [], analytics_note: null, degraded: false, mock: false });

  it("opens with career context on, shows the career questions, and sends the flag", async () => {
    mocked.mentorChat.mockResolvedValue(reply());
    renderAt("/mentor?career=1");
    expect(await screen.findByText(/Career context is on/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Which internships fit my current skills?" }));
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(mocked.mentorChat).toHaveBeenCalled());
    expect(mocked.mentorChat.mock.calls[0]![0]).toMatchObject({ mode: "placement_mentor", career_context: true, message: "Which internships fit my current skills?" });
  });

  it("does not send career context from an ordinary mentor page", async () => {
    mocked.mentorChat.mockResolvedValue(reply());
    renderAt("/mentor");
    await screen.findByRole("heading", { name: "AI Mentor" });
    expect(screen.queryByText(/Career context is on/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Your message"), { target: { value: "hello" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(mocked.mentorChat).toHaveBeenCalled());
    expect(mocked.mentorChat.mock.calls[0]![0].career_context).toBeUndefined();
  });

  it("links to it from the Career page", async () => {
    renderAt("/career");
    await screen.findByRole("heading", { name: "React Intern" });
    expect(screen.getByRole("link", { name: "Ask the AI mentor" })).toHaveAttribute("href", "/mentor?career=1");
  });
});
