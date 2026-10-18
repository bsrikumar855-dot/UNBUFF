import type { FreehireClient, FreehireQuery, FreehireSearchResult, RawJob } from "../../src/careers/freehire.js";
import { FreehireError } from "../../src/careers/freehire.js";
import type { CareerPlacementPort } from "../../src/careers/service.js";
import type { PlacementDashboard, PlacementProfile, PlacementProfileResponse, SkillAssessment } from "../../src/types.js";

/** A posting as Freehire returns it, with only what a test cares about overridden. */
export function rawJob(over: Record<string, unknown> = {}): RawJob {
  return {
    public_slug: "react-intern-acme-abc123",
    title: "React Intern",
    company: "Acme Labs",
    company_slug: "acme-labs",
    url: "https://boards.example.com/acme/jobs/1?utm_source=freehire.me",
    location: "Bengaluru, India",
    source: "greenhouse",
    description: "<p>Build <b>UI</b> with React.</p>",
    countries: ["in"],
    regions: ["apac"],
    cities: ["Bengaluru"],
    work_mode: "hybrid",
    skills: ["react", "javascript", "css"],
    posted_at: "2026-10-17T08:00:00Z",
    updated_at: "2026-10-17T08:00:00Z",
    last_seen_at: "2026-10-18T01:00:00Z",
    closed_at: null,
    enrichment: { employment_type: "internship", seniority: "intern", category: "frontend", experience_years_min: 0, summary: "A frontend internship.", requirements: [{ text: "Knows React basics", priority: "required" }] },
    reality: { class: "fresh", age_days: 1, repost_count: 1, mass_posting_count: 1, fake_freshness: false },
    ...over,
  } as unknown as RawJob;
}

export interface FakeFreehire extends Pick<FreehireClient, "search" | "getJob" | "facets"> {
  searches: FreehireQuery[];
  getJobs: string[];
  /** Responses are taken from here by call order; the last one repeats. */
  results: (FreehireSearchResult | Error)[];
  jobs: Map<string, RawJob | Error>;
}

export const searchResult = (jobs: RawJob[], total: number | null = jobs.length, extra: Partial<FreehireSearchResult["meta"]> = {}): FreehireSearchResult => ({
  jobs,
  dropped: 0,
  meta: { total, limit: null, offset: null, ignored_params: [], ...extra },
  rate: { limit: 600, remaining: 590, reset_seconds: 1 },
});

export function fakeFreehire(results: (FreehireSearchResult | Error)[] = [searchResult([])]): FakeFreehire {
  const f: FakeFreehire = {
    searches: [],
    getJobs: [],
    results,
    jobs: new Map(),
    async search(query) {
      f.searches.push(structuredClone(query));
      const r = f.results[Math.min(f.searches.length - 1, f.results.length - 1)]!;
      if (r instanceof Error) throw r;
      return r;
    },
    async getJob(slug) {
      f.getJobs.push(slug);
      const j = f.jobs.get(slug);
      if (!j) throw new FreehireError("not_found", "not found");
      if (j instanceof Error) throw j;
      return { job: j, rate: { limit: 600, remaining: 590, reset_seconds: 1 } };
    },
    async facets() {
      return { total: 100, facets: { category: [{ value: "frontend", count: 10 }] }, ignored_params: [] };
    },
  };
  return f;
}

export const profile = (over: Partial<PlacementProfile> = {}): PlacementProfile => ({
  role_ids: ["frontend_developer"],
  target_companies: ["Acme Labs"],
  placement_date: "2027-03-01",
  available_weekdays: [1, 2, 3],
  daily_minutes: 60,
  preferred_language: "javascript",
  experience_level: "beginner",
  strengths: [],
  weak_areas: [],
  priorities: [],
  ...over,
});

const skill = (area: string, status: SkillAssessment["status"], provenance: SkillAssessment["evidence"]["provenance"]): SkillAssessment =>
  ({ area, label: area, category: "interview", status, estimate: 0.7, evidence: { kind: "interview_assessment", provenance, count: 3, unit: "answers", last_at: null, recency: "recent" }, confidence: "medium", gaps: [], self_reported: null, next_assessment: null, note: null }) as unknown as SkillAssessment;

export const verifiedReact = skill("interview:frontend_developer:react_state", "strong", "verified");
export const verifiedGraphql = skill("graphql", "developing", "verified");
export const weakVerified = skill("interview:frontend_developer:git", "weak", "verified");
export const demoOnly = skill("interview:frontend_developer:accessibility", "strong", "demonstration");

export function fakePlacement(opts: { profile?: PlacementProfile | null; skills?: SkillAssessment[] | Error } = {}): CareerPlacementPort {
  const p = opts.profile === undefined ? profile() : opts.profile;
  return {
    async getProfile(): Promise<PlacementProfileResponse> {
      return { profile: p, updated_at: p ? "2026-10-01T00:00:00.000Z" : null, suggestions: null, roles: [{ id: "frontend_developer", name: "Frontend Developer", description: "" } as never], topics: [] };
    },
    async dashboard(): Promise<PlacementDashboard> {
      if (opts.skills instanceof Error) throw opts.skills;
      return { skills: { generated_at: "", skills: opts.skills ?? [], limitations: [] } } as unknown as PlacementDashboard;
    },
  };
}
