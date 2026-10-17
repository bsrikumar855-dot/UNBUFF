import { describe, expect, it } from "vitest";
import { ApiError } from "../../src/errors.js";
import { answerFor, classifyIntent, planContext, proposalsFor, weakestVerified } from "../../src/placement/assistant.js";
import { addDays, diffDays, isValidYmd, weekdayName, weekStart } from "../../src/placement/dates.js";
import type { EvidenceBundle } from "../../src/placement/evidence.js";
import { assessFeasibility, availableMinutes, capacityOn, findSlot, lastPlanDay, taskIdFor, usedByDate } from "../../src/placement/planner.js";
import { normalizeProfile } from "../../src/placement/profile.js";
import { assessSkills, SKILL_RULES } from "../../src/placement/skills.js";
import { completionProof, obsoleteReason, rebalance } from "../../src/placement/service.js";
import type { TaskRecord } from "../../src/placement/store.js";
import type { BreakdownRow, DsaAnalyticsResponse, PlacementDashboard, PlacementProfile, RateMetric, TopicWeakness } from "../../src/types.js";
import { roles } from "../helpers.js";

const TODAY = "2026-06-15"; // a Monday
const NOW = new Date("2026-06-15T09:00:00.000Z");

const profile = (over: Partial<PlacementProfile> = {}): PlacementProfile => ({
  role_ids: ["frontend_developer"], target_companies: [], placement_date: "2026-07-15", available_weekdays: [1, 2, 3, 4, 5], daily_minutes: 90, preferred_language: null,
  experience_level: null, strengths: [], weak_areas: [], priorities: ["dsa"], ...over,
});
const rate = (n: number, d: number, min = 5): RateMetric => ({ value: d >= min ? n / d : null, numerator: n, denominator: d, available: d >= min, min_sample: min, note: null });
const row = (key: string, attempts: number, accepted: number, qAttempted: number, qSolved: number): BreakdownRow => ({ key, attempts, accepted, questions_attempted: qAttempted, questions_solved: qSolved, accuracy: rate(accepted, attempts), solve_rate: rate(qSolved, qAttempted) });
const weakness = (topic: string, status: TopicWeakness["status"], trend: TopicWeakness["trend"] = "stable"): TopicWeakness => ({ topic, status, trend, explanation: [`${topic} reason`], evidence: { questions_attempted: 5, questions_solved: 1, attempts: 9, accepted: 1, algorithmic_failures: 8, technical_failures: 0, repeated_failure_questions: 2, revision_regressions: 0 } });
const overview = (over: Partial<DsaAnalyticsResponse> = {}): DsaAnalyticsResponse =>
  ({ generated_at: NOW.toISOString(), totals: { solved_unique: 0, attempted_unique: 0, eligible_attempts: 0, accepted_attempts: 0 }, topics: [], weaknesses: [], repeated_failures: [], revision_due: 0, comparison: { available: false, note: null, current: {}, previous: {} }, exclusions: { available: true, sampled_submissions: 0, demonstration: 0, ineligible_suite: 0, unverified_provider: 0, mock_execution: 0, judge_error: 0, unknown_provenance: 0 }, ...over }) as unknown as DsaAnalyticsResponse;

const bundle = (over: Partial<EvidenceBundle> = {}): EvidenceBundle => ({
  generatedAt: NOW.toISOString(),
  dsa: { overview: null, outcomes: [], revision: [], gradable: [], topicsInScope: [], execution: { configured: true, verified: true }, readFailed: false, ...(over.dsa ?? {}) },
  interview: { skills: [], sessions: [], demonstration: false, readFailed: false, ...(over.interview ?? {}) },
  lab: { exercises: [], readFailed: false, ...(over.lab ?? {}) },
  github: { status: "not_connected", stale: false, syncedAt: null, totalPublic: null, gaps: [], readFailed: false, ...(over.github ?? {}) },
  memory: { goals: [], profile: null, readFailed: false, ...(over.memory ?? {}) },
  conversations: over.conversations ?? [],
});
const gradable = (id: string, topics: string[]) => ({ summary: { id, title: id, url: null, difficulty: "easy" as const, topics, company_ids: [] }, eligible: true });

describe("profile validation", () => {
  const ctx = { roles, today: TODAY };
  const good = profile();
  it("accepts a complete profile and normalises it", () => {
    const p = normalizeProfile({ ...good, available_weekdays: [5, 1, 1, 3], strengths: ["Arrays", "arrays"], role_ids: ["frontend_developer", "frontend_developer"] }, ctx);
    expect(p.available_weekdays).toEqual([1, 3, 5]);
    expect(p.strengths).toEqual(["Arrays"]);
    expect(p.role_ids).toEqual(["frontend_developer"]);
  });
  it("rejects bad dates: not real, in the past, too far ahead", () => {
    for (const d of ["2026-02-30", "June 1", "2026-6-1", "2026-06-14", "2029-01-01"]) expect(() => normalizeProfile({ ...good, placement_date: d }, ctx), d).toThrow(ApiError);
    expect(normalizeProfile({ ...good, placement_date: TODAY }, ctx).placement_date).toBe(TODAY);
    expect(normalizeProfile({ ...good, placement_date: null }, ctx).placement_date).toBeNull();
  });
  it("rejects bad study time, days, roles and unknown fields", () => {
    for (const bad of [{ daily_minutes: 10 }, { daily_minutes: 481 }, { daily_minutes: 60.5 }, { daily_minutes: "60" }, { available_weekdays: [] }, { available_weekdays: [7] }, { role_ids: ["nope"] }, { role_ids: ["a", "b", "c", "d"] }, { priorities: ["luck"] }, { preferred_language: "cobol" }, { experience_level: "expert" }, { extra: 1 }]) {
      expect(() => normalizeProfile({ ...good, ...bad }, ctx), JSON.stringify(bad)).toThrow(ApiError);
    }
  });
  it("does not allow a topic to be both a strength and a weak area, and caps list sizes", () => {
    expect(() => normalizeProfile({ ...good, strengths: ["Graphs"], weak_areas: ["graphs"] }, ctx)).toThrow(/both a strength and a weak area/);
    expect(() => normalizeProfile({ ...good, strengths: Array.from({ length: 9 }, (_v, i) => `t${i}`) }, ctx)).toThrow(ApiError);
    expect(() => normalizeProfile({ ...good, target_companies: Array.from({ length: 11 }, (_v, i) => `c${i}`) }, ctx)).toThrow(ApiError);
  });
  it("strips markup-like characters from free text", () => {
    expect(normalizeProfile({ ...good, target_companies: ["Acme <script>"] }, ctx).target_companies[0]).not.toContain("<");
  });
});

describe("calendar helpers", () => {
  it("works on plain dates", () => {
    expect(isValidYmd("2026-02-28")).toBe(true);
    expect(isValidYmd("2026-02-29")).toBe(false);
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(diffDays("2026-06-20", TODAY)).toBe(5);
    expect(weekdayName(TODAY)).toBe("Monday");
    expect(weekStart("2026-06-21")).toBe("2026-06-15"); // Sunday belongs to the week that began Monday
    expect(weekStart(TODAY)).toBe(TODAY);
  });
});

describe("scheduling and feasibility", () => {
  const p = profile({ available_weekdays: [1, 3, 5], daily_minutes: 60 });
  it("only schedules on available days and respects the daily limit", () => {
    expect(capacityOn(p, "2026-06-16")).toBe(0); // Tuesday
    expect(capacityOn(p, "2026-06-17")).toBe(60);
    const used = new Map<string, number>([["2026-06-15", 45]]);
    expect(findSlot(p, used, 30, TODAY, "2026-06-30")).toBe("2026-06-17"); // Monday has 15 minutes left
    expect(findSlot(p, used, 15, TODAY, "2026-06-30")).toBe("2026-06-15");
    expect(findSlot(p, used, 30, TODAY, "2026-06-16")).toBeNull(); // nothing before the limit
  });
  it("places a task longer than a day only on an empty day", () => {
    expect(findSlot(p, new Map(), 90, TODAY, "2026-06-30")).toBe(TODAY);
    expect(findSlot(p, new Map([[TODAY, 10]]), 90, TODAY, "2026-06-30")).toBe("2026-06-17");
  });
  it("counts committed minutes only for open tasks", () => {
    const used = usedByDate([{ status: "planned", due_date: TODAY, estimated_minutes: 20 }, { status: "in_progress", due_date: TODAY, estimated_minutes: 10 }, { status: "completed", due_date: TODAY, estimated_minutes: 50 }]);
    expect(used.get(TODAY)).toBe(30);
  });
  it("stops at the day before the placement date and at the planning horizon", () => {
    expect(lastPlanDay(profile({ placement_date: "2026-06-18" }), TODAY)).toBe("2026-06-17");
    expect(lastPlanDay(profile({ placement_date: "2026-09-01" }), TODAY)).toBe("2026-06-28");
    expect(lastPlanDay(profile({ placement_date: null }), TODAY)).toBe("2026-06-28");
    expect(lastPlanDay(profile({ placement_date: TODAY }), TODAY)).toBe(TODAY);
  });
  it("computes available time from the student's own days", () => {
    expect(availableMinutes(profile({ placement_date: "2026-06-22", daily_minutes: 60, available_weekdays: [1, 2] }), TODAY)).toBe(120); // Mon 15 and Tue 16 only
  });
  it("is honest about feasibility: ok, tight, insufficient, no deadline", () => {
    const pp = profile({ placement_date: "2026-06-22", daily_minutes: 60, available_weekdays: [1, 2, 3, 4, 5] }); // 5 days, 300 minutes
    expect(assessFeasibility(pp, TODAY, 200, [], false).status).toBe("ok");
    expect(assessFeasibility(pp, TODAY, 280, [], false).status).toBe("tight");
    const bad = assessFeasibility(pp, TODAY, 400, ["x"], true);
    expect(bad.status).toBe("insufficient");
    expect(bad.message).toMatch(/reduced plan/);
    expect(bad.deferred_task_ids).toEqual(["x"]);
    expect(assessFeasibility(profile({ placement_date: null }), TODAY, 100, [], false).status).toBe("no_deadline");
    expect(assessFeasibility(profile({ placement_date: TODAY }), TODAY, 10, [], false).status).toBe("insufficient");
  });
  it("makes the same task id for the same activity and a different one for another user or cycle", () => {
    expect(taskIdFor("u1", "dsa_practice|question:q1")).toBe(taskIdFor("u1", "dsa_practice|question:q1"));
    expect(taskIdFor("u1", "dsa_practice|question:q1")).not.toBe(taskIdFor("u2", "dsa_practice|question:q1"));
    expect(taskIdFor("u1", "dsa_revision|revision:q1@1@x")).not.toBe(taskIdFor("u1", "dsa_revision|revision:q1@2@x"));
    expect(taskIdFor("u1", "k")).toMatch(/^t_[a-f0-9]{24}$/);
  });
});

describe("skill assessment", () => {
  const dsa = (rows: BreakdownRow[], weak: TopicWeakness[], topics: string[], extra: Partial<EvidenceBundle["dsa"]> = {}) => bundle({ dsa: { overview: overview({ topics: rows, weaknesses: weak }), outcomes: [], revision: [], gradable: topics.map((t, i) => gradable(`q${i}`, [t])), topicsInScope: topics, execution: { configured: true, verified: true }, readFailed: false, ...extra } });
  const area = (b: EvidenceBundle, key: string, p: PlacementProfile | null = profile()) => assessSkills(b, p, roles, NOW).skills.find((s) => s.area === key)!;

  it("shows an unassessed topic as unknown, never as a score", () => {
    const s = area(dsa([], [], ["Arrays"]), "dsa:Arrays");
    expect(s).toMatchObject({ status: "unassessed", estimate: null, confidence: "none", evidence: { provenance: "unavailable", count: 0 } });
    expect(s.next_assessment?.type).toBe("diagnostic");
  });
  it("is provisional below the minimum sample: some evidence, no estimate", () => {
    const s = area(dsa([row("Arrays", 3, 2, 2, 1)], [], ["Arrays"]), "dsa:Arrays");
    expect(s.estimate).toBeNull();
    expect(s.confidence).toBe("low");
    expect(s.note).toMatch(/Provisional/);
    expect(s.evidence.provenance).toBe("verified");
  });
  it("estimates from the solve rate once the sample is enough, with confidence rising with evidence", () => {
    const mid = area(dsa([row("Arrays", 8, 6, 5, 4)], [weakness("Arrays", "strong")], ["Arrays"]), "dsa:Arrays");
    expect(mid).toMatchObject({ estimate: 0.8, status: "strong", confidence: "medium" });
    const high = area(dsa([row("Arrays", 14, 9, 6, 5)], [], ["Arrays"]), "dsa:Arrays");
    expect(high.confidence).toBe("high");
    expect(high.status).toBe("strong"); // 5/6 with no analytics weakness status falls back to the estimate thresholds
    expect(SKILL_RULES.dsa.high.attempts).toBe(12);
  });
  it("takes weak status and gaps from the analytics engine, not from its own opinion", () => {
    const s = area(dsa([row("Graphs", 9, 2, 5, 1)], [weakness("Graphs", "weak")], ["Graphs"]), "dsa:Graphs");
    expect(s.status).toBe("weak");
    expect(s.gaps.join(" ")).toMatch(/Graphs reason/);
    expect(s.gaps.join(" ")).toMatch(/failed repeatedly/);
    expect(s.next_assessment?.type).toBe("dsa_practice");
    expect(area(dsa([row("Graphs", 9, 5, 5, 3)], [weakness("Graphs", "technical_issues")], ["Graphs"]), "dsa:Graphs").status).toBe("developing");
  });
  it("keeps self-reported levels beside the estimate, never in it", () => {
    const s = area(dsa([], [], ["Arrays"]), "dsa:Arrays", profile({ strengths: ["Arrays"] }));
    expect(s.self_reported).toBe("You listed this as a strength");
    expect(s.estimate).toBeNull();
    expect(s.status).toBe("unassessed");
    const w = area(dsa([], [], ["Arrays"]), "dsa:Arrays", profile({ weak_areas: ["arrays"] }));
    expect(w.self_reported).toBe("You listed this as a weak area");
  });
  it("labels stale evidence by age", () => {
    const old = bundle({ dsa: { overview: overview({ topics: [row("Arrays", 8, 6, 5, 4)] }), outcomes: [{ question_id: "q0", topics: ["Arrays"], difficulty: "easy", attempts: 8, accepted: 6, solved: true, last_attempt_at: "2026-03-01T00:00:00.000Z", consecutive_failures: 0 }], revision: [], gradable: [gradable("q0", ["Arrays"])], topicsInScope: ["Arrays"], execution: { configured: true, verified: true }, readFailed: false } });
    const s = area(old, "dsa:Arrays");
    expect(s.evidence.recency).toBe("stale");
    expect(s.next_assessment?.description).toMatch(/last evidence is old/);
  });
  it("says why nothing can be assessed when code execution is missing or unverified", () => {
    const none = assessSkills(dsa([], [], ["Arrays"], { execution: { configured: false, verified: false } }), profile(), roles, NOW);
    expect(none.limitations.some((l) => /not configured/.test(l.message) && l.severity === "limits_accuracy")).toBe(true);
    expect(none.skills.find((s) => s.area === "dsa:Arrays")!.note).toMatch(/configured/);
    const unv = assessSkills(dsa([], [], ["Arrays"], { execution: { configured: true, verified: false } }), profile(), roles, NOW);
    expect(unv.limitations.some((l) => /not been declared verified/.test(l.message))).toBe(true);
  });
  it("reports excluded demonstration, mock and unknown-provenance submissions as a limitation", () => {
    const b = dsa([], [], ["Arrays"]);
    b.dsa.overview = overview({ exclusions: { available: true, sampled_submissions: 9, demonstration: 3, ineligible_suite: 0, unverified_provider: 1, mock_execution: 2, judge_error: 0, unknown_provenance: 1 } });
    expect(assessSkills(b, profile(), roles, NOW).limitations.some((l) => /7 judged submission\(s\) were excluded/.test(l.message))).toBe(true);
  });

  it("interview skills: verified results estimate, demonstration results do not", () => {
    const skill = { role_id: "frontend_developer", skill_id: "react_state", name: "React state", state: "needs_work" as const, proficiency: 0.3, at: "2026-06-10T00:00:00.000Z", assessments: 2, retested: false, gaps: ["hooks"] };
    const real = area(bundle({ interview: { skills: [skill], sessions: [], demonstration: false, readFailed: false } }), "interview:frontend_developer:react_state");
    expect(real).toMatchObject({ status: "weak", estimate: 0.3, confidence: "medium", evidence: { provenance: "verified", kind: "interview_assessment" } });
    expect(real.gaps).toEqual(["Missing: hooks"]);
    const demo = area(bundle({ interview: { skills: [skill], sessions: [], demonstration: true, readFailed: false } }), "interview:frontend_developer:react_state");
    expect(demo).toMatchObject({ status: "unassessed", estimate: null, confidence: "none", evidence: { provenance: "demonstration" } });
    expect(demo.note).toMatch(/mock model/);
  });
  it("interview skills not yet assessed are unassessed with a diagnostic interview as the next step; no role means none in scope", () => {
    const s = area(bundle(), "interview:frontend_developer:testing");
    expect(s).toMatchObject({ status: "unassessed", evidence: { provenance: "unavailable" } });
    expect(s.next_assessment?.type).toBe("technical_interview");
    const r = assessSkills(bundle(), profile({ role_ids: [] }), roles, NOW);
    expect(r.skills.some((x) => x.category === "interview")).toBe(false);
    expect(r.limitations.some((l) => /Choose a target role/.test(l.message))).toBe(true);
  });

  it("GraphQL: reading is not competence; passed exercises are", () => {
    const ex = (id: string, passed: boolean, attempts: number) => ({ id, module_id: "m1", lesson_id: "l1", title: id, order: 1, passed, attempts, last_attempt_at: attempts ? "2026-06-14T00:00:00.000Z" : null, module_title: "M1", module_order: 1, difficulty: "beginner" });
    const none = area(bundle({ lab: { exercises: [ex("a", false, 0), ex("b", false, 0)], readFailed: false } }), "graphql", profile({ priorities: ["graphql"] }));
    expect(none).toMatchObject({ status: "unassessed", estimate: null, evidence: { provenance: "unavailable" } });
    expect(none.note).toMatch(/Reading lessons alone is not counted/);
    const some = area(bundle({ lab: { exercises: [ex("a", true, 1), ex("b", false, 2), ex("c", false, 0), ex("d", false, 0)], readFailed: false } }), "graphql", profile({ priorities: ["graphql"] }));
    expect(some.estimate).toBe(0.25);
    expect(some.evidence).toMatchObject({ provenance: "verified", count: 2, unit: "exercises attempted" });
    expect(some.confidence).toBe("low");
    expect(some.gaps).toEqual(["Not yet passed: b"]);
  });
  it("GraphQL is left out when it is not wanted and not used, and included when the role needs APIs", () => {
    const off = assessSkills(bundle(), profile({ role_ids: [], priorities: ["dsa"] }), roles, NOW);
    expect(off.skills.some((s) => s.area === "graphql")).toBe(false);
    const viaRole = assessSkills(bundle(), profile({ priorities: ["dsa"] }), roles, NOW); // frontend_developer lists rest_apis
    expect(viaRole.skills.some((s) => s.area === "graphql")).toBe(true);
  });

  it("GitHub is context only: it never gives an estimate or counts towards coverage, and its absence costs nothing", () => {
    const absent = assessSkills(bundle(), profile(), roles, NOW);
    expect(absent.skills.some((s) => s.category === "project")).toBe(false);
    expect(absent.limitations.find((l) => l.source === "github")).toMatchObject({ severity: "info", message: expect.stringContaining("costs you nothing") });
    const present = assessSkills(bundle({ github: { status: "available", stale: false, syncedAt: "2026-06-14T00:00:00.000Z", totalPublic: 4, gaps: [{ repository: "alice/notes", check: "readme_present", label: "Has a README at the repository root" }], readFailed: false } }), profile(), roles, NOW);
    const proj = present.skills.find((s) => s.area === "project:github")!;
    expect(proj).toMatchObject({ estimate: null, status: "unassessed", confidence: "none" });
    expect(proj.note).toMatch(/not a measure/);
    expect(proj.gaps[0]).toMatch(/alice\/notes/);
    expect(present.coverage.in_scope).toBe(absent.coverage.in_scope);
  });
  it("reports unconfigured, stale and reconnect states for GitHub as explicit limitations", () => {
    const g = (status: EvidenceBundle["github"]["status"], stale = false) => assessSkills(bundle({ github: { status, stale, syncedAt: "2026-06-01T00:00:00.000Z", totalPublic: 1, gaps: [], readFailed: false } }), profile(), roles, NOW).limitations.filter((l) => l.source === "github");
    expect(g("not_configured")[0]!.message).toMatch(/not set up on this server/);
    expect(g("needs_reconnect")[0]).toMatchObject({ severity: "limits_accuracy" });
    expect(g("available", true)[0]!.message).toMatch(/older/);
    expect(g("connected_no_data")[0]!.message).toMatch(/nothing has been synchronised/);
  });
  it("coverage counts only what has medium or better confidence, and defines itself as not performance", () => {
    const b = dsa([row("Arrays", 8, 6, 5, 4), row("Graphs", 3, 1, 2, 0)], [], ["Arrays", "Graphs", "Strings"]);
    const r = assessSkills(b, profile({ role_ids: [], priorities: ["dsa"] }), roles, NOW);
    expect(r.coverage).toMatchObject({ in_scope: 3, sufficient_evidence: 1, provisional: 1, unassessed: 1 });
    expect(r.coverage.definition).toMatch(/not how well you are doing/);
    expect(r.method.join(" ")).toMatch(/no overall readiness score/);
  });
  it("survives unreadable sources by saying so", () => {
    const b = bundle({ dsa: { overview: null, outcomes: [], revision: [], gradable: [], topicsInScope: [], execution: { configured: true, verified: true }, readFailed: true }, interview: { skills: [], sessions: [], demonstration: false, readFailed: true }, memory: { goals: [], profile: null, readFailed: true } });
    const r = assessSkills(b, profile(), roles, NOW);
    expect(r.limitations.filter((l) => /could not be read/.test(l.message)).length).toBeGreaterThanOrEqual(3);
  });
});

describe("completion proof and obsolescence use real records only", () => {
  const task = (over: Partial<TaskRecord>): TaskRecord => ({ id: "t_" + "a".repeat(24), owner_uid: "u", type: "dsa_practice", title: "t", description: "d", skill_area: "x", priority: 2, estimated_minutes: 20, due_date: TODAY, original_due_date: TODAY, link: "/x", ref: { kind: "question", id: "q1" }, completion_criteria: "c", completion_check: "verified_event", evidence_source: "s", reason: "r", reason_codes: [], depends_on: [], blocked: false, status: "planned", postponed_count: 0, skip_reason: null, completed_at: null, completed_by: null, student_scheduled: false, created_at: "2026-06-15T08:00:00.000Z", updated_at: "2026-06-15T08:00:00.000Z", history: [], ...over });
  const outcome = (o: Partial<EvidenceBundle["dsa"]["outcomes"][number]>) => ({ question_id: "q1", topics: ["Arrays"], difficulty: "easy" as const, attempts: 1, accepted: 0, solved: false, last_attempt_at: "2026-06-15T10:00:00.000Z", consecutive_failures: 1, ...o });

  it("a practice task completes only when the question is solved in the verified record", () => {
    expect(completionProof(task({}), bundle())).toBeNull();
    expect(completionProof(task({}), bundle({ dsa: { overview: null, outcomes: [outcome({})], revision: [], gradable: [], topicsInScope: [], execution: { configured: true, verified: true }, readFailed: false } }))).toBeNull(); // failed attempt: not done
    expect(completionProof(task({}), bundle({ dsa: { overview: null, outcomes: [outcome({ solved: true, accepted: 1 })], revision: [], gradable: [], topicsInScope: [], execution: { configured: true, verified: true }, readFailed: false } }))).toMatch(/accepted/);
  });
  it("a diagnostic completes with any counted attempt made after it was created", () => {
    const d = task({ type: "diagnostic" });
    const ev = (at: string) => bundle({ dsa: { overview: null, outcomes: [outcome({ last_attempt_at: at })], revision: [], gradable: [], topicsInScope: [], execution: { configured: true, verified: true }, readFailed: false } });
    expect(completionProof(d, ev("2026-06-15T10:00:00.000Z"))).toMatch(/counted judged submission/);
    expect(completionProof(d, ev("2026-06-14T10:00:00.000Z"))).toBeNull(); // an attempt from before the task existed proves nothing
  });
  it("GraphQL, interview, conversation and GitHub tasks complete only from their own records", () => {
    const labEv = (passed: boolean) => bundle({ lab: { exercises: [{ id: "m1-e1", module_id: "m1", lesson_id: "l", title: "t", order: 1, passed, attempts: 1, last_attempt_at: null, module_title: "M", module_order: 1, difficulty: "beginner" }], readFailed: false } });
    expect(completionProof(task({ ref: { kind: "lab_exercise", id: "m1-e1" } }), labEv(false))).toBeNull();
    expect(completionProof(task({ ref: { kind: "lab_exercise", id: "m1-e1" } }), labEv(true))).toMatch(/GraphQL Lab/);
    const iv = (assessed: string[], at: string) => bundle({ interview: { skills: [], sessions: [{ id: "s", role_id: "frontend_developer", created_at: at, assessed_skill_ids: assessed }], demonstration: false, readFailed: false } });
    const t = task({ ref: { kind: "role", id: "frontend_developer" } });
    expect(completionProof(t, iv(["testing"], "2026-06-15T12:00:00.000Z"))).toMatch(/interview session/);
    expect(completionProof(t, iv([], "2026-06-15T12:00:00.000Z"))).toBeNull();
    expect(completionProof(t, iv(["testing"], "2026-06-15T07:00:00.000Z"))).toBeNull();
    const conv = (messages: number) => bundle({ conversations: [{ id: "c", mode: "interview_practice", messages, updated_at: "2026-06-15T12:00:00.000Z" }] });
    expect(completionProof(task({ ref: { kind: "mentor_mode", id: "interview_practice" } }), conv(2))).toBeNull();
    expect(completionProof(task({ ref: { kind: "mentor_mode", id: "interview_practice" } }), conv(4))).toMatch(/two exchanges/);
    const gh = (gaps: { repository: string; check: string; label: string }[], syncedAt: string) => bundle({ github: { status: "available", stale: false, syncedAt, totalPublic: 1, gaps, readFailed: false } });
    const pt = task({ type: "project", ref: { kind: "github_check", id: "alice/notes:readme_present" } });
    expect(completionProof(pt, gh([{ repository: "alice/notes", check: "readme_present", label: "x" }], "2026-06-15T12:00:00.000Z"))).toBeNull();
    expect(completionProof(pt, gh([], "2026-06-15T12:00:00.000Z"))).toMatch(/passing/);
    expect(completionProof(pt, gh([], "2026-06-15T07:00:00.000Z"))).toBeNull();
    expect(completionProof(task({ ref: { kind: "review", id: "x" }, completion_check: "student" }), bundle())).toBeNull();
  });
  it("tasks stop applying for stated reasons only", () => {
    expect(obsoleteReason(task({ type: "project", ref: { kind: "github_check", id: "a:b" } }), bundle(), TODAY)).toMatch(/Your other tasks are unaffected/);
    expect(obsoleteReason(task({ type: "dsa_practice" }), bundle({ dsa: { overview: null, outcomes: [], revision: [], gradable: [], topicsInScope: [], execution: { configured: true, verified: true }, readFailed: false } }), TODAY)).toMatch(/can no longer be judged/);
    expect(obsoleteReason(task({ ref: { kind: "role", id: "r" }, due_date: "2026-06-01" }), bundle(), TODAY)).toBe("That week has passed.");
    expect(obsoleteReason(task({ ref: { kind: "role", id: "r" }, due_date: TODAY }), bundle(), TODAY)).toBeNull();
  });
});

describe("rebalancing after availability changes", () => {
  const mk = (id: string, due: string, minutes: number, priority: 1 | 2 | 3 | 4 | 5): TaskRecord => ({ id: `t_${id.padEnd(24, "0")}`, owner_uid: "u", type: "general", title: id, description: "", skill_area: "x", priority, estimated_minutes: minutes, due_date: due, original_due_date: due, link: "/", ref: { kind: "review", id }, completion_criteria: "", completion_check: "student", evidence_source: "", reason: "", reason_codes: [], depends_on: [], blocked: false, status: "planned", postponed_count: 0, skip_reason: null, completed_at: null, completed_by: null, student_scheduled: false, created_at: "x", updated_at: "x", history: [] });
  it("moves the lowest-priority work off an overfull day, keeps the rest and records each move", () => {
    const tasks = [mk("a", TODAY, 40, 1), mk("b", TODAY, 40, 3), mk("c", TODAY, 40, 5)];
    const changes: Parameters<typeof rebalance>[4] = [];
    const moved = rebalance(tasks, profile({ daily_minutes: 90 }), TODAY, "2026-06-15T09:00:00.000Z", changes, "fewer minutes");
    expect(moved.map((t) => t.title)).toEqual(["c"]);
    expect(tasks.find((t) => t.title === "a")!.due_date).toBe(TODAY);
    expect(tasks.find((t) => t.title === "c")!.due_date).toBe("2026-06-16");
    expect(changes[0]).toMatchObject({ kind: "task_rescheduled", reason: "fewer minutes" });
  });
  it("moves everything off a day that is no longer available, and never loses a task", () => {
    const tasks = [mk("a", TODAY, 30, 2), mk("b", TODAY, 30, 3)];
    rebalance(tasks, profile({ available_weekdays: [3] }), TODAY, "x", [], "no longer a study day");
    expect(tasks.map((t) => t.due_date)).toEqual(["2026-06-17", "2026-06-17"]);
  });
  it("leaves a lone oversize task where it is", () => {
    const tasks = [mk("big", TODAY, 200, 2)];
    expect(rebalance(tasks, profile({ daily_minutes: 60 }), TODAY, "x", [], "r")).toEqual([]);
  });
});

describe("assistant: intents, deterministic answers and proposals", () => {
  it("classifies the questions the planner is meant to answer", () => {
    const c = (m: string) => classifyIntent(m);
    expect(c("What should I study today?")).toBe("today");
    expect(c("Why did you prioritize arrays?")).toBe("why");
    expect(c("What changed since last week?")).toBe("changes");
    expect(c("Can I finish the remaining tasks before my placement date?")).toBe("feasibility");
    expect(c("Explain my weakest verified skill")).toBe("weakest");
    expect(c("Give me a lighter plan for today")).toBe("lighter");
    expect(c("Help me revise the topic I failed yesterday")).toBe("revise");
    expect(c("tell me a joke")).toBe("other");
  });

  const dash = (over: Partial<PlacementDashboard> = {}): PlacementDashboard =>
    ({
      generated_at: NOW.toISOString(), today: TODAY, needs_profile: false, profile: profile(),
      plan: { generation: 1, generated_at: NOW.toISOString(), feasibility: { status: "ok", required_minutes: 60, available_minutes: 600, message: "It fits.", reduced: false, deferred_task_ids: [] }, days_until_placement: 30 },
      today_tasks: [{ id: "t_" + "b".repeat(24), type: "dsa_practice", title: "Practise Graphs", description: "", skill_area: "dsa:Graphs", priority: 2, estimated_minutes: 40, due_date: TODAY, original_due_date: TODAY, link: "/x", ref: { kind: "question", id: "q" }, completion_criteria: "", completion_check: "verified_event", evidence_source: "analytics:weakness:Graphs", reason: "Graphs is weak by your verified results", reason_codes: [], depends_on: [], blocked: false, status: "planned", postponed_count: 0, skip_reason: null, completed_at: null, completed_by: null, student_scheduled: false, created_at: "x", updated_at: "x", history: [] }],
      today_minutes: 40, today_capacity_minutes: 90, week: [], counts: { planned: 1, in_progress: 0, completed: 0, skipped: 0 }, outstanding_priorities: [],
      skills: { generated_at: "x", skills: [], coverage: { in_scope: 3, sufficient_evidence: 0, provisional: 0, unassessed: 3, definition: "" }, limitations: [], method: [] },
      history: { recent_completed: [], changes: [], improvements: [], repeated_difficulties: [], revision: { due: 0, items: 0 } },
      readiness: { sufficient_evidence: [], weak: [], unassessed: [], next_diagnostics: [], note: "" }, limitations: [], ...over,
    }) as PlacementDashboard;

  it("answers 'today' and 'why' from the stored plan, with the recorded reason", () => {
    expect(answerFor("today", dash())).toMatch(/1 task\(s\), about 40 of your 90 available minutes[\s\S]*Graphs is weak by your verified results/);
    expect(answerFor("why", dash())).toMatch(/Why: Graphs is weak by your verified results.*analytics:weakness:Graphs/);
  });
  it("will not name a weakest skill without enough evidence, and says what to do instead", () => {
    expect(weakestVerified(dash())).toBeUndefined();
    const a = answerFor("weakest", dash({ readiness: { sufficient_evidence: [], weak: [], unassessed: [], next_diagnostics: [{ area: "DSA: Arrays", description: "Solve one Arrays question." }], note: "" } }));
    expect(a).toMatch(/cannot name a weakest skill yet/);
    expect(a).toMatch(/Solve one Arrays question/);
  });
  it("names the weakest verified skill with its estimate, confidence and gaps", () => {
    const skills = dash().skills;
    skills.skills = [
      { area: "dsa:Arrays", label: "DSA: Arrays", category: "dsa", status: "strong", estimate: 0.9, evidence: { kind: "dsa_judged", provenance: "verified", count: 12, unit: "judged submissions", last_at: "2026-06-10T00:00:00.000Z", recency: "recent" }, confidence: "high", gaps: [], self_reported: null, next_assessment: null, note: null },
      { area: "dsa:Graphs", label: "DSA: Graphs", category: "dsa", status: "weak", estimate: 0.2, evidence: { kind: "dsa_judged", provenance: "verified", count: 9, unit: "judged submissions", last_at: "2026-06-12T00:00:00.000Z", recency: "recent" }, confidence: "medium", gaps: ["Graphs reason"], self_reported: null, next_assessment: null, note: null },
      { area: "dsa:Hash", label: "DSA: Hash", category: "dsa", status: "weak", estimate: 0.1, evidence: { kind: "dsa_judged", provenance: "verified", count: 3, unit: "judged submissions", last_at: null, recency: "none" }, confidence: "low", gaps: [], self_reported: null, next_assessment: null, note: null },
    ];
    const a = answerFor("weakest", dash({ skills }));
    expect(a).toMatch(/DSA: Graphs: estimate 20% from 9 judged submissions, confidence medium/);
    expect(a).not.toMatch(/Hash/); // low confidence is never called the weakest
  });
  it("explains feasibility with the stored numbers and disclaims prediction", () => {
    expect(answerFor("feasibility", dash())).toMatch(/It fits\. There are 30 day\(s\) until your placement date\..*not a prediction/);
  });
  it("tells a student with no profile or plan what to do first", () => {
    expect(answerFor("today", dash({ needs_profile: true, profile: null, plan: null }))).toMatch(/Set your goals/);
    expect(answerFor("today", dash({ plan: null }))).toMatch(/not been generated/);
  });
  it("proposes changes but never applies them, and only for supported requests", () => {
    const d = dash({ today_minutes: 90 });
    expect(proposalsFor("lighter", "give me a lighter plan", d)).toEqual([{ kind: "lighter_day", date: TODAY, max_minutes: 45, description: expect.stringContaining("45 minutes") }]);
    expect(proposalsFor("other", "postpone everything today", d)[0]).toMatchObject({ kind: "postpone_day", days: 1 });
    expect(proposalsFor("other", "I can only study 45 minutes a day", d)[0]).toMatchObject({ kind: "set_daily_minutes", minutes: 45 });
    expect(proposalsFor("other", "I can study 2 hours", d)[0]).toMatchObject({ minutes: 120 });
    expect(proposalsFor("other", "I can study 5 minutes", d)).toEqual([]); // below the minimum
    expect(proposalsFor("other", "I can study 90 minutes", d)).toEqual([]); // no change
    expect(proposalsFor("today", "what should I do", d)).toEqual([]);
    expect(proposalsFor("lighter", "lighter plan", dash({ needs_profile: true, profile: null, plan: null }))).toEqual([]);
  });
  it("gives the model only application-calculated facts and tells it what it cannot do", () => {
    const text = planContext(dash(), "today", [{ kind: "lighter_day", date: TODAY, max_minutes: 45, description: "Keep about 45 minutes today." }]);
    expect(text).toContain("FEASIBILITY (calculated by the application): It fits.");
    expect(text).toContain("CHANGES THE APPLICATION HAS PREPARED (the student must apply them; you cannot)");
    expect(text).toContain("There is no overall score");
    expect(text.length).toBeLessThanOrEqual(6000);
  });
});
