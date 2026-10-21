import type { EvidenceConfidence, EvidenceLimitation, EvidenceRecency, PlacementProfile, PlacementSkillsResponse, SkillAssessment, SkillStatus } from "../types.js";
import type { RoleRegistry } from "../services/roles.js";
import { diffDays, ymd } from "./dates.js";
import type { EvidenceBundle } from "./evidence.js";
import { normalizeTopic, type LeetCodeEvidence } from "../leetcode/context.js";

/**
 * Deterministic skill assessment, one entry per skill area. There is deliberately NO overall readiness score and no
 * probability of an offer: each area states what was measured, how much evidence there is, how recent it is, and how
 * confident the estimate can be. Only verified results produce an estimate; self-reported levels are shown beside it
 * and never mixed in; the AI model supplies none of these numbers.
 */

/** Thresholds, in one place so tests and documentation can state them. */
export const SKILL_RULES = {
  /** Confidence from judged submissions and distinct questions in a DSA topic. */
  dsa: { low: { attempts: 3, questions: 1 }, medium: { attempts: 6, questions: 3 }, high: { attempts: 12, questions: 5 } },
  /** Confidence from the number of DBMS topic quizzes attempted. */
  dbms: { low: 1, medium: 4, high: 8 },
  /** Confidence from the number of recorded interview assessments of a skill. */
  interview: { low: 1, medium: 2, high: 3 },
  /** Status from an estimate when the analytics engine gives no weakness status. */
  status: { strong: 0.75, developing: 0.4 },
  /** Days since the last evidence: recent up to 14, aging up to 45, stale after that. */
  recencyDays: { recent: 14, aging: 45 },
} as const;

export const METHOD: string[] = [
  "DSA topics: from counted, judged submissions only (the analytics engine's rules). Estimate = the share of attempted questions you solved, shown only when the minimum sample is met; status comes from the analytics weakness rules.",
  "Interview skills: the existing interview report's skill state and proficiency for your target roles. Results graded by the built-in mock model are shown as demonstrations, with no estimate.",
  "DBMS: the share of topics whose quiz you have passed (three of four correct). The server grades the quiz, so a pass is verified; reading the notes alone counts for nothing.",
  "Projects: GitHub activity is context only. It gives no estimate and is never counted towards coverage.",
  "LeetCode: numbers you import yourself are listed beside matching DSA topics as your own reported context, with their capture date. They never change an estimate, a status, a confidence level or coverage, and they are never merged with judged submissions.",
  "Confidence depends on how much evidence there is (see the thresholds in the documentation); recency is days since the last piece of evidence. Self-reported levels are displayed separately.",
  "There is no overall readiness score and no offer probability.",
];

const recencyOf = (iso: string | null, now: Date): EvidenceRecency => {
  if (!iso) return "none";
  const days = diffDays(ymd(now), iso.slice(0, 10));
  return days <= SKILL_RULES.recencyDays.recent ? "recent" : days <= SKILL_RULES.recencyDays.aging ? "aging" : "stale";
};

const statusFromEstimate = (e: number): SkillStatus => (e >= SKILL_RULES.status.strong ? "strong" : e >= SKILL_RULES.status.developing ? "developing" : "weak");

function selfReported(area: string, profile: PlacementProfile | null, mentorLevels: Record<string, string> | undefined): string | null {
  const key = area.replace(/^[a-z]+:/, "").toLowerCase();
  if (profile?.strengths.some((s) => s.toLowerCase() === key)) return "You listed this as a strength";
  if (profile?.weak_areas.some((s) => s.toLowerCase() === key)) return "You listed this as a weak area";
  const level = mentorLevels ? Object.entries(mentorLevels).find(([k]) => k.toLowerCase() === key)?.[1] : undefined;
  return level ? `You told the mentor your level is ${level}` : null;
}

/** What the student's own imported LeetCode numbers say about a topic (exact match after plural and spacing differences), or null. Context only. */
export function leetcodeTopicNote(lc: LeetCodeEvidence | undefined, topic: string): string | null {
  if (!lc || lc.status !== "available" || !lc.data?.topics || !lc.captured_at) return null;
  const key = normalizeTopic(topic);
  const hit = lc.data.topics.find((t) => normalizeTopic(t.topic) === key);
  return hit ? `You reported ${hit.solved} "${hit.topic}" problems on LeetCode (imported, captured ${lc.captured_at.slice(0, 10)}${lc.stale ? ", out of date" : ""}); not verified and not counted here` : null;
}

export function assessSkills(ev: EvidenceBundle, profile: PlacementProfile | null, roles: RoleRegistry, now: Date): PlacementSkillsResponse {
  const skills: SkillAssessment[] = [];
  const mentorLevels = ev.memory.profile?.skill_self_assessment as Record<string, string> | undefined;
  const limitations: EvidenceLimitation[] = [];

  // ---------------- DSA ----------------
  const dsa = ev.dsa;
  if (dsa.readFailed) limitations.push({ source: "dsa", severity: "limits_accuracy", message: "DSA results could not be read right now, so DSA areas show no evidence." });
  if (!dsa.execution.configured) limitations.push({ source: "dsa", severity: "limits_accuracy", message: "Code execution is not configured on this server, so DSA solutions cannot be judged and no DSA result is counted." });
  else if (!dsa.execution.verified) limitations.push({ source: "dsa", severity: "limits_accuracy", message: "The code-execution service has not been declared verified, so judged submissions are not counted as results. DSA practice can still be planned." });
  if (dsa.gradable.length === 0) limitations.push({ source: "dsa", severity: "limits_accuracy", message: "No catalogue question has a judging suite, so no DSA practice or DSA result is possible." });
  else if (dsa.gradable.some((g) => !g.eligible)) limitations.push({ source: "dsa", severity: "info", message: `${dsa.gradable.filter((g) => !g.eligible).length} practice question(s) use demonstration suites; solving them is never counted as a result.` });
  const ex = dsa.overview?.exclusions;
  if (ex && ex.available) {
    const excluded = ex.demonstration + ex.mock_execution + ex.unverified_provider + ex.ineligible_suite + ex.unknown_provenance;
    if (excluded > 0) limitations.push({ source: "dsa", severity: "info", message: `${excluded} judged submission(s) were excluded from your results (demonstration, mock, unverified or unknown-provenance records).` });
  }

  const outcomesByTopic = new Map<string, string>();
  for (const o of dsa.outcomes) for (const t of o.topics) if (o.last_attempt_at && (outcomesByTopic.get(t) ?? "") < o.last_attempt_at) outcomesByTopic.set(t, o.last_attempt_at);
  for (const topic of dsa.topicsInScope) {
    const row = dsa.overview?.topics.find((r) => r.key === topic);
    const weak = dsa.overview?.weaknesses.find((w) => w.topic === topic);
    const attempts = row?.attempts ?? 0;
    const questions = row?.questions_attempted ?? 0;
    const lastAt = outcomesByTopic.get(topic) ?? null;
    const c = SKILL_RULES.dsa;
    const confidence: EvidenceConfidence = attempts >= c.high.attempts && questions >= c.high.questions ? "high" : attempts >= c.medium.attempts && questions >= c.medium.questions ? "medium" : attempts >= c.low.attempts && questions >= c.low.questions ? "low" : "none";
    const estimate = row && row.solve_rate.available ? row.solve_rate.value : null;
    let status: SkillStatus = "unassessed";
    if (estimate !== null) {
      status = weak?.status === "weak" ? "weak" : weak?.status === "technical_issues" || weak?.status === "watch" ? "developing" : weak?.status === "strong" ? "strong" : statusFromEstimate(estimate);
    }
    const gaps: string[] = [];
    if (weak && (weak.status === "weak" || weak.status === "technical_issues" || weak.status === "watch")) gaps.push(...weak.explanation.slice(0, 2));
    if (weak && weak.evidence.repeated_failure_questions > 0) gaps.push(`${weak.evidence.repeated_failure_questions} question(s) failed repeatedly`);
    const provisional = attempts > 0 && estimate === null;
    let note: string | null = null;
    if (attempts === 0) note = !dsa.execution.configured ? "Cannot be assessed until code execution is configured." : !dsa.execution.verified ? "Cannot be assessed until the execution service is declared verified." : "No judged attempts yet.";
    else if (provisional) note = `Provisional: ${attempts} judged submission(s), below the minimum for an estimate.`;
    skills.push({
      area: `dsa:${topic}`,
      label: `DSA: ${topic}`,
      category: "dsa",
      status,
      estimate,
      evidence: { kind: attempts > 0 ? "dsa_judged" : "none", provenance: attempts > 0 ? "verified" : "unavailable", count: attempts, unit: "judged submissions", last_at: lastAt, recency: recencyOf(lastAt, now) },
      confidence,
      gaps,
      self_reported: [selfReported(topic, profile, mentorLevels), leetcodeTopicNote(ev.leetcode, topic)].filter((x): x is string => x !== null).join(" · ") || null,
      next_assessment:
        status === "unassessed"
          ? { type: "diagnostic", description: `Solve one ${topic} question to get a first measurement.` }
          : status === "weak" || status === "developing"
            ? { type: "dsa_practice", description: `Practise ${topic} with a new question.` }
            : recencyOf(lastAt, now) === "stale"
              ? { type: "dsa_practice", description: `Re-check ${topic}: the last evidence is old.` }
              : null,
      note,
    });
  }

  // ---------------- interview ----------------
  const iv = ev.interview;
  if (iv.readFailed) limitations.push({ source: "interview", severity: "limits_accuracy", message: "Interview results could not be read right now." });
  if (iv.demonstration) limitations.push({ source: "interview", severity: "limits_accuracy", message: "Interview answers are graded by the built-in mock model on this server, so interview results are demonstrations, not assessments." });
  for (const roleId of profile?.role_ids ?? []) {
    const role = roles.get(roleId);
    if (!role) continue;
    for (const rs of role.skills) {
      const found = iv.skills.find((s) => s.role_id === roleId && s.skill_id === rs.id);
      const assessed = found !== undefined && (found.state === "ready" || found.state === "needs_work");
      const real = assessed && !iv.demonstration;
      const estimate = real ? found.proficiency : null;
      const c = SKILL_RULES.interview;
      const confidence: EvidenceConfidence = !real ? "none" : found.assessments >= c.high ? "high" : found.assessments >= c.medium || found.retested ? "medium" : "low";
      const status: SkillStatus = !real ? "unassessed" : found.state === "ready" ? "strong" : found.proficiency >= SKILL_RULES.status.developing ? "developing" : "weak";
      skills.push({
        area: `interview:${roleId}:${rs.id}`,
        label: `Interview: ${rs.name} (${role.name})`,
        category: "interview",
        status,
        estimate,
        evidence: { kind: assessed ? "interview_assessment" : "none", provenance: !assessed ? "unavailable" : iv.demonstration ? "demonstration" : "verified", count: found?.assessments ?? 0, unit: "assessments", last_at: assessed ? found.at : null, recency: assessed ? recencyOf(found.at, now) : "none" },
        confidence,
        gaps: real && found.state === "needs_work" ? (found.gaps.length > 0 ? found.gaps.map((g) => `Missing: ${g}`) : ["The last assessment found gaps."]) : [],
        self_reported: selfReported(rs.id, profile, mentorLevels) ?? selfReported(rs.name, profile, mentorLevels),
        next_assessment: !real ? { type: "technical_interview", description: `Take an interview on ${rs.name} to assess it.` } : status === "strong" ? null : { type: "technical_interview", description: `Retest ${rs.name} after practising.` },
        note: iv.demonstration && assessed ? "Graded by the mock model: a demonstration, not an assessment." : !assessed ? "Not assessed yet." : null,
      });
    }
  }
  if ((profile?.role_ids.length ?? 0) === 0) limitations.push({ source: "interview", severity: "info", message: "Choose a target role in your goals to include interview skills." });

  // ---------------- DBMS ----------------
  const dbms = ev.dbms;
  if (dbms.readFailed) limitations.push({ source: "dbms", severity: "info", message: "DBMS quiz progress could not be read right now." });
  const wantsDbms = (profile?.priorities.includes("dbms") ?? false) || dbms.topics.some((t) => t.attempts > 0);
  if (wantsDbms) {
    const attempted = dbms.topics.filter((t) => t.attempts > 0);
    const passed = dbms.topics.filter((t) => t.passed);
    const total = dbms.topics.length;
    const estimate = attempted.length > 0 && total > 0 ? passed.length / total : null;
    const last = attempted.map((t) => t.last_attempt_at).filter((x): x is string => x !== null).sort().at(-1) ?? null;
    const c = SKILL_RULES.dbms;
    const confidence: EvidenceConfidence = attempted.length >= c.high ? "high" : attempted.length >= c.medium ? "medium" : attempted.length >= c.low ? "low" : "none";
    const status: SkillStatus = estimate === null ? "unassessed" : confidence === "low" && estimate < SKILL_RULES.status.developing ? "developing" : statusFromEstimate(estimate);
    skills.push({
      area: "dbms",
      label: "DBMS",
      category: "dbms",
      status,
      estimate,
      evidence: { kind: attempted.length > 0 ? "dbms_quiz" : "none", provenance: attempted.length > 0 ? "verified" : "unavailable", count: attempted.length, unit: "topic quizzes attempted", last_at: last, recency: recencyOf(last, now) },
      confidence,
      gaps: attempted.filter((t) => !t.passed).slice(0, 3).map((t) => `Not yet passed: ${t.title}`),
      self_reported: selfReported("dbms", profile, mentorLevels),
      next_assessment:
        attempted.length === 0 && total > 0
          ? { type: "dbms", description: "Read a DBMS topic and pass its quiz to get a first measurement." }
          : passed.length < total
            ? { type: "dbms", description: "Continue with the next DBMS topic." }
            : null,
      note: attempted.length === 0 ? "No DBMS quizzes attempted yet. Reading the notes alone is not counted." : `${passed.length} of ${total} topics passed; each pass is decided by the server grading your quiz answers.`,
    });
  } else {
    limitations.push({ source: "dbms", severity: "info", message: "DBMS is not in your priorities, so it is left out. You can still study it any time." });
  }

  // ---------------- projects (context only) ----------------
  const gh = ev.github;
  if (gh.status === "not_configured") limitations.push({ source: "github", severity: "info", message: "GitHub connection is not set up on this server. It is optional and does not affect your plan." });
  else if (gh.status === "not_connected") limitations.push({ source: "github", severity: "info", message: "GitHub is not connected. It is optional: connecting adds project context, and not connecting costs you nothing." });
  else if (gh.status === "needs_reconnect") limitations.push({ source: "github", severity: "limits_accuracy", message: "GitHub needs to be reconnected; any project context shown may be out of date." });
  else if (gh.status === "connected_no_data") limitations.push({ source: "github", severity: "info", message: "GitHub is connected but nothing has been synchronised yet, so there is no project context." });
  else if (gh.stale) limitations.push({ source: "github", severity: "info", message: "Project context comes from an older GitHub synchronisation." });
  if (gh.readFailed) limitations.push({ source: "github", severity: "info", message: "GitHub data could not be read right now." });
  if (gh.status === "available" || gh.status === "needs_reconnect") {
    skills.push({
      area: "project:github",
      label: "Projects (GitHub context)",
      category: "project",
      status: "unassessed",
      estimate: null,
      evidence: { kind: "github_context", provenance: gh.syncedAt ? "verified" : "unavailable", count: gh.totalPublic ?? 0, unit: "public repositories", last_at: gh.syncedAt, recency: recencyOf(gh.syncedAt, now) },
      confidence: "none",
      gaps: gh.gaps.slice(0, 5).map((g) => `${g.repository}: ${g.label} is missing`),
      self_reported: null,
      next_assessment: gh.gaps.length > 0 ? { type: "project", description: `Improve ${gh.gaps[0]!.repository}: ${gh.gaps[0]!.label}.` } : null,
      note: "Project activity is context, not a measure of algorithmic or interview ability, and it does not count towards coverage.",
    });
  }

  const lc = ev.leetcode;
  if (lc?.status === "available") {
    limitations.push({ source: "leetcode", severity: "info", message: `LeetCode numbers you imported (captured ${lc.captured_at?.slice(0, 10)}${lc.stale ? ", now out of date" : ""}) appear beside matching DSA topics as your own reported context. They are not verified, never counted as judged results and never change an estimate.` });
  }

  if (ev.memory.readFailed) limitations.push({ source: "memory", severity: "info", message: "Saved mentor memory could not be read right now." });

  const counted = skills.filter((s) => s.category !== "project");
  const sufficient = counted.filter((s) => s.confidence === "medium" || s.confidence === "high").length;
  const provisional = counted.filter((s) => s.confidence === "low").length;
  return {
    generated_at: now.toISOString(),
    skills,
    coverage: {
      in_scope: counted.length,
      sufficient_evidence: sufficient,
      provisional,
      unassessed: counted.length - sufficient - provisional,
      definition: "The number of skill areas with at least medium evidence confidence. It describes how much has been measured, not how well you are doing.",
    },
    limitations,
    method: METHOD,
  };
}

